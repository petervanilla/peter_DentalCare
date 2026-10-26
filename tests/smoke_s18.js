/* smoke_s18.js — S18 스모크 (M3): 전자동의 서명(SHA-256·HMAC) + 동의서 검증·변경 감지 + 운영 지표 리포트 자동 수집
   실행: cd /home/user/tests && node smoke_s18.js */
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
  console.log('=== A. 데모 서버 — 전자동의 서명·검증·리포트 ===');
  const srvA = createApp().listen(0, '127.0.0.1');
  await sleep(120);
  const base = 'http://127.0.0.1:' + srvA.address().port;
  const api = (m, p, b) => fetch(base + p, { method: m, headers: b ? { 'Content-Type': 'application/json' } : undefined, body: b ? JSON.stringify(b) : undefined });
  const J = async (m, p, b) => await (await api(m, p, b)).json();

  const h = await J('GET', '/api/health');
  assert(/^S\d+$/.test(h.version) && parseInt(h.version.slice(1), 10) >= 18, 'health: version S18+ (하한선 검증 — bump 무관)');
  const up = await J('POST', '/api/cases/C-2601/consent', { role: 'clinic', signerName: '김○○' });
  assert(up.ok === true && up.consent.id === 'CS-1' && up.consent.docHash.length === 64 && up.consent.sig.length === 64, '동의 서명 → CS-1 · SHA-256 해시 · HMAC 서명 기록');
  let cj = await J('GET', '/api/cases/C-2601');
  assert(cj.case.consents.length === 1 && cj.case.history[0].t.includes('전자동의 서명'), '케이스에 동의서 내장 + 히스토리 기록');
  let v = await J('POST', '/api/consent/verify', { caseId: 'C-2601', cid: 'CS-1' });
  assert(v.valid === true && v.caseChanged === false, '검증: 서명 무결성 ✓ · 케이스 상태 일치');
  await J('PATCH', '/api/cases/C-2601', { role: 'clinic', patch: { status: '주문' } });
  v = await J('POST', '/api/consent/verify', { caseId: 'C-2601', cid: 'CS-1' });
  assert(v.valid === true && v.caseChanged === true, '검증: 서명 후 케이스 변경 감지 (caseChanged)');
  const bad = await J('POST', '/api/cases/C-2601/consent', { role: 'clinic', signerName: '' });
  assert(bad.error !== undefined, '빈 서명자 → 400');
  let rp = await J('GET', '/api/report');
  assert(rp.current.funnel.cases === 5 && rp.current.consents === 1 && rp.last === null, '리포트: 현재값(5케이스·서명 1) · 수집분 없음');
  const cap = await J('POST', '/api/report/capture');
  assert(cap.ok === true && !!cap.report.ts, '리포트 수집(capture) → 스냅샷 저장');
  rp = await J('GET', '/api/report');
  assert(!!rp.last && rp.last.ts === cap.report.ts, 'GET /api/report → 마지막 수집분 반환');
  await new Promise(r => srvA.close(r));

  console.log('=== B. 영속 모드 — 서명·리포트 재시작 생존 (secret 영속) ===');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-s18-'));
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
  await fetch(baseB + '/api/cases/C-2601/consent', { method: 'POST', headers: HB(), body: JSON.stringify({ signerName: '영속서명' }) });
  await fetch(baseB + '/api/report/capture', { method: 'POST', headers: HB(), body: '{}' });
  if (srvB.closeAllConnections) srvB.closeAllConnections();
  await new Promise(r => srvB.close(r));

  srvB = createApp({ auth: true, persist: dbf }).listen(0, '127.0.0.1');
  await sleep(150);
  baseB = 'http://127.0.0.1:' + srvB.address().port;
  tok = await login(baseB);
  const cj2 = await (await fetch(baseB + '/api/cases/C-2601', { headers: HB() })).json();
  assert(cj2.case.consents.length === 1 && cj2.case.consents[0].signerName === '영속서명', '재시작 → 동의서 생존 (케이스 내장)');
  const v2 = await (await fetch(baseB + '/api/consent/verify', { method: 'POST', headers: HB(), body: JSON.stringify({ caseId: 'C-2601', cid: 'CS-1' }) })).json();
  assert(v2.valid === true, '재시작 후 검증 ✓ — HMAC 시크릿 영속 (meta)');
  const rp2 = await (await fetch(baseB + '/api/report', { headers: HB() })).json();
  assert(!!rp2.last && rp2.last.consents === 1, '재시작 → 수집 리포트 생존 (meta)');
  if (srvB.closeAllConnections) srvB.closeAllConnections();
  await new Promise(r => srvB.close(r));

  console.log('=== C. 온라인 통합 — 동의서 모달·리포트 버튼 ===');
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
  w.MM.app.go('caseHub');
  await sleep(300);
  assert(!!$('#btnReport'), 'caseHub 지표 카드: 주간 리포트 버튼 (M3)');
  const repC = await w.MM.Api.report();
  assert(repC.current.funnel.cases === 5, 'Api.report() → 5케이스');
  w.MM.app.state.caseId = 'C-2601';
  w.MM.app.go('caseDetail');
  await sleep(150);
  assert(!!$('#cdConsent'), 'caseDetail: 동의서 버튼 (M3)');
  $('#cdConsent').click();
  await sleep(100);
  $('#csName').value = '통합서명';
  $('#csSignOk').click();
  await sleep(500);
  const cItem = w.MM.CASES_DATA.items.find(x => x.id === 'C-2601');
  assert(cItem.consents && cItem.consents.length === 1 && cItem.consents[0].signerName === '통합서명', '온라인 서명 → 서버 기록 + 케이스 동기화');
  assert(errors.length === 0, 'C 최종: errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  await dom.window.close();
  if (srvC.closeAllConnections) srvC.closeAllConnections();
  await new Promise(r => srvC.close(r));

  console.log('=== D. 오프라인 — 로컬 서명 폴백 ===');
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
  await sleep(100);
  $2('#cdConsent').click();
  await sleep(80);
  $2('#csName').value = '오프라인서명';
  $2('#csSignOk').click();
  await sleep(200);
  const oItem = w2.MM.CASES_DATA.items.find(x => x.id === 'C-2601');
  assert(oItem.consents && oItem.consents[0] && oItem.consents[0].sig === 'OFFLINE-DEMO', '오프라인 서명 → 로컬 기록 (OFFLINE-DEMO 표기)');
  assert(errors2.length === 0, 'D 최종: errors 없음' + (errors2.length ? ' → ' + errors2.join('|') : ''));
  await dom2.window.close();

  console.log('--- S18 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
