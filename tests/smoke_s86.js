#!/usr/bin/env node
/* S86 스모크 — 스캔 사실화·스캔 완료 3D 입안 뷰어 (88차 · Romexis Model Analyser 참조):
   RS-01 스캔 SVG 사실화 — 잇몸 코랄 그라디언트(url#gGm)·치아 아이보리 그라디언트(#gTx defs)
   RS-02 스캔 진행 계약 — 96P 도달·.txT.v 16/16 (S82 스윕 불변)
   RS-03 스캔 완료 → Design 단계 3D 입안 뷰어 — #t3d-box·canvas 마운트·Romexis형·데모 뱃지
   RS-04 Design SVG 동일 톤 — 잇몸 url(#gGm)·gTx defs·보철 오버레이(색조 fill) 유지
   RS-05 요약 계약 — txRow 5행(색조 · 재료) 유지
   RS-06 정리 계약 — staffHome 복귀·renderer dispose 후 runtime errors 0
   RS-07 번들 예산 — 283,000B 이하
   RS-08 비진단 고지 — 데모 메쉬 · 교육용 뱃지 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const LIMIT = 283000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = (fn, ms) => new Promise((res, rej) => { const t0 = Date.now(); (function p() { const v = fn(); if (v) return res(v); if (Date.now() - t0 > ms) return rej(new Error('timeout')); setTimeout(p, 100); })(); });
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

(async () => {
  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const w = dom.window, d = w.document;
  await sleep(900);
  const root = () => d.getElementById('root');

  /* 진료 진입 → 스캔 (S81 팝업·S82 스윕 경유) */
  Array.from(d.querySelectorAll('button')).find(x => x.textContent.includes('의료진 모드')).click();
  await sleep(300);
  d.getElementById('agreeRow').click();
  d.getElementById('agreeBtn').click();
  await sleep(500);
  d.getElementById('txEntry').click();
  await sleep(400);
  d.querySelectorAll('.tt')[0].click();
  d.querySelectorAll('.dtc')[0].click();
  d.getElementById('txGo').click();
  const svg = await waitFor(() => d.querySelector('#modalBody #txSvg'), 6000);

  /* RS-01 스캔 SVG 사실화 */
  const gum = svg.querySelector('path');
  assert(gum && gum.getAttribute('fill') === 'url(#gGm)' && svg.querySelector('linearGradient#gTx') && svg.querySelector('radialGradient#gGm'),
    'RS-01 스캔 SVG 사실화 — 잇몸 url(#gGm) 코랄 그라디언트·치아 #gTx defs');

  /* RS-02 스캔 진행 계약 (S82 불변) */
  await waitFor(() => parseInt((d.querySelector('#txPt') || {}).textContent, 10) === 96, 20000);
  assert(d.querySelectorAll('#txSvg .txT.v').length === 16, 'RS-02 스캔 진행 — 96P·.txT.v 16/16 (S82 스윕 불변)');
  Array.from(d.querySelectorAll('#modalBody button')).find(b => b.id === 'txDn').click();
  await sleep(600);

  /* RS-03 스캔 완료 → 3D 입안 뷰어 */
  const box = await waitFor(() => d.getElementById('t3d-box'), 4000);
  assert(!!box && !!d.getElementById('t3d') && d.body.textContent.includes('3D 뷰어') && d.body.textContent.includes('Romexis형'),
    'RS-03 스캔 완료 → 3D 입안 뷰어 — #t3d-box·canvas 마운트·Romexis형 (스캔 데이터 기반)');
  assert(d.body.textContent.includes('데모 메쉬 · 교육용'), 'RS-08 비진단 고지 — 데모 메쉬 · 교육용 뱃지');

  /* RS-04 Design SVG 동일 톤 + 오버레이 */
  const dg = root().querySelector('svg path');
  assert(dg && dg.getAttribute('fill') === 'url(#gGm)' && root().querySelector('svg linearGradient#gTx')
    && !!root().querySelector('svg rect[fill="#F7F1DE"]'),
    'RS-04 Design SVG 동일 톤 — 잇몸 url(#gGm)·gTx defs·보철 오버레이(색조 fill) 유지');

  /* RS-05 요약 계약 */
  assert(root().textContent.includes('색조 · 재료') && root().textContent.includes('DesignType'), 'RS-05 디자인 요약 5행 유지 (CV-06)');

  /* RS-06 정리 — dispose 후 복귀 무오류 */
  w.A.go('staffHome');
  await sleep(400);
  assert(errors.length === 0, 'RS-06 정리 — staffHome 복귀·renderer dispose 후 errors 0' + (errors.length ? ' → ' + errors.join('|') : ''));

  /* RS-07 예산 */
  const sz = fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size;
  assert(sz <= LIMIT, `RS-07 번들 — ${sz}B ≤ ${LIMIT}B`);
  assert(errors.length === 0, 'RS-06b 최종 runtime errors 0');
  await dom.window.close();

  console.log('--- S86 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
