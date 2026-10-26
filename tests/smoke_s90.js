#!/usr/bin/env node
/* S90 스모크 — Inlay·Onlay 3면도 구분 사실화·스캔라인 펄스 (92차 · 90차 요청 완결):
   PV-01 온레이 링 — 윗면 외곽 d 재활용 stroke 링(색조색·3.5·opacity .85)
   PV-02 정면 cusp 캡 — 온레이 교합면 커버 오버레이(색조색)
   PV-03 인레이 rect 유지 — 정면 M40 42·윗면 M41 25 (S88 연속성)
   FX-01 스캔라인 펄스 — txScanPulse 키프레임·#txSl 애니메이션 (S89 점 이펙트 톤 통일)
   EX-01 번들 예산 — 283,000B 이하·헤드룸 100B 이상
   EX-02 runtime errors 0 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const VIEWS = fs.readFileSync(path.join(__dirname, '..', 'mirimiso-webapp', 'js', 'views.js'), 'utf8');
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

  /* 진료 진입 → Inlay · Onlay 처방 → 스캔 */
  Array.from(d.querySelectorAll('button')).find(x => x.textContent.includes('의료진 모드')).click();
  await sleep(300);
  d.getElementById('agreeRow').click();
  d.getElementById('agreeBtn').click();
  await sleep(500);
  d.getElementById('txEntry').click();
  await sleep(400);
  d.querySelectorAll('.tt')[0].click();
  const dtc = Array.from(d.querySelectorAll('.dtc')).find(b => b.textContent.includes('Inlay'));
  dtc.click();
  assert(TXDT_OK(dtc.textContent), 'PV-전제 DesignType — Inlay · Onlay 단일 버튼');
  d.getElementById('txGo').click();
  const svg = await waitFor(() => d.querySelector('#modalBody #txSvg'), 6000);

  /* FX-01 스캔라인 펄스 — 스캔 모달 단계에서 라인 존재 + CSS 계약 */
  assert(!!d.getElementById('txSl') && CSS.includes('@keyframes txScanPulse') && /#txSl\{[^}]*animation:txScanPulse/.test(CSS),
    'FX-01 스캔라인 펄스 — #txSl 라이브·txScanPulse 키프레임·애니메이션 적용');

  await waitFor(() => parseInt((d.querySelector('#txPt') || {}).textContent, 10) === 96, 20000);
  Array.from(d.querySelectorAll('#modalBody button')).find(b => b.id === 'txDn').click();
  const pv = await waitFor(() => root().querySelector('svg.txv3'), 4000);

  /* PV-01 온레이 링 */
  const ring = pv.querySelector('path[stroke-width="3.5"]');
  assert(!!ring && ring.getAttribute('opacity') === '.85' && /^#/.test(ring.getAttribute('stroke') || ''),
    'PV-01 온레이 링 — 윗면 외곽 stroke 링(색조색·width 3.5·opacity .85)');

  /* PV-02 정면 cusp 캡 */
  const cap = Array.from(pv.querySelectorAll('path')).find(p => (p.getAttribute('d') || '').indexOf('M33 23Q41 15') === 0);
  assert(!!cap && /^#/.test(cap.getAttribute('fill') || ''), 'PV-02 정면 cusp 캡 — 온레이 교합면 커버 오버레이(색조색)');

  /* PV-03 인레이 rect 유지 (S88 연속성) */
  assert(VIEWS.includes('M41 25H59V38H41Z') && VIEWS.includes('M40 42H60V50H40Z'),
    'PV-03 인레이 rect 유지 — 정면·윗면 내부 충전 (S88 연속성)');

  /* EX-01 예산·헤드룸 */
  const sz = fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size;
  assert(sz <= LIMIT && LIMIT - sz >= 100, `EX-01 번들 — ${sz}B ≤ ${LIMIT}B·헤드룸 ${LIMIT - sz}B ≥ 100B`);

  /* EX-02 정리 무오류 */
  w.A.go('staffHome');
  await sleep(400);
  assert(errors.length === 0, 'EX-02 정리 — staffHome 복귀 후 runtime errors 0' + (errors.length ? ' → ' + errors.join('|').slice(0, 160) : ''));
  await dom.window.close();

  console.log('--- S90 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

function TXDT_OK(t) { return t.indexOf('Inlay') > -1 && t.indexOf('Onlay') > -1; }
