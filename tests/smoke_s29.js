/* smoke_s29.js — S29 스모크: 파일럿 보안 하드닝 — 로그인 시도 제한(429)·타이밍 안전 코드 비교·세션 30일 만료·보안 헤더·실패 감사로그
   실행: cd /home/user/tests && node smoke_s29.js */
const { createApp } = require('/home/user/mirimiso-webapp/server/server.js');
const { JSDOM } = require('jsdom');
const fs = require('fs');

let pass = 0, fail = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg);
  cond ? pass++ : (fail++, process.exitCode = 1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = async (base, m, p, b, cookie) => {
  const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: b ? JSON.stringify(b) : undefined });
  const h = {};
  ['x-content-type-options', 'referrer-policy', 'set-cookie'].forEach(k => { const v = r.headers.get(k); if (v) h[k] = v; });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  return { status: r.status, j, h };
};
const login = (base, code) => J(base, 'POST', '/api/auth/login', { code: code });

(async () => {
  console.log('=== A. 보안 헤더 + version ===');
  const srvA = createApp({ auth: true }).listen(0, '127.0.0.1');
  await sleep(120);
  const base = 'http://127.0.0.1:' + srvA.address().port;
  const h = await J(base, 'GET', '/api/health');
  assert(parseInt(String(h.j.version).replace('S',''), 10) >= 29 && h.h['x-content-type-options'] === 'nosniff' && h.h['referrer-policy'] === 'strict-origin-when-cross-origin',
    'health: version S29 이상 · 보안 헤더(nosniff·referrer-policy) 적용');
  assert(h.j.signer && h.j.signer.mode === 'hmac', 'signer 블록 유지 (S25 회귀 없음)');

  console.log('=== B. 로그인 하드닝 ===');
  const ok = await login(base, 'MIRI-CLINIC-2026');
  assert(ok.status === 200 && ok.j.ok === true && /HttpOnly/.test(ok.h['set-cookie'] || '') && /SameSite=Lax/.test(ok.h['set-cookie'] || ''),
    '정상 코드 로그인 성립 (timing-safe 경로 · 쿠키 속성 유지)');
  const ck = 'mm_session=' + (ok.h['set-cookie'] || '').split(';')[0].split('=')[1];
  const me = await J(base, 'GET', '/api/auth/me', null, ck);
  assert(me.status === 200 && me.j.role === 'clinic', '세션 유효 (me 응답 정상)');

  const fails = [];
  for (let i = 0; i < 10; i++) {
    const r = await login(base, 'WRONG-' + i);
    fails.push(r.status === 401 && r.j.error.includes('유효하지 않은'));
  }
  assert(fails.every(Boolean), '잘못된 코드 10회 모두 401 (오류 메시지 유지)');
  const locked = await login(base, 'WRONG-11');
  assert(locked.status === 429 && locked.j.error.includes('15분'), '연속 실패 10회 → 429 잠금 (15분 메시지)');
  const evenOk = await login(base, 'MIRI-CLINIC-2026');
  assert(evenOk.status === 429, '잠금 중 올바른 코드도 429 (브루트포스 차단 우선)');
  const au = await J(base, 'GET', '/api/audit?limit=50', null, ck);
  assert(au.j.audit.some(a => a.act === 'login:fail') && !au.j.audit.some(a => (a.detail || '').includes('WRONG-')), '실패 시도 감사로그 기록 · 코드 원문 미기록(길이만)');

  console.log('=== C. 세션·가드 회귀 ===');
  const bad = await J(base, 'GET', '/api/cases', null, 'mm_session=invalid-token-123');
  assert(bad.status === 401, '무효 세션 토큰 → 401 (기존 동작 유지)');
  const demo = createApp().listen(0, '127.0.0.1');
  await sleep(120);
  const baseD = 'http://127.0.0.1:' + demo.address().port;
  const dl = await login(baseD, 'MIRI-CLINIC-2026');
  assert(dl.status === 400 && dl.j.error.includes('인증 모드가 아닙니다'), '데모 모드: 로그인 400 안내 유지 · 잠금 미적용(비인증 경로)');
  const dh = await J(baseD, 'GET', '/api/health');
  assert(dh.h['x-content-type-options'] === 'nosniff', '데모 모드도 보안 헤더 적용');
  if (demo.closeAllConnections) demo.closeAllConnections();
  await new Promise(r => demo.close(r));
  if (srvA.closeAllConnections) srvA.closeAllConnections();
  await new Promise(r => srvA.close(r));

  console.log('=== D. 클라 회귀 — 로그인 플로우 (auth 모드 jsdom) ===');
  const BUNDLE = fs.readFileSync('/home/user/미리미소-웹앱.html', 'utf8');
  const errors = [];
  const srvD = createApp({ auth: true }).listen(0, '127.0.0.1');
  await sleep(120);
  const baseC = 'http://127.0.0.1:' + srvD.address().port;
  const dom = new JSDOM(BUNDLE, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: baseC + '/',
    beforeParse(w) {
      w.fetch = (u, o) => fetch(new URL(u, baseC + '/').href, o);
      w.scrollTo = () => {};
      w.addEventListener('error', e => errors.push('onerror: ' + e.message));
    }
  });
  const d = dom.window.document;
  await sleep(700);
  assert(d.body.textContent.includes('초대코드') || d.querySelector('#loginCode, [data-login]'), 'auth 모드: 초대코드 게이트 노출');
  const codeInput = d.querySelector('#inviteCode');
  assert(codeInput, '로그인 코드 입력 필드 (#inviteCode)');
  codeInput.value = 'MIRI-CLINIC-2026';
  const goBtn = d.querySelector('#codeLogin');
  goBtn.click();
  await sleep(600);
  assert(!errors.length, 'D 최종: errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  await dom.window.close();
  if (srvD.closeAllConnections) srvD.closeAllConnections();
  await new Promise(r => srvD.close(r));

  console.log('--- S29 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
