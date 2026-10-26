#!/usr/bin/env node
/* S66 스모크 — 공유문 히트맵·기록 요약: 완주 리포트 공유(클립보드) 텍스트에 히트맵·기록 요약 포함
   단정 원칙: 공유는 클립보드 전용(전송 없음) · 히트맵·요약은 기기 로컬 기록(비진단) · 기존 1행 계약 유지 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); } }
const iso = t => new Date(Date.now() - t * 864e5).toISOString().slice(0, 10);

(async () => {
  let clipText = null;
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/',
    beforeParse(w) {
      w.scrollTo = () => {};
      Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: t => { clipText = t; return Promise.resolve(); } }, configurable: true });
    } });
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
  /* 씨드 — 캡처 3일(10일 전 p2·v1, 7일 전 p1, 3일 전 p1) · 기록 4일(3·5·9일 전 + 오늘) — 오늘은 캡처 기간 밖 */
  w.MM.capSave({ d: iso(10), p: 2, v: 1, a: '우측', q: 'C', b: 120, s: 8, f: 21 });
  w.MM.capSave({ d: iso(7), p: 1, a: '정면', q: 'A', b: 140, s: 12, f: 15 });
  w.MM.capSave({ d: iso(3), p: 1, a: '좌측', q: 'B', b: 130, s: 10, f: 18 });
  w.MM.todaySave({ d: iso(3), pain: 2, swell: 0, bleed: 1, chew: 0, brush: 0, vice: 0, m: '' });
  w.MM.todaySave({ d: iso(5), pain: 1, swell: 0, bleed: 0, chew: 0, brush: 0, vice: 0, m: '' });
  w.MM.todaySave({ d: iso(9), pain: 0, swell: 0, bleed: 0, chew: 0, brush: 0, vice: 0, m: '' });
  w.MM.todaySave({ d: iso(0), pain: 0, swell: 0, bleed: 0, chew: 0, brush: 0, vice: 0, m: '' });
  w.MM.capRepModal(w.MM.capLogs());
  await sleep(300);
  const body = d.getElementById('modalBody');
  assert(d.getElementById('modalOverlay').classList.contains('show') && body.textContent.includes('30일 완주 리포트'), '완주 리포트 모달 오픈 (RP-01 회귀)');
  clipText = null;
  body.querySelector('#cpSh').click();
  await sleep(300);
  assert(!!clipText, '공유 → 클립보드 캡처 (RP-03 회귀)');

  /* A. 기존 1행 계약 유지 (SR-03) */
  assert(clipText.startsWith('[참고 자료 · 비진단] 30일 완주 · 사진 4 · 영상 1 · A1/B1/C1 — SMILE30(가상)'), '첫 행 계약 — 완주·사진/영상·A/B/C·SMILE30 (SR-03)');

  /* B. 기록 요약 — 기간 필터·평균 (SR-02) */
  assert(clipText.includes('[기록 요약] 기록 3일 · 평균 1.7/6 · 캡처 병행 1일'), '기록 요약 — 3일(5/3=1.7)·병행 1일 (SR-02)');
  assert(!clipText.includes('기록 4일'), '기간 필터 — 캡처 기간 밖 오늘 기록 제외 (SR-02)');

  /* C. 히트맵 — 단일 월·마커 (SR-01) */
  assert((clipText.match(/2026-10 \(/g) || []).length === 1, '히트맵 단일 월 — 캡처 기간이 한 달 (SR-01)');
  const dk = t => +iso(t).slice(8);
  assert(clipText.includes((dk(3) < 10 ? '  ' : ' ') + dk(3) + '*'), '둘 다 마커 * (' + iso(3) + ' — 기록+캡처) (SR-01)');
  assert(clipText.includes((dk(5) < 10 ? '  ' : ' ') + dk(5) + 'r') && clipText.includes((dk(9) < 10 ? '  ' : ' ') + dk(9) + 'r'), '기록 마커 r (' + iso(5) + '·' + iso(9) + ') (SR-01)');
  assert(clipText.includes((dk(7) < 10 ? '  ' : ' ') + dk(7) + 'c') && clipText.includes((dk(10) < 10 ? '  ' : ' ') + dk(10) + 'c'), '캡처 마커 c (' + iso(7) + '·' + iso(10) + ') (SR-01)');
  assert(clipText.includes('(r 기록 · c 캡처 · * 둘 다 · · 없음)'), '범례 포함 (SR-01)');

  /* D. 경계 — 기기 로컬 고지·클립보드 전용 (SR-04) */
  assert(clipText.includes('[히트맵·기록 요약 — 기기 로컬 기록(비진단)]'), '공유문 고지 — 기기 로컬·비진단 (SR-04)');
  assert(d.getElementById('toast').textContent.includes('클립보드 복사 완료'), '클립보드 복사 토스트 — 전송 없음 (SR-04)');

  /* E. 예산 */
  assert(fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size <= 283000, '번들 예산 — 276KiB 이하 (' + fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size + 'B)');

  console.log('--- S66 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
