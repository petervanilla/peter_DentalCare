#!/usr/bin/env node
/* S83 스모크 — Design 단계 보철 시각화 (85차 자율 · AIDENT Design 스레드 완결):
   DG-01 Design 카드 치아 아치 SVG — 16치·선택 치아 점등(.txT v)·잇몸 베이스
   DG-02 보철 오버레이 — 선택 치아에 DesignType별 형태(전체 캡)·색조(TXS.col) 색상 반영
   DG-03 FDI 라벨 — 첫 선택 치아 번호 표시
   DG-04 요약 계약 유지 — txRow 5행(환자·치아·DesignType·ImplantBody·색조·재료)
   DG-05 저장 플로우 유지 — 기록 저장 → staffHome 복귀 (CV-07)
   DG-06 회귀·예산 — 카드 중첩 0·비진단 고지·번들 한도 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const LIMIT = 283000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = (fn, ms) => new Promise((res, rej) => { const t0 = Date.now(); (function p() { const v = fn(); if (v) return res(v); if (Date.now() - t0 > ms) return rej(new Error('timeout')); setTimeout(p, 100); })(); });
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

  /* 진입 · 스캔 (기존 플로우 — S81 팝업·S82 치아 점등 경유) */
  d.getElementById('txEntry').click();
  await sleep(400);
  d.querySelectorAll('.tt')[0].click();
  await sleep(100);
  d.querySelectorAll('.dtc')[0].click();
  await sleep(100);
  d.getElementById('txGo').click();
  await waitFor(() => d.getElementById('txSvg'), 4000);
  await waitFor(() => d.getElementById('txPt') && parseInt(d.getElementById('txPt').textContent, 10) === 96, 18000);
  d.getElementById('txDn').click();
  await sleep(500);

  /* A. 치아 아치 SVG (DG-01) */
  const teeth = root().querySelectorAll('rect.txT');
  assert(teeth.length === 16 && root().querySelectorAll('rect.txT.v').length >= 1 && !!root().querySelector('svg path'), 'DG-01 Design 카드 치아 아치 — 16치·선택 치아 점등·잇몸 베이스');

  /* B. 보철 오버레이 (DG-02) */
  const over = root().querySelectorAll('rect:not(.txT)');
  assert(over.length >= 1 && over.length === root().querySelectorAll('rect.txT.v').length, 'DG-02 보철 오버레이 — 선택 치아 수만큼 렌더');
  assert(over[0] && /^#F/.test(over[0].getAttribute('fill') || ''), 'DG-02b 오버레이 색조 색상 반영 (SH[' + (over[0] ? over[0].getAttribute('fill') : '') + '])');

  /* C. FDI 라벨 (DG-03) */
  const label = root().querySelector('svg text');
  assert(!!label && /^FDI \d+$/.test(label.textContent), 'DG-03 FDI 라벨 — ' + (label ? label.textContent : '없음'));

  /* D. 요약 계약 (DG-04) */
  assert(root().textContent.includes('환자') && root().textContent.includes('치아 (FDI)') && root().textContent.includes('DesignType') && root().textContent.includes('ImplantBody') && root().textContent.includes('색조 · 재료'), 'DG-04 디자인 요약 5행 유지 (CV-06 계약)');

  /* E. 저장 플로우 (DG-05) */
  d.getElementById('txSave').click();
  await sleep(500);
  let rec = null;
  try { rec = JSON.parse(w.localStorage.getItem('MM_TREAT_V1'))[0]; } catch (e) {}
  assert(rec && rec.pt === 96 && root().textContent.includes('스마일치과 Clinic'), 'DG-05 저장 — MM_TREAT_V1(pt=96) · staffHome 복귀');

  /* F. 회귀·예산 (DG-06) */
  d.getElementById('txEntry').click();
  await sleep(400);
  assert(root().querySelectorAll('.card .card').length === 0 && root().textContent.includes('AIDENT형 워크플로 학습용 가상 시연'), 'DG-06 카드 중첩 0·비진단 고지 유지 (S80·CV-08)');
  const BN = Buffer.byteLength(BUNDLE);
  assert(BN <= LIMIT, '번들 예산 — 276KiB 한도 이하 (' + BN + 'B ≤ ' + LIMIT + 'B)');

  console.log('--- S83 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e && e.message); process.exit(1); });
