#!/usr/bin/env node
/* S93 스모크 — staffHome 타이틀 브랜드화 (95차 사용자 요청):
   SC-01 staffHome 앱바 타이틀 — 'Clinic 대시보드' → 브랜드 '스마일치과' (56차 브랜드 표기 통일)
   SC-02 타 화면 타이틀 불변 — staffPatient '환자 스캔 리뷰' (라벨 맵 국소 변경)
   SC-03 소스 계약 — 라벨 맵 갱신·'Clinic 대시보드' 부재 (번들)
   SC-04 staffHome hero 불변 — '스마일치과 Clinic' 헤더는 별개 요소로 유지
   EX-01 번들 예산 — 283,000B 이하·헤드룸 100B 이상
   EX-02 runtime errors 0 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, '..', 'mirimiso-webapp', 'js', 'app.js'), 'utf8');
const LIMIT = 283000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

(async () => {
  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const w = dom.window, d = w.document;
  await sleep(900);

  /* 의료진 진입 → staffHome */
  Array.from(d.querySelectorAll('button')).find(x => x.textContent.includes('의료진 모드')).click();
  await sleep(300);
  d.getElementById('agreeRow').click();
  d.getElementById('agreeBtn').click();
  await sleep(700);

  /* SC-01 타이틀 브랜드화 */
  assert(d.getElementById('brandTitle').textContent === '스마일치과',
    "SC-01 staffHome 타이틀 — '스마일치과' (구 'Clinic 대시보드')");

  /* SC-04 hero 불변 */
  assert(d.getElementById('root').textContent.includes('스마일치과 Clinic'),
    'SC-04 staffHome hero 불변 — 스마일치과 Clinic 헤더 (별개 요소·범위 외)');

  /* SC-02 타 화면 무영향 */
  d.getElementById('root').querySelector('[data-goto="staffPatient"], #goScan, button') && (() => {})();
  const back = d.getElementById('root').textContent;
  assert(back.includes('환자') , 'SC-02 전제 — staffHome 렌더 확인');
  w.A.go('staffPatient');
  await sleep(300);
  assert(d.getElementById('brandTitle').textContent === '환자 스캔 리뷰',
    "SC-02 타 화면 타이틀 불변 — staffPatient '환자 스캔 리뷰'");

  /* SC-03 소스 계약 */
  assert(APP.includes('staffHome:"스마일치과"') && !BUNDLE.includes('Clinic 대시보드'),
    "SC-03 소스 계약 — 라벨 맵 갱신·'Clinic 대시보드' 부재");

  /* EX-01 예산·헤드룸 */
  const sz = fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size;
  assert(sz <= LIMIT && LIMIT - sz >= 100, `EX-01 번들 — ${sz}B ≤ ${LIMIT}B·헤드룸 ${LIMIT - sz}B ≥ 100B`);

  /* EX-02 정리 무오류 */
  w.A.go('staffHome');
  await sleep(300);
  assert(errors.length === 0, 'EX-02 runtime errors 0' + (errors.length ? ' → ' + errors.join('|').slice(0, 160) : ''));
  await dom.window.close();

  console.log('--- S93 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
