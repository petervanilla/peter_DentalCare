#!/usr/bin/env node
/* S102 스모크 — 파일럿 준비 최종 리허설 (데모시나리오 STEP 대조):
   RP-01 STEP1 역할 선택 3종
   RP-02 STEP2 환자 — 구강 스캔 열기 진입점
   RP-03 STEP3 의료진 — 진료 시작·케이스 허브
   RP-04 STEP5 기공소 — 주문 큐 진입
   RP-05 STEP6 환자 — 상담 리포트 공유 버튼
   EX-01 번들 예산, EX-02 runtime errors 0
   ※ 역할마다 독립 세션 (기존 스위트 진입 방식), 가시 DOM 기준 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const LIMIT = 283000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
const errors = [];
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

async function session(roleIdx) {
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const w = dom.window, d = w.document;
  const vis = () => { const c = d.body.cloneNode(true); c.querySelectorAll('script,style').forEach(e => e.remove()); return c.textContent; };
  await sleep(900);
  const cards = d.querySelectorAll('.role-card');
  if (roleIdx === 0) assert(cards.length === 3 && vis().includes('일반 환자 모드'), 'RP-01 STEP1 역할 선택 3종');
  cards[roleIdx].click();
  await sleep(300);
  const ag = d.getElementById('agreeRow'); ag && ag.click();
  await sleep(150);
  const ab = d.getElementById('agreeBtn'); ab && ab.click();
  await sleep(600);
  return { dom, w, d, vis };
}

(async () => {
  const p = await session(0);
  assert(p.vis().includes('구강 스캔 열기'), 'RP-02 STEP2 환자 홈 — 구강 스캔 열기');
  p.w.MM.app.go('report');
  await sleep(400);
  assert(!!p.d.getElementById('refShare') && p.vis().includes('병원에 리포트 공유하기'),
    'RP-05 STEP6 환자 상담 리포트 공유');
  await p.dom.window.close();

  const s = await session(1);
  const staff = s.vis();
  assert(staff.includes('진료 시작') && staff.includes('스마일치과'),
    'RP-03 STEP3 의료진 — 진료 시작·스마일치과');
  await s.dom.window.close();

  const l = await session(2);
  const lab = l.vis();
  assert(lab.includes('주문'), 'RP-04 STEP5 기공소 — 주문 화면');
  await l.dom.window.close();

  const sz = fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size;
  assert(sz <= LIMIT && LIMIT - sz >= 100, `EX-01 번들 — ${sz}B ≤ ${LIMIT}B·헤드룸 ${LIMIT - sz}B ≥ 100B`);
  assert(errors.length === 0, 'EX-02 runtime errors 0' + (errors.length ? ' → ' + errors.join('|').slice(0, 160) : ''));

  console.log('--- S102 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
