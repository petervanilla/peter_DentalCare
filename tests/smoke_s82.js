#!/usr/bin/env node
/* S82 스모크 — 실시간 치아 스캔 (84차 지시 · Scan the Working Arch 현실감):
   TS-01 치아 아치 렌더 — 치아 16개(.txT·중앙→좌우 배열)·잇몸 베이스·스캔 라인(#txSl)·'실시간 치아 스캔' 배지
   TS-02 실시간 점등 — 포인트(96)에 연동되어 치아가 순차 점등·스캔 라인이 아치를 따라 이동
   TS-03 초기화 — 점등 0·라인 복귀(28)·카운터 0 P
   TS-04 완료 플로우 — 96P 도달 → 스캔 완료 · 디자인 ▶ → Design 요약 → 저장(pt=96) · staffHome 복귀
   TS-05 회귀 — 이중 게이트·카드 중첩 0·96 포인트 카운터 유지
   TS-06 번들 예산 */
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

  /* 진입 · 게이트 (기존 계약) */
  d.getElementById('txEntry').click();
  await sleep(400);
  const txGo = d.getElementById('txGo');
  assert(txGo.disabled === true, 'TS-05a 이중 게이트 — 초기 disabled 유지');
  d.querySelectorAll('.tt')[0].click();
  await sleep(100);
  d.querySelectorAll('.dtc')[0].click();
  await sleep(100);
  assert(txGo.disabled === false, 'TS-05b 이중 게이트 — 선택 시 enabled');
  txGo.click();

  /* A. 치아 아치 렌더 (TS-01) */
  await waitFor(() => d.getElementById('txSvg'), 4000);
  const teeth = d.querySelectorAll('#txSvg .txT');
  const sl = d.getElementById('txSl');
  assert(teeth.length === 16, 'TS-01 치아 16개 — 아치 배열 (중앙→좌우 스캔 순서)');
  assert(!!sl && !!d.querySelector('#txSvg path'), 'TS-01b 스캔 라인(#txSl)·잇몸 베이스 렌더');
  assert(d.getElementById('modalBody').textContent.includes('실시간 치아 스캔'), 'TS-01c 배지 — 실시간 치아 스캔');
  const y0 = sl.getAttribute('y1');

  /* B. 실시간 점등 (TS-02) */
  await sleep(1500);
  const lit1 = d.querySelectorAll('#txSvg .txT.v').length;
  const y1 = sl.getAttribute('y1');
  assert(lit1 >= 1 && d.getElementById('txPt') && parseInt(d.getElementById('txPt').textContent, 10) >= 3, 'TS-02 실시간 점등 시작 — ' + lit1 + '개 · ' + d.getElementById('txPt').textContent);
  await sleep(1800);
  const lit2 = d.querySelectorAll('#txSvg .txT.v').length;
  const y2 = sl.getAttribute('y1');
  assert(lit2 > lit1 && parseFloat(y2) > parseFloat(y1), 'TS-02b 점등 진행 — ' + lit1 + '→' + lit2 + '개 · 라인 이동 ' + y1 + '→' + y2);

  /* C. 초기화 (TS-03) */
  d.getElementById('txRs').click();
  await sleep(100);
  assert(d.querySelectorAll('#txSvg .txT.v').length === 0 && sl.getAttribute('y1') === '28' && d.getElementById('txPt').textContent === '0 P', 'TS-03 초기화 — 점등 0·라인 28 복귀·카운터 0 P');

  /* D. 완료 플로우 (TS-04) */
  await waitFor(() => d.getElementById('txPt') && parseInt(d.getElementById('txPt').textContent, 10) === 96, 18000);
  assert(parseInt(d.getElementById('txPt').textContent, 10) === 96 && d.querySelectorAll('#txSvg .txT.v').length === 16, 'TS-04 스캔 완료 — 96P·치아 16개 전부 점등');
  d.getElementById('txDn').click();
  await sleep(500);
  assert(root().textContent.includes('Design — ') && !!d.getElementById('txSave'), 'TS-04b 스캔 완료 → Design 요약 전환');
  d.getElementById('txSave').click();
  await sleep(500);
  let rec = null;
  try { rec = JSON.parse(w.localStorage.getItem('MM_TREAT_V1'))[0]; } catch (e) {}
  assert(rec && rec.pt === 96 && root().textContent.includes('스마일치과 Clinic'), 'TS-04c 저장 — MM_TREAT_V1(pt=96) · staffHome 복귀');

  /* E. 회귀 (TS-05) */
  d.getElementById('txEntry').click();
  await sleep(400);
  assert(root().querySelectorAll('.card .card').length === 0 && root().textContent.includes('AIDENT형 워크플로 학습용 가상 시연'), 'TS-05 카드 중첩 0·비진단 고지 유지 (S80·CV-08 계약)');

  /* F. 예산 (TS-06) */
  const BN = Buffer.byteLength(BUNDLE);
  assert(BN <= LIMIT, '번들 예산 — 276KiB 한도 이하 (' + BN + 'B ≤ ' + LIMIT + 'B)');

  console.log('--- S82 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e && e.message); process.exit(1); });
