/* smoke_s42.js — S42 스모크: 계정 수명주기 완결 (회수·재활성 — 발급만 있던 수명주기의 마지막 단계)
   실행: cd /home/user/tests && node smoke_s42.js */
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
  console.log('=== A. auth — 회수→차단→재활성 라이프사이클 ===');
  const srvA = createApp({ auth: true }).listen(0, '127.0.0.1');
  await new Promise(r => srvA.on('listening', r));
  await sleep(100);
  const baseA = 'http://127.0.0.1:' + srvA.address().port;
  const login = async function (code) {
    const r = await fetch(baseA + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) });
    return { st: r.status, ck: (r.headers.get('set-cookie') || '').split(';')[0].split('=')[1], j: await r.json() };
  };
  const hA = await J(baseA, 'GET', '/api/health');
  assert(parseInt(hA.version.slice(1), 10) >= 42, 'health: version S42 이상');
  const tC = await login('MIRI-CLINIC-2026');
  assert(tC.st === 200, 'clinic 로그인');
  const tL = await login('MIRI-LAB-2026');
  const tL2 = await login('MIRI-LAB-2026');
  assert(tL.st === 200 && tL2.st === 200, 'lab 세션 2개 준비');
  const uL = await J(baseA, 'POST', '/api/auth/revoke', { code: 'MIRI-LAB-2026' }, 'mm_session=' + tL.ck);
  assert(uL.error !== undefined && uL.error.includes('clinic'), '회수 clinic 전용 — lab 실행 → 403 (요청자 검사)');
  const rv = await J(baseA, 'POST', '/api/auth/revoke', { code: 'MIRI-LAB-2026' }, 'mm_session=' + tC.ck);
  assert(rv.ok === true && rv.killed === 2, '회수 — 활성 세션 2건 즉시 차단');
  assert(rv.seed === true && rv.notice.includes('시드'), '시드 코드 — 데모 회수 고지');
  const cs = await J(baseA, 'GET', '/api/cases?role=lab', null, 'mm_session=' + tL.ck);
  assert(cs.error !== undefined, '회수 후 기존 세션 → 401');
  const re2 = await login('MIRI-LAB-2026');
  assert(re2.st === 403 && re2.j.error.includes('회수된'), '회수된 코드 로그인 → 403 (안내)');
  const users1 = await J(baseA, 'GET', '/api/auth/users', null, 'mm_session=' + tC.ck);
  assert(users1.users.some(u => u.code === 'MIRI-LAB-2026' && u.active === false), '계정 목록 — active:false 표시');
  const rct = await J(baseA, 'POST', '/api/auth/reactivate', { code: 'MIRI-LAB-2026' }, 'mm_session=' + tC.ck);
  assert(rct.ok === true, '재활성');
  const re3 = await login('MIRI-LAB-2026');
  assert(re3.st === 200, '재활성 후 로그인 성립');
  /* 가드: 본인 회수·마지막 clinic */
  const g1 = await J(baseA, 'POST', '/api/auth/revoke', { code: 'MIRI-CLINIC-2026' }, 'mm_session=' + tC.ck);
  assert(g1.error !== undefined && g1.error.includes('본인'), '본인 계정 회수 → 400');
  const g2 = await J(baseA, 'POST', '/api/auth/revoke', { code: 'MM-XXXX' }, 'mm_session=' + tC.ck);
  assert(g2.error !== undefined, '없는 코드 회수 → 404');
  const au = await J(baseA, 'GET', '/api/audit?limit=20', null, 'mm_session=' + tC.ck);
  assert(au.audit.some(a => a.act === 'account:demo-revoke' || a.act === 'account:revoke') && au.audit.some(a => a.act === 'account:reactivate'), '회수(시드=demo-revoke)·재활성 → 감사로그');
  /* 게이트 — 회수 계정은 전체 계수 제외 확인 */
  const tP = await login('MIRI-PAT-2601');
  const g3 = await J(baseA, 'GET', '/api/metrics/gate', null, 'mm_session=' + tC.ck);
  assert(g3.ok === true && g3.totalAccounts === 3, '게이트 — 재활성 후 전체 3계정 기준');
  if (srvA.closeAllConnections) srvA.closeAllConnections();
  await new Promise(r => srvA.close(r));

  console.log('=== B. 데모 — 인증 전용 안내 ===');
  const srvB = createApp().listen(0, '127.0.0.1');
  await new Promise(r => srvB.on('listening', r));
  await sleep(100);
  const baseB = 'http://127.0.0.1:' + srvB.address().port;
  const pB = await J(baseB, 'POST', '/api/auth/revoke?role=clinic', { code: 'X' });
  assert(pB.error !== undefined && pB.error.includes('인증 모드'), '데모 회수 → 인증 모드 안내');
  if (srvB.closeAllConnections) srvB.closeAllConnections();
  await new Promise(r => srvB.close(r));

  console.log('=== C. 클라 — 발급 모달 관리 UI (jsdom) ===');
  const srvC = createApp({ auth: true }).listen(0, '127.0.0.1');
  await new Promise(r => srvC.on('listening', r));
  await sleep(100);
  const baseC = 'http://127.0.0.1:' + srvC.address().port;
  const errors = [];
  const jar = {}; /* S42: jsdom은 Set-Cookie 비보관 — 세션 쿠키 jar (S16 패턴) */
  const dom = new JSDOM(BUNDLE, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: baseC + '/',
    beforeParse(w) {
      w.fetch = (u, o) => {
        o = o || {};
        const ck = Object.keys(jar).map(k => k + '=' + jar[k]).join('; ');
        o.headers = Object.assign({}, o.headers, ck ? { Cookie: ck } : {});
        return fetch(new URL(u, baseC + '/').href, o).then(res => {
          (res.headers.getSetCookie ? res.headers.getSetCookie() : []).forEach(c => { const kv = c.split(';')[0]; const i = kv.indexOf('='); if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1); });
          return res;
        });
      };
      w.scrollTo = () => {};
      w.addEventListener('error', e => errors.push('onerror: ' + e.message));
    }
  });
  const w = dom.window, d = w.document, $ = s => d.querySelector(s);
  await sleep(700);
  $('#inviteCode').value = 'MIRI-CLINIC-2026';
  $('#codeLogin').click();
  await sleep(700);
  w.MM.app.state.role = 'staff';
  w.MM.app.go('caseHub');
  await sleep(400);
  d.getElementById('qaInvite').click();
  await sleep(300);
  const listEl = d.getElementById('ivList');
  assert(listEl && listEl.textContent.includes('MIRI'), '계정 발급 모달 — 최근 발급 목록');
  const rvBtn = listEl.querySelector('[data-rv="MIRI-LAB-2026"]');
  assert(rvBtn, 'lab 계정 — 회수 버튼 표시');
  rvBtn.click();
  await sleep(150);
  assert(d.getElementById('modalBody').textContent.includes('계정 회수'), '회수 확인 모달');
  d.getElementById('rvGo').click();
  await sleep(300);
  assert(d.getElementById('toast').textContent.includes('회수'), '회수 실행 → 토스트');
  await sleep(600);
  /* S43 정정: 회수 성공 시 초대 모달 유지·갱신 — 재오픈 없이 '회수됨' 즉시 표시 (D111·UX-01) */
  const listEl2 = d.getElementById('ivList');
  assert(listEl2 && listEl2.textContent.includes('회수됨'), '모달 유지 — 회수됨 즉시 표시');
  assert(errors.length === 0, 'C 최종: errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  await dom.window.close();
  if (srvC.closeAllConnections) srvC.closeAllConnections();
  await new Promise(r => srvC.close(r));

  console.log('=== D. 문서 — 명세 AC-42 ===');
  const spec = fs.readFileSync('/home/user/미리미소-작업명세.md', 'utf8');
  assert(spec.includes('AC-42') && spec.includes('AC-02') && spec.includes('AC-03') && spec.includes('AC-43') && spec.includes('UX-01'), '명세 AC-42/AC-43 (수명주기·UX 정정) 반영');

  console.log('--- S42 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
