#!/usr/bin/env node
/* S96 스모크 — 헤더 라이트/다크 모드 · 환자 홈 빠른 메뉴 드래그 순서 · 상태 사진 라벨 (98차 사용자 요청):
   DM-01 헤더 모드 전환 버튼·다크 변수 CSS
   DM-02 다크/라이트 전환 — html.dark·MM_MODE 저장·aria-pressed
   QO-01 저장된 빠른 메뉴 순서가 홈 진입 시 반영
   QO-02 아이콘 드래그(포인터) 재배열·순서 저장
   PH-01 환자 상태 사진 라벨 — '📷 상태 사진 추가' (구 문구 부재)
   EX-01 번들 예산 — 283,000B 이하·헤드룸 100B 이상
   EX-02 runtime errors 0 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'mirimiso-webapp', 'css', 'app.css'), 'utf8');
const CASEHUB = fs.readFileSync(path.join(__dirname, '..', 'mirimiso-webapp', 'js', 'casehub.js'), 'utf8');
const LIMIT = 283000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

(async () => {
  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const w = dom.window, d = w.document;
  await sleep(900);

  /* DM-01/02 헤더 모드 전환 */
  assert(!!d.getElementById('modeLight') && !!d.getElementById('modeDark') && CSS.includes('.dark{--q:#E9F1F8'),
    'DM-01 헤더 라이트/다크 버튼·다크 변수 CSS');
  d.getElementById('modeDark').click();
  const darkOk = d.documentElement.classList.contains('dark') && w.localStorage.MM_MODE === 'dark'
    && d.getElementById('modeDark').getAttribute('aria-pressed') === 'true';
  d.getElementById('modeLight').click();
  assert(darkOk && !d.documentElement.classList.contains('dark') && w.localStorage.MM_MODE === 'light',
    'DM-02 모드 전환 — 다크 적용·저장 후 라이트 복귀');

  /* QO-01 저장 순서 반영 */
  w.localStorage.MM_QO = JSON.stringify(['today', 'care', 'report', 'records', 'sim']);
  [...d.querySelectorAll('.role-card')].find(x => x.textContent.includes('일반 환자')).click();
  await sleep(400);
  d.getElementById('agreeRow').click();
  d.getElementById('agreeBtn').click();
  await sleep(700);
  const order1 = [...d.querySelectorAll('#homeQuickGrid .quick')].map(x => x.dataset.goto).join(',');
  assert(order1 === 'today,care,report,records,sim', 'QO-01 빠른 메뉴 저장 순서 반영 — ' + order1);

  /* QO-02 포인터 드래그 재배열·저장 (elementFromPoint 스텁 — jsdom 레이아웃 대체) */
  const cards = [...d.querySelectorAll('#homeQuickGrid .quick')];
  const first = cards[0], last = cards[cards.length - 1];
  const origEFP = d.elementFromPoint;
  d.elementFromPoint = () => first;
  const ev = (type, target) => { const e = new w.MouseEvent(type, { bubbles: true }); Object.defineProperty(e, 'clientX', { value: 10 }); Object.defineProperty(e, 'clientY', { value: 0 }); target.dispatchEvent(e); };
  ev('pointerdown', last.querySelector('.q-ic'));
  ev('pointermove', d.getElementById('homeQuickGrid'));
  ev('pointerup', d.getElementById('homeQuickGrid'));
  d.elementFromPoint = origEFP;
  const order2 = [...d.querySelectorAll('#homeQuickGrid .quick')].map(x => x.dataset.goto);
  const saved = JSON.parse(w.localStorage.MM_QO || '[]');
  assert(order2[1] === 'sim' && saved.join(',') === order2.join(','),
    'QO-02 아이콘 드래그 재배열·저장 — ' + order2.join(','));

  /* PH-01 상태 사진 라벨 */
  [...d.querySelectorAll('[data-goto="care"]')][0].click();
  await sleep(600);
  const label = [...d.querySelectorAll('label.finput')].map(x => x.textContent.trim()).find(x => x.includes('상태 사진'));
  assert(label === '📷 상태 사진 추가' && !CASEHUB.includes('상태 사진 추가 (선택 · 파일명만 기록)'),
    'PH-01 상태 사진 라벨 단축 — ' + JSON.stringify(label));

  /* EX-01/02 */
  const sz = fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size;
  assert(sz <= LIMIT && LIMIT - sz >= 100, `EX-01 번들 — ${sz}B ≤ ${LIMIT}B·헤드룸 ${LIMIT - sz}B ≥ 100B`);
  assert(errors.length === 0, 'EX-02 runtime errors 0' + (errors.length ? ' → ' + errors.join('|').slice(0, 160) : ''));
  await dom.window.close();

  console.log('--- S96 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
