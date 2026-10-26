#!/usr/bin/env node
/* S60 스모크 — M2 데이터 기여 동의 플로우: 동의 모달(온보딩 동의 체계 재사용)·동의 기록(MM_CAPC_V1)·해제·경계 고지
   단정 원칙: 현재는 전송 없음(기기 로컬만)·재동의 안내·비진단 고지가 모달에 명시되어야 한다 */
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
  const body = () => d.getElementById('modalBody');
  const today = new Date().toISOString().slice(0, 10);

  /* A. 기록 1일 시드 — M2 버튼 노출 */
  w.MM.capSave({ d: today, p: 1, a: '정면', q: 'A', b: 140, s: 12, f: 15 });
  w.MM.app.rerender();
  await sleep(400);
  const m2 = d.getElementById('cpM2');
  assert(!!m2 && m2.textContent.includes('M2 기여 동의'), 'M2 기여 버튼 — 캡처 기록 시 노출 (S60)');

  /* B. 동의 모달 — 목적·전송 현실·재동의·해제·비진단 고지 (DC-01·DC-03) */
  m2.click();
  await sleep(300);
  assert(d.getElementById('modalOverlay').classList.contains('show') && body().textContent.includes('데이터 기여'), '동의 모달 오픈');
  const t = body().textContent;
  assert(t.includes('AI 학습(M2)'), '목적 고지 — AI 정밀 분석 학습(M2)');
  assert(t.includes('전송 없음') && t.includes('기기 저장만'), '전송 현실 — 데모는 기기 로컬만·전송 없음 (DC-03)');
  assert(t.includes('재동의'), '실제 수집 — M2 착수 후 재동의 안내');
  assert(t.includes('해제'), '철회 안내 — 언제든 해제 가능');
  assert(t.includes('비진단'), '비진단 고지 (DC-03)');

  /* C. 동의 체크 → 기록 (DC-02) — 온보딩 동의 체계 재사용 */
  assert(body().querySelector('#ccRow') && body().querySelector('#ccOk').disabled, '동의 행(.agree-row 재사용) — 확인 전 버튼 비활성');
  body().querySelector('#ccRow').click();
  await sleep(200);
  assert(!body().querySelector('#ccOk').disabled, '체크 → 동의 버튼 활성화');
  body().querySelector('#ccOk').click();
  await sleep(400);
  const con = w.MM.capCon();
  assert(con && con.on === 1 && con.d === today, '동의 기록 — MM_CAPC_V1 {on, d} 기기 로컬');
  assert(root().includes('M2 ✓'), '카드 헤더 — M2 기여 배지');

  /* D. 해제 (DC-04) */
  assert(d.getElementById('cpM2').textContent.includes('기여 해제'), '버튼 전환 — 기여 해제');
  d.getElementById('cpM2').click();
  await sleep(300);
  assert(body().textContent.includes('동의 ' + today), '동의 기록일 표시');
  body().querySelector('#ccOff').click();
  await sleep(400);
  assert(!w.MM.capCon() || !w.MM.capCon().on, '해제 — 동의 기록 삭제');
  assert(!root().includes('M2 ✓'), '배지 제거');

  /* E. 예산 */
  assert(fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size <= 283000, '번들 예산 — 276KiB 이하 (' + fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size + 'B)');

  console.log('--- S60 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
