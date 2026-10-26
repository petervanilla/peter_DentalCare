/* smoke_s5.js — S5 회귀: 케이스 허브·파이프라인·전이·주문 게이트·리포트·케어 (+S8 오프라인 감사로그)
   실행: cd /home/user/tests && node smoke_s5.js */
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

  /* 1. 의료진 진입 */
  $$('.role-card')[1].click();
  if ($('#agreeRow')) { $('#agreeRow').click(); $('#agreeBtn').click(); }
  assert(document.getElementById('brandTitle').textContent === '스마일치과', 'staff 진입');
  assert(document.body.textContent.includes('긴급'), 'staffHome 케이스 허브 배너 (긴급)');
  $('#goCaseHub').click();
  assert(document.getElementById('brandTitle').textContent === '케이스 허브', '케이스 허브 진입');

  /* 2. 허브 구성 */
  assert($$('[data-case]').length === 5, '케이스 행 5건');
  assert($$('.quick').length === 8, '빠른 작업 8종 (S8 감사로그 + S9 프로토콜 + S23 계정 발급 포함)');
  assert(document.body.textContent.includes('감사로그'), '빠른 작업에 감사로그');
  assert($$('[data-case].urgent').length === 2, '긴급 그룹 2건 (코랄)');

  /* 3. C-2601 상세 + 5탭 */
  window.MM.app.state.caseId = 'C-2601';
  window.MM.app.go('caseDetail');
  assert(document.getElementById('brandTitle').textContent === '케이스 상세', '케이스 상세 진입');
  assert($$('.pl-step.cur').length === 1 && $('.pl-step.cur').textContent.includes('제작'), '파이프라인 현재: 제작');
  assert($$('#cdTabs button').length === 5, '탭 5종');
  assert(document.body.textContent.includes('Aident AI-30'), '개요: 스캔 장비');
  $$('#cdTabs button')[1].click();
  assert($('#cdCanvas'), '3D 데이터 탭: 캔버스 마운트');
  $$('#cdTabs button')[2].click();
  assert(document.body.textContent.includes('AI 초기 제안') && document.body.textContent.includes('담당의'), '치료계획: AI 초기 제안 배지');
  $$('#cdTabs button')[3].click();
  assert(document.body.textContent.includes('제출됨') && $('#loPrint'), '주문 탭: 제출됨 + 처방전 인쇄 (S8)');
  $$('#cdTabs button')[4].click();
  assert($$('#root .file-row').length >= 4, '히스토리 기록 표시');

  /* 4. 리포트 3분리 모달 */
  $('#cdReport').click();
  assert($$('[data-rep]').length === 3, '리포트 3종');
  $('[data-rep="0"]').click();
  assert($('#repPdf') && $('#repCopy'), '리포트 상세: PDF 인쇄 + 복사 (S8)');
  $('#repBack').click();
  $('#repClose').click();
  assert(!$('#modalOverlay').classList.contains('show'), '모달 닫기');

  /* 5. C-2603: 동의 → 주문 전이 → 주문서 게이트 */
  window.MM.app.state.caseId = 'C-2603';
  window.MM.app.rerender();
  await sleep(30);
  assert($('#cdNext').textContent.includes('주문'), 'C-2603 다음 단계: 주문');
  $('#cdNext').click();
  assert(document.getElementById('brandTitle').textContent === '기공 주문서', '주문서로 유도');
  assert($$('.lo-check').length === 5 && $('#loSubmit').disabled === true, '제출 전 체크 5종 · 초기 비활성');
  $$('.lo-check').forEach(it => it.click());
  assert($('#loSubmit').disabled === false, '5개 전부 통과 시 제출 활성');
  $('#loSubmit').click();
  await sleep(30);
  assert(document.getElementById('brandTitle').textContent === '케이스 상세', '제출 후 상세 복귀');
  assert(cases().find(c => c.id === 'C-2603').order.status === '제작 중', '주문 객체 부여 (제작 중)');
  assert(cases().find(c => c.id === 'C-2603').history[0].t.includes('기공 주문 제출'), '히스토리 기록');

  /* 6. C-2602: 스캔→계획→동의(모달) */
  window.MM.app.state.caseId = 'C-2602';
  window.MM.app.go('caseDetail');
  assert($('#cdNext').textContent.includes('계획'), 'C-2602 다음 단계: 계획');
  $('#cdNext').click();
  await sleep(30);
  assert(cases().find(c => c.id === 'C-2602').status === '계획', '상태 전이: 계획');
  $('#cdNext').click();
  assert($('#agrOk'), '동의 확인 모달 (M3: 서명 입력 결합)');
  $('#agrName').value = '테스트 서명자';
  $('#agrOk').click();
  await sleep(30);
  const c2602 = cases().find(c => c.id === 'C-2602');
  assert(c2602.status === '동의' && c2602.consents && c2602.consents[0].sig === 'OFFLINE-DEMO', '상태 전이: 동의 (서명 기록 포함 · 오프라인 로컬 서명)');

  /* 7. S8: 오프라인 감사로그 (세션 로그) */
  await window.MM.Api.push({ type: 'patch', caseId: 'C-2602', patch: { status: '계획' } });
  window.MM.app.go('caseHub');
  $('#qaAudit').click();
  assert(document.getElementById('brandTitle').textContent === '감사로그', '감사로그 화면 (S8)');
  assert($('#alMode').textContent.includes('오프라인'), '오프라인 모드 배지');
  assert(document.body.textContent.includes('order') && document.body.textContent.includes('오프라인'), '세션 로그: 주문 제출 기록 표시');
  $('#alRefresh').click();
  await sleep(30);
  assert($('#alTable tbody').children.length >= 2, '새로고침 후 로그 유지');

  /* 8. 환자 케어 뷰 */
  $('.role-chip').click();
  $('#swPatient').click();
  if ($('#agreeRow')) { $('#agreeRow').click(); $('#agreeBtn').click(); }
  window.MM.app.go('care');
  assert($$('.rv-chip').length >= 3, '회복 상태 칩 (통증/붓기/출혈)');
  assert($('#rvCall'), '이상 신호 → 병원 연결');
  window.MM.app.go('auditLog');
  assert(document.body.textContent.includes('전용'), '환자 감사로그 가드');

  assert(errors.length === 0, '최종: runtime errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  console.log('--- S5 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  window.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
