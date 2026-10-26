#!/usr/bin/env node
/* S94 스모크 — 역할 선택 hero 로고 제거 (96차 사용자 요청):
   LG-01 logo-big 부재 — DOM·소스·CSS 완전 제거 (역할 선택 화면의 반짝 아이콘 칩)
   LG-02 hero 구조 유지 — 제목·설명·role-card 3장 (96차: 이미지만 삭제)
   LG-03 진입 플로우 무영향 — 동의 → 로그인 경로 정상
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
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

(async () => {
  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const w = dom.window, d = w.document;
  await sleep(900);

  /* LG-01 소스·CSS 부재 */
  assert(!VIEWS.includes('logo-big') && !CSS.includes('logo-big'),
    'LG-01 logo-big 제거 — views·css 소스 부재');

  /* LG-01 DOM 부재 */
  assert(d.querySelectorAll('.logo-big').length === 0, 'LG-01 logo-big 제거 — DOM 부재 (96차: 이미지 삭제)');

  /* LG-02 hero 구조 유지 */
  const hero = d.querySelector('.role-hero');
  assert(!!hero && hero.querySelector('h1').textContent === '치과 상담, 미리 준비하고 오세요' && d.querySelectorAll('.role-card').length === 3,
    'LG-02 hero 구조 유지 — 제목·role-card 3장');

  /* LG-03 진입 플로우 */
  Array.from(d.querySelectorAll('.role-card')).find(x => x.textContent.includes('의료진')).click();
  await sleep(400);
  d.getElementById('agreeRow').click();
  d.getElementById('agreeBtn').click();
  await sleep(700);
  assert(d.getElementById('root').textContent.length > 200, 'LG-03 진입 플로우 — 동의 후 로그인 렌더 정상');

  /* EX-01 예산·헤드룸 */
  const sz = fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size;
  assert(sz <= LIMIT && LIMIT - sz >= 100, `EX-01 번들 — ${sz}B ≤ ${LIMIT}B·헤드룸 ${LIMIT - sz}B ≥ 100B`);

  /* EX-02 정리 무오류 */
  assert(errors.length === 0, 'EX-02 runtime errors 0' + (errors.length ? ' → ' + errors.join('|').slice(0, 160) : ''));
  await dom.window.close();

  console.log('--- S94 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
