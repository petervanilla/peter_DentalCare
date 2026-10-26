/* smoke_s36.js — S36 스모크: 파일럿 종료 데이터 내보내기 (계약 의무의 기능 이행)
   실행: cd /home/user/tests && node smoke_s36.js */
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
  console.log('=== A. auth — 내보내기 경계·형식 ===');
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
  const tokP = await login('MIRI-PAT-2601');
  const hA = await J(baseA, 'GET', '/api/health');
  assert(parseInt(hA.version.slice(1), 10) >= 36, 'health: version S36 이상');
  const eL = await fetch(baseA + '/api/maintenance/export', { headers: { Cookie: 'mm_session=' + tokL } });
  assert(eL.status === 403, '내보내기 lab → 403');
  const eP = await fetch(baseA + '/api/maintenance/export', { headers: { Cookie: 'mm_session=' + tokP } });
  assert(eP.status === 403, '내보내기 patient → 403');
  const eC = await fetch(baseA + '/api/maintenance/export', { headers: { Cookie: 'mm_session=' + tokC } });
  assert(eC.status === 200 && (eC.headers.get('content-disposition') || '').includes('mirimiso-export-'), 'clinic → 첨부 파일 헤더 (mirimiso-export-*.json)');
  const eJ = await eC.json();
  assert(eJ.meta && eJ.meta.counts && typeof eJ.meta.counts.cases === 'number' && Array.isArray(eJ.cases) && Array.isArray(eJ.files) && Array.isArray(eJ.audit), '본문 형식 — meta.counts + cases + files(sha256) + audit');
  assert(eJ.cases.length === eJ.meta.counts.cases && eJ.cases.length === 5, '전체 케이스 포함 (5건 시드 일치)');
  assert(eJ.cases.every(c => Array.isArray(c.history)), '케이스 히스토리 포함 (계약 조항)');
  const au = await J(baseA, 'GET', '/api/audit?limit=20', null, 'mm_session=' + tokC);
  assert(au.audit.some(a => a.act === 'data-export'), '내보내기 → 감사로그');
  if (srvA.closeAllConnections) srvA.closeAllConnections();
  await new Promise(r => srvA.close(r));

  console.log('=== B. 데모 — body role ===');
  const srvB = createApp().listen(0, '127.0.0.1');
  await new Promise(r => srvB.on('listening', r));
  await sleep(100);
  const baseB = 'http://127.0.0.1:' + srvB.address().port;
  const eB = await fetch(baseB + '/api/maintenance/export?role=clinic');
  assert(eB.status === 200 && (await eB.json()).meta.counts.cases === 5, '데모 role=clinic → 내보내기 성립');
  const eB2 = await fetch(baseB + '/api/maintenance/export?role=lab');
  assert(eB2.status === 403, '데모 role=lab → 403');
  if (srvB.closeAllConnections) srvB.closeAllConnections();
  await new Promise(r => srvB.close(r));

  console.log('=== C. 클라 — 운영 대시보드 내보내기 버튼 (jsdom) ===');
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
      w.URL.createObjectURL = () => 'blob:mock-s36';
      w.URL.revokeObjectURL = () => {};
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
  assert($('#odExport'), '운영 대시보드 — 데이터 내보내기 버튼');
  $('#odExport').click();
  await sleep(600);
  assert(d.getElementById('toast').textContent.includes('내보내기 완료'), '클릭 → 다운로드 + 완료 토스트');
  assert(errors.length === 0, 'C 최종: errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  await dom.window.close();
  if (srvC.closeAllConnections) srvC.closeAllConnections();
  await new Promise(r => srvC.close(r));

  console.log('=== D. 문서 — 계약 조항 연계 ===');
  const contract = fs.readFileSync('/home/user/미리미소-파일럿계약서초안.md', 'utf8');
  const spec = fs.readFileSync('/home/user/미리미소-작업명세.md', 'utf8');
  assert(contract.includes('내보내기를 지원') && spec.includes('AC-36'), '계약서 제2조(내보내기 지원) ↔ 명세 AC-36 대응');

  console.log('--- S36 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
