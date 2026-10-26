#!/usr/bin/env node
/* S61 스모크 — 여정 월간 캘린더: 월 그리드(요일 7·일수)·기록/캡처 마커·오늘 강조·월 이동(미래월 금지)·비진단 고지
   단정 원칙: 캘린더는 기기 로컬 기록만 표시(비진단 참고) · 기존 여정 계약(도트 15·퀘스트 30) 유지 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); } }

(async () => {
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; } });
  const w = dom.window, d = w.document;
  await sleep(900);
  await sleep(300);
  Array.from(d.querySelectorAll('button')).find(x => x.textContent.includes('일반 환자 모드')).click();
  await sleep(300);
  d.getElementById('agreeRow').click();
  d.getElementById('agreeBtn').click();
  await sleep(700);
  d.getElementById('pfoot').children[3].click();
  await sleep(400);
  const root = () => d.getElementById('root').textContent;
  const today = new Date().toISOString().slice(0, 10);
  const y = today.slice(0, 4), mo = today.slice(5, 7);

  /* A. 캘린더 카드·그리드 구조 (CL-01) */
  assert(root().includes('월간 캘린더') && root().includes(y + '-' + mo), '월간 캘린더 카드 — 현재 월 표시 (S61·CL-01)');
  assert(d.querySelectorAll('.cwg i').length === 7, '요일 헤더 7칸');
  const dim = new Date(+y, +mo, 0).getDate();
  assert(d.querySelectorAll('.cdg i').length === dim, '날짜 셀 — ' + mo + '월 ' + dim + '칸');
  assert(!!d.querySelector('.cdg i.t'), '오늘 셀 강조 (.t)');

  /* B. 기록·캡처 마커 (CL-01·CL-03) */
  w.MM.todaySave({ d: today, pain: 1, swell: 0, bleed: 0, chew: 0, brush: 1, vice: 0, m: '' });
  w.MM.capSave({ d: today, p: 1, a: '정면', q: 'A', b: 140, s: 12, f: 15 });
  w.MM.app.rerender();
  await sleep(400);
  const tc = d.querySelector('.cdg i.t');
  assert(tc.classList.contains('r') && tc.classList.contains('c'), '오늘 셀 — 기록(r)·캡처(c) 이중 마커');
  const before = root();

  /* C. 월 이동 — 이전 → 빈 월 → 복귀 · 미래월 금지 (CL-02) */
  const prevY = +mo === 1 ? +y - 1 : y, prevM = +mo === 1 ? 12 : String(+mo - 1).padStart(2, '0');
  d.getElementById('calP').click();
  await sleep(400);
  assert(root().includes(prevY + '-' + prevM), '‹ 이전 월 이동 — ' + prevY + '-' + prevM);
  assert(!d.querySelector('.cdg i.r') && !d.querySelector('.cdg i.c'), '이전 월 — 기록 없으면 마커 없음');
  d.getElementById('calN').click();
  await sleep(400);
  assert(root().includes(y + '-' + mo), '› 다음 월 복귀 — 현재 월');
  assert(d.getElementById('calN').disabled, '현재 월에서 › 비활성 — 미래월 이동 금지 (CL-02)');
  assert(root().includes('비진단'), '캘린더 비진단 고지 (CL-04)');

  /* D. 기존 여정 계약 유지 */
  assert(d.querySelector('.jrow').querySelectorAll('.jd').length === 15, '15일 도트 유지');
  assert(d.querySelector('.cdots').querySelectorAll('.jd').length === 30, '퀘스트 30도트 유지');

  /* E. 예산 */
  assert(fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size <= 283000, '번들 예산 — 276KiB 이하 (' + fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size + 'B)');

  console.log('--- S61 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
