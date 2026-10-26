/* smoke_s25.js — S25 스모크: 서명 어댑터 계층(ES-01·D63 승격) — HMAC 기본·외부 전자서명 게이트웨이 계약·폴백·판정 보류·alg 디스패치
   실행: cd /home/user/tests && node smoke_s25.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { createApp } = require('/home/user/mirimiso-webapp/server/server.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg);
  cond ? pass++ : (fail++, process.exitCode = 1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BUNDLE = fs.readFileSync('/home/user/미리미소-웹앱.html', 'utf8');
const J = async (base, m, p, b) => await (await fetch(base + p, { method: m, headers: b ? { 'Content-Type': 'application/json' } : undefined, body: b ? JSON.stringify(b) : undefined })).json();

/* 외부 전자서명 게이트웨이 모의 — 어댑터 계약 구현체 (sign/verify) */
function startMockSigner() {
  const SEC = 'mock-ca-key-2026';
  const mac = h => 'ES256-MOCK:' + crypto.createHmac('sha256', SEC).update(h).digest('hex').slice(0, 48);
  const srv = http.createServer((rq, rs) => {
    let body = '';
    rq.on('data', ch => { body += ch; });
    rq.on('end', () => {
      const j = JSON.parse(body || '{}');
      if (rq.url === '/sign') {
        rs.writeHead(200, { 'Content-Type': 'application/json' });
        rs.end(JSON.stringify({ sig: mac(j.docHash), alg: 'ES256-MOCK', keyId: 'mock-ca-2026' }));
      } else if (rq.url === '/verify') {
        rs.writeHead(200, { 'Content-Type': 'application/json' });
        rs.end(JSON.stringify({ valid: j.sig === mac(j.docHash) }));
      } else { rs.writeHead(404); rs.end('{}'); }
    });
  });
  return new Promise(res => srv.listen(0, '127.0.0.1', () => res({ srv, port: srv.address().port })));
}

