#!/usr/bin/env node
/* S63 스모크 — 완주 리포트 월간 히트맵: 인쇄 리포트에 텍스트 캘린더 포함 (기기 로컬 데이터 · 비진단)
   단정 원칙: 히트맵은 MM_TODAY_LOG_V1·MM_CAP_V1 기기 로컬 열람만 · 기존 리포트 계약(요약·SMILE30) 유지 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); } }
const iso = t => new Date(Date.now() - t * 864e5).toISOString().slice(0, 10);

(async () => {
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/',
    beforeParse(w) { w.scrollTo = () => {}; w.open = function () { return { document: { write: h => { printed = h; }, close() {}, focus() {} } }; }; } });
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
  let printed = null;
  /* 원본 printed 바인딩 — beforeParse 클로저 대신 window 스코프 회수 */
  const seeds = [
    { t: 40, rec: 1, cap: 0 }, { t: 41, rec: 0, cap: 1 }, { t: 3, rec: 1, cap: 1 },
  ];
  seeds.forEach(s => {
    const d0 = iso(s.t);
    if (s.rec) w.MM.todaySave({ d: d0, pain: 1, swell: 0, bleed: 0, chew: 0, brush: 1, vice: 0, m: '' });
    if (s.cap) w.MM.capSave({ d: d0, p: 1, a: '정면', q: 'A', b: 140, s: 12, f: 15 });
  });

  /* A. MM.calPrint — 텍스트 히트맵 (HM-01·02) */
  const dR = iso(40), dC = iso(41), dB = iso(3);
  const mR = dR.slice(0, 7), mB = dB.slice(0, 7);
  const hp = w.MM.calPrint(+dR.slice(0, 4), +dR.slice(5, 7));
  assert(hp.includes(mR) && hp.includes('r 기록') && hp.includes('c 캡처') && hp.includes('* 둘 다'), 'calPrint — 월 헤더·범례 (r 기록·c 캡처·* 둘 다) (HM-01)');
  assert(hp.includes('일  월  화  수  목  금  토'), 'calPrint — 요일 헤더 7칸 (HM-01)');
  const dayR = +dR.slice(8), dayC = +dC.slice(8), dayB = +dB.slice(8);
  assert(hp.includes((dayR < 10 ? '  ' : ' ') + dayR + 'r'), 'calPrint — 기록 셀 r (' + dR + ') (HM-02)');
  assert(hp.includes((dayC < 10 ? '  ' : ' ') + dayC + 'c'), 'calPrint — 캡처 셀 c (' + dC + ') (HM-02)');
  const hb = w.MM.calPrint(+dB.slice(0, 4), +dB.slice(5, 7));
  assert(hb.includes((dayB < 10 ? '  ' : ' ') + dayB + '*'), 'calPrint — 둘 다 셀 * (' + dB + ') (HM-02)');
  const dim = new Date(+dR.slice(0, 4), +dR.slice(5, 7), 0).getDate();
  const pad = new Date(+dR.slice(0, 4), +dR.slice(5, 7) - 1, 1).getDay();
  assert(hp.split('\n').length - 1 === 2 + Math.ceil((pad + dim) / 7), 'calPrint — 줄 수 = 헤더 2 + 주 수 (' + Math.ceil((pad + dim) / 7) + ') (HM-01)');

  /* B. 인쇄 리포트 연계 — 2달 범위 히트맵 + 기존 계약 (HM-03·04) */
  w.MM.capRepModal(w.MM.capLogs());
  await sleep(300);
  const body = d.getElementById('modalBody');
  assert(d.getElementById('modalOverlay').classList.contains('show') && body.textContent.includes('30일 완주 리포트'), '완주 리포트 모달 오픈 (RP-01 회귀)');
  assert(body.textContent.includes('A 2 · B 0 · C 0'), '요약 계약 유지 — 품질 분포 (RP-01 회귀)');
  printed = null;
  body.querySelector('#cpPr').click();
  await sleep(300);
  assert(!!printed && printed.includes('30일 캡처 퀘스트 완주 리포트'), '인쇄 — 리포트 제목 유지 (RP-02 회귀)');
  assert(printed.includes(mR) && printed.includes(mB), '인쇄 — 히트맵 2개월 헤더 (' + mR + '·' + mB + ') (HM-03)');
  assert(printed.includes('히트맵 — 기기 로컬 기록(비진단)'), '인쇄 — 히트맵 기기 로컬·비진단 고지 (HM-04)');
  assert(printed.includes('SMILE30') && printed.includes('진단·처방을 대체하지'), '인쇄 — SMILE30·기본 면책 유지 (RP-04 회귀)');

  /* C. 예산 */
  assert(fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size <= 283000, '번들 예산 — 276KiB 이하 (' + fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size + 'B)');

  console.log('--- S63 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
