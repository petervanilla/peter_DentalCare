/* smoke_s46.js — S46 스모크: 개인화·보안 검토 반영 — 조건부 Secure 쿠키·prefs 서버 정규화·잠금 회귀·개인화 동기화·클라 방어
   실행: cd /home/user/tests && node smoke_s46.js */
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
  console.log('=== A. 보안 — 조건부 Secure·잠금 회귀·prefs 정규화 (SV-01/02) ===');
  const srv = createApp({ auth: true }).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  await sleep(120);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const h = await J(base, 'GET', '/api/health');
  assert(parseInt(h.version.slice(1), 10) >= 46, 'health: version S46 이상');

  const loginRaw = async (code, xf) => await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(xf ? { 'X-Forwarded-Proto': xf } : {}) }, body: JSON.stringify({ code: code }) });
  const rHttp = await loginRaw('MIRI-CLINIC-2026');
  const ckHttp = (rHttp.headers.get('set-cookie') || '');
  assert(/HttpOnly/.test(ckHttp) && /SameSite=Lax/.test(ckHttp) && !/Secure/.test(ckHttp), '로컬 http 로그인 쿠키 — HttpOnly·SameSite=Lax·Secure 미포함(로컬 동작 유지)');
  const ck = ckHttp.split(';')[0];

  const rHttps = await loginRaw('MIRI-LAB-2026', 'https');
  const ckHttps = (rHttps.headers.get('set-cookie') || '');
  assert(/HttpOnly/.test(ckHttps) && /Secure/.test(ckHttps) && /SameSite=Lax/.test(ckHttps), 'HTTPS 프록시 경유(X-Forwarded-Proto: https) — 쿠키에 Secure 추가 (SV-01)');

  assert((await fetch(base + '/api/cases?role=clinic', { headers: { Cookie: ck } })).headers.get('x-content-type-options') === 'nosniff', '보안 헤더 — nosniff 유지');

  const pBad = await J(base, 'POST', '/api/me/prefs', { prefs: { zoom: '<script>', theme: 'evil', nick: '가'.repeat(30) } }, ck); /* 계약: {prefs:…} 랩핑 (S46 검증 루프 — 스모크 버그 정정) */
  assert(pBad.ok === true && pBad.prefs.zoom === 'm' && pBad.prefs.theme === '' && pBad.prefs.nick.length === 12, 'prefs 서버 정규화 — 화이트리스트 외 무시·nick 12자 절단 (SV-02)');
  const pGet = await J(base, 'GET', '/api/me/prefs', null, ck);
  assert(pGet.prefs.zoom === 'm' && pGet.prefs.theme === '' && pGet.prefs.nick.length === 12, '정규화 값만 저장 — GET으로 재확인');

  console.log('=== B. 개인화 — 기기+계정 동기화·클라 방어 (PE 실측) ===');
  const jar = {};
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: base + '/', beforeParse(w) {
    w.fetch = (u, o) => { o = o || {}; const ck2 = Object.keys(jar).map(k => k + '=' + jar[k]).join('; '); o.headers = Object.assign({}, o.headers, ck2 ? { Cookie: ck2 } : {}); return fetch(new URL(String(u), base + '/').href, o).then(res => { (res.headers.getSetCookie ? res.headers.getSetCookie() : []).forEach(c => { const kv = c.split(';')[0]; const i = kv.indexOf('='); if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1); }); return res; }); };
    w.scrollTo = () => {};
  } });
  const w = dom.window, d = w.document;
  await sleep(900);
  d.querySelector('#inviteCode').value = 'MIRI-CLINIC-2026';
  d.querySelector('#codeLogin').click();
  await sleep(800);
  w.MM.savePrefs({ zoom: 'l', theme: 'blue', nick: '3진료실' });
  await sleep(500);
  const saved = JSON.parse(w.localStorage.getItem('MM_PREFS') || '{}');
  assert(saved.zoom === 'l' && saved.theme === 'blue' && saved.nick === '3진료실', '설정 저장 — 기기(localStorage) 즉시 반영');
  const pfSync = await J(base, 'GET', '/api/me/prefs', null, 'mm_session=' + jar.mm_session);
  assert(pfSync.prefs && pfSync.prefs.nick === '3진료실' && pfSync.prefs.theme === 'blue', '계정 동기화 — 서버에도 저장 (다른 기기 로그인 시 복원)');
  w.MM.applyPrefs({ zoom: 's', theme: 'evil' });
  const mint = d.documentElement.style.getPropertyValue('--mint');
  assert(mint === '' && d.body.style.zoom === '0.9', '클라 방어 — 화이트리스트 외 테마 주입은 CSS 변경 무시·정상 항목만 적용');

  /* 잠금 회귀는 클라 검증(B) 이후 — 모듈 공유 LOGIN_FAILS가 후속 로그인을 막지 않도록 (S46 검증 루프) */
  for (let i = 0; i < 10; i++) await loginRaw('WRONG-' + i);
  const locked = await loginRaw('MIRI-PAT-2601');
  assert(locked.status === 429, '잠금 회귀 — 연속 실패 10회 → 429 (S29 유지 확인)');

  console.log('=== C. 문서 — 검토 리포트·명세 AC-46 ===');
  const review = fs.readFileSync('/home/user/미리미소-개인화·보안검토.md', 'utf8');
  const spec = fs.readFileSync('/home/user/미리미소-작업명세.md', 'utf8');
  assert(review.includes('SV-01') && review.includes('위협 모델'), '검토 리포트: 개인화·보안 의견 문서 존재 (위협 모델·보완 로드맵)');
  assert(spec.includes('AC-46') && spec.includes('SV-02'), '명세 AC-46 반영');

  if (srv.closeAllConnections) srv.closeAllConnections();
  await new Promise(r => srv.close(r));
  console.log('--- S46 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  process.exit(fail ? 1 : 0); /* jsdom 폴링 타이머가 이벤트 루프를 유지 — s42 패턴으로 명시 종료 (S46 검증 루프) */
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
