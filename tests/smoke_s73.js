#!/usr/bin/env node
/* S73 스모크 — 의료진 홈 정보 아키텍처 재배치 (사용자 요구):
   ① Clinic 헤더 최상단 유지·통계 → 케이스 허브(보조) → 환자 목록 순서
   ② 스캐너 학습 가이드를 상단 헤더에 노출·하단 버튼 제거 */
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
  const root = () => d.getElementById('root');
  const crTxt = () => d.getElementById('crumbs').textContent.replace(/\s+/g, ' ').trim();

  /* A. 배치 순서 — Clinic 헤더 → 통계 → 케이스 허브 → 환자 목록 (SM-01) */
  const ti = root().querySelector('.card.ti');
  const chipsEl = root().querySelector('.stat-chips');
  const hubEl = Array.from(root().querySelectorAll('.card')).find(c => c.querySelector('[data-goto="caseHub"]'));
  const tbl = root().querySelector('.staff-table');
  assert(!!ti && !!chipsEl && !!hubEl && !!tbl, '4블록 렌더 — Clinic·통계·케이스 허브·환자 목록 (SM-01)');
  assert(!!(ti.compareDocumentPosition(chipsEl) & 4), 'Clinic 헤더가 통계보다 위 (SM-01)');
  assert(!!(chipsEl.compareDocumentPosition(hubEl) & 4) && !!(hubEl.compareDocumentPosition(tbl) & 4), '순서 — 통계 → 케이스 허브 → 환자 목록 (SM-01)');

  /* B. 케이스 허브 카드 — 건수·이동 (SM-02) */
  const hubBtn = hubEl.querySelector('[data-goto="caseHub"]');
  assert(/케이스 허브 열기 \(\d+건 · 긴급 \d+\)/.test(hubBtn.textContent), '허브 버튼 — 열린 케이스·긴급 건수 라벨 (SM-02)');
  hubBtn.click();
  await sleep(300);
  assert(w.MM.app.current === 'caseHub' && crTxt().endsWith('HOME›케이스 허브'), '허브 버튼 → caseHub 이동·경로 (SM-02)');
  w.MM.app.go('staffHome');
  await sleep(300);

  /* C. 스캐너 학습 가이드 — 앱바 우측 (SM-03 · S76 갱신) */
  const guideBtn = d.getElementById('scanGuideTop');
  assert(!!guideBtn && guideBtn.textContent.includes('스캐너 학습 가이드') && guideBtn.style.display !== 'none', '앱바 📖 스캐너 학습 가이드 — staffHome 표시 (SM-03)');
  assert(!root().querySelector('[data-goto="scannerInfo"]'), '스캐너 진입은 앱바로 일원화 — 화면 내 버튼 0 (SM-03)');
  assert(!root().querySelector('.card:not(.ti) [data-goto="scannerInfo"]'), '하단 스캐너 버튼 제거 (SM-04)');
  guideBtn.click();
  await sleep(300);
  assert(w.MM.app.current === 'scannerInfo' && root().textContent.includes('스캐너 학습 가이드') && root().textContent.includes('스캐너 학습용'), '가이드 화면 — 학습 프레이밍(포맷·워크플로) (SM-03)');
  assert(crTxt().endsWith('HOME›스캐너 학습 가이드'), '경로 — HOME›스캐너 학습 가이드 (SM-03)');

  /* D. 회귀 — 칩 중첩 금지·표 4열 (S71 계약) */
  w.MM.app.go('staffHome');
  await sleep(300);
  assert(d.querySelectorAll('.stat-chips > .stat-chip').length === 4 && !d.querySelector('.stat-chip .stat-chip'), '통계 칩 직계 4개·중첩 없음 (SC-02 회귀)');
  assert(root().querySelectorAll('.prow').length === 3 && root().querySelectorAll('.prow:first-child td').length === 4, '환자 표 3행×4열 (SC-03 회귀)');

  /* E. 예산 */
  assert(fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size <= 283000, '번들 예산 — 276KiB 이하 (' + fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size + 'B)');

  console.log('--- S73 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
