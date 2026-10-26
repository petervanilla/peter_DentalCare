/* smoke_s35.js — S35 스모크: 구조 완결성 (모달 ESC·세션 만료 복귀·미러 중지 라이프사이클·우아한 종료)
   실행: cd /home/user/tests && node smoke_s35.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const { spawn } = require('child_process');
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
  console.log('=== A. auth — 미러 라이프사이클 완결 (시작 → 중지) ===');
  const srvA = createApp({ auth: true }).listen(0, '127.0.0.1');
  await new Promise(r => srvA.on('listening', r));
  await sleep(100);
  const baseA = 'http://127.0.0.1:' + srvA.address().port;
  const login = async function (code) {
    const r = await fetch(baseA + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) });
    return (r.headers.get('set-cookie') || '').split(';')[0].split('=')[1];
  };
  const tokC = await login('MIRI-CLINIC-2026');
  const tokL = await login('MIRI-LAB-2026');
  const hA = await J(baseA, 'GET', '/api/health');
  assert(parseInt(hA.version.slice(1), 10) >= 35, 'health: version S35 이상');
  const st = await J(baseA, 'POST', '/api/mirror/start', { nick: '중지테스트' }, 'mm_session=' + tokC);
  assert(st.ok === true, '미러 시작 성립');
  const dL = await J(baseA, 'DELETE', '/api/mirror/' + st.id, null, 'mm_session=' + tokL);
  assert(dL.error !== undefined && dL.error.includes('clinic'), '중지 lab → 403');
  const dX = await J(baseA, 'DELETE', '/api/mirror/ffffff', null, 'mm_session=' + tokC);
  assert(dX.error !== undefined, '중지 없는 id → 404');
  const dC = await J(baseA, 'DELETE', '/api/mirror/' + st.id, null, 'mm_session=' + tokC);
  assert(dC.ok === true, '중지 clinic → ok');
  const fr = await J(baseA, 'GET', '/api/mirror/' + st.id + '/frame');
  assert(fr.error !== undefined, '중지 후 뷰어 폴링 → 404 (뷰어 자동 종료)');
  const au = await J(baseA, 'GET', '/api/audit?limit=20', null, 'mm_session=' + tokC);
  assert(au.audit.some(a => a.act === 'mirror:stop'), '중지 → 감사로그');
  if (srvA.closeAllConnections) srvA.closeAllConnections();
  await new Promise(r => srvA.close(r));

  console.log('=== B. 데모 — body role 경계 ===');
  const srvB = createApp().listen(0, '127.0.0.1');
  await new Promise(r => srvB.on('listening', r));
  await sleep(100);
  const baseB = 'http://127.0.0.1:' + srvB.address().port;
  const st2 = await J(baseB, 'POST', '/api/mirror/start', { role: 'clinic', nick: 'x' });
  const dB = await J(baseB, 'DELETE', '/api/mirror/' + st2.id);
  assert(dB.error !== undefined, '데모 중지 role 누락 → 403');
  const dB2 = await J(baseB, 'DELETE', '/api/mirror/' + st2.id + '?role=clinic');
  assert(dB2.ok === true, '데모 중지 role=clinic → ok');
  if (srvB.closeAllConnections) srvB.closeAllConnections();
  await new Promise(r => srvB.close(r));

  console.log('=== C. 클라 — ESC·세션 만료 복귀 (jsdom) ===');
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
  d.getElementById('setBtn').click();
  await sleep(150);
  assert(d.getElementById('modalOverlay').classList.contains('show'), '설정 모달 개설');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  await sleep(100);
  assert(!d.getElementById('modalOverlay').classList.contains('show'), 'SC-01: ESC → 모달 닫힘');
  assert(typeof w.MM.Api.mirrorStop === 'function', 'SC-03: 미러 중지 API 존재');
  w.eval("MM.Api.authRequired = true;");
  const oldFetch = w.fetch;
  w.fetch = () => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: '세션 만료' }) });
  await w.MM.Api.pull().catch(() => {});
  await sleep(250);
  assert(d.body.textContent.includes('초대코드로 시작'), 'SC-02: 세션 만료 → 초대코드 게이트 복귀');
  assert(d.getElementById('toast').textContent.includes('세션 만료'), 'SC-02: 만료 안내 토스트');
  assert(w.MM.app.state.role === '' && w.MM.Api.user === null, 'SC-02: 상태 초기화 (role·user)');
  w.fetch = oldFetch;
  assert(errors.length === 0, 'C 최종: errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  await dom.window.close();
  if (srvC.closeAllConnections) srvC.closeAllConnections();
  await new Promise(r => srvC.close(r));

  console.log('=== D. 운영 — SIGTERM 우아한 종료 ===');
  try { fs.unlinkSync('/tmp/s35g.db'); } catch (e) {}
  const ch = spawn('node', ['/home/user/mirimiso-webapp/server/server.js'], { env: Object.assign({}, process.env, { PORT: '0', MM_AUTH: '1', MM_DB: '/tmp/s35g.db' }) });
  let booted = false;
  ch.stdout.on('data', x => { if (String(x).indexOf('mirimiso-mock') >= 0) booted = true; });
  await sleep(1200);
  assert(booted, 'SC-04: 영속 모드 기동 (PORT=0 · MM_DB)');
  ch.kill('SIGTERM');
  const code = await new Promise(r => ch.on('exit', c => r(c)));
  assert(code === 0, 'SC-04: SIGTERM → 종료 코드 0 (close + 체크포인트 후 정상 종료)');

  console.log('--- S35 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
