#!/usr/bin/env node
/* S72 스모크 — 환자 모드 편의 완결: 어제 기록 불러오기·캘린더 기록 월 빠른 점프·완주 리포트 템플릿 내역
   단정 원칙: 어제 기록은 저장 전 폼 프리필만(변경은 저장 시) · 월 점프는 기기 로컬 기록 월만 · 캡처 이미지는 기기 저장만(번들 미포함) */
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
  await sleep(300);
  Array.from(d.querySelectorAll('button')).find(x => x.textContent.includes('일반 환자 모드')).click();
  await sleep(300);
  d.getElementById('agreeRow').click();
  d.getElementById('agreeBtn').click();
  await sleep(700);
  const pf = i => d.getElementById('pfoot').children[i].click();
  const root = () => d.getElementById('root').textContent;

  /* A. 어제 기록 불러오기 (CY-01) */
  const dY = iso(1);
  w.MM.todaySave({ d: dY, pain: 2, swell: 1, bleed: 0, chew: 1, brush: 0, vice: 0, m: '어제는 부었음' });
  pf(1);
  await sleep(400);
  const btn = d.getElementById('tdCopy');
  assert(!!btn && btn.textContent.includes('어제 기록 불러오기'), '오늘 미기록+어제 기록 — 불러오기 버튼 (CY-01)');
  assert(!d.getElementById('root').textContent.includes('기록 완료 ✓'), '프리필 전 — 미저장 상태 (CY-01)');
  btn.click();
  await sleep(200);
  const on1 = d.querySelector('[data-tq="pain"] .on');
  assert(on1 && on1.getAttribute('data-tv') === '2' && !!d.querySelector('[data-tq="chew"] .on[data-tv="1"]'), '프리필 — 6그룹 슬롯 .on 반영 (통증 심·씹기 불편) (CY-01)');
  assert(d.getElementById('tmMemo').value === '어제는 부었음', '프리필 — 메모 채움 (CY-01)');
  d.getElementById('tdSave').click();
  await sleep(400);
  assert(root().includes('기록 완료 ✓') && root().includes('7/6') === false && root().includes('3/6'), '저장 — 오늘 기록 완성·점수 3/6 (CY-01)');
  pf(3);
  await sleep(300);

  /* B. 기록 월 빠른 점프 (CJ-01) */
  w.MM.todaySave({ d: '2026-08-20', m: '' });
  w.MM.capSave({ d: '2026-09-05', p: 1, a: '정면', q: 'A', b: 140, s: 12, f: 15 });
  w.MM.app.rerender();
  await sleep(400);
  const jm = Array.from(d.querySelectorAll('#calJm i'));
  assert(jm.length >= 3 && jm[0].classList.contains('on'), '월 칩 — 기록 월 내림차순·현재 on (CJ-01)');
  const tgt = jm.find(x => x.getAttribute('data-j') === '2026-08');
  tgt.click();
  await sleep(400);
  assert(root().includes('2026-08-') && d.querySelector('.cdg i[data-d="2026-08-20"]'), '칩 클릭 → 8월 이동·기록 셀 존재 (CJ-01)');
  const nextDisabled = d.getElementById('calN');
  assert(!nextDisabled.disabled, '과거 월에서 › 활성 — 월 이동 계약 유지 (S61 회귀)');
  w.MM.app.rerender();
  await sleep(300);

  /* C. 완주 리포트 템플릿 내역 (TR-01) */
  let printed = null;
  const ow = w.open; w.open = function () { return { document: { write: h => { printed = h; }, close() {}, focus() {} } }; };
  w.MM.capRepModal(w.MM.capLogs());
  await sleep(300);
  printed = null;
  d.getElementById('modalBody').querySelector('#cpPr').click();
  await sleep(300);
  assert(!!printed && printed.includes('템플릿별 촬영 — 기기 로컬(비진단)'), '인쇄 — 템플릿별 촬영 섹션 (TR-01)');
  assert(printed.includes('정면 사진 1회'), '인쇄 — tp 집계 행(정면 사진 1회 — 시드 결정값) (TR-01)');
  assert(printed.includes('일 상세 표') && printed.includes('SMILE30'), '인쇄 — 기존 섹션 계약 유지 (S64·RP-04 회귀)');
  w.open = ow;

  /* D. 예산 */
  assert(fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size <= 283000, '번들 예산 — 276KiB 이하 (' + fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size + 'B)');

  console.log('--- S72 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
