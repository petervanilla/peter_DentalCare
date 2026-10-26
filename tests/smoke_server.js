/* smoke_server.js — S84: 서버 API 무결성 라이브 스모크 (분석리포트 I-11 → R3)
   검증: 기동→헬스(version)→정적 서빙→pull 계약→create/patch seq 단조→lab·patient 역할 마스킹(서버 강제)
         →SSE 브로드캐스트 실수신→events 폴링 폴백→reset 복원 — 클라이언트 없는 서버 계약 전용 스위트
   실행: cd /home/user/tests && node smoke_server.js */
const { createApp } = require('/home/user/mirimiso-webapp/server/server.js');
const http = require('http');

let pass = 0, fail = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg);
  cond ? pass++ : (fail++, process.exitCode = 1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = createApp().listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const J = async (m, p, b) => {
    const r = await fetch(base + p, { method: m, headers: b ? { 'Content-Type': 'application/json' } : undefined, body: b ? JSON.stringify(b) : undefined });
    return { s: r.status, j: await r.json().catch(() => ({})) };
  };

  console.log('=== 서버 계약 — 기동·헬스·정적 ===');
  const h = await J('GET', '/api/health');
  assert(h.s === 200 && h.j.service === 'mirimiso-mock' && h.j.version === 'S114', '헬스 — service·version S114 (LIVE)');
  assert(h.j.cases === 5 && h.j.demo === true, '시드 5케이스 · 데모 고지');
  const idx = await fetch(base + '/');
  assert(idx.status === 200 && (await idx.text()).includes('스마일치과'), 'GET / — 앱 셸(index) 서빙 200');
  const bun = await fetch(base + '/bundle');
  const bunText = await bun.text();
  assert(bun.status === 200 && bunText.length > 200000 && bunText.includes('<script>'), 'GET /bundle — 단일 파일 번들 서빙 (' + Math.round(bunText.length / 1024) + 'KB)');

  console.log('=== REST 변이 계약 — seq 단조·역할 마스킹 ===');
  const pull = await J('GET', '/api/cases?role=clinic');
  assert(pull.s === 200 && pull.j.cases.length === 5 && pull.j.seq >= 0, 'cases pull (clinic) — 5케이스·seq 커서');
  const cr = await J('POST', '/api/cases', { role: 'clinic', patient: '검증환자', tooth: '46', proc: '무결성 검증 케이스' });
  const newId = cr.j.cases && cr.j.cases.filter(c => c.patient === '검증환자').map(c => c.id)[0];
  assert(cr.s === 200 && !!newId && cr.j.seq > pull.j.seq && cr.j.cases.length === 6,
    'create — ' + newId + ' · seq 증가 (' + pull.j.seq + '→' + cr.j.seq + ') · 6케이스');
  const pa = await J('PATCH', '/api/cases/' + newId, { role: 'clinic', patch: { status: '스캔' } });
  assert(pa.s === 200 && pa.j.seq > cr.j.seq && pa.j.cases.find(c => c.id === newId).status === '스캔',
    'patch 상태 변이 — seq 단조 증가 · 반영 확인');
  const lab = await J('GET', '/api/cases?role=lab');
  const labCase = lab.j.cases.find(c => c.id === 'C-2601');
  assert(lab.s === 200 && labCase && labCase._masked && labCase._masked.length >= 1 && !labCase.plan.aiNote && labCase._maskNotice,
    'lab 역할 — 서버 강제 마스킹 (aiNote 제거·_masked ' + (labCase && labCase._masked || []).length + '건)');
  const pat = await J('GET', '/api/cases?role=patient');
  const pc = (pat.j.cases || []).filter(Boolean)[0] || {};
  const patKeys = Object.keys(pc).sort().join(',');
  assert(pat.s === 200 && patKeys === 'careLog,due,id,patient,proc,status,tooth', 'patient 역할 — 화이트리스트 필드만 (' + patKeys + ')');

  console.log('=== SSE 실수신·폴링 폴백·reset 복원 ===');
  const chunks = [];
  const req = http.get(base + '/api/stream', res => { res.setEncoding('utf8'); res.on('data', c => chunks.push(c)); });
  await sleep(250);
  const pa2 = await J('PATCH', '/api/cases/' + newId, { role: 'clinic', patch: { status: '계획' } });
  await sleep(500);
  req.destroy();
  assert(pa2.j.seq > pa.j.seq && chunks.join('').indexOf('"seq"') >= 0, 'SSE 브로드캐스트 실수신 — 변이 후 seq 푸시');
  const ev = await J('GET', '/api/events?since=' + pa.j.seq);
  assert(ev.j.seq >= pa2.j.seq && (ev.j.changes || []).length >= 1, 'events 폴링 폴백 — since 커서·changes 유실 없음');
  const rs = await J('POST', '/api/reset');
  const after = await J('GET', '/api/cases?role=clinic');
  assert(after.j.cases.length === 5 && !after.j.cases.some(c => c.id === newId) && rs.j.seq !== undefined,
    'reset — 시드 복원 (생성 케이스 제거)');
  srv.close();
  console.log('--- S84 server smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
