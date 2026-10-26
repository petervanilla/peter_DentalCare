#!/usr/bin/env node
/* S69 스모크 — 브레드크럼–뒤로가기 연동: 스택 기반 이전 화면 표시(‹ 라벨)·pop 이동·조상 절단
   단정 원칙: ‹ 링크는 스택 pop · 조상 링크는 스택을 조상까지 절단 · 기존 경로 표시(BR-02) 유지 · appbar btnBack은 S92에서 제거(하단 네비 대체) */
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
  const cr = () => d.getElementById('crumbs');
  const crTxt = () => cr().textContent.replace(/\s+/g, ' ').trim();
  const pf = i => d.getElementById('pfoot').children[i].click();
  const bk = () => cr().querySelector('[data-b]');

  /* A. 홈 — 뒤로 링크 없음 (BK-01) */
  assert(crTxt() === 'HOME' && !bk(), '홈 — ‹ 링크 없음(스택 1) (BK-01)');

  /* B. 스택 기반 이전 화면 표시 (BK-02) */
  pf(3);
  await sleep(300);
  assert(!!bk() && bk().textContent.trim() === '‹ HOME', '여정 — ‹ HOME 표시(스택 이전) (BK-02)');
  pf(1);
  await sleep(300);
  assert(bk().textContent.trim() === '‹ 관리 여정' && crTxt() === '‹ 관리 여정›HOME›오늘의 관리', '오늘 — ‹ 관리 여정 + HOME›오늘의 관리 공존 (BK-02)');

  /* C. ‹ 클릭 = 스택 pop (BK-03) */
  bk().click();
  await sleep(300);
  assert(crTxt() === '‹ HOME›HOME›관리 여정'.replace('‹ HOME›HOME›', '‹ HOME›') || crTxt() === '‹ HOME›HOME›관리 여정', '‹ 클릭 → 관리 여정 복귀(스택 pop) (BK-03)');
  assert(d.getElementById('root').textContent.includes('월간 캘린더'), '관리 여정 화면 렌더 확인 (BK-03)');

  /* D. 조상 클릭 = 스택 절단 — 뒤로가기와 일관 (BK-03) */
  cr().querySelector('[data-c="home"]').click();
  await sleep(300);
  assert(crTxt() === 'HOME' && !d.getElementById('btnBack'), '조상(HOME) 클릭 → 스택 절단 — appbar btnBack 제거 확인 (BK-03)');

  /* E. 회귀 — 경로 표시·배지 캘린더 (BR-02·CB 회귀) */
  pf(3);
  await sleep(300);
  assert(crTxt().endsWith('HOME›관리 여정'), '기존 경로 표시 유지(‹ 접두 포함 신규 형식) (BR-02 회귀)');
  assert(d.querySelectorAll('.cwg i').length === 7, '캘린더 구조 유지 (S61 회귀)');

  /* F. 예산 */
  assert(fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size <= 283000, '번들 예산 — 276KiB 이하 (' + fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size + 'B)');

  console.log('--- S69 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
