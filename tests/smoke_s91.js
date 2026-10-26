#!/usr/bin/env node
/* S91 스모크 — 스캔 포인트 클라우드 아치 배치·3면도 해부학적 사실화 (93차 · 사용자 재요청):
   DB-01 도트 아치 분포 — 96P 도달 시 96개·cx/cy 스팬이 아치 전체 커버(구 띠 배치 결함 해소)
   DB-02 도트 가시성 — #35DCA5 밝은 민트·r 1.3·치아 rect 위 레이어
   DB-03 글로우 — drop-shadow 필터·txPop 종료색 #35DCA5
   AN-01 해부형 치관 — 교두 곡선(M33 47)·교합면 라운드사각(M38 12H62)
   AN-02 세부 해부 — 십자 중앙홈(M50 18V44)·크라운 경부 마진(M34 42Q42 46)
   AN-03 크라운 오버레이 — 색조색 3면(정면·측면 scale·윗면)
   EX-01 번들 예산 — 283,000B 이하·헤드룸 100B 이상
   EX-02 runtime errors 0 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'mirimiso-webapp', 'css', 'app.css'), 'utf8');
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

  /* 진료 진입 → Anatomic Crown 처방 → 스캔 */
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
  const pg = () => svg.querySelector('#txPts');

  /* DB-01 도트 아치 분포 */
  await waitFor(() => parseInt((d.querySelector('#txPt') || {}).textContent, 10) === 96, 20000);
  const dots = Array.from(pg().querySelectorAll('circle'));
  const cxs = dots.map(c => +c.getAttribute('cx')), cys = dots.map(c => +c.getAttribute('cy'));
  assert(dots.length === 96 && Math.max(...cxs) - Math.min(...cxs) >= 80 && Math.max(...cys) - Math.min(...cys) >= 55,
    `DB-01 도트 아치 분포 — 96개·cx 스팬 ${(Math.max(...cxs) - Math.min(...cxs)).toFixed(0)}·cy 스팬 ${(Math.max(...cys) - Math.min(...cys)).toFixed(0)} (구 띠 배치 결함 해소)`);

  /* DB-02 가시성 · 레이어 */
  const mint = dots.filter(c => c.getAttribute('fill') === '#35DCA5' && c.getAttribute('r') === '1.3').length;
  const svgKids = Array.from(svg.children).map(e => e.id || e.tagName).join(',');
  assert(mint === 96 && svgKids.indexOf('txPts') > svgKids.lastIndexOf('rect') && svgKids.indexOf('txSl') > svgKids.indexOf('txPts'),
    'DB-02 도트 가시성 — #35DCA5·r 1.3·치아 rect 위·스캔라인 아래 레이어');

  /* DB-03 글로우 CSS */
  assert(CSS.includes('filter:drop-shadow(0 0 1.5px #35DCA5)') && CSS.includes('100%{fill:#35DCA5;r:1.3}'),
    'DB-03 글로우 — drop-shadow 필터·txPop 종료색 #35DCA5');

  Array.from(d.querySelectorAll('#modalBody button')).find(b => b.id === 'txDn').click();
  const pv = await waitFor(() => root().querySelector('svg.txv3'), 4000);
  const ds = Array.from(pv.querySelectorAll('path')).map(p => p.getAttribute('d') || '');

  /* AN-01 해부형 치관 */
  assert(ds.some(p => p.indexOf('M33 47') === 0) && ds.some(p => p.indexOf('M38 12H62') === 0),
    'AN-01 해부형 치관 — 교두 곡선 정면·교합면 라운드사각 윗면');

  /* AN-02 세부 해부 */
  assert(ds.some(p => p.indexOf('M50 18V44') === 0) && ds.some(p => p.indexOf('M34 42Q42 46') === 0),
    'AN-02 세부 해부 — 십자 중앙홈·크라운 경부 마진선');

  /* AN-03 크라운 오버레이 3면 */
  const shade3 = Array.from(pv.querySelectorAll('path[fill="#F7F1DE"]')).length;
  assert(shade3 === 3, 'AN-03 크라운 오버레이 — 색조색 정면·측면(scale)·윗면 3개');

  /* EX-01 예산·헤드룸 */
  const sz = fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size;
  assert(sz <= LIMIT && LIMIT - sz >= 100, `EX-01 번들 — ${sz}B ≤ ${LIMIT}B·헤드룸 ${LIMIT - sz}B ≥ 100B`);

  /* EX-02 정리 무오류 */
  w.A.go('staffHome');
  await sleep(400);
  assert(errors.length === 0, 'EX-02 정리 — staffHome 복귀 후 runtime errors 0' + (errors.length ? ' → ' + errors.join('|').slice(0, 160) : ''));
  await dom.window.close();

  console.log('--- S91 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
