#!/usr/bin/env node
/* S117 스모크 — S-04·S-08 문자열 키 이행 (AC-118 · PRD §19 T-02 4차 · §26 보강 표):
   I18N-09 S-04 키 11종 등록·simResult 사전 참조·문구 불변
   I18N-10 S-08 키 7종(§26 title·print·share 포함) 등록·report 사전 참조·문구 불변
   EX-01 번들 ≤283,000B · 프리뷰 ≤130,000B
   실행: cd /home/user/tests && node smoke_s117.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const views = fs.readFileSync(path.join(root, 'mirimiso-webapp', 'js', 'views.js'), 'utf8');
const BUNDLE = fs.readFileSync(path.join(root, '미리미소-웹앱.html'), 'utf8');
const bundleBytes = fs.statSync(path.join(root, '미리미소-웹앱.html')).size;
const previewBytes = fs.statSync(path.join(root, '미리미소-프리뷰.html')).size;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'mirimiso-webapp', 'js', 'i18n.js'), 'utf8'), sandbox);
const MM = sandbox.window.MM;
const s04 = MM.STR.text['S-04'] || {}, s08 = MM.STR.text['S-08'] || {};
assert(Object.keys(s04).length === 11 && s04.badge.includes('교육용 시뮬레이션')
  && s04.compare_note.includes('현재 미소 (Before)') && s04.cta_report === '맞춤 상담 질문지 만들기',
  'I18N-09 S-04 키 11종 사전 등록');
assert(Object.keys(s08).length === 7 && s08.title === '상담 리포트 — '
  && s08.print === '◉ 인쇄 / PDF 저장' && s08.share === '병원에 리포트 공유하기 (케이스 시작)',
  'I18N-10 S-08 키 7종 사전 등록 (§26 title·print·share)');
assert((views.split('text.S-04.').length - 1) >= 11 && (views.split('text.S-08.').length - 1) >= 7,
  'I18N-09/10 views simResult·report 사전 참조 (S-04 11·S-08 7곳)');

(async () => {
  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const w = dom.window, d = w.document;
  await sleep(900);
  w.eval('A.chooseRole("patient")');
  await sleep(400);
  const ag = d.getElementById('agreeRow'); ag && ag.click(); await sleep(150);
  const ab = d.getElementById('agreeBtn'); ab && ab.click(); await sleep(600);
  w.eval('A.go("simResult")');
  await sleep(600);
  let t = d.body.textContent.replace(/\s+/g, ' ');
  assert(t.includes('교육용 시뮬레이션') && t.includes('현재 미소 (Before)') && t.includes('분석 요약')
    && t.includes('맞춤 상담 질문지 만들기') && t.includes('다른 사진으로 다시 시도'),
    'I18N-09 simResult 문구 불변 (사전 값 = 렌더)');
  w.eval('A.go("report")');
  await sleep(600);
  t = d.body.textContent.replace(/\s+/g, ' ');
  assert(t.includes('상담 리포트 —') && t.includes('AI 소견 및 상담 가이드') && t.includes('상담 질문지')
    && t.includes('예상 비용 범위') && t.includes('인쇄 / PDF 저장') && t.includes('병원에 리포트 공유하기'),
    'I18N-10 report 문구 불변 (사전 값 = 렌더)');
  assert(errors.length === 0, 'I18N 런타임 오류 0' + (errors.length ? ' → ' + errors.join('|') : ''));
  dom.window.close();

  assert(bundleBytes <= 283000 && previewBytes <= 130000,
    'EX-01 번들 ' + bundleBytes + 'B ≤ 283,000B · 프리뷰 ' + previewBytes + 'B ≤ 130,000B');
  console.log(`\nTOTAL: ${passed} passed / ${failed} failed`);
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
