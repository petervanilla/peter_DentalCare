/* smoke_s10.js — S10 스모크: 치아별(FDI) 지표·데칼 계량·운영 지표(/api/metrics·허브 카드)
   실행: cd /home/user/tests && node smoke_s10.js */
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

  /* A. 순수 함수 — 치아별 지표 */
  const D3 = window.Dental3D, A = window.MM.Analysis;
  assert(errors.length === 0, 'boot: no errors');
  const scenes = [
    D3.buildArch('lower', { 46: { status: 'implant' }, 38: { status: 'missing' } }, [{ fdi: 36, kind: 'plaque', u: 0.5, v: 0.62, r: 0.22 }]),
    D3.buildArch('upper', {}, [])
  ];
  const by = A.statsByTooth(scenes);
  const whole = A.statsFromScenes(scenes);
  assert(by.teeth.length >= 24 && by.teeth.some(t => t.fdi === 46) && by.teeth.some(t => t.fdi === 36), 'statsByTooth: ' + by.teeth.length + '개 치아 매핑 (46·36 포함)');
  assert(!by.teeth.some(t => t.fdi === 38), '결손치(38)는 매핑 제외');
  const t36 = by.teeth.find(t => t.fdi === 36);
  assert(t36.decals.plaque > 0 && t36.decalArea === undefined, '36 데칼 마킹 면적 ' + t36.decals.plaque.toFixed(3) + ' mm² (계량)');
  const sumArea = by.teeth.reduce((s, t) => s + t.area, 0) + by.unmapped.area;
  const sumTri = by.teeth.reduce((s, t) => s + t.tri, 0) + by.unmapped.tri;
  assert(Math.abs(sumArea - whole.areaMm2) < whole.areaMm2 * 0.005 && sumTri === whole.triCount, '정합성: 치아별 합계 = 전체 통계 (면적·삼각형)');
  assert(by.unmapped.tri > 0, '잇몸(gum) 등 비치아 면 unmapped 집계 (' + by.unmapped.tri + ' tri)');
  const soup = D3.triSoupScene(new Float32Array(9), 'scan');
  const bySoup = A.statsByTooth([soup]);
  assert(bySoup.teeth.length === 0 && bySoup.unmapped.tri === 1, '업로드 soup: 치아 매핑 없음 → unmapped');
  const gridSoup = A.toothGridHTML(bySoup, {});
  assert(gridSoup.includes('Phase B') && gridSoup.includes('세그멘테이션'), 'soup 그리드: Phase B 고지 (정직한 경계)');
  const grid = A.toothGridHTML(by, { 36: { status: 'natural' }, 46: { status: 'implant' } });
  assert(grid.includes('플라크') && grid.includes('36') && grid.includes('임플란트') && grid.includes('mm²'), '그리드: 치아·상태·마킹·면적 표기');

  /* B. staffPatient — 분석 카드에 치아별 지표 */
  $$('.role-card')[1].click();
  if ($('#agreeRow')) { $('#agreeRow').click(); $('#agreeBtn').click(); }
  window.MM.app.state.staffPatient = 0;
  window.MM.app.go('staffPatient');
  $('#btnAnalyze').click();
  await sleep(30);
  const out = $('#stAnalysisOut').textContent;
  assert(out.includes('치아별 지표') && out.includes('우식의심') && out.includes('플라크'), '분석 카드: 치아별 지표 + 마킹 배지 (26 우식·36/37/33 플라크)');
  assert(out.includes('개 매핑'), '매핑 치아 수 요약');

  /* C. caseDetail 모달 — 마킹 요약 */
  window.MM.app.state.caseId = 'C-2601';
  window.MM.app.go('caseDetail');
  $$('#cdTabs button')[1].click();
  $('#cdAnalyze').click();
  await sleep(30);
  assert(document.querySelector('#modalBody').textContent.includes('마킹 요약'), '케이스 분석 모달: 마킹 요약');
  $('#anClose').click();

  /* D. 케이스 허브 — 운영 지표 카드 (오프라인 로컬 계량) */
  window.MM.app.go('caseHub');
  await sleep(30);
  const mx = $('#mxBody').textContent;
  assert($('#mxMode').textContent.includes('로컬 계량'), '오프라인: 로컬 계량 모드');
  assert(mx.includes('주문 전환') && mx.includes('40%'), '지표: 주문 전환 40% (2/5)');
  assert(mx.includes('긴급') && mx.includes('수정 요청'), '지표: 긴급·수정 요청 칩');
  const cs = window.MM.CASES_DATA.items;
  const expOrders = cs.filter(c => !!c.order).length;
  assert(mx.includes(expOrders + ''), '지표: 주문 제출 ' + expOrders + '건 (케이스 상태와 일치)');

  /* E. api.metrics 헬퍼 (스텁) */
  window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ demo: true, funnel: { cases: 5, ordersSubmitted: 2, orderConversionPct: 40 } }) });
  const mj = await window.MM.Api.metrics();
  assert(mj.funnel && mj.funnel.orderConversionPct === 40, 'Api.metrics 헬퍼 동작');
  delete window.fetch;

  console.log('--- S10 client smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');

  /* F. 서버 /api/metrics (별도 인스턴스) */
  const { createApp } = require('/home/user/mirimiso-webapp/server/server.js');
  const server = createApp().listen(0, '127.0.0.1');
  await sleep(150);
  const base = 'http://127.0.0.1:' + server.address().port;
  const api = (m, p, b) => fetch(base + p, { method: m, headers: b ? { 'Content-Type': 'application/json' } : undefined, body: b ? JSON.stringify(b) : undefined });
  let m1 = await (await api('GET', '/api/metrics')).json();
  assert(m1.demo === true && m1.funnel.cases === 5 && m1.funnel.ordersSubmitted === 2, '서버 지표: 5케이스·주문 2건');
  assert(m1.funnel.orderConversionPct === 40 && m1.funnel.urgent === 2 && m1.funnel.modifyRequests === 1, '서버 지표: 전환 40%·긴급 2·수정요청 1');
  assert(m1.activity.changes === 0 && m1.funnel.byStatus['제작'] >= 1, '서버 지표: 상태 분포·활동 로그');
  await api('POST', '/api/cases', { role: 'clinic', patient: '테○○', tooth: '36', proc: '지표 확인용 (데모)' });
  m1 = await (await api('GET', '/api/metrics')).json();
  assert(m1.funnel.cases === 6 && m1.funnel.orderConversionPct === 33, '생성 후: 6케이스·전환율 33%로 재계산');
  await api('POST', '/api/reset');
  m1 = await (await api('GET', '/api/metrics')).json();
  assert(m1.funnel.cases === 5 && m1.funnel.orderConversionPct === 40, 'reset 후: 지표 복원');
  server.close();

  assert(errors.length === 0, '최종: runtime errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  console.log('--- S10 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
