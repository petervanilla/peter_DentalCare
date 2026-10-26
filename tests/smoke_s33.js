/* smoke_s33.js — S33 스모크: 상태 기록 정정 루프(수정·삭제 · 감사 후행 · 공유본 동기 정정)
   실행: cd /home/user/tests && node smoke_s33.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const { createApp } = require('/home/user/mirimiso-webapp/server/server.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg);
  cond ? pass++ : (fail++, process.exitCode = 1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BUNDLE = fs.readFileSync('/home/user/미리미소-웹앱.html', 'utf8');
const J = async (base, m, p, b, ck) => await (await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', ...(ck ? { Cookie: ck } : {}) }, body: b ? JSON.stringify(b) : undefined })).json();

(async () => {
  console.log('=== A. auth — 공유 id 부여·수정·삭제·경계 ===');
  const srvA = createApp({ auth: true }).listen(0, '127.0.0.1');
  await new Promise(r => srvA.on('listening', r));
  await sleep(100);
  const baseA = 'http://127.0.0.1:' + srvA.address().port;
  const login = async function (code) {
    const r = await fetch(baseA + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) });
    return (r.headers.get('set-cookie') || '').split(';')[0].split('=')[1];
  };
  const tokP = await login('MIRI-PAT-2601');
  const tokC = await login('MIRI-CLINIC-2026');
  const s1 = await J(baseA, 'POST', '/api/cases/C-2601/care-log', { d: '2026-10-14', '통증': '보통', '붓기': '없음', '출혈': '없음' }, 'mm_session=' + tokP);
  assert(s1.ok === true && /^[0-9a-f]{6}$/.test((s1.entry && s1.entry.id || '').slice(1)), '공유 → 항목 id 자동 부여');
  const g1 = await J(baseA, 'GET', '/api/cases/C-2601?role=patient', null, 'mm_session=' + tokP);
  assert(g1.case.careLog[0].id === s1.entry.id, '케이스 열람 — 기록에 id 존재');
  const e1 = await J(baseA, 'PATCH', '/api/cases/C-2601/care-log', { logId: s1.entry.id, '통증': '심함', '붓기': '약간 있음', '출혈': '약간' }, 'mm_session=' + tokP);
  assert(e1.ok === true && e1.entry['통증'] === '심함' && !!e1.entry.edited, '수정 — 값 반영 + edited 표시');
  const g2 = await J(baseA, 'GET', '/api/cases/C-2601?role=clinic', null, 'mm_session=' + tokC);
  assert(g2.case.history.some(h => h.t.includes('환자 상태 기록 수정') && h.t.includes('보통')), '수정 → 이력에 원값 보존 (정정 기록·clinic 뷰)');
  const au1 = await J(baseA, 'GET', '/api/audit?limit=30', null, 'mm_session=' + tokC);
  assert(au1.audit.some(a => a.act === 'care-log:edit' && a.detail.includes('수정 전')), '수정 → 감사로그 (수정 전 값)');
  const badE = await J(baseA, 'PATCH', '/api/cases/C-2601/care-log', { logId: s1.entry.id, '통증': '13글자가넘는통증값입니다', '붓기': '없음', '출혈': '없음' }, 'mm_session=' + tokP);
  assert(badE.error !== undefined, '수정 검증 — 12자 초과 → 400');
  const cE = await J(baseA, 'PATCH', '/api/cases/C-2601/care-log', { logId: s1.entry.id, '통증': '없음', '붓기': '없음', '출혈': '없음' }, 'mm_session=' + tokC);
  assert(cE.error !== undefined && cE.error.includes('환자'), '의료진 계정 수정 → 403 (환자 전용)');
  const d1 = await J(baseA, 'DELETE', '/api/cases/C-2601/care-log', { logId: s1.entry.id }, 'mm_session=' + tokP);
  assert(d1.ok === true && d1.count === 0, '삭제 — 잔여 0건');
  const g3 = await J(baseA, 'GET', '/api/cases/C-2601?role=clinic', null, 'mm_session=' + tokC);
  assert(g3.case.history.some(h => h.t.includes('환자 상태 기록 삭제')), '삭제 → 이력 기록 (clinic 뷰)');
  const au2 = await J(baseA, 'GET', '/api/audit?limit=30', null, 'mm_session=' + tokC);
  assert(au2.audit.some(a => a.act === 'care-log:del'), '삭제 → 감사로그');
  const d2 = await J(baseA, 'DELETE', '/api/cases/C-2601/care-log', { logId: s1.entry.id }, 'mm_session=' + tokP);
  assert(d2.error !== undefined, '재삭제(없는 id) → 404');
  if (srvA.closeAllConnections) srvA.closeAllConnections();
  await new Promise(r => srvA.close(r));

  console.log('=== B. 데모 — body role 경계 ===');
  const srvB = createApp().listen(0, '127.0.0.1');
  await new Promise(r => srvB.on('listening', r));
  await sleep(100);
  const baseB = 'http://127.0.0.1:' + srvB.address().port;
  const s2 = await J(baseB, 'POST', '/api/cases/C-2601/care-log', { role: 'patient', '통증': '보통', '붓기': '없음', '출혈': '없음' });
  assert(s2.ok === true && s2.entry.id, '데모 공유 → id');
  const eB = await J(baseB, 'PATCH', '/api/cases/C-2601/care-log', { role: 'patient', logId: s2.entry.id, '통증': '없음', '붓기': '없음', '출혈': '없음' });
  assert(eB.ok === true, '데모 수정 성립');
  const cB = await J(baseB, 'PATCH', '/api/cases/C-2601/care-log', { role: 'clinic', logId: s2.entry.id, '통증': '없음', '붓기': '없음', '출혈': '없음' });
  assert(cB.error !== undefined, '데모 clinic 수정 → 403');
  const hB = await fetch(baseB + '/api/health').then(r => r.json());
  assert(parseInt(hB.version.slice(1), 10) >= 33, 'health: version S33 이상');
  if (srvB.closeAllConnections) srvB.closeAllConnections();
  await new Promise(r => srvB.close(r));

  console.log('=== C. 클라 — 기기 기록 수정·삭제 (jsdom) ===');
  const srvC = createApp().listen(0, '127.0.0.1');
  await new Promise(r => srvC.on('listening', r));
  await sleep(100);
  const baseC = 'http://127.0.0.1:' + srvC.address().port;
  const errors = [];
  const dom = new JSDOM(BUNDLE, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: baseC + '/',
    beforeParse(w) {
      w.fetch = (u, o) => fetch(new URL(u, baseC + '/').href, o);
      w.scrollTo = () => {};
      w.addEventListener('error', e => errors.push('onerror: ' + e.message));
    }
  });
  const w = dom.window, d = w.document, $ = s => d.querySelector(s);
  await sleep(700);
  $('.role-card').click();
  if ($('#agreeRow')) { $('#agreeRow').click(); $('#agreeBtn').click(); }
  await sleep(300);
  w.MM.app.state.role = 'patient';
  w.MM.app.go('care');
  await sleep(300);
  $('#rvSave').click();
  await sleep(150);
  assert(d.querySelectorAll('.rec-item').length >= 1, '기기 기록 저장 → 목록 표시');
  $('.rv-ed').click();
  await sleep(150);
  assert(d.getElementById('modalBody').textContent.includes('기록 수정'), '수정 모달 개설');
  d.querySelector('.ed-chip[data-rv="통증"][data-v="심함"]').click();
  d.getElementById('edSave').click();
  await sleep(150);
  assert(d.getElementById('toast').textContent.includes('기록 수정 완료') && $('.rec-item').textContent.includes('심함') && $('.rec-item').textContent.includes('수정됨'), '수정 저장 → 목록 반영 + 수정됨 표시');
  $('.rv-rm').click();
  await sleep(150);
  assert(d.getElementById('modalBody').textContent.includes('기록 삭제'), '삭제 확인 모달 개설');
  d.getElementById('rmGo').click();
  await sleep(150);
  assert(d.getElementById('toast').textContent.includes('기록 삭제 완료') && !d.querySelector('.rec-item'), '삭제 → 목록에서 제거');
  assert(errors.length === 0, 'C 최종: errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  await dom.window.close();
  if (srvC.closeAllConnections) srvC.closeAllConnections();
  await new Promise(r => srvC.close(r));

  console.log('=== D. 문서 — 명세 AC-33 ===');
  const spec = fs.readFileSync('/home/user/미리미소-작업명세.md', 'utf8');
  assert(spec.includes('AC-33') && spec.includes('RE-01') && spec.includes('감사'), '명세 AC-33 (RE-01~03) 반영');

  console.log('--- S33 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
