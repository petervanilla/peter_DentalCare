#!/usr/bin/env node
/* S56 스모크 — 캡처 퀘스트 완주·활용: 셀프타이머·품질 추이·병원 전달 요약·완주 리워드 (S57에서 3각도 칩→모달 템플릿 이전)
   단정 원칙: 렌더 결과는 #root 기준 · 타이머는 MM.capTimer 유닛 검증(400ms×3=1.2s) · 공유문은 clipboard 스터브 캡처 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); } }

(async () => {
  let clipText = null;
  const dom = new JSDOM(BUNDLE, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/',
    beforeParse(w) {
      w.scrollTo = () => {};
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
  const root = () => d.getElementById('root').textContent;
  const today = new Date().toISOString().slice(0, 10);

  /* A. 각도 칩은 S57 캡처 모달 템플릿(4종)으로 이전 — 각도 저장 단정은 유지 */
  const angs = d.querySelectorAll('#cpAng .ang');
  assert(angs.length === 0, '카드 각도 칩 — S57 모달 템플릿으로 이전 (UI 중복 제거)');

  /* B. 각도 기록 + 품질 추이 + 병원 전달 요약 (CG-02) */
  w.MM.capSave({ d: today, p: 1, a: '좌측', q: 'A', b: 140, s: 12, f: 15, tip: '좋아요 — 이 각도를 기억하세요' });
  w.MM.app.rerender();
  await sleep(400);
  assert(w.MM.capLogs()[0].a === '좌측', '캡처 저장 — 촬영 각도(a) 동반 기록');
  const tr = d.getElementById('cpTr');
  assert(!!tr && tr.textContent.includes('품질 추이 — A1·B0·C0') && tr.textContent.includes('최근 A등급'), '품질 추이 — 등급 카운트·최근 등급 (S56·CG-02)');
  assert(!!d.getElementById('cpShare'), '병원 전달 요약 버튼 — 기록 1일부터 노출');
  d.getElementById('cpShare').click();
  await sleep(300);
  assert(clipText && clipText.includes('[참고 자료 · 비진단]') && clipText.includes('1일차') && clipText.includes('사진 1'), '전달 요약 — 비진단 고지·일차·횟수 포함 (상담 자료화)');

  /* C. 셀프타이머 3·2·1 (CG-01) */
  const seq = [];
  const fake = { set textContent(v) { seq.push(v); }, get textContent() { return seq[seq.length - 1] || ''; } };
  let done = false;
  w.MM.capTimer(fake, () => { done = true; });
  assert(seq[0] === '⏱ 3 — 준비…', '타이머 시작 — 3 표시');
  await sleep(1350);
  assert(done && seq[seq.length - 1] === '📷 촬영!', '셀프타이머 3·2·1 → 촬영 콜백 (400ms 간격)');

  /* D. 타이머 정리 — stopCam이 카운트다운 취소 (cleanup 계약) */
  let done2 = false;
  w.MM.capTimer(fake, () => { done2 = true; });
  w.MM.stopCam();
  assert(w.MM._civ === null, 'stopCam — 진행 중 타이머 정리');
  await sleep(1350);
  assert(!done2, '정리된 타이머 — 촬영 콜백 미호출');

  /* E. 30일 완주 리워드 (CG-03) */
  const logs = [];
  for (let i = 0; i < 30; i++) logs.push({ d: '2026-09-1' + (i % 10), p: 1, q: 'A', b: 140, s: 12, f: 15 });
  try { w.localStorage.setItem('MM_CAP_V1', JSON.stringify(logs)); } catch (e) {}
  w.MM.app.rerender();
  await sleep(400);
  let t = root();
  assert(t.includes('30/30일') && t.includes('🏆 30일 달성!'), '30일 완주 — 배지 표시');
  assert(t.includes('SMILE30') && t.includes('케어 쿠폰'), '완주 리워드 — 리포트·쿠폰(가상) 안내 (S56·CG-03)');

  /* F. 경계 유지 · 예산 */
  assert(t.includes('비진단') && t.includes('별도 학습'), '비진단·M2 별도 학습 고지 유지 (CP-04 계승)');
  assert(fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size <= 283000, '번들 예산 — 276KiB 이하 (' + fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size + 'B)');

  console.log('--- S56 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
