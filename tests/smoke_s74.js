#!/usr/bin/env node
/* S74 스모크 — 진료 워크플로 (AIDENT형 Order·Scan·Design · 76차 지시):
   ①의료진 홈 '🦷 진료 시작' 진입(CV-01) ②크럼·스테퍼(CV-02) ③주문 폼·FDI 32치·DesignType 6·ImplantBody 5(CV-03)
   ④치아+DesignType 이중 게이트(CV-04) ⑤Data processing→가상 스캔 점등(CV-05) ⑥디자인 요약(CV-06)
   ⑦MM_TREAT_V1 저장·재진입 초기화·기록 카드(CV-07) ⑧비진단 고지(CV-08) */
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
  Array.from(d.querySelectorAll('button')).find(x => x.textContent.includes('의료진 모드')).click();
  await sleep(300);
  d.getElementById('agreeRow').click();
  d.getElementById('agreeBtn').click();
  await sleep(600);
  const root = () => d.getElementById('root');
  const crTxt = () => d.getElementById('crumbs').textContent.replace(/\s+/g, ' ').trim();

  /* A. 진입 — staffHome 헤더의 진료 시작 버튼 (CV-01) */
  const txEntry = d.getElementById('txEntry');
  assert(!!txEntry && txEntry.textContent.includes('진료 시작') && txEntry.getAttribute('data-goto') === 'treatment', 'CV-01 staffHome 헤더 🦷 진료 시작 버튼(#txEntry·data-goto=treatment)');
  const tiCard = txEntry.closest('.card');
  assert(!!tiCard && tiCard.classList.contains('ti') && !tiCard.querySelector('[data-goto="scannerInfo"]'), 'CV-01b 진료 시작 — Clinic 헤더 주 액션 (가이드는 앱바 이동·S76)');

  /* B. 라우팅·스텝 (CV-02) */
  txEntry.click();
  await sleep(400);
  assert(root().textContent.includes('진료 — Order·Scan·Design') && crTxt().endsWith('진료'), 'CV-02 treatment 라우팅 · crumbs HOME › 진료');

  /* C. Order 폼 (CV-03) */
  const txNo = d.getElementById('txNo');
  const txP = d.getElementById('txP');
  assert(!!txNo && txNo.readOnly && /^IScan\d{14}$/.test(txNo.value) && !!txP && txP.tagName === 'SELECT' && txP.options.length >= 3, 'CV-03 주문 폼 — IScan 주문번호(readonly) · 환자 select');
  assert(d.querySelectorAll('.tt').length === 32 && d.querySelectorAll('.dtc').length === 6 && d.querySelectorAll('.ib').length === 5, 'CV-03b FDI 32치 · DesignType 6 · ImplantBody 5 구성');

  /* D. 이중 게이트 (CV-04) */
  const txGo = d.getElementById('txGo');
  assert(!!txGo && txGo.disabled === true, 'CV-04 초기 — 스캔 시작 disabled (치아·DesignType 미선택)');
  d.querySelectorAll('.tt')[0].click();
  await sleep(100);
  assert(txGo.disabled === true, 'CV-04b 치아만 선택 — 여전히 disabled');
  d.querySelectorAll('.dtc')[0].click();
  await sleep(100);
  assert(txGo.disabled === false, 'CV-04c 치아+DesignType — 스캔 시작 enabled');
  const dtName = d.querySelectorAll('.dtc')[0].getAttribute('data-d');

  /* E. 스캔 (CV-05) */
  txGo.click();
  await sleep(300);
  assert(!!d.getElementById('txBar') && !!d.getElementById('txPct'), 'CV-05 스캔 전환 — Data processing 프로그레스');
  await sleep(2300);
  const ptTxt = d.getElementById('txPt') ? parseInt(d.getElementById('txPt').textContent, 10) : 0;
  assert(ptTxt >= 3 && d.querySelectorAll('#txSvg .txT').length === 16 && d.querySelectorAll('#txSvg .txT.v').length >= 1, 'CV-05b 가상 스캔 라이브 — 포인트 카운터·치아 점등 (' + ptTxt + 'P · S82 실시간 치아)');

  /* F. Design 요약 (CV-06) */
  d.getElementById('txDn').click();
  await sleep(400);
  assert(root().textContent.includes('Design — ' + dtName) && root().textContent.includes('18'), 'CV-06 디자인 요약 — DesignType·FDI 반영');

  /* G. 저장 · 재진입 (CV-07) */
  d.getElementById('txSave').click();
  await sleep(500);
  let rec = null;
  try { rec = JSON.parse(w.localStorage.getItem('MM_TREAT_V1'))[0]; } catch (e) {}
  assert(rec && rec.f === '18' && rec.t === dtName && rec.pt === 96 && !d.getElementById('txNo'), 'CV-06b 저장 — MM_TREAT_V1(f·t·pt=96) · staffHome 복귀');
  txEntry.click();
  await sleep(400);
  assert(d.getElementById('txGo').disabled === true && root().textContent.includes('최근 진료 기록') && root().textContent.includes(dtName), 'CV-07 재진입 — 폼 초기화(txNew) · 기록 카드 노출');

  /* H. 비진단 고지 (CV-08) */
  assert(root().textContent.includes('AIDENT형 워크플로 학습용 가상 시연') && root().textContent.includes('비진단'), 'CV-08 비진단·가상 시연 고지 고정');

  console.log('--- S74 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('FATAL - ' + (e && e.message)); console.log('--- S74 smoke finished: ' + passed + ' pass / ' + (failed + 1) + ' fail ---'); process.exit(1); });
