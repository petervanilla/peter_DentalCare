#!/usr/bin/env node
/* S81 스모크 — 진료 스캔 팝업화 (83차 지시):
   PM-01 스캔 시작 → 팝업(모달) — 화면 이동 없음 (Order 유지·brandTitle 진료·닫기 버튼)
   PM-02 팝업 실시간 — Data processing → 96포인트 가상 스캔(점등·카운터)·일시정지/재개
   PM-03 스캔 완료 → 팝업 닫힘 + Design 요약 전환 → 저장 · staffHome 복귀 (pt=96)
   PM-04 닫기 경로 — 진행 중 닫기 → Order 복귀
   PM-05 기존 계약 유지 — 이중 게이트·폼·카드 중첩 0·비진단 고지
   PM-06 번들 예산 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const LIMIT = 283000;
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
  const ov = d.getElementById('modalOverlay');
  const brand = () => d.getElementById('brandTitle').textContent;

  /* 진입 · 게이트 (CV-01·04 계약) */
  d.getElementById('txEntry').click();
  await sleep(400);
  const txGo = d.getElementById('txGo');
  assert(txGo.disabled === true, 'PM-05a 초기 스캔 시작 disabled (이중 게이트 유지)');
  d.querySelectorAll('.tt')[0].click();
  await sleep(100);
  d.querySelectorAll('.dtc')[0].click();
  await sleep(100);
  assert(txGo.disabled === false, 'PM-05b 치아+DesignType → enabled');

  /* A. 스캔 시작 → 팝업 (PM-01) */
  txGo.click();
  await sleep(300);
  assert(ov.classList.contains('show') && d.getElementById('modalBody').textContent.includes('Data processing') && d.getElementById('modalBody').textContent.includes('비진단'), 'PM-01 스캔 시작 → 실시간 데모 팝업 (Data processing·비진단 배지)');
  assert(brand().includes('진료') && !!d.getElementById('txNo') && !!d.getElementById('txMxC'), 'PM-01b 화면 이동 없음 — Order 유지(주문번호)·팝업 닫기 버튼');
  assert(root().querySelectorAll('.card .card').length === 0, 'PM-05c 카드 중첩 0 유지 (S80 TV-01)');

  /* B. 팝업 실시간 스캔 (PM-02) */
  await sleep(2300);
  const pt = parseInt(d.getElementById('txPt').textContent, 10) || 0;
  assert(pt >= 3 && d.querySelectorAll('#txSvg .txT').length === 16 && d.querySelectorAll('#txSvg .txT.v').length >= 1, 'PM-02 팝업 내 가상 스캔 라이브 — ' + pt + 'P 치아 점등 (S82)');
  d.getElementById('txPz').click();
  await sleep(100);
  assert(d.getElementById('txPz').textContent.includes('재개'), 'PM-02b 일시정지 → 재개 전환 (팝업 내 제어 유지)');
  d.getElementById('txPz').click();
  await sleep(100);

  /* C. 스캔 완료 → Design (PM-03) */
  d.getElementById('txDn').click();
  await sleep(500);
  assert(!ov.classList.contains('show') && root().textContent.includes('Design — ') && !!d.getElementById('txSave'), 'PM-03 스캔 완료 → 팝업 닫힘 + Design 요약 전환');
  d.getElementById('txSave').click();
  await sleep(500);
  let rec = null;
  try { rec = JSON.parse(w.localStorage.getItem('MM_TREAT_V1'))[0]; } catch (e) {}
  assert(rec && rec.pt === 96 && root().textContent.includes('스마일치과 Clinic'), 'PM-03b 저장 — MM_TREAT_V1(pt=96) · staffHome 복귀 (CV-07 계약)');

  /* D. 닫기 경로 (PM-04) */
  d.getElementById('txEntry').click();
  await sleep(400);
  d.querySelectorAll('.tt')[0].click();
  await sleep(100);
  d.querySelectorAll('.dtc')[0].click();
  await sleep(100);
  d.getElementById('txGo').click();
  await sleep(300);
  d.getElementById('txMxC').click();
  await sleep(400);
  assert(!ov.classList.contains('show') && !!d.getElementById('txNo') && brand().includes('진료'), 'PM-04 진행 중 닫기 → Order 복귀 (팝업 해제·주문번호 유지)');

  /* E. 고지·예산 (PM-06) */
  assert(root().textContent.includes('AIDENT형 워크플로 학습용 가상 시연') && root().textContent.includes('비진단'), 'PM-05d 비진단 고지 고정 유지 (CV-08)');
  const BN = Buffer.byteLength(BUNDLE);
  assert(BN <= LIMIT, '번들 예산 — 276KiB 한도 이하 (' + BN + 'B ≤ ' + LIMIT + 'B)');

  console.log('--- S81 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e && e.message); process.exit(1); });
