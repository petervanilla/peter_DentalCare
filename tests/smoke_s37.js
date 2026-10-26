/* smoke_s37.js — S37 스모크: 게이트 1 계측 (월간 활성율 — 계약 전환 조건의 판정 도구)
   실행: cd /home/user/tests && node smoke_s37.js */
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
  console.log('=== A. auth — 활성율 계산·세션 터치·경계 ===');
  try { fs.unlinkSync('/tmp/s37t.db'); } catch (e) {}
  const srvA = createApp({ auth: true, persist: '/tmp/s37t.db' }).listen(0, '127.0.0.1');
  await new Promise(r => srvA.on('listening', r));
  await sleep(150);
  const baseA = 'http://127.0.0.1:' + srvA.address().port;
  const login = async function (code) {
    const r = await fetch(baseA + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) });
    return (r.headers.get('set-cookie') || '').split(';')[0].split('=')[1];
  };
  const hA = await J(baseA, 'GET', '/api/health');
  assert(parseInt(hA.version.slice(1), 10) >= 37, 'health: version S37 이상');
  const tokC = await login('MIRI-CLINIC-2026');
  const tokP = await login('MIRI-PAT-2601');
  const g1 = await J(baseA, 'GET', '/api/metrics/gate', null, 'mm_session=' + tokC);
  assert(g1.ok === true && g1.ratePct === 67 && g1.pass === false && g1.activeAccounts === 2 && g1.totalAccounts === 3, '2/3 계정 활동 → 활성율 67% · 미달 판정');
  const tokL = await login('MIRI-LAB-2026');
  const g2 = await J(baseA, 'GET', '/api/metrics/gate', null, 'mm_session=' + tokC);
  assert(g2.ratePct === 100 && g2.pass === true, '3/3 → 활성율 100% · 통과 판정');
  assert(g2.gate === '게이트 1' && g2.def === '월간 활성율 70%' && g2.windowDays === 30, '판정 근거 필드 — 게이트 정의·30일 창');
  const gL = await J(baseA, 'GET', '/api/metrics/gate', null, 'mm_session=' + tokL);
  assert(gL.error !== undefined && gL.error.includes('clinic'), '계측 조회는 clinic 전용 — lab 403');
  const gNo = await fetch(baseA + '/api/metrics/gate?role=clinic');
  assert(gNo.status === 401, '쿠키 없음 → 인증 게이트 401 (role 쿼리 무시)');
  /* 세션 터치 검증: DB에서 lastSeen 5일 전으로 낮춤 → 재기동(로드) → 활동 요청 → 갱신 확인 */
  const raw = require('/home/user/mirimiso-webapp/server/server.js').sqliteRaw();
  const row = raw.prepare('SELECT json FROM sessions WHERE token=?').get(tokC);
  const sj = JSON.parse(row.json);
  const oldSeen = new Date(Date.now() - 5 * 24 * 3600 * 1000);
  const pad = n => String(n).padStart(2, '0');
  sj.lastSeen = oldSeen.getFullYear() + '-' + pad(oldSeen.getMonth() + 1) + '-' + pad(oldSeen.getDate()) + ' ' + pad(oldSeen.getHours()) + ':' + pad(oldSeen.getMinutes()) + ':' + pad(oldSeen.getSeconds());
  raw.prepare('UPDATE sessions SET json=? WHERE token=?').run(JSON.stringify(sj), tokC);
  if (srvA.closeAllConnections) srvA.closeAllConnections();
  await new Promise(r => srvA.close(r));
  const srvA2 = createApp({ auth: true, persist: '/tmp/s37t.db' }).listen(0, '127.0.0.1');
  await new Promise(r => srvA2.on('listening', r));
  await sleep(150);
  const baseA2 = 'http://127.0.0.1:' + srvA2.address().port;
  await J(baseA2, 'GET', '/api/cases?role=clinic', null, 'mm_session=' + tokC);
  const row2 = JSON.parse(require('/home/user/mirimiso-webapp/server/server.js').sqliteRaw().prepare('SELECT json FROM sessions WHERE token=?').get(tokC).json);
  assert(new Date(row2.lastSeen).getTime() > oldSeen.getTime() + 4 * 24 * 3600 * 1000, 'GT-01: 활동 요청 → lastSeen 갱신 (60초 스로틀 터치·재기동 후)');
  const g3 = await J(baseA2, 'GET', '/api/metrics/gate', null, 'mm_session=' + tokC);
  assert(g3.ratePct === 100, '터치된 세션도 활성 계정으로 집계 (활성율 유지)');
  if (srvA2.closeAllConnections) srvA2.closeAllConnections();
  await new Promise(r => srvA2.close(r));

  console.log('=== B. 데모 — 계정 없음 안내 ===');
  const srvB = createApp().listen(0, '127.0.0.1');
  await new Promise(r => srvB.on('listening', r));
  await sleep(100);
  const baseB = 'http://127.0.0.1:' + srvB.address().port;
  const gB = await J(baseB, 'GET', '/api/metrics/gate?role=clinic');
  assert(gB.error !== undefined && gB.error.includes('인증 모드'), '데모 게이트 → 400 (계정 모드 안내)');
  if (srvB.closeAllConnections) srvB.closeAllConnections();
  await new Promise(r => srvB.close(r));

  console.log('=== C. 클라 — 운영 대시보드 게이트 카드 (jsdom) ===');
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
  w.MM.app.go('opsDash');
  await sleep(400);
  assert($('#odGate'), '운영 대시보드 — 게이트 1 카드');
  assert($('#odGate').textContent.includes('인증 모드'), '데모 → 계정 모드 안내 표시');
  assert(errors.length === 0, 'C 최종: errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  await dom.window.close();
  if (srvC.closeAllConnections) srvC.closeAllConnections();
  await new Promise(r => srvC.close(r));

  console.log('=== D. 문서 — 런북 v1.3·명세 AC-37 ===');
  const runbook = fs.readFileSync('/home/user/미리미소-배포런북.md', 'utf8');
  const spec = fs.readFileSync('/home/user/미리미소-작업명세.md', 'utf8');
  assert(runbook.includes('v1.3') && runbook.includes('게이트'), '런북 v1.3 — 게이트 계측 절차');
  assert(spec.includes('AC-37') && spec.includes('GT-01'), '명세 AC-37 (GT-01) 반영');

  console.log('--- S37 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
