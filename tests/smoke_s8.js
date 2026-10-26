/* smoke_s8.js — S8 스모크: 알림 센터·리포트/처방전 PDF 인쇄·감사로그(오프라인/온라인)·권한
   실행: cd /home/user/tests && node smoke_s8.js */
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

  /* 0. 부팅 + 환자 (벨 숨김) */
  assert(errors.length === 0, 'boot: no errors');
  assert($('#bellBtn').style.display === 'none', '역할 선택 전 벨 숨김');
  $$('.role-card')[0].click();
  if ($('#agreeRow')) { $('#agreeRow').click(); $('#agreeBtn').click(); }
  assert($('#bellBtn').style.display === 'none', '환자 모드 벨 숨김');

  /* 1. 의료진: 알림 배지 자동 계산 */
  $('.role-chip').click();
  $('#swStaff').click();
  if ($('#agreeRow')) { $('#agreeRow').click(); $('#agreeBtn').click(); }
  assert($('#bellBtn').style.display !== 'none', '의료진 모드 벨 표시');
  assert($('#bellCount').textContent === '3', '알림 배지 3 (긴급 2 + 동의 대기 1) · 실제: ' + $('#bellCount').textContent);
  $('#bellBtn').click();
  assert($('#modalOverlay').classList.contains('show') && $$('.notif-row').length === 3, '알림 센터 3건');
  assert(document.body.textContent.includes('기공소 수정 요청') && document.body.textContent.includes('동의 대기'), '긴급·동의 알림 텍스트');

  /* 2. 알림 클릭 → 케이스 이동 */
  $$('.notif-row')[0].click();
  await sleep(30);
  assert(document.getElementById('brandTitle').textContent === '케이스 상세' && window.MM.app.state.caseId === 'C-2601', '알림 클릭 → C-2601 상세');

  /* 3. 리포트 PDF 인쇄 (window.open 스텁) */
  let captured = null;
  window.open = function () { captured = { html: '', document: { write: s => { captured.html += s; }, close() {} } }; return captured; };
  $('#cdReport').click();
  $('[data-rep="1"]').click();
  assert($('#repPdf'), '리포트 PDF 버튼 (S8)');
  $('#repPdf').click();
  assert(captured && captured.html.includes('기공소 제작 리포트'), '인쇄 창: 기공 제작 리포트');
  assert(captured.html.includes('SB-001') && captured.html.includes('내부 육각'), '인쇄 내용: 제품 정보 포함');
  assert(captured.html.includes('가상 데모 데이터') && captured.html.includes('진단·처방을 대체하지'), '인쇄 고지: 비진단·가상 데이터 명시');
  assert($('#toast').textContent.includes('PDF'), '토스트: PDF 저장 안내');

  /* 4. 인쇄 불가 환경 폴백 */
  window.open = function () { return null; };
  $('#repPdf').click();
  assert($('#toast').textContent.includes('제한'), '인쇄 불가 시 폴백 토스트');

  /* 5. 기공 처방전 인쇄 (DDX 패턴) */
  window.open = function () { captured = { html: '', document: { write: s => { captured.html += s; }, close() {} } }; return captured; };
  $$('#cdTabs button')[3].click();
  assert($('#loPrint'), '주문 탭 처방전 인쇄 버튼');
  $('#loPrint').click();
  assert(captured.html.includes('기공 처방전') && captured.html.includes('C-2601'), '처방전 제목·케이스 ID');
  assert(captured.html.includes('내부 육각') && captured.html.includes('SB-001') && captured.html.includes('A2'), '처방전: 연결부·스캔바디·색조');
  assert(captured.html.includes('full_arch_v3.stl') && captured.html.includes('요청 납기'), '처방전: 첨부 파일·납기');

  /* 6. 감사로그 — 오프라인 세션 로그 */
  await window.MM.Api.push({ type: 'patch', caseId: 'C-2602', patch: { status: '계획' } });
  window.MM.app.go('caseHub');
  $('#qaAudit').click();
  assert(document.getElementById('brandTitle').textContent === '감사로그', '감사로그 화면');
  assert($('#alMode').textContent.includes('오프라인'), '오프라인 배지 (세션 로그)');
  assert(document.body.textContent.includes('patch') && document.body.textContent.includes('오프라인'), '세션 로그 행 표시');

  /* 7. 감사로그 — 온라인 서버 로그 */
  window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ audit: [{ ts: '2026-10-13 10:00:00', role: 'lab', act: 'read', caseId: 'C-2601', detail: '기공소 케이스 열람 (감사로그)' }] }) });
  window.MM.Api.online = true;
  $('#alRefresh').click();
  await sleep(80);
  assert($('#alMode').textContent.includes('서버 감사로그 · 1건'), '서버 감사로그 모드');
  assert(document.body.textContent.includes('기공소 케이스 열람') && document.body.textContent.includes('C-2601'), '서버 로그 행 (열람 기록)');
  window.MM.Api.online = false;
  delete window.fetch;

  /* 8. 기공소 벨 (긴급 2건 — 동의 알림은 의료진 전용) */
  $('.role-chip').click();
  $('#swLab').click();
  if ($('#agreeRow')) { $('#agreeRow').click(); $('#agreeBtn').click(); }
  assert(document.getElementById('brandTitle').textContent === '기공소 큐', '기공소 전환');
  assert($('#bellCount').textContent === '2', '기공소 알림 2건 (긴급만) · 실제: ' + $('#bellCount').textContent);

  /* 9. 환자 가드 */
  $('.role-chip').click();
  $('#swPatient').click();
  if ($('#agreeRow')) { $('#agreeRow').click(); $('#agreeBtn').click(); }
  window.MM.app.go('auditLog');
  assert(document.body.textContent.includes('전용'), '환자 감사로그 접근 가드');
  assert($('#bellBtn').style.display === 'none', '환자 모드 벨 숨김 복귀');

  assert(errors.length === 0, '최종: runtime errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  console.log('--- S8 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  window.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
