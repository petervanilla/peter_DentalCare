#!/usr/bin/env node
/* S89 스모크 — 점 스캐닝 이펙트·3D 뷰어 상악/하악/초기화 (91차 · 사용자 3요청):
   FX-01 점 이펙트 CSS — @keyframes txPop(미트 글로우 팝)·txPulse(선행 점 펄스)
   FX-02 점 스캐닝 런타임 — 96P 도달 시 도트 96개 (S88 PT-01 연속성)
   JW-01 초기 양악 — upper/lower 버튼 모두 .on 아님(S88 하이라이트 불일치 결함 해소)·mount 하이라이트 동기
   JW-02 상악 단독 — buildArch('upper') 재구성·upper .on
   JW-03 하악 단독 — buildArch('lower') 재구성·lower .on
   JW-04 초기화 복원 — buildJaw(양악) 재구성·양 버튼 .on 해제 (사용자 요청 — 초기화 시 상·하악 모두)
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

  /* 진료 진입 → Veneer 처방 → 스캔 */
  Array.from(d.querySelectorAll('button')).find(x => x.textContent.includes('의료진 모드')).click();
  await sleep(300);
  d.getElementById('agreeRow').click();
  d.getElementById('agreeBtn').click();
  await sleep(500);
  d.getElementById('txEntry').click();
  await sleep(400);
  d.querySelectorAll('.tt')[0].click();
  d.querySelectorAll('.dtc')[2].click();
  d.getElementById('txGo').click();
  const svg = await waitFor(() => d.querySelector('#modalBody #txSvg'), 6000);

  /* FX-02 점 스캐닝 런타임 (S88 연속성) */
  await waitFor(() => parseInt((d.querySelector('#txPt') || {}).textContent, 10) === 96, 20000);
  assert(svg.querySelectorAll('#txPts circle').length === 96, 'FX-02 점 스캐닝 — 96P 도달 시 도트 96개 (S88 연속성)');

  /* FX-01 점 이펙트 CSS */
  assert(CSS.includes('@keyframes txPop') && CSS.includes('@keyframes txPulse') && CSS.includes('#txPts circle{animation:txPop'),
    'FX-01 점 이펙트 CSS — txPop 글로우 팝·txPulse 선행 점 펄스');

  Array.from(d.querySelectorAll('#modalBody button')).find(b => b.id === 'txDn').click();
  const box = await waitFor(() => d.getElementById('t3d-box'), 4000);

  /* build spy — 렌더 호출 계측 */
  const calls = [];
  const D3 = w.Dental3D, oBA = D3.buildArch, oBJ = D3.buildJaw;
  D3.buildArch = function (t) { calls.push(t); return oBA.apply(D3, arguments); };
  D3.buildJaw = function () { calls.push('jaw'); return oBJ.apply(D3, arguments); };
  const up = box.querySelector('[data-a="upper"]'), lo = box.querySelector('[data-a="lower"]');
  const rs = box.querySelector('[data-act="reset"]');

  /* JW-01 초기 양악 — 하이라이트 정합 */
  assert(!up.classList.contains('on') && !lo.classList.contains('on') && VIEWS.includes('l(s),{renderer:r,setArch:l'),
    'JW-01 초기 양악 — upper/lower 모두 .on 아님 (S88 하이라이트 불일치 해소·mount 동기)');

  /* JW-02 상악 단독 */
  calls.length = 0;
  up.click();
  await sleep(250);
  assert(calls.indexOf('upper') > -1 && calls.indexOf('lower') === -1 && up.classList.contains('on') && !lo.classList.contains('on'),
    'JW-02 상악 단독 — buildArch(upper) 재구성·upper .on');

  /* JW-03 하악 단독 */
  calls.length = 0;
  lo.click();
  await sleep(250);
  assert(calls.indexOf('lower') > -1 && calls.indexOf('upper') === -1 && lo.classList.contains('on') && !up.classList.contains('on'),
    'JW-03 하악 단독 — buildArch(lower) 재구성·lower .on');

  /* JW-04 초기화 → 양악 복원 */
  calls.length = 0;
  rs.click();
  await sleep(250);
  assert(calls.indexOf('jaw') > -1 && calls.indexOf('upper') > -1 && calls.indexOf('lower') > -1
    && !up.classList.contains('on') && !lo.classList.contains('on'),
    'JW-04 초기화 복원 — buildJaw(상·하악 동시) 재구성·양 버튼 .on 해제');

  /* EX-01 예산·헤드룸 */
  const sz = fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size;
  assert(sz <= LIMIT && LIMIT - sz >= 100, `EX-01 번들 — ${sz}B ≤ ${LIMIT}B·헤드룸 ${LIMIT - sz}B ≥ 100B`);

  /* EX-02 정리 무오류 */
  w.A.go('staffHome');
  await sleep(400);
  assert(errors.length === 0, 'EX-02 정리 — staffHome 복귀 후 runtime errors 0' + (errors.length ? ' → ' + errors.join('|').slice(0, 160) : ''));
  await dom.window.close();

  console.log('--- S89 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
