#!/usr/bin/env node
/* S62 스모크 — 캘린더 일 상세: 셀 탭 → 당일 기록·캡처 모달 (기기 로컬 조회 · 변경 없음)
   단정 원칙: 상세는 기기 로컬 기록의 열람만(비진단) · 기존 S61 캘린더 계약(요일 7·월 이동) 유지 */
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
  const yd = new Date(Date.now() - 864e5).toISOString().slice(0, 10);

  /* A. 셀 data-d — 기록·캡처 있는 날만 (DD-01) */
  assert(Array.from(d.querySelectorAll('.cdg i[data-d]')).every(x => x.classList.contains('r') || x.classList.contains('c') || x.classList.contains('t')), 'data-d 셀 — 기록(r)·캡처(c)·오늘(t)과 일치 (빈 과거 셀 탭 불가·DD-01)');
  w.MM.todaySave({ d: today, pain: 1, swell: 0, bleed: 0, chew: 0, brush: 1, vice: 0, m: '양치 후 좋아요' });
  w.MM.capSave({ d: today, p: 1, a: '정면', q: 'A', b: 140, s: 12, f: 15 });
  w.MM.app.rerender();
  await sleep(400);
  const tc = d.querySelector('.cdg i.t');
  assert(tc && tc.getAttribute('data-d') === today, '기록 셀 — data-d 부여 (오늘)');
  assert(!d.querySelector('.cdg i.x[data-d]'), '빈 셀 — data-d 없음');

  /* B. 셀 탭 → 일 상세 모달 (DD-01) */
  tc.click();
  await sleep(300);
  const mb = () => d.getElementById('modalBody').textContent;
  assert(d.getElementById('modalOverlay').classList.contains('show') && mb().includes(today + ' 기록'), '셀 탭 → 일 상세 모달 (DD-01)');
  assert(mb().includes('통증 1') && mb().includes('양치·치실 1') && (mb().match(/ · /g) || []).length >= 5, '당일 기록 6그룹 값 표시 (DD-02)');
  assert(mb().includes('/6'), '당일 상태 점수 배지 (/6)');
  assert(mb().includes('메모') && mb().includes('양치 후 좋아요'), '당일 메모 표시 (DD-02)');
  assert(mb().includes('캡처') && mb().includes('정면·A'), '당일 캡처 표시 — 템플릿·등급 (DD-03)');
  assert(mb().includes('비진단 — 기기 로컬 기록만 표시.'), '일 상세 비진단 고지 (DD-04)');

  /* C. 닫기 (DD-04) */
  d.getElementById('dClose').click();
  await sleep(200);
  assert(!d.getElementById('modalOverlay').classList.contains('show'), '닫기 버튼 → 모달 종료 (DD-04)');

  /* D. 이틀 시나리오 — 기록만 있는 날 (캡처 없음·메모 없음) */
  w.MM.todaySave({ d: yd, pain: 0, swell: 0, bleed: 0, chew: 0, brush: 0, vice: 0, m: '' });
  w.MM.app.rerender();
  await sleep(400);
  const yc = d.querySelector('.cdg i[data-d="' + yd + '"]');
  assert(!!yc, '어제 셀 — data-d 부여');
  yc.click();
  await sleep(300);
  assert(mb().includes(yd + ' 기록') && mb().includes('없음') && mb().includes('—'), '어제 상세 — 캡처 없음·메모 없음 (—)');
  d.getElementById('dClose').click();
  await sleep(200);

  /* E. 기존 S61 계약 유지 */
  assert(d.querySelectorAll('.cwg i').length === 7 && d.querySelectorAll('.cdg i').length === new Date(+today.slice(0, 4), +today.slice(5, 7), 0).getDate(), 'S61 계약 — 요일 7칸·당월 셀 수 유지');

  /* F. 예산 */
  assert(fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size <= 283000, '번들 예산 — 276KiB 이하 (' + fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size + 'B)');

  console.log('--- S62 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
