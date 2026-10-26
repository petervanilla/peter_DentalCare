#!/usr/bin/env node
/* S98 스모크 — Figma 디자인 본 적용 (100차 사용자 요청):
   DS-01 홈 플라크 카드 — 부착 지수 라벨·상태 뱃지 (양호/주의)
   DS-02 게이지 스케일 (0% 최상 · 50% 주의 · 100% 위험 · 권장 <20%)
   DS-03 데일리 루틴 카드 + 오늘의 치아 지킴 팁 카드
   DS-04 루틴 카드 클릭 → routine 화면 이동 (data-goto 계약)
   DS-05 미소 시뮬레이션 stepper (1. 사진 업로드 2. 시술 선택 3. AI 미리보기)
   DS-06 디자인 제외 문구 부재 (1,428명·종단간·스마트 케어) 회귀
   EX-01 번들 예산, EX-02 runtime errors 0
   ※ 텍스트 단정은 script를 제외한 가시 DOM 기준 */
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
  const body = vis();

  assert(body.includes('안녕하세요') && body.includes('플라크 부착 지수') && (body.includes('안정/양호') || body.includes('● 주의')),
    'DS-01 홈 진입·플라크 부착 지수·상태 뱃지');
  assert(body.includes('0% 최상') && body.includes('50% 주의') && body.includes('100% 위험') && body.includes('권장 <20%'),
    'DS-02 게이지 스케일 라벨');
  assert(body.includes('오늘의 데일리 루틴') && body.includes('7일 연속') && body.includes('오늘의 치아 지킴 팁') && body.includes('치실을 사선으로'),
    'DS-03 루틴 카드·팁 카드');
  const rc = d.querySelector('div.card[data-goto="routine"]');
  assert(!!rc, 'DS-04a 루틴 카드 data-goto 존재');
  rc && rc.click();
  await sleep(400);
  const rv = vis();
  assert(rv.includes('오늘의 케어 루틴') && !rv.includes('오늘의 치아 지킴 팁'), 'DS-04b 루틴 카드 클릭 → routine 이동');
  const hb = [...d.querySelectorAll('.pfoot button')].find(b => b.textContent.includes('홈'));
  hb && hb.click();
  await sleep(400);
  const sc = d.querySelector('[data-goto="sim"]');
  sc && sc.click();
  await sleep(400);
  const sim = vis();
  assert(sim.includes('1. 사진 업로드') && sim.includes('2. 시술 선택') && sim.includes('3. AI 미리보기') && d.querySelectorAll('.cst').length >= 3,
    'DS-05 시뮬레이션 stepper 3단계');
  assert(!sim.includes('1,428명') && !sim.includes('종단간') && !sim.includes('스마트 케어'),
    'DS-06 디자인 제외 문구 부재');
  const sz = fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size;
  assert(sz <= LIMIT && LIMIT - sz >= 100, `EX-01 번들 — ${sz}B ≤ ${LIMIT}B·헤드룸 ${LIMIT - sz}B ≥ 100B`);
  assert(errors.length === 0, 'EX-02 runtime errors 0' + (errors.length ? ' → ' + errors.join('|').slice(0, 160) : ''));
  await dom.window.close();

  console.log('--- S98 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
