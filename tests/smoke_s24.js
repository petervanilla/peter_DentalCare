/* smoke_s24.js — S24 스모크: 운영 대시보드(퍼널·저장소·헬스) + 파일 GC(미참조 원본 정리 · 참조 보호 · 감사로그)
   실행: cd /home/user/tests && node smoke_s24.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { createApp, filesDirLive } = require('/home/user/mirimiso-webapp/server/server.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg);
  cond ? pass++ : (fail++, process.exitCode = 1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BUNDLE = fs.readFileSync('/home/user/미리미소-웹앱.html', 'utf8');

(async () => {
  console.log('=== A. 서버 — metrics storage/sys + GC 라운드트립 (데모 모드) ===');
  const srvA = createApp().listen(0, '127.0.0.1');
  await sleep(120);
  const base = 'http://127.0.0.1:' + srvA.address().port;
  const J = async (m, p, b) => await (await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })).json();

  const h = await J('GET', '/api/health');
  assert(parseInt(String(h.version).replace('S',''), 10) >= 24, 'health: version S24 이상 (' + h.version + ')');
  let mx = await J('GET', '/api/metrics');
  assert(mx.storage && typeof mx.storage.files === 'number' && mx.sys && parseInt(String(mx.sys.version).replace('S',''), 10) >= 24 && mx.sys.persist === false,
    'metrics: storage·sys 블록 (version S24 · 데모 메모리 DB)');

  const mx0 = await J('GET', '/api/metrics');
  const ref0 = mx0.storage.files - mx0.storage.orphans; /* 참조 파일 수 불변식 (결정적 파일 ID — 재업로드는 덮어쓰기) */
  const up = await fetch(base + '/api/cases/C-2601/sessions/SS-2601-1/files?filename=ops.stl', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: Buffer.from('solid s24\nendsolid s24') });
  assert(up.ok === true, '스캔 원본 업로드 (참조 생성)');
  mx = await J('GET', '/api/metrics');
  const ref1 = mx.storage.files - mx.storage.orphans;
  assert(ref1 === ref0 + 1, 'storage: 업로드 참조 등록 — 참조 파일 ' + ref0 + '→' + ref1);
  const orphAfter = mx.storage.orphans;

  fs.writeFileSync(path.join(filesDirLive(), 'orphan-junk-' + Date.now() + '.stl'), Buffer.from('solid orphan\nendsolid orphan')); /* 실행 간 파일명 충돌 방지 */
  mx = await J('GET', '/api/metrics');
  assert(mx.storage.orphans === orphAfter + 1, '미참조 파일 감지 — orphan ' + mx.storage.orphans + '개 (업로드 후 ' + orphAfter + ')');

  const gcLab = await fetch(base + '/api/maintenance/gc?role=lab', { method: 'POST' });
  assert(gcLab.status === 403, 'GC lab → 403 (clinic 전용)');
  const gc = await J('POST', '/api/maintenance/gc?role=clinic');
  assert(gc.ok === true && gc.gc.removed >= 1 && gc.gc.kept >= 1, 'GC clinic — 삭제 ' + gc.gc.removed + '개 · 보존 ' + gc.gc.kept + '개 (참조 보호)');
  mx = await J('GET', '/api/metrics');
  assert(mx.storage.orphans === 0 && mx.storage.files >= 1, 'GC 후 — orphan 0 · 원본 ' + mx.storage.files + '개 생존');
  const au = await J('GET', '/api/audit?limit=50');
  assert(au.audit.some(a => a.act === 'maintenance:gc'), 'GC → 감사로그 기록');
  if (srvA.closeAllConnections) srvA.closeAllConnections();
  await new Promise(r => srvA.close(r));

  console.log('=== B. auth 모드 — 세션 권한 GC 403 ===');
  const srvB = createApp({ auth: true }).listen(0, '127.0.0.1');
  await sleep(120);
  const baseB = 'http://127.0.0.1:' + srvB.address().port;
  const login = async function (code) {
    const r = await fetch(baseB + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) });
    return (r.headers.get('set-cookie') || '').split(';')[0].split('=')[1];
  };
  const tokC = await login('MIRI-CLINIC-2026');
  const iv = await (await fetch(baseB + '/api/auth/invite', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'mm_session=' + tokC }, body: JSON.stringify({ role: 'lab', name: 'GC테스트 기공소' }) })).json();
  const tokL = await login(iv.code);
  const gcAuth = await fetch(baseB + '/api/maintenance/gc', { method: 'POST', headers: { Cookie: 'mm_session=' + tokL } });
  assert(gcAuth.status === 403, 'auth 모드 lab 세션 GC → 403 (sess 권한)');
  if (srvB.closeAllConnections) srvB.closeAllConnections();
  await new Promise(r => srvB.close(r));

  console.log('=== C. 온라인 통합 — 운영 대시보드(퍼널·헬스·저장소) + GC 플로우 ===');
  const srvC = createApp().listen(0, '127.0.0.1');
  await sleep(120);
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
  $('.role-card').parentNode.querySelectorAll('.role-card')[1].click();
  if ($('#agreeRow')) { $('#agreeRow').click(); $('#agreeBtn').click(); }
  await sleep(900);
  w.MM.app.state.role = 'staff';
  w.MM.app.go('caseHub');
  await sleep(400);
  const quicks = $('#root').querySelectorAll('.quick').length;
  assert($('#qdOps') && quicks === 8, 'caseHub: 퀵 작업 8종 · 운영 대시보드 카드');
  $('#qdOps').click();
  await sleep(500);
  const dash = d.getElementById('root').textContent;
  assert(dash.includes('케이스 퍼널') && dash.includes('상담') && dash.includes('주문 전환'), '대시보드: 8단계 퍼널 바 렌더');
  assert(/S\d+/.test(dash) && dash.includes('실시간 연결'), '대시보드: 시스템 헬스 (version 표기 · SSE 탭 수)');
  assert(dash.includes('서버 계량'), '대시보드: 서버 계량 모드 표시');
  await w.MM.Api.uploadScanFile('C-2603', 'SS-2603-1', { name: 'dash.stl', arrayBuffer: () => Promise.resolve(Buffer.from('solid dash\nendsolid dash')) });
  w.MM.app.go('opsDash');
  await sleep(400);
  assert(d.getElementById('odStore').textContent.includes('등록 원본 1개'), '대시보드: 등록 원본 1개 표시');
  $('#odGc').click();
  await sleep(150);
  assert(d.getElementById('modalBody').textContent.includes('참조 없는'), 'GC 확인 모달 (참조 보호 고지)');
  $('#gcGo').click();
  await sleep(500);
  assert(d.getElementById('root').textContent.includes('미참조(orphan) 0개'), 'GC 실행 후 — orphan 0 갱신');
  assert(errors.length === 0, 'C 최종: errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  await dom.window.close();
  if (srvC.closeAllConnections) srvC.closeAllConnections();
  await new Promise(r => srvC.close(r));

  console.log('=== D. 오프라인 — 로컬 계량 폴백 ===');
  const errors2 = [];
  const dom2 = new JSDOM(BUNDLE, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://demo.local/',
    beforeParse(w2) { w2.scrollTo = () => {}; w2.addEventListener('error', e => errors2.push('onerror: ' + e.message)); }
  });
  const w2 = dom2.window, d2 = w2.document;
  await sleep(400);
  d2.querySelector('.role-card').parentNode.querySelectorAll('.role-card')[1].click();
  if (d2.querySelector('#agreeRow')) { d2.querySelector('#agreeRow').click(); d2.querySelector('#agreeBtn').click(); }
  await sleep(300);
  w2.MM.app.go('opsDash');
  await sleep(300);
  const off = d2.getElementById('root').textContent;
  assert(off.includes('로컬 계량 (오프라인)') && off.includes('케이스 퍼널'), '오프라인: 로컬 계량 폴백 + 퍼널 유지');
  assert(d2.getElementById('odStore').textContent.includes('서버 연결 시'), '오프라인: 저장소 정보 가드');
  d2.getElementById('odGc').click();
  await sleep(150);
  assert(!d2.getElementById('gcGo'), '오프라인: GC 모달 미개행 (토스트 가드)');
  assert(errors2.length === 0, 'D 최종: errors 없음' + (errors2.length ? ' → ' + errors2.join('|') : ''));
  await dom2.window.close();

  console.log('--- S24 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
