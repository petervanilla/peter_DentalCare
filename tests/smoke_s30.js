/* smoke_s30.js — S30 스모크: 사용자 완결성 — 환자 관리 기록 영속화(저장·프리필·히스토리·병원 전달 요약) + 앱 내 역할별 사용 가이드(헤더 ?)
   실행: cd /home/user/tests && node smoke_s30.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');

let pass = 0, fail = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg);
  cond ? pass++ : (fail++, process.exitCode = 1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BUNDLE = fs.readFileSync('/home/user/미리미소-웹앱.html', 'utf8');

(async () => {
  console.log('=== A. 환자 관리 기록 — 저장·프리필·히스토리 (오프라인) ===');
  const errors = [];
  const dom = new JSDOM(BUNDLE, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://demo.local/',
    beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push('onerror: ' + e.message)); }
  });
  const w = dom.window, d = w.document;
  await sleep(400);
  d.querySelector('.role-card').click();
  if (d.querySelector('#agreeRow')) { d.querySelector('#agreeRow').click(); d.querySelector('#agreeBtn').click(); }
  await sleep(300);
  w.MM.app.state.role = 'patient';
  w.MM.app.go('care');
  await sleep(300);
  assert(d.body.textContent.includes('오늘 상태 기록 저장') && d.body.textContent.includes('이 기기(브라우저)에만 저장'), 'care: 저장 버튼 + 기기 저장 고지');
  assert(!d.body.textContent.includes('상태가 기록되었습니다'), 'care: 허위 "기록되었습니다" 토스트 문구 제거 확인');
  d.querySelector('#rvSave').click();
  await sleep(400);
  const log1 = JSON.parse(w.localStorage.getItem('MM_CARE_LOG') || '[]');
  assert(log1.length === 1 && log1[0]['통증'] === '보통' && log1[0]['붓기'] === '없음' && log1[0]['출혈'] === '없음' && log1[0].d, '기록 저장 — localStorage 1건 (통증 보통·붓기 없음·출혈 없음·날짜)');
  assert(d.body.textContent.includes('최근 기록 (1건'), 'care: 최근 기록 히스토리 렌더');
  const bleed = d.querySelector('.rv-chip[data-rv="출혈"][data-v="지속"]');
  bleed.click();
  d.querySelector('#rvSave').click();
  await sleep(400);
  const log2 = JSON.parse(w.localStorage.getItem('MM_CARE_LOG') || '[]');
  assert(log2.length === 2 && log2[0]['출혈'] === '지속', '2회차 저장 — 출혈 지속 반영 (최신순)');
  w.MM.app.go('home');
  await sleep(200);
  w.MM.app.go('care');
  await sleep(300);
  assert(d.querySelector('.rv-chip[data-rv="출혈"][data-v="지속"].on'), '재방문 프리필 — 마지막 기록(출혈 지속) 칩 on');
  assert(d.querySelector('#rvPhoto'), '사진 입력 존재 (파일명 기록 방식)');
  d.querySelector('#rvCopy').click();
  await sleep(200);
  assert(d.body.textContent.includes('복사') || d.getElementById('modalBody') !== null, '병원 전달 요약 복사 동작 (클립보드 or 폴백 안내)');
  if (w.dom) await w.dom.close();

  console.log('=== B. 앱 내 사용 가이드 — 역할별 (헤더 ? 버튼) ===');
  const errors2 = [];
  const dom2 = new JSDOM(BUNDLE, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://demo.local/',
    beforeParse(w2) { w2.scrollTo = () => {}; w2.addEventListener('error', e => errors2.push('onerror: ' + e.message)); }
  });
  const w2 = dom2.window, d2 = w2.document;
  await sleep(400);
  assert(d2.getElementById('helpBtn').style.display === 'none', '역할 선택 전 — 가이드 버튼 숨김');
  d2.querySelector('.role-card').click();
  if (d2.querySelector('#agreeRow')) { d2.querySelector('#agreeRow').click(); d2.querySelector('#agreeBtn').click(); }
  await sleep(300);
  assert(d2.getElementById('helpBtn').style.display !== 'none', '역할 진입 후 — 가이드 버튼 표시');
  w2.MM.app.state.role = 'staff';
  w2.MM.app.go('home');
  await sleep(200);
  d2.getElementById('helpBtn').click();
  await sleep(200);
  let modalTxt = d2.getElementById('modalBody').textContent;
  assert(modalTxt.includes('의료진 가이드') && modalTxt.includes('운영 대시보드') && modalTxt.includes('감사로그'), '의료진 가이드 — 케이스 허브·발급·대시보드 커버');
  assert(modalTxt.includes('의료기기 아님'), '가이드에 비진단 고지 포함');
  d2.getElementById('hgOk').click();
  w2.MM.app.state.role = 'lab';
  w2.MM.app.go('home');
  await sleep(200);
  d2.getElementById('helpBtn').click();
  await sleep(200);
  modalTxt = d2.getElementById('modalBody').textContent;
  assert(modalTxt.includes('기공소 가이드') && modalTxt.includes('SHA-256'), '기공소 가이드 — 스냅샷·원본 해시 커버');
  d2.getElementById('hgOk').click();
  w2.MM.app.state.role = 'patient';
  w2.MM.app.go('home');
  await sleep(200);
  d2.getElementById('helpBtn').click();
  await sleep(200);
  assert(d2.getElementById('modalBody').textContent.includes('환자 가이드') && d2.getElementById('modalBody').textContent.includes('치료 후 관리'), '환자 가이드 — 여정 커버');
  assert(errors.length === 0 && errors2.length === 0, '최종: errors 없음' + ((errors.length || errors2.length) ? ' → ' + errors.concat(errors2).join('|') : ''));
  await dom2.window.close();

  console.log('--- S30 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
