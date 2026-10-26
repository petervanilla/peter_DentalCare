#!/usr/bin/env node
/* S70 스모크 — 일 상세 템플릿 4종 칩: 당일 캡처 템플릿 강조(등급)·미촬영 흐림 (기기 로컬 열람만 · 비진단)
   단정 원칙: 칩은 CAP_TPL(정면 미소·좌측/우측 교합면·30초 영상) 기준 렌더 · 기존 계약(s62 없음·s68 지표 행) 유지 */
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
  d.getElementById('pfoot').children[3].click();
  await sleep(400);
  const dP = iso(1), dV = iso(2), dN = iso(3);
  w.MM.todaySave({ d: dP, m: '' });
  w.MM.capSave({ d: dP, p: 1, a: '정면', q: 'A', b: 140, s: 12, f: 15 });
  w.MM.todaySave({ d: dV, m: '' });
  w.MM.capSave({ d: dV, p: 1, a: '좌측', q: 'B', b: 130, s: 10, f: 18 });
  w.MM.capSave({ d: dV, v: 1, a: '정면', q: '', b: 0, s: 0, f: 0 });
  w.MM.app.rerender();
  await sleep(400);
  const list = d.getElementById('dlList');
  const row = dd => Array.from(list.querySelectorAll('[data-dl]')).find(r => r.getAttribute('data-dl') === dd);
  const open = dd => { row(dd).click(); return sleep(300); };
  const mb = () => d.getElementById('modalBody');
  const chips = () => Array.from(mb().querySelectorAll('.ctg i'));
  const close = () => { d.getElementById('dClose').click(); return sleep(200); };

  /* A. 4종 칩 렌더 (TL-01) */
  await open(dP);
  assert(chips().length === 4, '일 상세 — 템플릿 4종 칩 렌더 (TL-01)');
  assert(chips().map(x => x.textContent).join('|') === '정면 미소 A|좌측 교합면|우측 교합면|30초 영상', '칩 라벨 — 촬영분 등급 표기·미촬영 라벨만 (TL-01)');
  assert(chips()[0].classList.contains('on') && chips().slice(1).every(x => !x.classList.contains('on')), '정면 사진일 — 정면 미소 칩만 강조 (TL-01)');
  assert(mb().textContent.includes('정면·A — 사진 1 · 영상 0 · 선명도 15 · 밝기 140'), 's68 지표 행 유지 (DM-01 회귀)');
  await close();

  /* B. 사진+영상 혼합일 (TL-01) */
  await open(dV);
  assert(chips()[1].classList.contains('on') && chips()[3].classList.contains('on') && !chips()[0].classList.contains('on') && !chips()[2].classList.contains('on'), '좌측 사진+영상 혼합일 — 좌측·30초 영상 강조·정면 사진 미강조(tp 집계) (TL-01)');
  assert(!chips()[2].classList.contains('on'), '미촬영(우측) 칩 — 강조 없음 (TL-01)');
  await close();

  /* C. 캡처 없는 날 (TL-02) */
  await open(dN);
  assert(chips().length === 4 && chips().every(x => !x.classList.contains('on')), '캡처 없는 날 — 4종 모두 미촬영 (TL-02)');
  assert(mb().textContent.includes('없음') && mb().textContent.includes('비진단 — 기기 로컬 기록만 표시.'), 's62 계약 — 없음·비진단 고지 유지 (TL-02·회귀)');
  await close();

  /* D. 예산 */
  assert(fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size <= 283000, '번들 예산 — 276KiB 이하 (' + fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size + 'B)');

  console.log('--- S70 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
