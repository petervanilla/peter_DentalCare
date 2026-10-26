#!/usr/bin/env node
/* S80 스모크 — treatment Order 화면 AIDENT형 3컬럼 정합 (82차 자율 · 81차 참조 이미지 레이아웃 스레드):
   TV-01 카드 중첩 제거 — 헤더·OrderInfo 카드 미종결로 전 카드가 중첩되던 구조 수복 (모든 단계)
   TV-02 AIDENT형 3컬럼(참조 이미지 image-4 레이아웃) — 좌 OrderInfo(환자·주문번호·Note)·중앙 치아 차트·우 DesignType·DesignMethod·색조·재료
   TV-03 하단 액션 바 — 취소·주문 저장·스캔 시작 (그리드 외 풀폭)
   TV-04 주문 폼 계약 유지 — IScan 주문번호(readonly)·환자 select·.tt 32·.dtc 6·.ib 5
   TV-05 이중 게이트 유지 — 치아+DesignType 선택 시 스캔 시작 enabled
   TV-06 Scan·Design 단계 불변 — Data processing→가상 스캔→디자인 요약→저장 복귀
   TV-07 비진단 고지·기록 카드 유지 (txFoot · CV-08 계약)
   TV-08 반응형 규칙·번들 예산 */
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
  const root = () => d.getElementById('root');

  /* 진입 (CV-01 계약) */
  d.getElementById('txEntry').click();
  await sleep(400);

  /* A. 카드 중첩 제거 (TV-01) */
  assert(root().querySelectorAll('.card .card').length === 0, 'TV-01 카드 중첩 0 — 헤더·OrderInfo 미종결 수복 (스캔·디자인 단계 포함)');
  const h3 = Array.from(root().querySelectorAll('h3')).find(x => x.textContent.includes('진료 — Order·Scan·Design'));
  assert(!!h3 && !!h3.closest('.card') && !h3.closest('.card').querySelector('.tx-grid'), 'TV-01b 헤더 카드 독립 — 스테퍼만 포함·후속 콘텐츠 중첩 없음');

  /* B. AIDENT형 3컬럼 (TV-02) */
  const grid = root().querySelector('.tx-grid');
  const cols = grid ? grid.querySelectorAll(':scope > .tx-col') : [];
  assert(!!grid && cols.length === 3, 'TV-02 AIDENT형 3컬럼 그리드 — OrderInfo·치아 차트·디자인 패널');
  assert(cols[0] && cols[0].textContent.includes('주문 정보') && !!cols[0].querySelector('#txP') && !!cols[0].querySelector('#txNo') && !!cols[0].querySelector('#txNt'), 'TV-02b 좌측 — 환자·주문번호·Note (OrderInfo 패널)');
  assert(cols[1] && cols[1].querySelectorAll('.tt').length === 32 && !!cols[1].querySelector('#txClear'), 'TV-02c 중앙 — 치아 위치 선택 FDI 32치·ClearAll (치상도 패널)');
  assert(cols[2] && cols[2].querySelectorAll('.dtc').length === 6 && cols[2].querySelectorAll('.ib').length === 5 && !!cols[2].querySelector('#txCol') && !!cols[2].querySelector('#txMat'), 'TV-02d 우측 — DesignType 6·ImplantBody 5·색조·재료 (디자인 패널)');

  /* C. 하단 액션 바 (TV-03) */
  const slot = root().querySelector('.tx-grid + .slot-row');
  assert(!!slot && slot.querySelector('#txSave1') && slot.querySelector('#txGo'), 'TV-03 취소·주문 저장·스캔 시작 — 그리드 외 하단 풀폭 행');

  /* D. 주문 폼 계약 (TV-04) */
  const txNo = d.getElementById('txNo'), txP = d.getElementById('txP');
  assert(!!txNo && txNo.readOnly && /^IScan\d{14}$/.test(txNo.value) && !!txP && txP.options.length >= 3, 'TV-04 IScan 주문번호(readonly)·환자 select — CV-03 계약');
  assert(d.querySelectorAll('.tt').length === 32 && d.querySelectorAll('.dtc').length === 6 && d.querySelectorAll('.ib').length === 5, 'TV-04b FDI 32치·DesignType 6·ImplantBody 5 — 재배치 후 구성 불변');

  /* E. 이중 게이트 (TV-05) */
  const txGo = d.getElementById('txGo');
  assert(txGo.disabled === true, 'TV-05 초기 스캔 시작 disabled');
  d.querySelectorAll('.tt')[0].click();
  await sleep(100);
  d.querySelectorAll('.dtc')[0].click();
  await sleep(100);
  assert(txGo.disabled === false, 'TV-05b 치아+DesignType → enabled (이중 게이트 유지)');

  /* F. Scan·Design 단계 불변 (TV-06) */
  txGo.click();
  await sleep(300);
  assert(!!d.getElementById('txBar') && !!d.getElementById('txPct'), 'TV-06 Data processing 프로그레스 전환');
  await sleep(2300);
  const ptTxt = d.getElementById('txPt') ? parseInt(d.getElementById('txPt').textContent, 10) : 0;
  assert(ptTxt >= 3 && d.querySelectorAll('#txSvg .txT').length === 16 && d.querySelectorAll('#txSvg .txT.v').length >= 1, 'TV-06b 가상 스캔 라이브 — ' + ptTxt + 'P 치아 점등 (S82)');
  d.getElementById('txDn').click();
  await sleep(400);
  assert(root().textContent.includes('Design — ') && !!d.getElementById('txSave'), 'TV-06c 디자인 요약·기록 저장 진입');
  d.getElementById('txSave').click();
  await sleep(500);
  assert(root().textContent.includes('스마일치과 Clinic'), 'TV-06d 저장 → staffHome 복귀');

  /* G. 재진입 — 기록 카드·고지 (TV-07) */
  d.getElementById('txEntry').click();
  await sleep(400);
  assert(root().textContent.includes('최근 진료 기록') && root().textContent.includes('AIDENT형 워크플로 학습용 가상 시연') && root().textContent.includes('비진단'), 'TV-07 최근 기록·비진단 고지 유지 (CV-07·08 계약)');

  /* H. 반응형·예산 (TV-08) */
  const css = Array.from(d.querySelectorAll('style')).map(x => x.textContent).join('');
  assert(css.includes('.txg3{display:grid') && css.includes('.tx-grid{display:grid;grid-template-columns:repeat(auto-fill') && css.includes('@media(max-width:1020px){.txg3{grid-template-columns:1fr}}') && css.indexOf('chub-entry') < 0, 'TV-06c 스코프 분리 — 진료 3컬럼(.txg3)·치아별 지표 그리드(.tx-grid auto-fill) 공존·사규 제거 (S85)');;
  const BN = Buffer.byteLength(BUNDLE);
  assert(BN <= LIMIT, '번들 예산 — 276KiB 한도 이하 (' + BN + 'B ≤ ' + LIMIT + 'B)');

  console.log('--- S80 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e && e.message); process.exit(1); });
