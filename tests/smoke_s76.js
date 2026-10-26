#!/usr/bin/env node
/* S76 스모크 — 스캐너 학습 가이드 앱바 이동 (78차 지시 · 첨부 이미지 기준):
   AG-01 앱바 우측(DEMO 리본 좌측)·staffHome 표시 AG-02 화면 내 스캐너 버튼 전무
   AG-03 Clinic 헤더 진료 버튼 전체폭 복원 AG-04 앱바 클릭 → 가이드 이동·타화면 숨김·복귀 재표시
   AG-05 허브 통합(77차 HF-02/03) 회귀 */
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

  /* A. 앱바 배치 (AG-01) */
  const g = d.getElementById('scanGuideTop'), rb = d.querySelector('.demo-ribbon');
  assert(!!g && g.classList.contains('ab-guide') && g.style.display !== 'none' && g.textContent.includes('스캐너 학습 가이드'), 'AG-01 앱바 📖 스캐너 학습 가이드 — staffHome 표시 (.ab-guide)');
  assert(!!(g.compareDocumentPosition(rb) & 4), 'AG-01b 가이드가 DEMO 리본보다 왼쪽 (앱바 우측 그룹 선두 — 첨부 이미지 빨간 박스 위치)');

  /* B. 화면 내 스캐너 버튼 전무 (AG-02) */
  assert(!root().querySelector('[data-goto="scannerInfo"]'), 'AG-02 staffHome 화면 내 스캐너 버튼 0 (헤더·하단 모두 — 앱바 일원화)');
  const txEntry = d.getElementById('txEntry');
  assert(!!txEntry && txEntry.style.flex === '' && txEntry.textContent.includes('진료 시작'), 'AG-03 Clinic 헤더 진료 버튼 전체폭 복원 (flex 해제)');

  /* C. 이동·표시 토글 (AG-04) */
  g.click();
  await sleep(400);
  assert(w.MM.app.current === 'scannerInfo' && crTxt().includes('스캐너 학습 가이드'), 'AG-04 앱바 클릭 → scannerInfo 이동·경로');
  assert(g.style.display === 'none', 'AG-04b 타화면(scannerInfo)에서 숨김');
  w.MM.app.go('staffPatient');
  await sleep(300);
  assert(g.style.display === 'none', 'AG-04c staffPatient에서도 숨김');
  w.MM.app.go('staffHome');
  await sleep(300);
  assert(g.style.display !== 'none', 'AG-04d staffHome 복귀 — 재표시');

  /* D. 회귀 — 허브 통합·IA (AG-05) */
  const hub = Array.from(root().querySelectorAll('.card')).find(c => c.querySelector('#goCaseHub'));
  assert(!!hub && hub.querySelectorAll('.hflow b').length === 7 && !!hub.querySelector('.chub-stats'), 'AG-05 허브 흐름 스트립 7단계·통계 블록 내 유지 (77차 HF-02/03)');
  const chipsEl = root().querySelector('.stat-chips'), ti = root().querySelector('.card.ti'), tbl = root().querySelector('.staff-table');
  assert(!!(ti.compareDocumentPosition(chipsEl) & 4) && !!(chipsEl.compareDocumentPosition(hub) & 4) && !!(hub.compareDocumentPosition(tbl) & 4), 'AG-05b 순서 유지 — Clinic → 통계칩 → 허브 → 환자 목록');

  /* E. 예산 */
  assert(fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size <= 283000, '번들 예산 — 276KiB 이하 (' + fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size + 'B)');

  console.log('--- S76 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('FATAL - ' + (e && e.message)); console.log('--- S76 smoke finished: ' + passed + ' pass / ' + (failed + 1) + ' fail ---'); process.exit(1); });
