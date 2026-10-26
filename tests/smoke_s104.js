#!/usr/bin/env node
/* S104 스모크 — 미리보기 카드 레이아웃 수복 (사용자 스크린샷 지적):
   PV-01 flow-step 2개가 형제로 닫히고 pvGo가 카드 직속 (중첩 깨짐 회귀 방지)
   PV-02 코드 조각 리터럴('+sp(')이 화면에 노출되지 않음
   PV-03 pvGo 클릭 → 환자 동의 모달 (기존 계약 유지)
   EX-01 번들 예산, EX-02 runtime errors 0 */
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

  const pv = d.getElementById('pvGo');
  const steps = d.querySelectorAll('.flow-step');
  assert(!!pv && pv.parentElement.classList.contains('card') && steps.length === 2 && !steps[0].contains(steps[1]) && !steps[0].contains(pv),
    'PV-01 미리보기 단계·버튼 중첩 수복');
  assert(!vis().includes('+sp('), 'PV-02 코드 리터럴 노출 없음');
  pv.click();
  await sleep(400);
  assert(!!d.getElementById('agreeBtn') && d.getElementById('modalOverlay').classList.contains('show'),
    'PV-03 pvGo → 환자 동의 모달 (계약 유지)');

  const sz = fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size;
  assert(sz <= LIMIT && LIMIT - sz >= 100, `EX-01 번들 — ${sz}B ≤ ${LIMIT}B·헤드룸 ${LIMIT - sz}B ≥ 100B`);
  assert(errors.length === 0, 'EX-02 runtime errors 0' + (errors.length ? ' → ' + errors.join('|').slice(0, 160) : ''));
  await dom.window.close();

  console.log('--- S104 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
