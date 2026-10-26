#!/usr/bin/env node
/* S100 스모크 — Figma 디자인 후속 적용 (디자인 명세 DS-116·117):
   DS-116 시술 선택 리스트형 — #simChips 스코프 CSS·칩 토글 계약 유지
   DS-117 업로드 액션 분리 — 갤러리 선택/카메라 촬영(capture) 입력 2종
   EX-01 번들 예산, EX-02 runtime errors 0
   ※ 텍스트 단정은 script를 제외한 가시 DOM 기준 (S98 교훈) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const LIMIT = 283000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

(async () => {
  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const w = dom.window, d = w.document;
  const vis = () => { const c = d.body.cloneNode(true); c.querySelectorAll('script,style').forEach(e => e.remove()); return c.textContent; };
  await sleep(900);
  d.querySelector('.role-card').click();
  await sleep(300);
  const ag = d.getElementById('agreeRow'); ag && ag.click();
  await sleep(150);
  const ab = d.getElementById('agreeBtn'); ab && ab.click();
  await sleep(500);

  const sc = d.querySelector('[data-goto="sim"]');
  sc && sc.click();
  await sleep(400);
  const sim = vis();

  assert(BUNDLE.includes('#simChips .chip') && BUNDLE.includes('content:"✓"') && d.querySelectorAll('#simChips .chip').length === 5,
    'DS-116a 시술 리스트형 CSS·칩 5종');
  const chip = d.querySelector('#simChips .chip[data-c="implant"]');
  const before = chip.classList.contains('on');
  chip.click();
  await sleep(150);
  assert(chip.classList.contains('on') !== before, 'DS-116b 칩 토글 계약 유지');
  const cam = d.getElementById('simCam'), gal = d.getElementById('simFile');
  assert(sim.includes('갤러리 선택') && sim.includes('카메라 촬영') && !!cam && cam.getAttribute('capture') === 'environment' && !!gal,
    'DS-117 업로드 갤러리/카메라 분리');

  const sz = fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size;
  assert(sz <= LIMIT && LIMIT - sz >= 100, `EX-01 번들 — ${sz}B ≤ ${LIMIT}B·헤드룸 ${LIMIT - sz}B ≥ 100B`);
  assert(errors.length === 0, 'EX-02 runtime errors 0' + (errors.length ? ' → ' + errors.join('|').slice(0, 160) : ''));
  await dom.window.close();

  console.log('--- S100 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
