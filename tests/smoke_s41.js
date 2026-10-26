/* smoke_s41.js — S41 스모크: 인증 모드 전수 감사 2차 (FX-03 리셋 권한·FX-04 감사로그 역할 경계) + auth 완전 여정
   실행: cd /home/user/tests && node smoke_s41.js */
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
  console.log('=== A. auth — FX-03/04 경계 + 완전 여정 ===');
  const srvA = createApp({ auth: true }).listen(0, '127.0.0.1');
  await new Promise(r => srvA.on('listening', r));
  await sleep(100);
  const baseA = 'http://127.0.0.1:' + srvA.address().port;
  const login = async function (code) {
    const r = await fetch(baseA + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) });
    return (r.headers.get('set-cookie') || '').split(';')[0].split('=')[1];
  };
  const hA = await J(baseA, 'GET', '/api/health');
  assert(parseInt(hA.version.slice(1), 10) >= 41, 'health: version S41 이상');
  const tokC = await login('MIRI-CLINIC-2026');
  const tokL = await login('MIRI-LAB-2026');
  const tokP = await login('MIRI-PAT-2601');
  /* 환자가 기록 공유 → 감사로그에 care-log 항목 생성 */
  const sh = await J(baseA, 'POST', '/api/cases/C-2601/care-log', { '통증': '보통', '붓기': '없음', '출혈': '없음' }, 'mm_session=' + tokP);
  assert(sh.ok === true, '여정: 환자 기록 공유 성립');
  /* FX-04: 감사로그 역할 경계 */
  const auP = await J(baseA, 'GET', '/api/audit', null, 'mm_session=' + tokP);
  assert(auP.error !== undefined && auP.error.includes('전용'), 'FX-04: 환자 감사로그 → 403');
  const auL = await J(baseA, 'GET', '/api/audit?limit=50', null, 'mm_session=' + tokL);
  assert(Array.isArray(auL.audit) && !auL.audit.some(a => String(a.act).indexOf('care-log') === 0), 'FX-04: lab 감사로그 — care-log 계열 미포함 (소견 미노출)');
  assert(auL.audit.some(a => a.act === 'login' || a.act === 'read'), 'FX-04: lab — 접근 투명성 기록은 유지');
  const auC = await J(baseA, 'GET', '/api/audit?limit=50', null, 'mm_session=' + tokC);
  assert(Array.isArray(auC.audit) && auC.audit.some(a => a.act === 'care-log'), 'FX-04: clinic — 전체 감사로그 (care-log 포함)');
  /* FX-03: 리셋 권한 */
  const rsP = await J(baseA, 'POST', '/api/reset', null, 'mm_session=' + tokP);
  assert(rsP.error !== undefined && rsP.error.includes('clinic'), 'FX-03: 환자 리셋 → 403');
  const rsL = await J(baseA, 'POST', '/api/reset', null, 'mm_session=' + tokL);
  assert(rsL.error !== undefined, 'FX-03: lab 리셋 → 403');
  const g0 = await J(baseA, 'GET', '/api/cases?role=clinic', null, 'mm_session=' + tokC);
  assert(g0.cases.length === 5, '리셋 차단 확인 — 데이터 무사 (5건 유지)');
  /* auth 완전 여정 — 권한 매트릭스 회귀 */
  const ord = await J(baseA, 'PATCH', '/api/cases/C-2601', { patch: { status: '주문' } }, 'mm_session=' + tokL);
  assert(ord.error !== undefined, '여정: lab 케이스 수정 → 403');
  const pf = await J(baseA, 'POST', '/api/me/prefs', { prefs: { zoom: 'l' } }, 'mm_session=' + tokP);
  assert(pf.ok === true, '여정: 환자 prefs 저장');
  const gt = await J(baseA, 'GET', '/api/metrics/gate', null, 'mm_session=' + tokC);
  assert(gt.ok === true && gt.ratePct === 100, '여정: 게이트 계측 (3/3 활동)');
  const ex = await fetch(baseA + '/api/maintenance/export', { headers: { Cookie: 'mm_session=' + tokC } });
  assert(ex.status === 200, '여정: clinic 내보내기');
  const rsC = await J(baseA, 'POST', '/api/reset', null, 'mm_session=' + tokC);
  assert(rsC.ok === true, 'FX-03: clinic 리셋 → 허용 (시드 복원)');
  const g1 = await J(baseA, 'GET', '/api/cases?role=clinic', null, 'mm_session=' + tokC);
  assert(g1.cases.length === 5, '리셋 후 — 시드 5건 복원');
  if (srvA.closeAllConnections) srvA.closeAllConnections();
  await new Promise(r => srvA.close(r));

  console.log('=== B. 데모 — 기존 동작 회귀 ===');
  const srvB = createApp().listen(0, '127.0.0.1');
  await new Promise(r => srvB.on('listening', r));
  await sleep(100);
  const baseB = 'http://127.0.0.1:' + srvB.address().port;
  const rB = await J(baseB, 'POST', '/api/reset?role=clinic');
  assert(rB.ok === true, '데모 리셋 — role=clinic 허용 (기존 동작)');
  const auB = await J(baseB, 'GET', '/api/audit?role=lab');
  assert(Array.isArray(auB.audit), '데모 감사로그 — 역할 무관 열람 (기존 동작)');
  if (srvB.closeAllConnections) srvB.closeAllConnections();
  await new Promise(r => srvB.close(r));

  console.log('=== C. 클라 — 리셋 403 피드백 (jsdom) ===');
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
  w.MM.app.state.role = 'staff';
  w.MM.app.go('auditLog');
  await sleep(300);
  assert($('#demoReset'), '감사로그 화면 — 데모 초기화 버튼');
  const oldFetch = w.fetch;
  w.fetch = () => Promise.reject(new Error('HTTP 403'));
  $('#demoReset').click();
  await sleep(100);
  d.getElementById('drOk').click();
  await sleep(250);
  assert(d.getElementById('toast').textContent.includes('권한만'), 'FX-03 클라: 403 → 권한 안내 토스트 (catch 동작)');
  w.fetch = oldFetch;
  assert(errors.length === 0, 'C 최종: errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  await dom.window.close();
  if (srvC.closeAllConnections) srvC.closeAllConnections();
  await new Promise(r => srvC.close(r));

  console.log('=== D. 문서 — 감사 결과 반영 ===');
  const spec = fs.readFileSync('/home/user/미리미소-작업명세.md', 'utf8');
  const runbook = fs.readFileSync('/home/user/미리미소-배포런북.md', 'utf8');
  assert(spec.includes('AC-41') && spec.includes('FX-03') && spec.includes('FX-04'), '명세 AC-41 (FX-03/04) 반영');
  assert(runbook.includes('S41'), '런북 — 리셋 강제화 반영');

  console.log('--- S41 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
