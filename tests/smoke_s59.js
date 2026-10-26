#!/usr/bin/env node
/* S59 스모크 — 오늘의 기록 개편: 전문 레이아웃(스탯 스트립·2열 그리드)·메모 필드·촬영 버튼(→여정 연계)·잇몸/치아 가이드 존
   단정 원칙: 기존 계약(data-tq 6그룹·tdSave·'매일 한 줄 기록' 문구) 유지 · 촬영 저장 후 여정 탭 자동 이동 */
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
  d.getElementById('pfoot').children[1].click(); /* 오늘 탭 */
  await sleep(400);
  const root = () => d.getElementById('root').textContent;

  /* A. 전문 레이아웃 — 스탯 스트립 + 2열 그리드 (TD-01) */
  assert(d.querySelectorAll('.tstats > div').length === 3, '스탯 스트립 3항목 — 상태 점수·누적·퀘스트 (S59·TD-01)');
  assert(root().includes('상태 점수') && root().includes('누적') && root().includes('퀘스트'), '스탯 라벨 표시');
  assert(d.querySelectorAll('.tgrid [data-tq]').length === 6, '2열 그리드 — 기존 6그룹 계약 유지 (data-tq)');
  assert(root().includes('매일 한 줄 기록'), '기존 문구 계약 — 매일 한 줄 기록');

  /* B. 메모 필드 — 저장 시 m 필드 (TD-02) */
  const memo = d.getElementById('tmMemo');
  assert(!!memo, '메모 입력칸 존재 (S59·TD-02)');
  memo.value = '오늘 아침 냉찜질 10분';
  d.querySelector('[data-tq="pain"] [data-tv="1"]').click();
  d.getElementById('tdSave').click();
  await sleep(400);
  const log = w.MM.todayLogs()[0];
  assert(log && log.m === '오늘 아침 냉찜질 10분' && log.pain === 1, '메모 저장 — MM_TODAY_LOG_V1에 m 필드 기록');
  assert(root().includes('기록 완료 ✓'), '저장 상태 배지');

  /* C. 촬영 버튼 → 팝업 + 가이드 존 (TD-03·TD-04) */
  const cam = d.getElementById('tdCam');
  assert(!!cam && cam.textContent.includes('촬영'), '촬영 버튼 — 기록 저장 아래 배치 (S59·TD-03)');
  cam.click();
  await sleep(300);
  assert(d.getElementById('modalOverlay').classList.contains('show'), '촬영 팝업(모달) 오픈');
  const zones = d.querySelectorAll('#cpGuide i');
  assert(zones.length === 3, '가이드 존 3개 (S59·TD-04)');
  assert(zones[0].textContent === '위 잇몸' && zones[1].textContent === '치아' && zones[2].textContent === '아래 잇몸', '가이드 라벨 — 위 잇몸·치아·아래 잇몸');
  assert(BUNDLE.includes('cpGuide:after'), '타원 가이드라인(CSS) 유지');
  assert(d.getElementById('modalBody').textContent.includes('비진단'), '모달 내 비진단 고지');

  /* D. 촬영 → 저장 → 여정 자동 이동 (TD-03) */
  d.getElementById('capN1').click();
  await sleep(300);
  w.MM.capPrep(320, 240, 240, '정면');
  w.MM.capConfirm();
  await sleep(200);
  d.getElementById('capSave2').click();
  await sleep(400);
  assert(w.MM.app.current === 'journey', '촬영 저장 후 여정 탭 자동 이동 (S59·TD-03)');
  assert(d.getElementById('root').textContent.includes('1/30일'), '여정 퀘스트 — 오늘 촬영 1/30일 반영');
  assert(w.MM.capLogs().length === 1 && w.MM.capLogs()[0].a === '정면', '캡처 기록 — 각도 정면 저장');

  /* E. 예산 */
  assert(fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size <= 283000, '번들 예산 — 276KiB 이하 (' + fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size + 'B)');

  console.log('--- S59 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
