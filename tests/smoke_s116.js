#!/usr/bin/env node
/* S116 스모크 — 디자인 시안 안전 후보 반영 (AC-117 · PNG 시안 대조 · safe_candidates 확정):
   DSN-01 역할 선택 히어로·역할 설명 (PNG 구성, 제외 문구 없음)
   DSN-02 환자 홈 다음 방문 D-day·최근 스캔 CTA·섹션 라벨
   DSN-03 상담 리포트 4분면 상태·AI 소견/상담 가이드 (기존 스캔 데이터, 비진단 고지)
   DSN-04 여정 마일스톤·프로필 케어 요약·언어 설정 진입
   EX-01 번들 ≤283,000B
   실행: cd /home/user/tests && node smoke_s116.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const BUNDLE = fs.readFileSync(path.join(root, '미리미소-웹앱.html'), 'utf8');
const bundleBytes = fs.statSync(path.join(root, '미리미소-웹앱.html')).size;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

(async () => {
  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const w = dom.window, d = w.document;
  const vis = () => d.body.textContent.replace(/\s+/g, ' ');
  await sleep(900);

  /* DSN-01 역할 선택 */
  let t = vis();
  assert(t.includes('방문 전 가상 시뮬레이션과 사전 문진으로 더 만족스러운 치과 상담을 경험하세요'),
    'DSN-01 역할 선택 히어로 문구 (PNG 구성)');
  assert(t.includes('Pro 3D 구강 스캔 및 셀프 리포트') && t.includes('구강 스캐너 STL/PLY 데이터 연동')
    && t.includes('3D 밀링 및 제작 진행 상태 관리'), 'DSN-01 역할 설명 3종 (PNG 2행 구성)');
  assert(!/1,428명|종단간 암호화|미리미소 스마트 케어|케어 등급 B\+|잇몸 건강 지수|치열 대칭도/.test(t),
    'DSN-01 제외 확정 문구·미검증 수치 미반영');

  /* 환자 진입 */
  w.eval('A.chooseRole("patient")');
  await sleep(400);
  const ag = d.getElementById('agreeRow'); ag && ag.click(); await sleep(150);
  const ab = d.getElementById('agreeBtn'); ab && ab.click(); await sleep(700);

  /* DSN-02 홈 */
  w.eval('A.go("home")'); await sleep(600);
  t = vis();
  assert(t.includes('치과 관리 스마트 도구') && t.includes('맞춤형 홈 바로가기'), 'DSN-02 홈 섹션 라벨');
  assert(t.includes('다음 방문') && /D[+-]?\d+/.test(t), 'DSN-02 다음 방문 D-day 안내');
  assert(t.includes('최근 스캔 데이터 보기'), 'DSN-02 최근 스캔 CTA 문구 유지');

  /* DSN-03 리포트 */
  w.eval('A.go("report")'); await sleep(600);
  t = vis();
  assert(t.includes('AI 소견 및 상담 가이드') && t.includes('4분면 구강 상태') && t.includes('1사분면'),
    'DSN-03 상담 가이드·4분면 상태 카드');
  assert(t.includes('기존 스캔 데이터 기반 참고 정보') && t.includes('진단·처방은 치과의사 대면 진료'),
    'DSN-03 비진단 고지 (신규 지표 없음)');

  /* DSN-04 여정·프로필 */
  w.eval('A.go("journey")'); await sleep(600);
  t = vis();
  assert(t.includes('관리 마일스톤') && t.includes('첫 기록 시작') && t.includes('30일 여정 완주')
    && t.includes('치료 경과 판정이 아닙니다'), 'DSN-04 여정 마일스톤 (기록 기반)');
  w.eval('A.go("profile")'); await sleep(600);
  t = vis();
  assert(t.includes('케어 요약') && t.includes('다음 방문') && t.includes('언어 · Language')
    && t.includes('상단 설정(⚙)'), 'DSN-04 프로필 케어 요약·언어 설정 진입 안내');
  assert(errors.length === 0, 'DSN 런타임 오류 0' + (errors.length ? ' → ' + errors.join('|') : ''));
  dom.window.close();

  assert(bundleBytes <= 283000, 'EX-01 번들 ' + bundleBytes + 'B ≤ 283,000B');
  console.log(`\nTOTAL: ${passed} passed / ${failed} failed`);
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
