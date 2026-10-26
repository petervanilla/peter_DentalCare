/* smoke_s12.js — S12 스모크: STL 임포트→케이스 세션 등록(세션-파일 통합) + 운영 지표 히스토리(스파크라인)
   실행: cd /home/user/tests && node smoke_s12.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');

const html = fs.readFileSync('/home/user/미리미소-웹앱.html', 'utf8');
const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://demo.local/',
  beforeParse(window) {
    window.addEventListener('error', e => errors.push('onerror: ' + e.message));
  }
});
const { window } = dom;
const { document } = window;

/* jsdom 24에는 Blob#arrayBuffer/text가 없음 → FileReader 폴리필 (브라우저는 네이티브 지원 — 앱 코드 불변) */
window.Blob.prototype.arrayBuffer = function () {
  const b = this;
  return new Promise((res, rej) => {
    const fr = new window.FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error || new Error('read fail'));
    fr.readAsArrayBuffer(b);
  });
};
window.Blob.prototype.text = function () {
  const b = this;
  return new Promise((res, rej) => {
    const fr = new window.FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error || new Error('read fail'));
    fr.readAsText(b);
  });
};

let pass = 0, fail = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg);
  cond ? pass++ : (fail++, process.exitCode = 1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await sleep(400);
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  /* B. jsdom — STL 임포트 → 케이스 세션 등록 */
  assert(errors.length === 0, 'boot: no errors');
  assert(typeof window.MM.addCaseSession === 'function', 'MM.addCaseSession 공용 헬퍼 (S12)');
  $$('.role-card')[1].click();
  if ($('#agreeRow')) { $('#agreeRow').click(); $('#agreeBtn').click(); }
  window.MM.app.state.staffPatient = 0;
  window.MM.app.go('staffPatient');
  assert($('#btnRegSession') && $('#btnRegSession').style.display === 'none', '등록 버튼: 임포트 전 숨김');

  /* STL 파일 주입 → 임포트 */
  const F = window.MM.Formats, D3 = window.Dental3D;
  const scenes = [D3.buildArch('lower', {}, [])];
  const stl = F.buildBinarySTL(F.fromScenes(scenes, false).positions);
  const file = new window.File([new window.Uint8Array(stl)], 'scan_v2.stl');
  const input = $('#stlFile');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new window.Event('change'));
  await sleep(400);
  assert($('#stlStatus').textContent.indexOf('✓') === 0 && $('#stlStatus').textContent.includes('scan_v2.stl'), 'STL 임포트 성공 (✓ scan_v2.stl)');
  assert($('#btnRegSession').style.display !== 'none', '임포트 후 등록 버튼 표시');

  /* 케이스 선택 모달 → C-2601 등록 */
  $('#btnRegSession').click();
  await sleep(30);
  assert($('#modalOverlay').classList.contains('show') && $$('#modalBody [data-sc]').length === 5, '케이스 선택 모달 (칩 5개)');
  $('#modalBody [data-sc="C-2601"]').click();
  await sleep(40);
  const c1 = window.MM.CASES_DATA.items.find(c => c.id === 'C-2601');
  assert(c1.scanSessions.length === 2 && c1.scanSessions[1].label === '재스캔 — 업로드 파일', 'C-2601 세션 등록 (업로드 파일 라벨)');
  assert(c1.scanSessions[1].device === 'scan_v2.stl' && c1.history[0].t.includes('스캔 세션 등록'), '세션 메타: 파일명 장치·히스토리');
  assert(document.getElementById('brandTitle').textContent === '케이스 상세', '등록 후 케이스 상세로 이동');

  /* 등록된 세션 → 3D 탭 비교 분석 연결 */
  $$('#cdTabs button')[1].click();
  await sleep(30);
  assert($$('#cdSessions .file-row').length === 2 && $('#ssCompare'), '세션 카드 2건 → 비교 버튼');
  $('#ssCompare').click();
  await sleep(30);
  assert(document.querySelector('#modalBody').textContent.includes('scan_v2.stl'), '비교 모달에 업로드 세션 표시');
  $('#ssCmpClose').click();

  /* 5개 제한 (오프라인 로컬) */
  const c2 = window.MM.CASES_DATA.items.find(c => c.id === 'C-2602');
  let ok = true;
  for (let i = 0; i < 5; i++) ok = window.MM.addCaseSession(c2, { label: '세션 ' + (i + 1) }) && ok;
  assert(ok === true && (c2.scanSessions || []).length === 5, 'C-2602 세션 5개까지 등록');
  assert(window.MM.addCaseSession(c2, { label: '6번째' }) === false, '6번째 등록 차단 (최대 5개)');

  console.log('--- S12 client smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');

  /* A. 서버 — 지표 히스토리 */
  const { createApp } = require('/home/user/mirimiso-webapp/server/server.js');
  const server = createApp().listen(0, '127.0.0.1');
  await sleep(150);
  const baseUrl = 'http://127.0.0.1:' + server.address().port;
  const api = (m, p, b) => fetch(baseUrl + p, { method: m, headers: b ? { 'Content-Type': 'application/json' } : undefined, body: b ? JSON.stringify(b) : undefined });
  const J = async (m, p, b) => await (await api(m, p, b)).json();

  await J('POST', '/api/reset');
  let mx = await J('GET', '/api/metrics');
  assert(mx.funnel.cases === 5 && mx.history.length === 0, '초기: 5케이스·히스토리 0');
  await J('POST', '/api/cases', { role: 'clinic', patient: '추○○', tooth: '36', proc: '히스토리 테스트 (데모)' });
  mx = await J('GET', '/api/metrics');
  assert(mx.history.length === 1 && mx.history[0].seq === 1 && mx.history[0].cases === 6, '변경 1회 → 스냅샷 1 (6케이스)');
  assert(mx.history[0].conversion === 33, '스냅샷 전환율 33% (2/6)');
  await J('PATCH', '/api/cases/C-2606', { role: 'clinic', patch: { status: '주문' } });
  await J('POST', '/api/cases/C-2601/sessions', { role: 'clinic', session: { label: '추적 세션 (데모)' } });
  mx = await J('GET', '/api/metrics');
  assert(mx.history.length === 3 && mx.history[2].sessions === 4, '변경 3회 → 세션 4건 스냅샷');
  assert(mx.history.every((h, i) => h.seq === i + 1), '스냅샷 seq 연속성');
  await J('POST', '/api/reset');
  mx = await J('GET', '/api/metrics');
  assert(mx.history.length === 0 && mx.funnel.cases === 5, 'reset: 히스토리 초기화');
  server.close();

  /* C. 온라인 모킹 — 허브 스파크라인 */
  window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ demo: true, funnel: { cases: 5, ordersSubmitted: 2, orderConversionPct: 40, scanSessions: 3, urgent: 2, mods: 1 }, history: [{ seq: 1, conversion: 40 }, { seq: 2, conversion: 33 }, { seq: 3, conversion: 50 }] }) });
  window.MM.Api.online = true;
  window.MM.app.go('caseHub');
  await sleep(80);
  assert($('#mxMode') && $('#mxMode').textContent.includes('서버 계량'), '온라인: 서버 계량 모드');
  assert($('#mxBody svg') && $('#mxBody').textContent.includes('전환율 추이'), '히스토리 스파크라인 렌더 (S12)');
  window.MM.Api.online = false;
  delete window.fetch;

  assert(errors.length === 0, '최종: runtime errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  console.log('--- S12 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
