#!/usr/bin/env node
/* S78 스모크 — staffPatient S77 디자인 시스템 확장 (80차 지시):
   SP-01 STL 카드 헤더 액션(.hub-hd — 제목 좌·샘플 STL 버튼 우)
   SP-02 샘플 버튼 2차 위계 유지 (btn ghost small)
   SP-03 파일 입력 1차 진입·세션 등록 버튼(S12) 계약 유지
   SP-04 분석 카드 헤더 액션(.hub-hd — 분석 실행 primary small)
   SP-05 분석 실행 동작 유지 (stAnalysisOut 렌더)
   SP-06 상담 노트 헤더 액션 — 노트 복사 btn dark small 위계
   SP-07 노트 복사 동작 유지 (토스트 폴백 포함)
   SP-08 회귀 — chips·viewer·AI 소견·FDI·번들 예산 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const LIMIT = 283000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); } }

(async () => {
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; } });
  const w = dom.window, d = w.document;
  await sleep(900);
  await sleep(300);
  Array.from(d.querySelectorAll('button')).find(x => x.textContent.includes('의료진 모드')).click();
  await sleep(300);
  d.getElementById('agreeRow').click();
  d.getElementById('agreeBtn').click();
  await sleep(600);
  d.querySelectorAll('.prow')[0].click();
  await sleep(400);
  const root = d.getElementById('root');

  /* A. STL 카드 헤더 액션 (SP-01) */
  const stlCard = Array.from(root.querySelectorAll('.card')).find(c => c.querySelector('h3') && c.querySelector('h3').textContent.includes('스캐너 STL 가져오기'));
  const stlHd = stlCard && stlCard.querySelector('.hub-hd');
  const sample = d.getElementById('btnSampleSTL');
  assert(!!stlCard && !!stlHd && stlHd.contains(sample) && stlHd.querySelector('h3').textContent.includes('스캐너 STL 가져오기'), 'SP-01 STL 카드 헤더 .hub-hd — 제목 좌·샘플 버튼 우 (헤더 행)');

  /* B. 샘플 버튼 위계 (SP-02) */
  assert(!!sample && sample.classList.contains('btn') && sample.classList.contains('ghost') && sample.classList.contains('small') && sample.textContent.includes('샘플 STL 받기'), 'SP-02 샘플 STL 받기 — btn ghost small 2차 위계');

  /* C. 파일 진입·등록 버튼 계약 (SP-03) */
  const file = d.getElementById('stlFile'), reg = d.getElementById('btnRegSession');
  assert(!!file && file.getAttribute('accept') === '.stl,.obj,.ply', 'SP-03a STL·OBJ·PLY 파일 선택 — 1차 진입 유지');
  assert(!!reg && reg.style.display === 'none' && reg.classList.contains('btn') && reg.classList.contains('primary') && reg.classList.contains('small'), 'SP-03b 세션 등록 버튼(S12) — 임포트 전 숨김·primary small 유지');

  /* D. 분석 카드 헤더 액션 (SP-04) */
  const anCard = d.getElementById('stAnalysis');
  const anHd = anCard.querySelector('.hub-hd');
  const anBtn = d.getElementById('btnAnalyze');
  assert(!!anHd && anHd.contains(anBtn) && anHd.querySelector('h3').textContent.includes('스캔 데이터 분석') && anBtn.classList.contains('primary') && anBtn.classList.contains('small'), 'SP-04 분석 카드 헤더 .hub-hd — 분석 실행 primary small (헤더 행)');

  /* E. 분석 동작 유지 (SP-05) */
  anBtn.click();
  await sleep(400);
  const out = d.getElementById('stAnalysisOut');
  assert(!!out && out.textContent.trim().length > 50, 'SP-05 분석 실행 → stAnalysisOut 렌더 유지 (s9/s10 계약)');

  /* F. 상담 노트 헤더 액션·위계 (SP-06) */
  const note = d.getElementById('stNote'), copy = d.getElementById('btnCopyNote');
  assert(!!note && note.tagName === 'TEXTAREA' && !!copy && copy.classList.contains('btn') && copy.classList.contains('dark') && copy.classList.contains('small') && !!copy.closest('.hub-hd'), 'SP-06 상담 노트 — textarea 유지·노트 복사 btn dark small 헤더 행');

  /* G. 노트 복사 동작 유지 (SP-07) */
  note.value = '46 임플란트 ISQ 양호 (데모)';
  copy.click();
  await sleep(300);
  const toast = d.getElementById('toast');
  assert(!!toast && (toast.textContent.includes('복사') || toast.textContent.includes('클립보드')), 'SP-07 노트 복사 클릭 → 토스트 (클립보드 폴백 포함)');

  /* H. 회귀·예산 (SP-08) */
  assert(root.querySelectorAll('[data-tp]').length === 3 && !!d.getElementById('stCanvas') && !!d.getElementById('stFdi'), 'SP-08a 회귀 — 환자 칩 3·3D 뷰어·FDI 차트 유지');
  assert(root.textContent.includes('AI 소견'), 'SP-08b 회귀 — 리포트 동의 환자 AI 소견 카드 유지');
  const BN = Buffer.byteLength(BUNDLE);
  assert(BN <= LIMIT, 'SP-08c 번들 예산 — 276KiB 한도 이하 (' + BN + 'B ≤ ' + LIMIT + 'B)');

  console.log('--- S78 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e && e.message); process.exit(1); });
