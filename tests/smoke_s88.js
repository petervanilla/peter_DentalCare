#!/usr/bin/env node
/* S88 스모크 — 3D 상·하악 동시·보철물 3면도·스캔 점(point) 클라우드 (90차):
   JA-01 buildJaw — dental3d 상·하악 병합(side 'both')·step3 startArch 'jaw' 연결
   JA-02 Design 카드 — '3D 뷰어 · 3면도' 병합 카드·#t3d 마운트
   PV-01 3면도 — svg.txv3 viewBox 300×66·정면/측면/윗면 라벨 3개
   PV-02 3면도 분기 — Veneer 치관 오버레이(DOM)·Inlay 인레이 rect(소스)
   PT-01 점 스캐닝 — #txPts 도트 진행 적재·96P 도달 시 96개
   PT-02 스캔 본체 수복 — Step 1 헤더·잇몸 url(#gGm) path (return 콤마 파손 회귀 감시)
   EX-01 번들 예산 — 283,000B 이하·헤드룸 100B 이상
   EX-02 runtime errors 0 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const VIEWS = fs.readFileSync(path.join(__dirname, '..', 'mirimiso-webapp', 'js', 'views.js'), 'utf8');
const D3D = fs.readFileSync(path.join(__dirname, '..', 'mirimiso-webapp', 'js', 'dental3d.js'), 'utf8');
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

  /* 진료 진입 → Veneer 처방 → 스캔 */
  Array.from(d.querySelectorAll('button')).find(x => x.textContent.includes('의료진 모드')).click();
  await sleep(300);
  d.getElementById('agreeRow').click();
  d.getElementById('agreeBtn').click();
  await sleep(500);
  d.getElementById('txEntry').click();
  await sleep(400);
  d.querySelectorAll('.tt')[0].click();
  d.querySelectorAll('.dtc')[2].click(); /* Veneer */
  d.getElementById('txGo').click();

  /* PT-02 스캔 본체 수복 — return 콤마 파손 시 gum path·헤더 소실 */
  const svg = await waitFor(() => d.querySelector('#modalBody #txSvg'), 6000);
  assert(d.getElementById('modalBody').textContent.includes('Step 1: Scan the Working Arch')
    && svg.querySelector('path') && svg.querySelector('path').getAttribute('fill') === 'url(#gGm)',
    'PT-02 스캔 본체 수복 — Step 1 헤더·잇몸 url(#gGm) path (return 콤마 파손 감시)');

  /* PT-01 점 스캐닝 — 도트 진행 적재 */
  const dotsDuring = await waitFor(() => { const g = svg.querySelector('#txPts'); return g && g.querySelectorAll('circle').length > 0 ? g.querySelectorAll('circle').length : null; }, 8000);
  assert(dotsDuring >= 1, 'PT-01 점 스캐닝 — 진행 중 도트 적재 (' + dotsDuring + '개)');
  await waitFor(() => parseInt((d.querySelector('#txPt') || {}).textContent, 10) === 96, 20000);
  assert(svg.querySelectorAll('#txPts circle').length === 96, 'PT-01 점 스캐닝 — 96P 도달 시 도트 96개');
  Array.from(d.querySelectorAll('#modalBody button')).find(b => b.id === 'txDn').click();
  await sleep(600);

  /* JA-01 소스 계약 — buildJaw 병합 + step3 jaw 연결 */
  assert(D3D.includes('buildJaw=function') && D3D.includes("side:'both'") && VIEWS.includes("startArch: 'jaw'"),
    'JA-01 buildJaw 계약 — dental3d 상·하악 병합(side both)·step3 startArch jaw');

  /* JA-02 Design 카드 병합 */
  await waitFor(() => d.getElementById('t3d'), 4000);
  assert(!!d.getElementById('t3d') && root().textContent.includes('3D 뷰어 · 3면도'),
    'JA-02 Design 카드 — 3D 뷰어 · 3면도 병합·#t3d 마운트');

  /* PV-01 3면도 — 라벨·분할 */
  const pv = root().querySelector('svg.txv3');
  const labels = pv ? Array.from(pv.querySelectorAll('text')).map(t => t.textContent) : [];
  assert(pv && pv.getAttribute('viewBox') === '0 0 300 66' && labels.join(',') === '정면,측면,윗면' && pv.querySelectorAll('path').length >= 5,
    'PV-01 3면도 — viewBox 300×66·정면/측면/윗면 라벨·path ' + (pv ? pv.querySelectorAll('path').length : 0) + '개');

  /* PV-02 Veneer 치관 오버레이 + Inlay rect 소스 분기 */
  assert(!!pv.querySelector('path[fill="#F7F1DE"]') && VIEWS.includes('M41 25H59V38H41Z') && VIEWS.includes('M40 42H60V50H40Z'),
    'PV-02 3면도 분기 — Veneer 치관 오버레이(DOM)·Inlay 인레이 rect(소스)');

  /* EX-01 예산·헤드룸 */
  const sz = fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size;
  assert(sz <= LIMIT && LIMIT - sz >= 100, `EX-01 번들 — ${sz}B ≤ ${LIMIT}B·헤드룸 ${LIMIT - sz}B ≥ 100B`);

  /* EX-02 정리 무오류 */
  w.A.go('staffHome');
  await sleep(400);
  assert(errors.length === 0, 'EX-02 정리 — staffHome 복귀 후 runtime errors 0' + (errors.length ? ' → ' + errors.join('|').slice(0, 160) : ''));
  await dom.window.close();

  console.log('--- S88 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
