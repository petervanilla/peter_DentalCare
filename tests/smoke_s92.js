#!/usr/bin/env node
/* S92 스모크 — appbar 뒤로가기 버튼 제거·하단 네비 대체 (94차 사용자 결정):
   NB-01 btnBack 제거 — DOM·소스(.backbtn) 부재 — 하단 네비가 있으므로 뒤로가기 버튼 불필요
   NB-02 하단 네비 유지 — pfoot 5버튼·on 토글 (S58 회귀)
   NB-03 crumbs ‹ 링크 유지 — 스택 pop 동작 (S69 잔여 계약 — staff 와이드 화면 뒤로 경로 보존)
   NB-04 조상 절단 유지 — data-c 클릭 스택 절단 (BK-03 연속)
   EX-01 번들 예산 — 283,000B 이하·헤드룸 100B 이상
   EX-02 runtime errors 0 */
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
  await sleep(900);

  /* NB-01 소스 계약 — index·app·css에서 완전 제거 */
  const IDX = fs.readFileSync(path.join(__dirname, '..', 'mirimiso-webapp', 'index.html'), 'utf8');
  const APP = fs.readFileSync(path.join(__dirname, '..', 'mirimiso-webapp', 'js', 'app.js'), 'utf8');
  const CSS = fs.readFileSync(path.join(__dirname, '..', 'mirimiso-webapp', 'css', 'app.css'), 'utf8');
  assert(!IDX.includes('btnBack') && !APP.includes('btnBack') && !CSS.includes('backbtn'),
    'NB-01 btnBack 제거 — index·app·css 소스 부재');

  /* 환자 모드 진입 */
  Array.from(d.querySelectorAll('button')).find(x => x.textContent.includes('일반 환자 모드')).click();
  await sleep(300);
  d.getElementById('agreeRow').click();
  d.getElementById('agreeBtn').click();
  await sleep(700);

  /* NB-01 DOM — 버튼 부재 */
  assert(!d.getElementById('btnBack') && d.querySelectorAll('.backbtn').length === 0,
    'NB-01 btnBack 제거 — DOM 부재 (94차: 하단 네비 존재)');

  /* NB-02 하단 네비 */
  const pf = i => d.getElementById('pfoot').children[i].click();
  const pfoot = d.getElementById('pfoot');
  assert(pfoot.children.length === 5 && pfoot.querySelectorAll('.on').length === 1,
    'NB-02 하단 네비 유지 — pfoot 5버튼·on 1개');

  /* NB-03 crumbs ‹ 링크 유지 — pop 동작 */
  pf(3);
  await sleep(300);
  const cb = d.querySelector('#crumbs [data-b]');
  assert(!!cb && cb.textContent.trim() === '‹ HOME', 'NB-03 crumbs ‹ 링크 유지 — 여정에서 ‹ HOME');
  cb.click();
  await sleep(300);
  assert(d.getElementById('crumbs').textContent.trim() === 'HOME', 'NB-03 ‹ 클릭 pop — HOME 복귀');

  /* NB-04 조상 절단 */
  pf(1);
  await sleep(300);
  d.querySelector('#crumbs [data-c="home"]').click();
  await sleep(300);
  assert(d.getElementById('crumbs').textContent.trim() === 'HOME', 'NB-04 조상(HOME) 절단 — 스택 절단 유지');

  /* EX-01 예산·헤드룸 */
  const sz = fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size;
  assert(sz <= LIMIT && LIMIT - sz >= 100, `EX-01 번들 — ${sz}B ≤ ${LIMIT}B·헤드룸 ${LIMIT - sz}B ≥ 100B`);

  /* EX-02 정리 무오류 */
  await sleep(300);
  assert(errors.length === 0, 'EX-02 runtime errors 0' + (errors.length ? ' → ' + errors.join('|').slice(0, 160) : ''));
  await dom.window.close();

  console.log('--- S92 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
