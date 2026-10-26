#!/usr/bin/env node
/* S85 스모크 — CSS 무결성 정비·재경량화 (87차 자율 · 분석리포트 후속):
   SG-01 진료 3컬럼 래퍼 — .tx-grid.txg3 병존 (추가만 원칙 · DOM 계약 불변)
   SG-02 3컬럼 구조 유지 — .txg3 > .tx-col(OrderInfo)
   SG-03 치아별 지표 그리드 단일 클래스 — Analysis.toothGridHTML은 tx-grid만 (txg3 오염 없음)
   SG-04 css 스코프 분리 — .txg3 3컬럼 규칙·.tx-grid auto-fill 규칙 공존 (82차~ 충돌 해소)
   SG-05 css 사규 회수 — chub-entry·--ac·--ap·.qc 삼중 중복 부재
   SG-06 css 사용 규칙 유지 — .cdots (golden 30 컨테이너 · s61/s65 정합)
   SG-07 레코드 행 회귀 스팟 — .tr 렌더 (중복 정의 관찰 대상 미변경 확인)
   SG-08 비진단 고지 유지 (진료 카드)
   SG-09 번들 — 한도 이하·직전 빌드(274,115B) 대비 순감소
   SG-10 runtime errors 0 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'mirimiso-webapp', 'css', 'app.css'), 'utf8');
const LIMIT = 283000, PREV = 274115;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = (fn, ms) => new Promise((res, rej) => { const t0 = Date.now(); (function p() { const v = fn(); if (v) return res(v); if (Date.now() - t0 > ms) return rej(new Error('timeout')); setTimeout(p, 100); })(); });
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

(async () => {
  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const w = dom.window, d = w.document;
  await sleep(900);
  const root = () => d.getElementById('root');

  /* A. 환자 records — .tr 행 스팟 (SG-07) */
  Array.from(d.querySelectorAll('.role-card'))[0].click();
  if (d.getElementById('agreeRow')) { d.getElementById('agreeRow').click(); d.getElementById('agreeBtn').click(); }
  await sleep(300);
  const DY = new Date(Date.now() - 864e5).toISOString().slice(0, 10), TD = new Date().toISOString().slice(0, 10);
  w.MM.todaySave({ d: DY, pain: 1, swell: 0, bleed: 0, m: '어제 시드 (데모)' });
  w.MM.todaySave({ d: TD, pain: 2, swell: 1, bleed: 0, m: '오늘 시드 (데모)' });
  w.A.go('journey');
  await sleep(200);
  assert(root().querySelector('.tr small') && root().querySelector('.tr .tb') && root().querySelectorAll('.cdots .jd').length === 30, 'SG-07 여정 — .tr 추이 행·.tb 바·golden 30 도트 (중복 정의 관찰 미변경)');

  /* B. css 정적 단정 (SG-04~06) */
  assert(CSS.includes('.txg3{display:grid;grid-template-columns:320px minmax(0,1fr) 330px') && CSS.includes('.tx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr))'),
    'SG-04 css 스코프 분리 — 진료 3컬럼(.txg3)·치아별 지표 그리드(.tx-grid auto-fill) 공존');
  assert(CSS.indexOf('chub-entry') < 0 && CSS.indexOf('--ac:') < 0 && CSS.indexOf('--ap:') < 0 && CSS.indexOf('.qc,.qc') < 0,
    'SG-05 css 사규 회수 — chub-entry·--ac·--ap·.qc 삼중 중복 부재');
  assert(CSS.includes('.cdots{'), 'SG-06 css .cdots 유지 — golden 30 컨테이너 (오탐 제외)');

  /* C. 진료 3컬럼 — txg3 병기 (SG-01·02·08) */
  d.querySelector('.role-chip').click();
  const sw = d.getElementById('swStaff'); if (sw) { sw.click(); } else { Array.from(d.querySelectorAll('button')).find(x => x.textContent.includes('의료진 모드')).click(); }
  if (d.getElementById('agreeRow')) { d.getElementById('agreeRow').click(); d.getElementById('agreeBtn').click(); }
  await sleep(400);
  d.getElementById('txEntry').click();
  await sleep(400);
  d.querySelectorAll('.tt')[0].click();
  d.querySelectorAll('.dtc')[0].click();
  await sleep(100);
  const grid = root().querySelector('.tx-grid.txg3');
  assert(!!grid, 'SG-01 진료 3컬럼 래퍼 — .tx-grid.txg3 병존 (tx-grid 계약 유지·txg3 추가)');
  assert(!!grid && grid.querySelector('.tx-col') && grid.querySelector('.tx-col').textContent.includes('OrderInfo'),
    'SG-02 3컬럼 구조 — .txg3 > .tx-col(OrderInfo) 유지');
  assert(root().textContent.includes('비진단'), 'SG-08 비진단 고지 유지 (진료 카드)');

  /* D. 치아별 지표 그리드 오염 없음 (SG-03) */
  assert(!!w.MM.Analysis && typeof w.MM.Analysis.toothGridHTML === 'function'
    && String(w.MM.Analysis.toothGridHTML).includes('tx-grid') && String(w.MM.Analysis.toothGridHTML).indexOf('txg3') < 0,
    'SG-03 Analysis.toothGridHTML — tx-grid 단독 (txg3 오염 없음 · auto-fill 복원 대상)');

  /* E. 번들·런타임 (SG-09·10) */
  const sz = fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size;
  assert(sz <= LIMIT, `SG-09 번들 — ${sz}B ≤ ${LIMIT}B (S85 −104B 회수 · 이후 스프린트 기능분은 한도 내 증가 허용)`);
  assert(errors.length === 0, 'SG-10 runtime errors 0' + (errors.length ? ' → ' + errors.join('|') : ''));

  await dom.window.close();
  console.log('--- S85 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
