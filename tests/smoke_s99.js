#!/usr/bin/env node
/* S99 스모크 — Figma 디자인 본 적용 2차 (100~101차 사용자 요청 · 디자인 명세 DS-105~115):
   DS-105 홈 동기화 라인·최근 스캔 데이터 보기 링크
   DS-106 홈 STL 다운로드 버튼 (mountExport 계약)
   DS-107 시뮬 intro·정확도 안내 문구
   DS-108 시뮬 정확도 팁 카드 3종
   DS-109 시뮬 시술 제목·설명 정합
   DS-110 시뮬 실행 CTA 'AI 시뮬레이션 시작' (예상 소요시간 표기 없음)
   DS-111 결과 Before/After 비교 라벨
   DS-112 리포트 Report 번호·발행·소견 검토 상태
   DS-113 리포트 종합 판정 (양호 분기)
   DS-114 리포트 인쇄 버튼·예약 문구·공유 문구 계약 유지
   DS-115 스캔 결과 섹션 언어 (플라크 부착 지수·AI 소견 및 상담 가이드)
   EX-01 번들 예산, EX-02 runtime errors 0
   ※ 텍스트 단정은 script를 제외한 가시 DOM 기준 (S98 교훈) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const LIMIT = 283000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

(async () => {
  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const w = dom.window, d = w.document;
  const vis = () => { const c = d.body.cloneNode(true); c.querySelectorAll('script,style').forEach(e => e.remove()); return c.textContent; };
  await sleep(900);
  d.querySelector('.role-card').click();
  await sleep(300);
  const ag = d.getElementById('agreeRow'); ag && ag.click();
  await sleep(150);
  const ab = d.getElementById('agreeBtn'); ab && ab.click();
  await sleep(500);
  const home = vis();

  assert(home.includes('스마일치과 동기화됨') && !!d.querySelector('b[data-goto="records"]'),
    'DS-105 홈 동기화 라인·스캔 데이터 보기 링크');
  assert(!!d.querySelector('[data-exp="stl"]') && home.includes('STL 다운로드'),
    'DS-106 홈 STL 다운로드 버튼 (mountExport)');

  const sc = d.querySelector('[data-goto="sim"]');
  sc && sc.click();
  await sleep(400);
  const sim = vis();
  assert(sim.includes('미리미소 AI 엔진이') && sim.includes('치아가 6개 이상'),
    'DS-107 시뮬 intro·정확도 안내');
  assert(sim.includes('시뮬레이션 정확도를 높이는 3가지 팁') && sim.includes('30~40cm') && sim.includes('밝은 조명'),
    'DS-108 시뮬 팁 카드 3종');
  assert(sim.includes('어떤 시술의 변화를 확인하고 싶으신가요?') && sim.includes('복합 플랜에 맞춘 가상 스마일'),
    'DS-109 시뮬 시술 제목·설명');
  const run = d.getElementById('btnSimRun');
  assert(!!run && run.textContent.includes('AI 시뮬레이션 시작') && !run.textContent.includes('예상'),
    'DS-110 시뮬 실행 CTA (소요시간 표기 없음)');

  w.MM.app.go('simResult');
  await sleep(400);
  assert(vis().includes('현재 미소 (Before)') && vis().includes('시뮬레이션 후 (After)'),
    'DS-111 결과 Before/After 비교 라벨');

  w.MM.app.go('report');
  await sleep(400);
  const rep = vis();
  assert(/Report #MM-\d{4}-\d{4}/.test(rep) && rep.includes('발행') && (rep.includes('담당의 소견 검토 대기중') || rep.includes('병원 확인 대기')),
    'DS-112 리포트 번호·발행·소견 검토 상태');
  assert(rep.includes('종합 판정: 양호') || rep.includes('종합 판정: 관찰 필요 단계'),
    'DS-113 리포트 종합 판정');
  assert(!!d.getElementById('refPrint') && rep.includes('인쇄 / PDF 저장') && rep.includes('원장님 상담 예약하기') && rep.includes('병원에 리포트 공유하기'),
    'DS-114 리포트 인쇄·예약·공유 문구');

  w.MM.app.go('scanResult');
  await sleep(500);
  const sr = vis();
  assert(sr.includes('플라크 부착 지수') && sr.includes('AI 소견 및 상담 가이드'),
    'DS-115 스캔 결과 섹션 언어');

  const sz = fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size;
  assert(sz <= LIMIT && LIMIT - sz >= 100, `EX-01 번들 — ${sz}B ≤ ${LIMIT}B·헤드룸 ${LIMIT - sz}B ≥ 100B`);
  assert(errors.length === 0, 'EX-02 runtime errors 0' + (errors.length ? ' → ' + errors.join('|').slice(0, 160) : ''));
  await dom.window.close();

  console.log('--- S99 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
