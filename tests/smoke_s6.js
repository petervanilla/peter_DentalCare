/* smoke_s6.js — S6 회귀: 기공소 큐·호환 검증·협업 루프·권한 (재구축본)
   실행: cd /home/user/tests && node smoke_s6.js */
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
  const cases = () => window.MM.CASES_DATA.items;

  /* 0. 3역할 + 기공소 진입 */
  assert($$('.role-card').length === 3, '3 role cards');
  assert(document.body.textContent.includes('가상 시뮬레이션과 사전 문진'), 'positioning copy');
  assert(window.MM.VIEWS.labHome && window.MM.VIEWS.labCase, 'lab views registered');
  $$('.role-card')[2].click();
  assert($('#modalOverlay').classList.contains('show') && document.body.textContent.includes('기공소 계정'), 'lab 전용 동의 모달');
  $('#agreeRow').click(); $('#agreeBtn').click();
  assert(document.getElementById('brandTitle').textContent === '기공소 큐', 'lab home 진입');
  assert($('.role-chip').textContent === '기공소 모드', '기공소 모드 칩');

  /* 1. 큐 + KPI + 호환 배지 */
  assert($$('#root [data-lc]').length === 2, '주문 큐 2건 (C-2601·C-2604, 완료 제외)');
  assert($$('#root [data-lc]')[0].getAttribute('data-lc') === 'C-2604', '납기순 정렬 (C-2604 먼저)');
  assert(document.body.textContent.includes('호환 4/4') && document.body.textContent.includes('호환 2/4'), '호환 배지 (C-2601 4/4 · C-2604 2/4)');
  assert(document.body.textContent.includes('접수 대기') && document.body.textContent.includes('제작 중') && document.body.textContent.includes('납기 임박'), 'KPI 칩');
  assert($$('.dday').length === 2 && document.body.textContent.includes('D-14'), 'D-day 배지');
  assert(document.body.textContent.includes('환자 소견') && document.body.textContent.includes('감사로그'), '권한 안내 상시 고지');

  /* 2. 기공 케이스 상세 */
  $('[data-lc="C-2601"]').click();
  assert(document.getElementById('brandTitle').textContent === '기공 케이스', 'lab case 진입');
  assert($$('.compat-row').length === 4, '호환 카드 4항목');
  assert(document.body.textContent.includes('SB-001') && document.body.textContent.includes('내부 육각'), '제작 정보 칩');
  assert($('#lbCanvas'), '3D 뷰어 마운트');
  const rt = $('#root').textContent;
  assert(!rt.includes('AI 초기 제안') && !rt.includes('환자 동의 완료') && !rt.includes('상담 · 치료계획 설명'), '권한 필터: AI 제안·환자 동의·상담 기록 미노출 (S8에서 발견·수정)');
  assert($$('[data-lf]').length === 3, '파일 3건');
  $$('[data-lf]')[0].click();
  assert($('#toast').textContent.length > 0, '다운로드 토스트 (체크섬 or 제한 분기)');

  /* 3. 수정 요청 루프 */
  $('#lbModify').click();
  assert($$('#mdReasons .slot').length === 4, '수정 사유 4종');
  $$('#mdReasons .slot')[2].click();
  document.getElementById('mdMemo').value = '근원측 접촉 재조정';
  $('#mdSend').click();
  await sleep(30);
  assert($('#toast').textContent.includes('수정 요청'), '수정 요청 전송 토스트');
  const c1 = cases().find(c => c.id === 'C-2601');
  assert(c1.urgent === true && c1.urgentNote.includes('색조 재확인') && c1.modifyReq.includes('근원측 접촉 재조정'), '긴급 배지·수정요청 반영');

  /* 4. 병원 측 반영 확인 */
  $('.role-chip').click();
  $('#swStaff').click();
  if ($('#agreeRow')) { $('#agreeRow').click(); $('#agreeBtn').click(); }
  assert(document.getElementById('brandTitle').textContent === '스마일치과', 'staff 전환 (조건부 동의)');
  window.MM.app.state.caseId = 'C-2601';
  window.MM.app.go('caseDetail');
  assert(document.body.textContent.includes('기공소 수정 요청 — 색조 재확인'), '병원 케이스 즉시 반영');

  /* 5. 완료 보고 → 장착 전환 → 큐 제외 */
  $('.role-chip').click();
  $('#swLab').click();
  $('[data-lc="C-2601"]').click();
  $('#lbDone').click();
  await sleep(30);
  assert(c1.order.status === '완료' && c1.status === '장착' && c1.urgent === false, '완료 보고 → 장착·urgent 해제');
  window.MM.app.go('labHome');
  await sleep(30);
  assert($$('#root [data-lc]').length === 1, '완료 주문 큐 자동 제외 (C-2604만)');

  /* 6. 접수 확인 → 제작 */
  $('[data-lc="C-2604"]').click();
  $('#lbStart').click();
  await sleep(30);
  assert(cases().find(c => c.id === 'C-2604').status === '제작', '접수 확인 → 제작 시작');
  window.MM.app.go('labHome');
  await sleep(30);
  assert($$('#root [data-lc]').length === 1, '제작(order 없음)도 큐 유지');

  assert(errors.length === 0, '최종: runtime errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  console.log('--- S6 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  window.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
