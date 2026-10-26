#!/usr/bin/env node
/* S95 스모크 — 메인 역할 카드 텍스트 가로 배치 (97차 사용자 요청):
   RC-01 role-card 그리드 — 아이콘 1열·제목/설명 2열 CSS
   RC-02 역할 카드 3종·제목 문구 유지
   RC-03 아이콘→제목→설명 DOM 순서 유지
   RC-04 카드 클릭 진입 무영향 — 의료진 동의 화면
   EX-01 번들 예산 — 283,000B 이하·헤드룸 100B 이상
   EX-02 runtime errors 0 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'mirimiso-webapp', 'css', 'app.css'), 'utf8');
const LIMIT = 283000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

(async () => {
  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const d = dom.window.document;
  await sleep(900);

  assert(/\.role-card\{[^}]*display:grid;grid-template-columns:42px minmax\(0,1fr\)/.test(CSS)
    && /\.role-card \.rc-ic\{[^}]*grid-row:1\/span 2/.test(CSS)
    && /\.role-card>b\{grid-column:2/.test(CSS)
    && /\.role-card>span:last-child\{grid-column:2/.test(CSS),
    'RC-01 role-card 가로 그리드 — 아이콘 1열·제목/설명 2열');

  const cards = [...d.querySelectorAll('.role-card')];
  const titles = cards.map(c => { const b = c.querySelector(':scope > b'); return b ? b.textContent : ''; });
  assert(cards.length === 3 && titles.map(t=>t.replace(' ★ 추천','')).join('|') === '일반 환자 모드|의료진 모드 (Clinic)|기공소 모드 (Lab)' && titles[0].includes('★ 추천'),
    'RC-02 역할 카드 3종 — 제목 문구 유지: ' + titles.join(' · '));

  assert(cards.every(c => {
    const icon = c.querySelector(':scope > .rc-ic');
    const title = c.querySelector(':scope > b');
    const desc = c.querySelector(':scope > span:last-child');
    return !!icon && !!title && !!desc && icon.nextElementSibling === title && title.nextElementSibling === desc && desc.textContent.length > 10;
  }), 'RC-03 카드 구조 — 아이콘 옆 제목·아래 설명 순서 유지');

  cards.find(c => c.textContent.includes('의료진')).click();
  await sleep(500);
  assert(!!d.getElementById('agreeRow'), 'RC-04 카드 클릭 진입 — 의료진 동의 화면 정상');

  const sz = fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size;
  assert(sz <= LIMIT && LIMIT - sz >= 100, `EX-01 번들 — ${sz}B ≤ ${LIMIT}B·헤드룸 ${LIMIT - sz}B ≥ 100B`);
  assert(errors.length === 0, 'EX-02 runtime errors 0' + (errors.length ? ' → ' + errors.join('|').slice(0, 160) : ''));
  await dom.window.close();

  console.log('--- S95 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
