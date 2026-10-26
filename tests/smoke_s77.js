#!/usr/bin/env node
/* S77 스모크 — staffHome 의료진용 프론트엔드 재설계 (79차 지시):
   SG-01 Clinic 카드 헤더 액션 분리(.cli-hd — 제목·설명 좌 / 진료 시작 버튼 우)
   SG-02 버튼 위계 통일 — txEntry primary small·goCaseHub dark small (풀폭 해제)
   SG-03 허브 카드 헤더 한 줄화(.hub-hd — 제목 + 열기 버튼)
   SG-04 허브 내용 회귀 — hflow 7단계·chub-stats 3항목 (75차 HF 계약)
   SG-05 통계칩 직계 4·IA 순서 (71차 SC·75차 HF 계약)
   SG-06 환자 목록 — 4열·prow 3행·클릭 → staffPatient
   SG-07 앱바 가이드 토글 회귀 (78차 AG 계약)
   SG-08 진료 진입·번들 예산 */
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
  const root = d.getElementById('root');
  const root2 = () => d.getElementById('root');

  /* A. Clinic 카드 헤더 액션 분리 (SG-01) */
  const ti = root.querySelector('.card.ti');
  assert(!!ti && ti.classList.contains('cli-hd'), 'SG-01 Clinic 카드 헤더 .cli-hd 적용 (좌 정보·우 액션 플렉스)');
  const tiKids = Array.from(ti.children);
  assert(!!ti.querySelector('.hd-t') && tiKids.filter(x => x.tagName === 'BUTTON').length === 1 && tiKids[tiKids.length - 1].id === 'txEntry', 'SG-01b 헤더 구조 — .hd-t(제목·설명) + 진료 시작 버튼 1개 (우측 액션)');
  assert(!ti.querySelector('[data-goto="scannerInfo"]'), 'SG-01c Clinic 카드 내 스캐너 버튼 전무 회귀 (78차 AG-02 유지)');

  /* B. 버튼 위계 (SG-02) */
  const txEntry = d.getElementById('txEntry');
  assert(txEntry.classList.contains('btn') && txEntry.classList.contains('primary') && txEntry.classList.contains('small') && txEntry.style.flex === '' && txEntry.style.width === '', 'SG-02 진료 시작 — btn primary small 위계 (풀폭 해제·인라인 크기 지정 없음)');
  const goBtn = d.getElementById('goCaseHub');
  assert(goBtn.classList.contains('btn') && goBtn.classList.contains('dark') && goBtn.classList.contains('small'), 'SG-02b 케이스 허브 열기 — btn dark small 위계 (2차 액션)');

  /* C. 허브 카드 헤더 한 줄화 (SG-03) */
  const hub = Array.from(root.querySelectorAll('.card')).find(c => c.querySelector('h3') && c.querySelector('h3').textContent.includes('케이스 허브'));
  assert(Array.from(root.querySelectorAll('.card')).filter(c => c.querySelector('h3') && c.querySelector('h3').textContent.includes('케이스 허브')).length === 1, 'SG-03 케이스 허브 카드 1장 유지');
  const hubhd = hub.querySelector('.hub-hd');
  assert(!!hubhd && hubhd.querySelector('h3') && hubhd.querySelector('h3').textContent.includes('케이스 허브') && hubhd.contains(goBtn), 'SG-03b 허브 헤더 .hub-hd — 제목 + 열기 버튼 한 줄 (버튼이 헤더 행에 배치)');

  /* D. 허브 내용 회귀 (SG-04) */
  const flow = hub.querySelector('.hflow');
  assert(!!flow && flow.querySelectorAll('b').length === 7 && flow.querySelectorAll('i').length === 6, 'SG-04 흐름 스트립 — 7단계·6개 연결자 유지 (75차 HF-02)');
  const stats = hub.querySelector('.chub-stats');
  const stTxt = stats ? stats.textContent.replace(/\s+/g, '') : '';
  assert(!!stats && hub.contains(stats) && stats.querySelectorAll('.cs-item').length === 3 && stTxt.includes('긴급2건') && stTxt.includes('진행2건') && stTxt.includes('오늘상담2·장착1·관리3'), 'SG-04b 허브 통계 — .cs-item 3항목·허브 블록 내 유지 (75차 HF-03)');

  /* E. 통계칩·IA 순서 (SG-05) */
  const chipsEl = root.querySelector('.stat-chips');
  assert(!!chipsEl && chipsEl.children.length === 4, 'SG-05 통계칩 직계 4 유지 (71차 SC-02)');
  const tbl = root.querySelector('.staff-table');
  assert(!!(ti.compareDocumentPosition(chipsEl) & 4) && !!(chipsEl.compareDocumentPosition(hub) & 4) && !!(hub.compareDocumentPosition(tbl) & 4), 'SG-05b IA 순서 — Clinic → 통계칩 → 케이스 허브 → 환자 목록 (75차 HF-05)');

  /* F. 환자 목록 (SG-06) */
  assert(tbl.querySelectorAll('th').length === 4 && root.querySelectorAll('.prow').length === 3, 'SG-06 환자 목록 표 — 4열·prow 3행 유지');
  root.querySelectorAll('.prow')[0].click();
  await sleep(300);
  assert(w.MM.app.current === 'staffPatient', 'SG-06b 환자 행 클릭 → staffPatient 이동');
  w.MM.app.go('staffHome');
  await sleep(300);

  /* G. 앱바 가이드 토글 회귀 (SG-07) */
  const g = d.getElementById('scanGuideTop');
  assert(!!g && g.classList.contains('ab-guide') && g.style.display !== 'none', 'SG-07 앱바 📖 가이드 — staffHome 표시 (78차 AG-01)');
  w.MM.app.go('scannerInfo');
  await sleep(300);
  assert(g.style.display === 'none', 'SG-07b scannerInfo 이동 — 가이드 숨김 (78차 AG-04b)');
  w.MM.app.go('staffHome');
  await sleep(300);
  assert(g.style.display !== 'none', 'SG-07c staffHome 복귀 — 재표시 (78차 AG-04d)');

  /* H. 진료 진입·예산 (SG-08) */
  assert(!!d.getElementById('txEntry') && d.getElementById('txEntry').getAttribute('data-goto') === 'treatment', 'SG-08 진료 시작 — data-goto=treatment 진입 유지 (74차 CV-01)');
  const BN = Buffer.byteLength(BUNDLE);
  assert(BN <= LIMIT, 'SG-08b 번들 예산 — 276KiB 한도 이하 (' + BN + 'B ≤ ' + LIMIT + 'B)');

  console.log('--- S77 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e && e.message); process.exit(1); });
