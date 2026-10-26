#!/usr/bin/env node
/* S58 스모크 — 완주 리포트 패키지: 30일 기록 요약(기간·횟수·등급 분포·각도별·선명도 추이)·인쇄(PDF)·공유
   단정 원칙: 모달·인쇄문·공유문 모두 비진단 고지·SMILE30(가상) 포함 · 인쇄는 window.open 스텁 캡처 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); } }

(async () => {
  let printed = null, clipText = null;
  const dom = new JSDOM(BUNDLE, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/',
    beforeParse(w) {
      w.scrollTo = () => {};
      w.open = function () { return { document: { write: h => { printed = h; }, close() {}, focus() {} } }; };
      Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: t => { clipText = t; return Promise.resolve(); } }, configurable: true });
    }
  });
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

  /* A. 30일 완주 시드 — 등급 A12·B12·C6 / 각도별 10회 / 선명도 상승 */
  const logs = [];
  for (let i = 0; i < 30; i++) {
    const dstr = i < 15 ? '2026-09-' + (16 + i) : '2026-10-' + String(i - 14).padStart(2, '0');
    logs.push({ d: dstr, p: 1, q: i % 5 === 0 ? 'C' : (i % 2 ? 'A' : 'B'), a: ['정면', '좌측', '우측'][i % 3], f: 10 + i * 0.5, b: 140, s: 12 });
  }
  try { w.localStorage.setItem('MM_CAP_V1', JSON.stringify(logs)); } catch (e) {}
  w.MM.app.rerender();
  await sleep(400);

  /* B. 완주 리포트 버튼 → 요약 모달 (RP-01) */
  const rep = d.getElementById('cpRep');
  assert(!!rep && rep.textContent.includes('완주 리포트'), '30일 완주 — 📄 완주 리포트 버튼 (S58·RP-01)');
  rep.click();
  await sleep(300);
  const body = d.getElementById('modalBody');
  assert(d.getElementById('modalOverlay').classList.contains('show') && body.textContent.includes('30일 완주 리포트'), '리포트 모달 오픈');
  assert(body.textContent.includes('26-09-16 ~ 26-10-15'), '요약 — 기간 (첫 ~ 마지막 캡처)');
  assert(body.textContent.includes('30일 · 사진 30 · 영상 0'), '요약 — 기록 수 (일·사진·영상)');
  assert(body.textContent.includes('A 12 · B 12 · C 6'), '요약 — 품질 분포 A/B/C');
  assert(body.textContent.includes('정면 10회') && body.textContent.includes('좌측 10회'), '요약 — 각도별 횟수');
  assert(body.textContent.includes('11.5 → 23 ▲'), '요약 — 선명도 추이 (첫 주 → 마지막 주 ▲)');
  assert(body.textContent.includes('SMILE30') && body.textContent.includes('비진단'), '리포트 고지 — SMILE30(가상)·비진단 (RP-04)');

  /* C. 인쇄·PDF — S8 인쇄 체계 재사용 (RP-02) */
  body.querySelector('#cpPr').click();
  await sleep(300);
  assert(!!printed && printed.includes('30일 캡처 퀘스트 완주 리포트'), '인쇄 문서 — 완주 리포트 제목');
  assert(printed.includes('비진단') && printed.includes('A12/B12/C6'), '인쇄 내용 — 비진단 고지·등급 분포');
  assert(printed.includes('SMILE30') && printed.includes('진단·처방을 대체하지'), '인쇄 고지 — 가상 쿠폰·기본 면책');

  /* D. 공유 (RP-03) */
  body.querySelector('#cpSh').click();
  await sleep(300);
  assert(clipText && clipText.includes('비진단') && clipText.includes('완주'), '공유문 — 비진단 고지·완주');
  assert(clipText.includes('SMILE30') && clipText.includes('A12/B12/C6'), '공유문 — SMILE30(가상)·등급 분포');

  /* E. 미완주 — 버튼 숨김 경계 */
  try { w.localStorage.removeItem('MM_CAP_V1'); } catch (e) {}
  w.MM.app.rerender();
  await sleep(400);
  assert(!d.getElementById('cpRep'), '미완주 — 완주 리포트 버튼 미노출');

  /* F. 예산 */
  assert(fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size <= 283000, '번들 예산 — 276KiB 이하 (' + fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size + 'B)');

  console.log('--- S58 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
