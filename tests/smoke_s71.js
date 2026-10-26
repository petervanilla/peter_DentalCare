#!/usr/bin/env node
/* S71 스모크 — 의료진 홈 와이드 레이아웃 정합 (사용자 요구: 넓은 화면에서 카드 중첩·표 붕괴 수복)
   단정 원칙: 통계 칩 4개는 .stat-chips 직계(중첩 금지)·환자 표 4열 유지·와이드 컨테이너 적용 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); } }

(async () => {
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; } });
  const w = dom.window, d = w.document;
  await sleep(900);
  await sleep(300);
  Array.from(d.querySelectorAll('button')).find(x => x.textContent.includes('의료진 모드')).click();
  await sleep(300);
  d.getElementById('agreeRow').click();
  d.getElementById('agreeBtn').click();
  await sleep(600);
  const crTxt = () => d.getElementById('crumbs').textContent.replace(/\s+/g, ' ').trim();

  /* A. 와이드 컨테이너 (SC-01) */
  assert(d.getElementById('root').className === 'wrap wide', '의료진 홈 — wrap wide 컨테이너 (SC-01)');
  assert(BUNDLE.includes('.wrap.wide{max-width:1140px}'), '와이드 — 1140px 확장 (SC-01)');

  /* B. 통계 칩 — 4개 직계·중첩 금지 (SC-02 — D174 회귀 감시) */
  const chips = d.querySelectorAll('.stat-chips > .stat-chip');
  assert(chips.length === 4, '통계 칩 — .stat-chips 직계 4개 (SC-02)');
  assert(!d.querySelector('.stat-chip .stat-chip'), '칩 중첩 없음 — 이중 오프너 회귀 감시 (SC-02·D174)');
  assert(Array.from(chips).map(c => c.querySelector('.sc-l').textContent).join('|') === '관리 환자|스캔 완료|리포트 동의|평균 플라크', '칩 라벨 4종 (SC-02)');

  /* C. 환자 목록 표 — 4열·3행 (SC-03) */
  const th = d.querySelectorAll('.staff-table thead th');
  assert(th.length === 4 && Array.from(th).map(x => x.textContent).join('|') === '환자|요약|최근 스캔|리포트', '환자 표 — 헤더 4열 (SC-03)');
  const prow = d.querySelectorAll('.prow');
  assert(prow.length === 3 && prow[0].querySelectorAll('td').length === 4, '환자 행 — 3행·행당 4열 (SC-03)');
  assert(BUNDLE.includes('.staff-table td:first-child,.staff-table td:nth-child(3){white-space:nowrap}'), '열 nowrap 규칙 — 이름·스캔일 세로 줄바꿈 방지 (SC-03)');

  /* D. 네비·고지 회귀 */
  assert(crTxt() === 'HOME›의료진', '브레드크럼 — HOME›의료진 (BR 회귀)');
  assert(!!prow[0].getAttribute('data-p'), '행 data-p 바인딩 — 클릭 위임 계약 (회귀)');
  w.MM.app.crumbs('staffPatient');
  assert(crTxt() === 'HOME›의료진›환자', '환자 상세 경로 — 3단(HOME›의료진›환자) (BR-04 회귀)');
  w.MM.app.go('staffHome');
  await sleep(300);
  assert(d.getElementById('root').textContent.includes('미동의 환자는'), '비진단·동의 경계 고지 유지 (회귀)');

  /* E. 예산 */
  assert(fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size <= 283000, '번들 예산 — 276KiB 이하 (' + fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size + 'B)');

  console.log('--- S71 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
