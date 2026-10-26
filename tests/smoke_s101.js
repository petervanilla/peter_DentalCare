#!/usr/bin/env node
/* S101 스모크 — 디자인 명세 종료 스프린트 (DS-118 + 브랜드/디자인 문서):
   DS-118 홈 상단 날짜 (실제 날짜 생성 — 월/일/요일)
   DOC-01 브랜드.md — 브랜드 구조·금지 명칭·비진단 원칙
   DOC-02 디자인.md — 토큰·컴포넌트 인벤토리·감찰 결과
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
  const home = vis();
  const now = new Date();
  const dateStr = (now.getMonth() + 1) + '월 ' + now.getDate() + '일';
  assert(home.includes(dateStr) && /[일월화수목금토]\)/.test(home),
    'DS-118 홈 날짜 (실제 날짜·요일)');
  const brand = fs.readFileSync(path.join(__dirname, '..', '브랜드.md'), 'utf8');
  assert(brand.includes('스마일치과') && brand.includes('미리미소 스마트 케어') && brand.includes('비진단'),
    'DOC-01 브랜드.md (구조·금지 명칭·비진단 원칙)');
  const design = fs.readFileSync(path.join(__dirname, '..', '디자인.md'), 'utf8');
  assert(design.includes('#27AE8D') && design.includes('149deg') && design.includes('컴포넌트 인벤토리') && design.includes('사규는 0건'),
    'DOC-02 디자인.md (토큰·인벤토리·감찰)');
  const sz = fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size;
  assert(sz <= LIMIT && LIMIT - sz >= 100, `EX-01 번들 — ${sz}B ≤ ${LIMIT}B·헤드룸 ${LIMIT - sz}B ≥ 100B`);
  assert(errors.length === 0, 'EX-02 runtime errors 0' + (errors.length ? ' → ' + errors.join('|').slice(0, 160) : ''));
  await dom.window.close();

  console.log('--- S101 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
