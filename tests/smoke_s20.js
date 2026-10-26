/* smoke_s20.js — S20 스모크: 주문 무결성(호환 검증 스냅샷 + 문서 해시·HMAC 서명) + obj 실측 비교(D70)
   실행: cd /home/user/tests && node smoke_s20.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('/home/user/mirimiso-webapp/server/server.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg);
  cond ? pass++ : (fail++, process.exitCode = 1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BUNDLE = fs.readFileSync('/home/user/미리미소-웹앱.html', 'utf8');

(async () => {
  console.log('=== A. 데모 서버 — 주문 서명·호환 스냅샷·검증 ===');
  const srvA = createApp().listen(0, '127.0.0.1');
  await sleep(120);
  const base = 'http://127.0.0.1:' + srvA.address().port;
  const api = (m, p, b) => fetch(base + p, { method: m, headers: b ? { 'Content-Type': 'application/json' } : undefined, body: b ? JSON.stringify(b) : undefined });
  const J = async (m, p, b) => await (await api(m, p, b)).json();

  const h = await J('GET', '/api/health');
  assert(/^S\d+$/.test(h.version) && parseInt(h.version.slice(1), 10) >= 20, 'health: version S20+ (하한선 검증 — bump 무관)');
  const od = await J('POST', '/api/cases/C-2603/order', { role: 'clinic', order: { shade: 'A1', pontic: '24, 26' } });
  assert(od.ok === true && /^[0-9a-f]{64}$/.test(od.case.order.docHash) && /^[0-9a-f]{64}$/.test(od.case.order.sig), '주문 제출 → 문서 해시·HMAC 서명 기록 (64hex)');
  assert(od.case.order.compat && od.case.order.compat.okCount === 4 && od.case.order.compat.verdict.includes('적합'), '호환성 검증 스냅샷 4/4 · 적합 판정 기록');
  let v = await J('POST', '/api/order/verify', { caseId: 'C-2603' });
  assert(v.signed === true && v.valid === true && v.orderChanged === false, '검증: 서명 무결성 ✓ · 제출 시점 그대로');
  await J('POST', '/api/cases/C-2603/lab-actions', { role: 'lab', action: 'done' });
  v = await J('POST', '/api/order/verify', { caseId: 'C-2603' });
  assert(v.valid === true && v.orderChanged === true, '검증: 제출 이후 주문 변경 감지 (완료 전환)');
  const sv = await J('POST', '/api/order/verify', { caseId: 'C-2601' });
  assert(sv.signed === false, '시드 주문(C-2601): 서명 기록 전 → signed:false');
  const nf = await J('POST', '/api/order/verify', { caseId: 'C-2602' });
  assert(nf.error !== undefined, '주문 없는 케이스 → 에러');
  if (srvA.closeAllConnections) srvA.closeAllConnections();
  await new Promise(r => srvA.close(r));

  console.log('=== B. 영속 모드 — 재시작 후 주문 검증 성립 ===');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-s20-'));
  const dbf = path.join(tmp, 'pilot.db');
  let srvB = createApp({ auth: true, persist: dbf }).listen(0, '127.0.0.1');
  await sleep(150);
  const login = async b2 => {
    const r = await fetch(b2 + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'MIRI-CLINIC-2026' }) });
    return (r.headers.get('set-cookie') || '').split(';')[0].split('=')[1];
  };
  let baseB = 'http://127.0.0.1:' + srvB.address().port;
  let tok = await login(baseB);
  const HB = () => ({ 'Content-Type': 'application/json', Cookie: 'mm_session=' + tok });
  await fetch(baseB + '/api/cases/C-2603/order', { method: 'POST', headers: HB(), body: JSON.stringify({ order: { shade: 'A1' } }) });
  if (srvB.closeAllConnections) srvB.closeAllConnections();
  await new Promise(r => srvB.close(r));
  srvB = createApp({ auth: true, persist: dbf }).listen(0, '127.0.0.1');
  await sleep(150);
  baseB = 'http://127.0.0.1:' + srvB.address().port;
  tok = await login(baseB);
  const v2 = await (await fetch(baseB + '/api/order/verify', { method: 'POST', headers: HB(), body: JSON.stringify({ caseId: 'C-2603' }) })).json();
  assert(v2.signed === true && v2.valid === true, '재시작 후 주문 검증 ✓ — HMAC 키 영속');
  if (srvB.closeAllConnections) srvB.closeAllConnections();
  await new Promise(r => srvB.close(r));

  console.log('=== C. 온라인 통합 — obj 실측 비교 + 주문 서명 UI ===');
  const srvC = createApp().listen(0, '127.0.0.1');
  await sleep(120);
  const baseC = 'http://127.0.0.1:' + srvC.address().port;
  const errors = [];
  const dom = new JSDOM(BUNDLE, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: baseC + '/',
    beforeParse(w) {
      w.fetch = (u, o) => fetch(new URL(u, baseC + '/').href, o);
      w.addEventListener('error', e => errors.push('onerror: ' + e.message));
    }
  });
  const w = dom.window, d = w.document, $ = s => d.querySelector(s);
  await sleep(700);
  $('.role-card').parentNode.querySelectorAll('.role-card')[1].click();
  if ($('#agreeRow')) { $('#agreeRow').click(); $('#agreeBtn').click(); }
  await sleep(300);
  /* 주문 제출 (온라인) → 서버 서명·호환 스냅샷 → 주문 탭 표시·검증 */
  await w.MM.Api.push({ type: 'order', caseId: 'C-2603', order: { shade: 'A1' } });
  await sleep(300);
  const c3 = w.MM.CASES_DATA.items.find(x => x.id === 'C-2603');
  assert(c3.order && c3.order.sig && c3.order.compat && c3.order.compat.okCount === 4, '온라인 주문 → 서명·호환 스냅샷 클라 동기화');
  w.MM.app.state.caseId = 'C-2603';
  w.MM.app.go('caseDetail');
  await sleep(300);
  d.querySelector('#cdTabs [data-t="ord"]').click();
  await sleep(300);
  const ordTxt = d.getElementById('cdBody').textContent;
  assert(ordTxt.includes('호환성 검증 (제출 시)') && ordTxt.includes('4/4'), '주문 탭: 호환 검증 스냅샷 표시');
  assert(ordTxt.includes('문서 서명 (S20)') && ordTxt.includes('HMAC'), '주문 탭: 문서 서명 표시');
  d.querySelector('#ovVerify').click();
  await sleep(400);
  assert(d.getElementById('toast').textContent.includes('무결성 ✓'), '검증 버튼 → 무결성 토스트');
  /* obj 실측: C-2601에 2세션 추가 + obj 업로드 → 비교 실측 전환 */
  w.MM.addCaseSession(w.MM.CASES_DATA.items.find(x => x.id === 'C-2601'), { label: '2차 — 재스캔 (obj 실측)', device: 'obj 테스트' });
  await sleep(300);
  const objTxt = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nv 1 1 0\nf 1 2 3\nf 2 4 3\n';
  assert(await w.MM.Api.uploadScanFile('C-2601', 'SS-2601-2', { name: 'real.obj', arrayBuffer: () => Promise.resolve(Buffer.from(objTxt)) }) === true, 'obj 파일 업로드');
  w.MM.app.state.caseId = 'C-2601';
  w.MM.app.go('caseDetail');
  await sleep(300);
  d.querySelector('#cdTabs [data-t="3d"]').click();
  await sleep(300);
  let cmpBtn = null;
  const tC = Date.now();
  while (Date.now() - tC < 3000 && !(cmpBtn = d.querySelector('#ssCompare'))) await sleep(120);
  cmpBtn.click();
  await sleep(1500);
  const mTxt = d.getElementById('modalBody').textContent;
  assert(mTxt.includes('업로드 파일 기반 (실측)'), 'obj 세션 → 실측 전환 표기 (D70 해소)');
  assert(errors.length === 0, 'C 최종: errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  await dom.window.close();
  if (srvC.closeAllConnections) srvC.closeAllConnections();
  await new Promise(r => srvC.close(r));

  console.log('=== D. 오프라인 — 시드 주문 렌더 가드 ===');
  const errors2 = [];
  const dom2 = new JSDOM(BUNDLE, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://demo.local/',
    beforeParse(w2) { w2.addEventListener('error', e => errors2.push('onerror: ' + e.message)); }
  });
  const w2 = dom2.window, d2 = w2.document, $2 = s => d2.querySelector(s);
  await sleep(400);
  $2('.role-card').parentNode.querySelectorAll('.role-card')[1].click();
  if ($2('#agreeRow')) { $2('#agreeRow').click(); $2('#agreeBtn').click(); }
  await sleep(200);
  w2.MM.app.state.caseId = 'C-2601';
  w2.MM.app.go('caseDetail');
  await sleep(200);
  d2.querySelector('#cdTabs [data-t="ord"]').click();
  await sleep(200);
  const o2 = d2.getElementById('cdBody').textContent;
  assert(o2.includes('기공 주문') && !o2.includes('문서 서명 (S20)'), '오프라인 시드 주문: 서명 행 없이 정상 렌더');
  assert(errors2.length === 0, 'D 최종: errors 없음' + (errors2.length ? ' → ' + errors2.join('|') : ''));
  await dom2.window.close();

  console.log('--- S20 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
