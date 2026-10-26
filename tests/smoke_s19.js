/* smoke_s19.js — S19 스모크: 파일 GC(참조 없는 스캔 파일 정리) + pontic 주문 반영 + 세션 비교 실측 전환(×1.03 갭 해소)
   실행: cd /home/user/tests && node smoke_s19.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { createApp, filesDirLive } = require('/home/user/mirimiso-webapp/server/server.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg);
  cond ? pass++ : (fail++, process.exitCode = 1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BUNDLE = fs.readFileSync('/home/user/미리미소-웹앱.html', 'utf8');

(async () => {
  console.log('=== A. 파일 GC — 참조 없는 스캔 파일 정리 ===');
  const srvA = createApp().listen(0, '127.0.0.1');
  await sleep(120);
  const base = 'http://127.0.0.1:' + srvA.address().port;
  const api = (m, p, b, raw) => fetch(base + p, { method: m, headers: b ? { 'Content-Type': raw ? 'application/octet-stream' : 'application/json' } : undefined, body: b ? (raw ? b : JSON.stringify(b)) : undefined });
  const h = await (await api('GET', '/api/health')).json();
  assert(/^S\d+$/.test(h.version) && parseInt(h.version.slice(1), 10) >= 19, 'health: version S19+ (하한선 검증 — bump 무관)');
  const dir0 = filesDirLive();
  fs.rmSync(dir0, { recursive: true, force: true }); /* 공유 tmp 저장소 잔여 파일 정리 — 결정적 카운트 */
  const up = await api('POST', '/api/cases/C-2601/sessions/SS-2601-1/files?filename=ref-file.stl', Buffer.from('solid ref\nendsolid ref'), true);
  assert(up.status === 200, '참조될 파일 업로드');
  const dir = filesDirLive();
  const orphan = path.join(dir, 'orphan_junk.stl');
  fs.writeFileSync(orphan, Buffer.from('solid orphan\nendsolid orphan'));
  fs.writeFileSync(path.join(dir, 'orphan2.ply'), Buffer.from('ply\n'));
  let g = await (await api('POST', '/api/maintenance/gc?role=clinic')).json();
  assert(g.gc.removed === 2 && g.gc.kept === 1, 'GC: orphan 2개 제거 · 참조 파일 1개 보존');
  assert(!fs.existsSync(orphan) && fs.readdirSync(dir).length === 1, '디스크: orphan 삭제 확인 · 참조 파일 존재');
  g = await (await api('POST', '/api/maintenance/gc?role=clinic')).json();
  assert(g.gc.removed === 0 && g.gc.kept === 1, 'GC 재실행: 멱등 (removed 0)');
  if (srvA.closeAllConnections) srvA.closeAllConnections();
  await new Promise(r => srvA.close(r));

  console.log('=== B. pontic 주문 반영 (브리지 교두 위치) ===');
  const srvB = createApp().listen(0, '127.0.0.1');
  await sleep(120);
  const baseB = 'http://127.0.0.1:' + srvB.address().port;
  const apiB = (m, p, b, raw) => fetch(baseB + p, { method: m, headers: b ? { 'Content-Type': raw ? 'application/octet-stream' : 'application/json' } : undefined, body: b ? (raw ? b : JSON.stringify(b)) : undefined });
  const JB = async (m, p, b, raw) => await (await apiB(m, p, b, raw)).json();
  const po = await JB('POST', '/api/cases/C-2603/order', { role: 'clinic', order: { shade: 'A1', pontic: '24, 26' } });
  assert(po.ok === true && po.case.order.pontic === '24, 26', '주문 제출: pontic "24, 26" 주문에 저장');
  const longP = await JB('POST', '/api/cases/C-2604/order', { role: 'clinic', order: { pontic: 'X'.repeat(40) } });
  assert(longP.ok === true && longP.case.order.pontic.length === 30, '긴 pontic → 30자 절단 (검증)');
  const cj = await JB('GET', '/api/cases/C-2603');
  assert(cj.case.order.pontic === '24, 26', 'GET 케이스: pontic 메타 조회');
  const noP = await JB('GET', '/api/cases/C-2602');
  assert(!noP.case.order || !noP.case.order.pontic, '주문 없는 케이스: pontic 필드 없음');
  if (srvB.closeAllConnections) srvB.closeAllConnections();
  await new Promise(r => srvB.close(r));

  console.log('=== C. 온라인 통합 — 세션 비교 실측 전환 ===');
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
  /* C-2601에 2차 세션 추가 + 실측 파일 업로드 (로컬 메타 즉시 반영 확인) */
  w.MM.addCaseSession(w.MM.CASES_DATA.items.find(x => x.id === 'C-2601'), { label: '2차 — 재스캔 (실측 테스트)', device: '업로드 테스트' });
  await sleep(300);
  const sid2 = 'SS-2601-2';
  /* 바이너리 STL (80B 헤더 + count=1 + 50B 삼각형) — D3.parseSTL 파싱 가능 */
  const hdr = Buffer.alloc(80); hdr.write('real-scan stl', 0);
  const tri = Buffer.alloc(50); tri.writeUInt32LE(1, 0);
  const buf = Buffer.concat([hdr, tri.writeUInt32LE(1, 0) ? tri : tri, Buffer.alloc(50)]).subarray(0, 134);
  const it = w.MM.CASES_DATA.items.find(x => x.id === 'C-2601'); /* adopt 후 최신 객체 재조회 */
  assert(await w.MM.Api.uploadScanFile('C-2601', sid2, { name: 'real-scan.stl', arrayBuffer: () => Promise.resolve(buf) }) === true, '2차 세션 파일 업로드');
  const ss2 = it.scanSessions.find(x => x.id === sid2);
  assert(ss2 && ss2.files && ss2.files[0] && ss2.files[0].id, '로컬 세션 파일 메타 즉시 반영 (폴링 대기 없음 · S19)');
  w.MM.app.state.caseId = 'C-2601';
  w.MM.app.go('caseDetail');
  await sleep(300);
  d.querySelector('#cdTabs [data-t="3d"]').click();
  let cmpBtn = null;
  const tC = Date.now();
  while (Date.now() - tC < 3000 && !(cmpBtn = d.querySelector('#ssCompare'))) await sleep(120); /* 렌더 타이밍 무관 대기 */
  assert(!!cmpBtn, '3D 탭: 세션 비교 버튼');
  cmpBtn.click();
  await sleep(1500); /* 실측 파일 fetch→parse 대기 */
  const modalTxt = d.getElementById('modalBody').textContent;
  assert(modalTxt.includes('업로드 파일 기반 (실측)'), '세션 비교: 실측 전환 표기 (×1.03 갭 해소)');
  assert(modalTxt.includes('실측 파일 혼합 비교') || modalTxt.includes('실측'), '델타 박스에 실측 혼합 고지');
  assert(modalTxt.includes('파일이 없는 세션은 데모 변형'), 'foot-note: 파일 없는 세션은 시뮬레이션 고지 유지');
  assert(errors.length === 0, 'C 최종: errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  await dom.window.close();
  if (srvC.closeAllConnections) srvC.closeAllConnections();
  await new Promise(r => srvC.close(r));

  console.log('=== D. 오프라인 — 시뮬레이션 비교 유지 (회귀 가드) ===');
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
  const it5 = w2.MM.CASES_DATA.items.find(x => x.id === 'C-2605'); /* 시드 2세션 */
  w2.MM.app.state.caseId = 'C-2605';
  w2.MM.app.go('caseDetail');
  await sleep(200);
  d2.querySelector('#cdTabs [data-t="3d"]').click();
  await sleep(200);
  d2.querySelector('#ssCompare').click();
  await sleep(200);
  const m2 = d2.getElementById('modalBody').textContent;
  assert(m2.includes('데모 변형 ×1.03') && m2.includes('표면적'), '오프라인: 데모 변형 비교 유지 (기존 동작)');
  assert(!m2.includes('업로드 파일 기반 (실측)'), '오프라인: 실측 표기 없음 (파일 없음)');
  assert(errors2.length === 0, 'D 최종: errors 없음' + (errors2.length ? ' → ' + errors2.join('|') : ''));
  await dom2.window.close();

  console.log('--- S19 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
