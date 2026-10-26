#!/usr/bin/env node
/* S79 스모크 — 3D 구강 스캔 재정비 (81차 지시):
   SI-01 레이아웃 파손 복구 — flow-steps div 불균형(step마다 2개 개방·1개 종결) 제거, 경고·버튼이 카드 직계 정상 렌더
   SI-02 AIDENT형 3컬럼(참조 이미지 레이아웃) — 검사 정보(좌)·본인 치상도(중)·검사 항목(우)
   SC-01 스캔 시작하기 → 실시간 데모 팝업(모달) — 화면 이동 없음
   SC-02 팝업 실시간 진행 — 96 포인트·진행률·검사 항목 순차 완료
   SC-03 완료 → 스캔 결과 보기 → scanResult (내보내기 3종 계약)
   SC-04 촬영 준비 체크(captureGuide) 경로 보존 — 기존 스캔 플로우 계약 유지
   + 회귀 — 스캐너 연동 안내·번들 예산 */
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
  Array.from(d.querySelectorAll('button')).find(x => x.textContent.includes('일반 환자 모드')).click();
  await sleep(300);
  d.getElementById('agreeRow').click();
  d.getElementById('agreeBtn').click();
  await sleep(600);
  const brand = () => d.getElementById('brandTitle').textContent;

  /* 진입 — Pro 게이트 (스캔 최초 1회) */
  w.MM.app.go('scanIntro');
  await sleep(400);
  if (d.getElementById('proTrial')) { d.getElementById('proTrial').click(); await sleep(400); }
  const root = d.getElementById('root');

  /* A. 레이아웃 파손 복구 (SI-01) */
  const warn = root.querySelector('.card > .note-warn');
  assert(!!warn && warn.textContent.includes('교육용 데모 예시'), 'SI-01 경고 박스가 카드 직계 렌더 — 단계 중첩 구조 파손 해제');
  assert(root.querySelectorAll('.flow-step').length === 0, 'SI-01b 파손 원인 구조(flow-step 불균형 중첩) 제거 — scanIntro 내 0');
  const goBtn = d.getElementById('btnScanGo');
  assert(!!goBtn && goBtn.closest('.card') === root.querySelector('.card'), 'SI-01c 스캔 시작 버튼 — 카드 하단 정상 렌더 (세로 뭉개짐 해제)');

  /* B. AIDENT형 3컬럼 (SI-02) */
  const grid = root.querySelector('.scan-grid');
  const cols = grid ? grid.querySelectorAll(':scope > .sg-col') : [];
  assert(!!grid && cols.length === 3, 'SI-02 AIDENT형 3컬럼 그리드 — 검사 정보·스캔 대상·검사 항목');
  assert(cols[0] && cols[0].querySelectorAll('td').length === 8 && cols[0].textContent.includes('님 (데모)') && cols[0].textContent.includes('6개월'), 'SI-02b 검사 정보(좌) — 대상·최근 스캔·권장 주기·스캔 방식 4행');
  assert(cols[1] && cols[1].querySelectorAll('.fdi-cell').length === 32, 'SI-02c 스캔 대상(중) — 본인 치상도 FDI 32치 (장비 화면 중앙 치상도 상응)');
  assert(cols[2] && cols[2].querySelectorAll('.chk-row').length === 4 && cols[2].textContent.includes('대기'), 'SI-02d 검사 항목(우) — 4행·대기 상태 (DesignType 패널 상응)');

  /* C. 스캔 버튼 → 팝업 (SC-01) */
  goBtn.click();
  await sleep(300);
  const ov = d.getElementById('modalOverlay');
  assert(ov.classList.contains('show') && d.getElementById('modalBody').textContent.includes('실시간 데모'), 'SC-01 스캔 시작 → 실시간 데모 팝업(모달) 열림');
  assert(brand() === '구강 스캔', 'SC-01b 화면 이동 없음 — brandTitle 구강 스캔 유지 (팝업 오버레이)');
  assert(!!d.getElementById('scPb') && !!d.getElementById('scPn'), 'SC-01c 팝업 진행 바·포인트 카운터 마련');

  /* D. 실시간 진행 (SC-02) */
  await sleep(4600);
  assert(d.getElementById('scPb').style.width === '100%' && d.getElementById('scPn').textContent.includes('96 / 96'), 'SC-02 실시간 진행 완료 — 진행률 100%·96 포인트');
  assert((d.getElementById('scItems').textContent.match(/완료/g) || []).length === 4, 'SC-02b 검사 항목 4개 순차 완료 (치아→잇몸→플라크→ISQ)');
  assert(d.getElementById('scGo').disabled === false, 'SC-02c 완료 후 스캔 결과 보기 활성');

  /* E. 결과 진입 (SC-03) */
  d.getElementById('scGo').click();
  await sleep(500);
  assert(brand() === '스캔 결과' && d.querySelector('[data-exp="stl"]') && d.querySelector('[data-exp="ply"]'), 'SC-03 스캔 결과 보기 → scanResult — 내보내기 계약 유지 (s47)');

  /* F. 촬영 준비 경로 보존 (SC-04) */
  w.MM.app.go('scanIntro');
  await sleep(300);
  d.getElementById('btnScanGo').click();
  await sleep(300);
  d.getElementById('scPrep').click();
  await sleep(400);
  assert(brand() === '캡처 가이드' && d.querySelectorAll('[data-ci]').length === 4 && d.getElementById('btnCapStart').disabled === true, 'SC-04 촬영 준비 체크(captureGuide) 경로 보존 — 기존 스캔 플로우 계약');

  /* G. 회귀·예산 */
  w.MM.app.go('scanIntro');
  await sleep(300);
  d.getElementById('btnScannerInfo').click();
  await sleep(400);
  assert(d.getElementById('root').textContent.includes('스캐너 학습 가이드'), '회귀 — 스캐너 연동 안내 진입 유지');
  const BN = Buffer.byteLength(BUNDLE);
  assert(BN <= LIMIT, '번들 예산 — 276KiB 한도 이하 (' + BN + 'B ≤ ' + LIMIT + 'B)');

  console.log('--- S79 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e && e.message); process.exit(1); });
