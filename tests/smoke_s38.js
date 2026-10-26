/* smoke_s38.js — S38 스모크: 데이터 삭제 청구 이행 (계약서 제4조 제3항 — 완전 삭제 + 결과 통지)
   실행: cd /home/user/tests && node smoke_s38.js */
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
  console.log('=== A. auth — 삭제 실행·증명·세션 소멸 ===');
  const srvA = createApp({ auth: true }).listen(0, '127.0.0.1');
  await new Promise(r => srvA.on('listening', r));
  await sleep(100);
  const baseA = 'http://127.0.0.1:' + srvA.address().port;
  const login = async function (code) {
    const r = await fetch(baseA + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) });
    return (r.headers.get('set-cookie') || '').split(';')[0].split('=')[1];
  };
  const hA = await J(baseA, 'GET', '/api/health');
  assert(parseInt(hA.version.slice(1), 10) >= 38, 'health: version S38 이상');
  const tokC = await login('MIRI-CLINIC-2026');
  const tokP = await login('MIRI-PAT-2601');
  const tokL = await login('MIRI-LAB-2026');
  const p403 = await J(baseA, 'POST', '/api/maintenance/purge', { confirm: '삭제' }, 'mm_session=' + tokP);
  assert(p403.error !== undefined && p403.error.includes('clinic'), '환자 삭제 실행 → 403');
  const l403 = await J(baseA, 'POST', '/api/maintenance/purge', { confirm: '삭제' }, 'mm_session=' + tokL);
  assert(l403.error !== undefined, 'lab 삭제 실행 → 403');
  const n400 = await J(baseA, 'POST', '/api/maintenance/purge', {}, 'mm_session=' + tokC);
  assert(n400.error !== undefined && n400.error.includes('문구'), '확인 문구 누락 → 400');
  const w400 = await J(baseA, 'POST', '/api/maintenance/purge', { confirm: '지우기' }, 'mm_session=' + tokC);
  assert(w400.error !== undefined, '확인 문구 불일치 → 400');
  const ok = await J(baseA, 'POST', '/api/maintenance/purge', { confirm: '삭제' }, 'mm_session=' + tokC);
  assert(ok.ok === true && ok.proof.purged.cases === 5 && ok.proof.purged.sessions === 3, '삭제 실행 — 케이스 5·세션 3건 결과 통지');
  assert(Array.isArray(ok.proof.fileHashes) && ok.proof.fileHashes.every(f => /^[0-9a-f]{64}$/.test(f.sha256 || '')), '증명 — 파일 해시 목록(본문 데이터 없음)');
  const after = await J(baseA, 'GET', '/api/cases?role=clinic', null, 'mm_session=' + tokC);
  assert(after.error !== undefined, '삭제 후 기존 세션 → 401 (세션 완전 소멸)');
  const tokC2 = await login('MIRI-CLINIC-2026');
  assert(tokC2 && tokC2.length > 10, '계정 유지 — 재로그인 성립');
  const g2 = await J(baseA, 'GET', '/api/cases?role=clinic', null, 'mm_session=' + tokC2);
  assert(g2.cases && g2.cases.length === 0, '재접근 — 케이스 0건 (완전 삭제)');
  const au = await J(baseA, 'GET', '/api/audit?limit=20', null, 'mm_session=' + tokC2);
  assert(au.audit.some(a => a.act === 'data-purge' && a.detail.includes('결과 통지')), '삭제 → 감사로그 (증명)');
  if (srvA.closeAllConnections) srvA.closeAllConnections();
  await new Promise(r => srvA.close(r));

  console.log('=== B. 데모 — 계정 모드 안내 ===');
  const srvB = createApp().listen(0, '127.0.0.1');
  await new Promise(r => srvB.on('listening', r));
  await sleep(100);
  const baseB = 'http://127.0.0.1:' + srvB.address().port;
  const pB = await J(baseB, 'POST', '/api/maintenance/purge?role=clinic', { confirm: '삭제' });
  assert(pB.error !== undefined && pB.error.includes('인증 모드'), '데모 삭제 → 400 (계정 모드 안내)');
  if (srvB.closeAllConnections) srvB.closeAllConnections();
  await new Promise(r => srvB.close(r));

  console.log('=== C. 클라 — 종료·삭제 카드·가드 (jsdom) ===');
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
  await sleep(300);
  assert($('#odPurge'), '운영 대시보드 — 종료·삭제 청구 카드');
  $('#odPurge').click();
  await sleep(150);
  assert(d.getElementById('modalBody').textContent.includes('삭제 청구 실행'), '삭제 확인 모달 개설');
  d.getElementById('pgWord').value = '지우기';
  d.getElementById('pgGo').click();
  await sleep(150);
  assert(d.getElementById('toast').textContent.includes('일치하지 않'), '문구 불일치 → 가드 토스트');
  d.getElementById('pgNo').click();
  await sleep(100);
  assert(!d.getElementById('modalOverlay').classList.contains('show'), '취소 → 모달 닫힘');
  assert(errors.length === 0, 'C 최종: errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  await dom.window.close();
  if (srvC.closeAllConnections) srvC.closeAllConnections();
  await new Promise(r => srvC.close(r));

  console.log('=== D. 문서 — 계약 조항·명세 대응 ===');
  const contract = fs.readFileSync('/home/user/미리미소-파일럿계약서초안.md', 'utf8');
  const spec = fs.readFileSync('/home/user/미리미소-작업명세.md', 'utf8');
  assert(contract.includes('제4조') && contract.includes('S38'), '계약서 제4조3항 ↔ S38 구현 연계');
  assert(spec.includes('AC-38') && spec.includes('DL-01'), '명세 AC-38 (DL-01) 반영');

  console.log('--- S38 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
