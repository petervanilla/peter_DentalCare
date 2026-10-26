/* smoke_s32.js — S32 스모크: 개인화(PE-01) + 자료공유(SH-01 폴백) + 내부 네트워크 화면 미러링(MI-01) + 블루투스 불가 문서(BL-01)
   실행: cd /home/user/tests && node smoke_s32.js */
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
  console.log('=== A. 데모 서버 — 미러 경계 + 뷰어 ===');
  const srvA = createApp().listen(0, '127.0.0.1');
  await new Promise(r => srvA.on('listening', r));
  await sleep(100);
  const baseA = 'http://127.0.0.1:' + srvA.address().port;
  const hA = await J(baseA, 'GET', '/api/health');
  assert(parseInt(hA.version.slice(1), 10) >= 32, 'health: version S32 이상');
  const denied = await J(baseA, 'POST', '/api/mirror/start', { role: 'patient', nick: 'x' });
  assert(denied.error !== undefined, '데모 미러 시작 role=patient → 403');
  const st = await J(baseA, 'POST', '/api/mirror/start', { role: 'clinic', nick: '3진료실' });
  assert(st.ok === true && /^[0-9a-f]{6}$/.test(st.id) && st.path === '/mirror/' + st.id, '미러 시작 — 6자 id + 뷰어 경로');
  const fr = await J(baseA, 'POST', '/api/mirror/' + st.id + '/frame?role=clinic', { img: 'data:image/jpeg;base64,AAAA' });
  assert(fr.ok === true, '프레임 전송 (clinic)');
  const frBad = await J(baseA, 'POST', '/api/mirror/' + st.id + '/frame?role=lab', { img: 'x' });
  assert(frBad.error !== undefined, '프레임 전송 lab → 403');
  const frGet = await J(baseA, 'GET', '/api/mirror/' + st.id + '/frame');
  assert(frGet.nick === '3진료실' && frGet.img && frGet.img.indexOf('data:image/jpeg') === 0, '뷰어 폴링용 프레임 조회 — 닉네임·이미지');
  const big = await J(baseA, 'POST', '/api/mirror/' + st.id + '/frame?role=clinic', { img: 'x'.repeat(300001) });
  assert(big.error !== undefined, '프레임 300KB 초과 → 413');
  const vp = await (await fetch(baseA + '/mirror/' + st.id)).text();
  assert(vp.includes('보기 전용') && vp.includes('var ID="' + st.id + '"') && vp.includes('/api/mirror/'), '뷰어 페이지 — 보기 전용 고지 + 폴링 스크립트(ID 주입)');
  const gone = await J(baseA, 'GET', '/api/mirror/ffffff/frame');
  assert(gone.error !== undefined, '없는/만료 미러 → 404');
  const pd = await J(baseA, 'GET', '/api/me/prefs');
  assert(pd.error !== undefined, '데모 prefs GET → 400 (기기 저장 안내)');
  if (srvA.closeAllConnections) srvA.closeAllConnections();
  await new Promise(r => srvA.close(r));

  console.log('=== B. auth 서버 — 계정 동기화 + 권한 ===');
  const srvB = createApp({ auth: true }).listen(0, '127.0.0.1');
  await new Promise(r => srvB.on('listening', r));
  await sleep(100);
  const baseB = 'http://127.0.0.1:' + srvB.address().port;
  const login = async function (code) {
    const r = await fetch(baseB + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) });
    return (r.headers.get('set-cookie') || '').split(';')[0].split('=')[1];
  };
  const tok = await login('MIRI-CLINIC-2026');
  const p0 = await J(baseB, 'GET', '/api/me/prefs', null, 'mm_session=' + tok);
  assert(p0.prefs && Object.keys(p0.prefs).length === 0, 'prefs 초기 조회 — 빈 객체');
  const p1 = await J(baseB, 'POST', '/api/me/prefs', { prefs: { zoom: 'l', theme: 'blue', nick: '3진료실 태블릿' } }, 'mm_session=' + tok);
  assert(p1.ok === true, 'prefs 저장');
  const p2 = await J(baseB, 'GET', '/api/me/prefs', null, 'mm_session=' + tok);
  assert(p2.prefs.theme === 'blue' && p2.prefs.nick === '3진료실 태블릿', 'prefs 재조회 — 계정 동기화 확인');
  const p3 = await J(baseB, 'POST', '/api/me/prefs', { prefs: { big: 'x'.repeat(500) } }, 'mm_session=' + tok);
  assert(p3.error !== undefined, 'prefs 400자 초과 → 400');
  const tokL = await login('MIRI-LAB-2026');
  const ml = await J(baseB, 'POST', '/api/mirror/start', { nick: 'lab' }, 'mm_session=' + tokL);
  assert(ml.error !== undefined && ml.error.includes('clinic'), 'auth lab 미러 시작 → 403');
  const tok2 = await login('MIRI-CLINIC-2026');
  const st2 = await J(baseB, 'POST', '/api/mirror/start', { nick: 'm' }, 'mm_session=' + tok2);
  assert(st2.ok === true, 'auth clinic 미러 시작 성립');
  const au = await J(baseB, 'GET', '/api/audit?limit=50', null, 'mm_session=' + tok2);
  assert(au.audit.some(a => a.act === 'mirror:start'), '미러 시작 → 감사로그');
  if (srvB.closeAllConnections) srvB.closeAllConnections();
  await new Promise(r => srvB.close(r));

  console.log('=== C. 클라 — 설정·공유·미러 UI (jsdom) ===');
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
  assert(d.getElementById('setBtn').style.display === 'none', '역할 선택 전 — 설정 버튼 숨김');
  $('.role-card').click();
  if ($('#agreeRow')) { $('#agreeRow').click(); $('#agreeBtn').click(); }
  await sleep(300);
  assert(d.getElementById('setBtn').style.display !== 'none', '역할 진입 후 — 설정 버튼 표시');
  w.MM.app.state.role = 'staff';
  d.getElementById('setBtn').click();
  await sleep(200);
  assert(d.getElementById('modalBody').textContent.includes('개인화 설정'), '설정 모달 개설');
  const bigBtn = d.querySelector('#pfSize [data-zoom="l"]');
  bigBtn.click();
  const blueBtn = d.querySelector('#pfTheme [data-theme="blue"]');
  blueBtn.click();
  await sleep(100);
  assert(d.documentElement.style.getPropertyValue('--mint') === '#5B9BD5', '테마 즉시 적용 — 루트 변수 치환(blue)');
  d.getElementById('pfNick').value = '3진료실';
  d.getElementById('pfSave').click();
  await sleep(200);
  const saved = JSON.parse(w.localStorage.getItem('MM_PREFS') || '{}');
  assert(saved.zoom === 'l' && saved.theme === 'blue' && saved.nick === '3진료실', '설정 저장 — MM_PREFS (zoom·theme·nick)');
  w.MM.app.state.role = 'patient';
  w.MM.app.go('home');
  await sleep(300);
  assert($('#hShare'), '환자 홈 — 공유 버튼 (건강 요약)');
  w.MM.shareText('t', '본문');
  await sleep(150);
  assert(d.getElementById('toast').textContent.includes('공유 제한') || d.getElementById('toast').textContent.includes('클립보드'), 'shareText 폴백 — 제한 안내 or 클립보드');
  w.MM.app.state.role = 'staff';
  w.MM.app.go('opsDash');
  await sleep(300);
  assert($('#miStart'), '운영 대시보드 — 화면 미러링 카드');
  $('#miStart').click();
  await sleep(150);
  assert(d.getElementById('toast').textContent.includes('캡처 미지원'), '미러 가드 — 캡처 미지원 브라우저 안내 (jsdom)');
  assert(errors.length === 0, 'C 최종: errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  await dom.window.close();
  if (srvC.closeAllConnections) srvC.closeAllConnections();
  await new Promise(r => srvC.close(r));

  console.log('=== D. BL-01 — 블루투스 불가 판정 문서 ===');
  const rep = fs.readFileSync('/home/user/미리미소-요구분석-S32.md', 'utf8');
  assert(rep.includes('웹 표준 한계로') && rep.includes('Web Bluetooth') && rep.includes('내부 네트워크'), '요구분석 리포트: 블루투스 불가 근거·대체 수단 명시');

  console.log('--- S32 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
