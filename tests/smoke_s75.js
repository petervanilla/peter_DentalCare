#!/usr/bin/env node
/* S75 스모크 — staffHome 케이스 허브 정비 (77차 지시):
   ①스캐너 학습 가이드 버튼 오른쪽 상위 이동 (HF-01)
   ②허브 단계 나열(스캔→계획→동의→기공 주문→제작→장착→관리)을 하나의 흐름 스트립으로 (HF-02)
   ③긴급·진행·오늘 상담·장착·관리 통계를 케이스 허브 블록 안으로 이동 (HF-03)
   + 허브 카드 단일화·IA 순서·기존 계약 회귀 */
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
  const root = d.getElementById('root');
  const crTxt = () => d.getElementById('crumbs').textContent.replace(/\s+/g, ' ').trim();

  /* A. 스캐너 학습 가이드 — 오른쪽 상위 (HF-01) */
  const ti = root.querySelector('.card.ti');
  const guide = d.getElementById('scanGuideTop'), rb = d.querySelector('.demo-ribbon');
  const txEntry = d.getElementById('txEntry');
  assert(!!guide && guide.style.display !== 'none' && guide.textContent.includes('스캐너 학습 가이드'), 'HF-01 가이드 버튼 오른쪽 상위 — 앱바 표시 (staffHome)');
  assert(!!(guide.compareDocumentPosition(rb) & 4), 'HF-01b 가이드가 DEMO 리본보다 왼쪽 (앱바 우측 그룹 선두)');

  /* B. 허브 단일화 — 상단 중복 카드 제거 (HF-04) */
  assert(!root.querySelector('.chub-entry'), 'HF-04 상단 중복 허브 카드(chub-entry) 제거');
  const hubCards = Array.from(root.querySelectorAll('.card')).filter(c => c.querySelector('h3') && c.querySelector('h3').textContent.includes('케이스 허브'));
  assert(hubCards.length === 1, 'HF-04b 케이스 허브 카드 1장 — 중복 0');
  const hub = hubCards[0];
  assert(root.children[0] && root.children[0].textContent.includes('스마일치과 Clinic'), 'HF-04c 첫 블록 = Clinic 헤더 (허브가 위에 뜨지 않음)');

  /* C. 하나의 흐름 — 7단계 플로우 스트립 (HF-02) */
  const flow = hub.querySelector('.hflow');
  assert(!!flow && flow.querySelectorAll('b').length === 7 && flow.querySelectorAll('i').length === 6, 'HF-02 흐름 스트립 — 7단계·6개 연결자');
  const stages = Array.from(flow.querySelectorAll('b')).map(x => x.textContent);
  assert(JSON.stringify(stages) === JSON.stringify(['스캔', '계획', '동의', '기공 주문', '제작', '장착', '관리']), 'HF-02b 단계 순서 — 스캔→계획→동의→기공 주문→제작→장착→관리');

  /* D. 통계 이동 — 허브 블록 안 (HF-03) */
  const stats = hub.querySelector('.chub-stats');
  assert(!!stats && hub.contains(stats), 'HF-03 통계가 케이스 허브 블록 안에 렌더');
  const stTxt = stats.textContent.replace(/\s+/g, '');
  assert(stTxt.includes('긴급2건') && stTxt.includes('진행2건') && stTxt.includes('오늘상담2·장착1·관리3'), 'HF-03b 통계 구성 — 긴급 2건·진행 2건·오늘 상담 2 · 장착 1 · 관리 3');

  /* E. IA 순서·열기 버튼 회귀 (SM 계약 유지) */
  const chipsEl = root.querySelector('.stat-chips');
  const tbl = root.querySelector('.staff-table');
  assert(!!(ti.compareDocumentPosition(chipsEl) & 4) && !!(chipsEl.compareDocumentPosition(hub) & 4) && !!(hub.compareDocumentPosition(tbl) & 4), 'HF-05 순서 유지 — Clinic → 통계칩 → 케이스 허브(통계·흐름 포함) → 환자 목록');
  const btn = d.getElementById('goCaseHub');
  assert(!!btn && btn.getAttribute('data-goto') === 'caseHub' && /케이스 허브 열기 \(\d+건 · 긴급 \d+\)/.test(btn.textContent), 'HF-06 열기 버튼 — id·data-goto·건수 라벨 유지');
  btn.click();
  await sleep(300);
  assert(w.MM.app.current === 'caseHub', 'HF-06b 허브 버튼 → caseHub 이동');
  w.MM.app.go('staffHome');
  await sleep(300);

  /* F. 진료 진입 무사 (S74 계약) */
  assert(!!d.getElementById('txEntry') && d.getElementById('txEntry').getAttribute('data-goto') === 'treatment', 'HF-07 🦷 진료 시작 버튼 유지 (S74 CV-01)');

  /* G. 예산 */
  assert(fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size <= 283000, '번들 예산 — 276KiB 이하 (' + fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size + 'B)');

  console.log('--- S75 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('FATAL - ' + (e && e.message)); console.log('--- S75 smoke finished: ' + passed + ' pass / ' + (failed + 1) + ' fail ---'); process.exit(1); });
