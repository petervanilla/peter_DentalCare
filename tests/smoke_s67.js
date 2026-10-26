#!/usr/bin/env node
/* S67 스모크 — 브레드크럼 네비(헤더·본문 사이) + 캘린더 캡처 건수 배지
   단정 원칙: 브레드크럼은 조상 클릭 이동·현재 강조(이미지 스타일: HOME 회색·현재 주황) · 배지는 기기 로컬 캡처 건수 표시 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); } }
const iso = t => new Date(Date.now() - t * 864e5).toISOString().slice(0, 10);

(async () => {
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; } });
  const w = dom.window, d = w.document;
  await sleep(900);
  const cr = () => d.getElementById('crumbs');
  const crTxt = () => cr().textContent.replace(/\s+/g, ' ').trim();

  /* A. 브레드크럼 — 위치·구조 (BR-01) */
  assert(!!BUNDLE.match(/<\/header>\s*<nav class="crumbs" id="crumbs"><\/nav>\s*<main id="root">/), '브레드크럼 — 헤더와 본문 사이 배치 (BR-01)');
  assert(crTxt() === 'HOME' && !!cr().querySelector('b'), '시작 화면 — HOME 단일(현재 강조) (BR-01)');

  /* B. 환자 모드 — 경로 표시·갱신 (BR-02) */
  Array.from(d.querySelectorAll('button')).find(x => x.textContent.includes('일반 환자 모드')).click();
  await sleep(300);
  d.getElementById('agreeRow').click();
  d.getElementById('agreeBtn').click();
  await sleep(600);
  assert(crTxt() === 'HOME', '홈 — HOME 현재 (BR-02)');
  d.getElementById('pfoot').children[3].click();
  await sleep(300);
  const aHome = cr().querySelector('[data-c="home"]');
  assert(crTxt() === '‹ HOME›HOME›관리 여정' && aHome && aHome.getAttribute('data-c') === 'home' && cr().querySelector('b').textContent === '관리 여정', '여정 — HOME › 관리 여정(현재 b·S69 ‹ 접두) (BR-02)');
  d.getElementById('pfoot').children[1].click();
  await sleep(300);
  assert(crTxt() === '‹ 관리 여정›HOME›오늘의 관리', '오늘 — 경로 갱신(S69 ‹ 접두) (BR-02)');

  /* C. 조상 클릭 이동 (BR-03) */
  cr().querySelector('[data-c="home"]').click();
  await sleep(300);
  assert(crTxt() === 'HOME' && !!d.getElementById('root').textContent.includes('일반 환자 모드') === false && d.getElementById('root').textContent.length > 100, '조상(HOME) 클릭 → 홈 이동 (BR-03)');

  /* D. 캡처 건수 배지 (CB-01·02) */
  d.getElementById('pfoot').children[3].click();
  await sleep(300);
  w.MM.capSave({ d: iso(0), p: 1, a: '정면', q: 'A', b: 140, s: 12, f: 15 });
  w.MM.capSave({ d: iso(0), p: 1, a: '좌측', q: 'B', b: 130, s: 10, f: 18 });
  w.MM.capSave({ d: iso(1), p: 1, a: '우측', q: 'C', b: 120, s: 8, f: 21 });
  w.MM.todaySave({ d: iso(2), pain: 1, m: '' });
  w.MM.app.rerender();
  await sleep(400);
  const cell = dd => d.querySelector('.cdg i[data-d="' + dd + '"]');
  assert(cell(iso(0)) && cell(iso(0)).querySelector('em') && cell(iso(0)).querySelector('em').textContent === '2', '2건 셀 — 건수 배지 em 2 (CB-01)');
  assert(cell(iso(1)) && !cell(iso(1)).querySelector('em'), '1건 셀 — 배지 없음 (CB-01)');
  assert(cell(iso(2)) && !cell(iso(2)).querySelector('em'), '기록만 셀 — 배지 없음 (CB-02)');
  assert(cell(iso(2)).classList.contains('r') && !cell(iso(2)).classList.contains('c'), '기록만 셀 — r 클래스 유지 (회귀)');

  /* E. 회귀 — 셀 탭 일 상세·캘린더 구조 */
  cell(iso(0)).click();
  await sleep(300);
  assert(d.getElementById('modalOverlay').classList.contains('show') && d.getElementById('modalBody').textContent.includes(iso(0) + ' 기록'), '배지 셀 탭 → 일 상세 유지 (S62 회귀)');
  d.getElementById('dClose').click();
  await sleep(200);
  assert(d.querySelectorAll('.cwg i').length === 7, '캘린더 요일 7칸 유지 (S61 회귀)');

  /* F. 예산 */
  assert(fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size <= 283000, '번들 예산 — 276KiB 이하 (' + fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size + 'B)');

  console.log('--- S67 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