(async () => {
  console.log('=== A. 기본 어댑터 — HMAC-SHA256 (S18/S20 바이트 호환) ===');
  const srvA = createApp().listen(0, '127.0.0.1');
  await sleep(120);
  const baseA = 'http://127.0.0.1:' + srvA.address().port;
  const h = await J(baseA, 'GET', '/api/health');
  assert(parseInt(String(h.version).replace('S',''), 10) >= 25 && h.signer && h.signer.mode === 'hmac' && h.signer.alg === 'HMAC-SHA256' && h.signer.fallback === false,
    'health: version S25 · signer {hmac, HMAC-SHA256, 폴백 없음}');
  const cs = await J(baseA, 'POST', '/api/cases/C-2601/consent', { role: 'clinic', signerName: '서명테스트' });
  assert(cs.ok === true && cs.consent.alg === 'HMAC-SHA256' && cs.consent.keyId === 'server-hmac',
    '동의 서명 → alg HMAC-SHA256 · keyId server-hmac 기록');
  let cv = await J(baseA, 'POST', '/api/consent/verify', { caseId: 'C-2601', cid: cs.consent.id });
  assert(cv.valid === true && cv.alg === 'HMAC-SHA256' && !cv.unverified, '동의 검증 ✓ (HMAC · alg 표시)');
  const od = await J(baseA, 'POST', '/api/cases/C-2603/order', { role: 'clinic', order: { shade: 'A1' } });
  assert(od.ok === true && od.case.order.alg === 'HMAC-SHA256' && /^[0-9a-f]{64}$/.test(od.case.order.sig), '주문 제출 → alg HMAC-SHA256 · 64hex 서명');
  cv = await J(baseA, 'POST', '/api/order/verify', { caseId: 'C-2603' });
  assert(cv.valid === true && cv.alg === 'HMAC-SHA256' && cv.orderChanged === false, '주문 검증 ✓ (제출 시점 그대로 · alg 표시)');
  if (srvA.closeAllConnections) srvA.closeAllConnections();
  await new Promise(r => srvA.close(r));

  console.log('=== B. 외부 어댑터 — 게이트웨이 계약 (sign/verify) + 판정 보류 ===');
  const mock = await startMockSigner();
  const baseB = 'http://127.0.0.1:' + mock.port;
  const srvB = createApp({ signer: 'external', signerEndpoint: baseB }).listen(0, '127.0.0.1');
  await sleep(120);
  const base = 'http://127.0.0.1:' + srvB.address().port;
  const h2 = await J(base, 'GET', '/api/health');
  assert(h2.signer.mode === 'external' && h2.signer.fallback === false, 'health: 외부 어댑터 활성 (폴백 없음)');
  const cs2 = await J(base, 'POST', '/api/cases/C-2601/consent', { role: 'clinic', signerName: '외부서명자' });
  assert(cs2.ok === true && cs2.consent.alg === 'ES256-MOCK' && cs2.consent.keyId === 'mock-ca-2026',
    '동의 서명 → 외부 게이트웨이 경유 (alg ES256-MOCK · keyId mock-ca-2026)');
  cv = await J(base, 'POST', '/api/consent/verify', { caseId: 'C-2601', cid: cs2.consent.id });
  assert(cv.valid === true && cv.alg === 'ES256-MOCK', '동의 검증 ✓ — 외부 서비스 경유 판정 (alg 유지)');
  const od2 = await J(base, 'POST', '/api/cases/C-2603/order', { role: 'clinic', order: { shade: 'A1' } });
  assert(od2.ok === true && od2.case.order.alg === 'ES256-MOCK', '주문 제출 → 외부 전자서명 (ES256-MOCK)');
  cv = await J(base, 'POST', '/api/order/verify', { caseId: 'C-2603' });
  assert(cv.valid === true && cv.alg === 'ES256-MOCK', '주문 검증 ✓ — 외부 경유 (alg 유지)');
  /* 판정 보류: 검증 서비스 다운 → valid:false + unverified (기존 서명은 alg 디스패치로 외부에 문의) */
  await new Promise(r => mock.srv.close(r));
  cv = await J(base, 'POST', '/api/order/verify', { caseId: 'C-2603' });
  assert(cv.unverified === true && cv.valid === false && (cv.notice || '').includes('판정 보류'), '검증 서비스 다운 → 판정 보류 (unverified · notice)');
  const cs3 = await J(base, 'POST', '/api/cases/C-2602/consent', { role: 'clinic', signerName: '다운후서명' });
  assert(cs3.error !== undefined && (await fetch(base + '/api/health')).status === 200, '서명은 소리 없이 실패하지 않음 — 502 계열 에러 (loud failure)');
  if (srvB.closeAllConnections) srvB.closeAllConnections();
  await new Promise(r => srvB.close(r));

  console.log('=== C. 폴백 — external 지정·엔드포인트 미설정 → HMAC + 공지 ===');
  const srvC = createApp({ signer: 'external' }).listen(0, '127.0.0.1');
  await sleep(120);
  const baseC = 'http://127.0.0.1:' + srvC.address().port;
  const h3 = await J(baseC, 'GET', '/api/health');
  assert(h3.signer.mode === 'hmac' && h3.signer.fallback === true && (h3.signer.notice || '').includes('MM_SIGNER_ENDPOINT'),
    'external·엔드포인트 미설정 → HMAC 폴백 + notice');
  const cs4 = await J(baseC, 'POST', '/api/cases/C-2601/consent', { role: 'clinic', signerName: '폴백서명' });
  cv = await J(baseC, 'POST', '/api/consent/verify', { caseId: 'C-2601', cid: cs4.consent.id });
  assert(cs4.ok === true && cv.valid === true && cv.alg === 'HMAC-SHA256', '폴백 상태에서도 서명·검증 성립 (HMAC)');
  if (srvC.closeAllConnections) srvC.closeAllConnections();
  await new Promise(r => srvC.close(r));

  console.log('=== D. 클라 — alg 표시 (labCase 서명 행 · 운영 대시보드) ===');
  const srvD = createApp().listen(0, '127.0.0.1');
  await sleep(120);
  const baseD = 'http://127.0.0.1:' + srvD.address().port;
  const errors = [];
  const dom = new JSDOM(BUNDLE, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: baseD + '/',
    beforeParse(w) {
      w.fetch = (u, o) => fetch(new URL(u, baseD + '/').href, o);
      w.scrollTo = () => {};
      w.addEventListener('error', e => errors.push('onerror: ' + e.message));
    }
  });
  const w = dom.window, d = w.document, $ = s => d.querySelector(s);
  await sleep(700);
  $('.role-card').parentNode.querySelectorAll('.role-card')[1].click();
  if ($('#agreeRow')) { $('#agreeRow').click(); $('#agreeBtn').click(); }
  await sleep(900);
  await w.MM.Api.push({ type: 'order', caseId: 'C-2603', order: { shade: 'A1' } });
  await w.MM.Api.push({ type: 'session', caseId: 'C-2603', session: { label: '제작 기준 (데모)' } });
  w.MM.app.state.caseId = 'C-2603';
  w.MM.app.state.role = 'lab';
  w.MM.app.go('labCase');
  await sleep(400);
  const labTxt = d.getElementById('root').textContent;
  assert(labTxt.includes('HMAC-SHA256 · 위변조 방지'), 'labCase: 서명 방식(alg) 표시 — HMAC-SHA256');
  assert(!labTxt.includes('외부 전자서명 ·'), 'labCase: HMAC 기록엔 외부 배지 미표시');
  w.MM.app.state.role = 'staff';
  w.MM.app.state.caseId = 'C-2603';
  w.MM.app.go('caseDetail');
  await sleep(400);
  const ordTab = Array.prototype.slice.call(d.querySelectorAll('#cdTabs button')).filter(function (b) { return b.getAttribute('data-t') === 'ord'; })[0];
  if (ordTab) ordTab.click();
  await sleep(300);
  assert(d.getElementById('root').textContent.includes('HMAC-SHA256 서명 기록'), 'caseDetail 주문 탭: 서명 행 alg 표시 (검증 버튼 옆)');
  w.MM.app.state.role = 'staff';
  w.MM.app.go('opsDash');
  await sleep(400);
  assert(d.getElementById('root').textContent.includes('서명 HMAC-SHA256'), '운영 대시보드: 활성 서명 어댑터 표기');
  assert(errors.length === 0, 'D 최종: errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  await dom.window.close();
  if (srvD.closeAllConnections) srvD.closeAllConnections();
  await new Promise(r => srvD.close(r));

  console.log('=== E. 오프라인 — labCase alg 기본값 회귀 ===');
  const errors2 = [];
  const dom2 = new JSDOM(BUNDLE, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://demo.local/',
    beforeParse(w2) { w2.scrollTo = () => {}; w2.addEventListener('error', e => errors2.push('onerror: ' + e.message)); }
  });
  const w2 = dom2.window, d2 = w2.document;
  await sleep(400);
  d2.querySelector('.role-card').parentNode.querySelectorAll('.role-card')[1].click();
  if (d2.querySelector('#agreeRow')) { d2.querySelector('#agreeRow').click(); d2.querySelector('#agreeBtn').click(); }
  await sleep(400);
  const c2603 = (w2.MM.CASES_DATA.items || []).filter(function (x) { return x.id === 'C-2603'; })[0];
  c2603.order = c2603.order || { shade: 'A1', docHash: 'ab'.repeat(32), compat: { okCount: 4, verdict: '적합 (참고 자료 · 최종 판단은 기공사·치과의사)' } }; /* 오프라인 데모 주문 — alg 무기록(구기록 호환 경로) */
  w2.MM.app.state.caseId = 'C-2603';
  w2.MM.app.state.role = 'lab';
  w2.MM.app.go('labCase');
  await sleep(300);
  assert(d2.getElementById('root').textContent.includes('HMAC-SHA256 · 위변조 방지'), '오프라인: alg 무기록도 HMAC-SHA256 기본 표기 (하위 호환)');
  assert(errors2.length === 0, 'E 최종: errors 없음' + (errors2.length ? ' → ' + errors2.join('|') : ''));
  await dom2.window.close();

  console.log('--- S25 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
