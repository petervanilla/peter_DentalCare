/* smoke_s9.js — S9 스모크: G1 스캔 프로토콜 가이드 · G4 보철 유형 확장(pontic) · 메쉬 분석(비진단)
   실행: cd /home/user/tests && node smoke_s9.js */
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

  /* 0. analysis.js 로드 확인 (번들포함) */
  assert(errors.length === 0, 'boot: no errors');
  assert(window.MM.Analysis && typeof window.MM.Analysis.statsFromScenes === 'function', 'MM.Analysis 등록 (analysis.js 번들)');

  /* 1. 순수 분석 함수 — 데모 아치 메쉬 */
  const D3 = window.Dental3D;
  const scenes = [D3.buildArch('lower', {}, []), D3.buildArch('upper', {}, [])];
  const st = window.MM.Analysis.statsFromScenes(scenes);
  assert(st.triCount > 1000 && st.vertCount > 0, 'stats: 삼각형 ' + st.triCount + ' · 정점 ' + st.vertCount);
  assert(st.bbox && st.bbox.dx > 0 && st.bbox.dy > 0 && st.bbox.dz > 0, 'stats: 바운딩 박스 (' + st.bbox.dx.toFixed(1) + '×' + st.bbox.dy.toFixed(1) + '×' + st.bbox.dz.toFixed(1) + ')');
  assert(st.areaMm2 > 0 && st.volumeMm3 > 0, 'stats: 표면적 ' + st.areaMm2.toFixed(1) + 'mm² · 부피 ' + st.volumeMm3.toFixed(1) + 'mm³');
  assert(typeof st.holeClusters === 'number' && st.holeClusters >= 0 && typeof st.largestHoleEdges === 'number', 'stats: 비만영역 클러스터 ' + st.holeClusters + ' (최대 ' + st.largestHoleEdges + ' 에지)');
  assert(window.MM.Analysis.statsFromScenes([]).triCount === 0, 'stats: 빈 입력 안전');
  const cards = window.MM.Analysis.cardsHTML(st, '테스트 소스');
  assert(cards.includes('테스트 소스') && cards.includes('표면적') && cards.includes('비진단') === false && cards.includes('mm²'), 'cardsHTML: 표 구성');
  assert(window.MM.Analysis.flags(st).every(f => ['warn', 'info'].includes(f.cls)), 'flags: warn/info 한정');

  /* 2. 의료진 진입 */
  $$('.role-card')[1].click();
  if ($('#agreeRow')) { $('#agreeRow').click(); $('#agreeBtn').click(); }
  $('#goCaseHub').click();

  /* 3. G1: 프로토콜 가이드 (빠른 작업) */
  assert($$('.quick').length === 8, '빠른 작업 8종 (프로토콜 가이드 + S23 계정 발급)');
  $('#qaProtocol').click();
  assert($$('#ptSteps .pt-item').length === 5, '프로토콜 5단계');
  assert(document.body.textContent.includes('스캔바디 장착') && document.body.textContent.includes('emergence profile'), '단계 내용: 스캔바디·조직 스캔');
  assert($('#ptGo').disabled === true, '미충족 시 CTA 비활성');
  $$('#ptSteps .pt-item')[0].click();
  assert($('#ptCount').textContent === '1/5' && $('#ptGo').disabled === true, '1/5 진행 · CTA 유지');
  $$('#ptSteps .pt-item').slice(1).forEach(el => el.click()); /* 0번은 이미 체크됨 — 토글 중복 방지 */
  assert($('#ptCount').textContent === '5/5' && $('#ptGo').disabled === false, '5/5 → CTA 활성');
  $('#ptGo').click();
  await sleep(40);
  assert(document.getElementById('brandTitle').textContent === '환자 스캔 리뷰', 'CTA → 스캔 파일 업로드 화면');

  /* 4. 메쉬 분석 카드 (staffPatient) */
  assert($('#stAnalysis') && $('#btnAnalyze'), '분석 카드 + 버튼');
  assert(document.body.textContent.includes('참고 시각화 · 비진단'), '비진단 배지');
  $('#btnAnalyze').click();
  await sleep(30);
  const out1 = $('#stAnalysisOut').textContent;
  assert(out1.includes('데모 스캔') && out1.includes('표면적') && out1.includes('mm³'), '분석 결과: 데모 스캔 표·부피');
  assert(out1.includes('담당 치과의사'), '판단 주체 고지');

  /* 5. 케이스 상세 3D 탭 → 메쉬 분석 모달 */
  window.MM.app.go('caseHub');
  window.MM.app.state.caseId = 'C-2601';
  window.MM.app.go('caseDetail');
  $$('#cdTabs button')[1].click();
  assert($('#cdAnalyze'), '3D 탭 메쉬 분석 버튼');
  $('#cdAnalyze').click();
  await sleep(30);
  assert($('#modalOverlay').classList.contains('show') && $('#anClose'), '분석 모달');
  assert(document.querySelector('#modalBody').textContent.includes('참고 시각화 · 비진단') && document.querySelector('#modalBody').textContent.includes('비만영역'), '모달: 비진단·비만영역 표시');
  $('#anClose').click();

  /* 6. G4: 주문서 보철 유형 확장 + pontic */
  window.MM.app.state.caseId = 'C-2604';
  window.MM.app.go('labOrder');
  const proSlots = $$('[data-lib="보철 종류"] .slot').map(x => x.textContent);
  assert(proSlots.includes('브리지') && proSlots.includes('스크류 유지 크라운') && proSlots.includes('단일 크라운 (지르코니아)'), '보철 유형 5종 (' + proSlots.length + '개)');
  assert($('#ponticWrap').style.display === 'none', 'pontic 필드 초기 숨김');
  $$('[data-lib="보철 종류"] .slot').find(x => x.textContent === '브리지').click();
  assert($('#ponticWrap').style.display !== 'none', '브리지 선택 → pontic 위치 입력 표시');
  $('#loPontic').value = '24, 26';
  $$('[data-lib="보철 종류"] .slot')[0].click();
  assert($('#ponticWrap').style.display === 'none', '단일 크라운 복귀 → pontic 숨김');
  assert($('#loProtocol'), '주문서 프로토콜 확인 버튼');
  $('#loProtocol').click();
  assert($$('#ptSteps .pt-item').length === 5, '주문서에서도 프로토콜 모달');
  $('#ptNo').click();
  await sleep(20);
  assert($$('.lo-check').length === 5 && $('#loSubmit').disabled === true, '기존 제출 게이트(5체크) 유지');

  /* 7. 주문 제출 회귀 (G4 확장이 S5/S7 흐름을 깨지 않음) */
  $$('.lo-check').forEach(it => it.click());
  $('#loSubmit').click();
  await sleep(30);
  const c4 = window.MM.CASES_DATA.items.find(c => c.id === 'C-2604');
  assert(c4.order && c4.order.status === '제작 중', '주문 제출 정상 (order 부여)');

  assert(errors.length === 0, '최종: runtime errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  console.log('--- S9 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  window.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
