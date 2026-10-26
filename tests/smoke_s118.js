#!/usr/bin/env node
/* S118 스모크 — 영어 번역본 2차 (AC-119 · S-04·S-08 영어 확장):
   L10N-04 영어 사전이 S-04·S-08 키를 제공
   L10N-05 English 설정 시 simResult·report 핵심 문구 영어 렌더·한국어 복귀
   EX-01 번들 ≤283,000B · 프리뷰 ≤130,000B
   실행: cd /home/user/tests && node smoke_s118.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
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
MM.setLang('en');
assert(Object.keys(MM.LOCALES.en.text['S-04']).length === 11 && Object.keys(MM.LOCALES.en.text['S-08']).length === 7
  && MM.t('text.S-04.cta_report') === 'Create my consultation questions'
  && MM.t('text.S-08.print') === '◉ Print / Save as PDF',
  'L10N-04 영어 사전 S-04 11키·S-08 7키 제공');
MM.setLang('ko');
assert(MM.t('text.S-08.print') === '◉ 인쇄 / PDF 저장', 'L10N-05 한국어 복귀 (단위)');

(async () => {
  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const w = dom.window, d = w.document;
  await sleep(900);
  w.eval('MM.setLang("en")');
  w.eval('A.chooseRole("patient")');
  await sleep(400);
  const ag = d.getElementById('agreeRow'); ag && ag.click(); await sleep(150);
  const ab = d.getElementById('agreeBtn'); ab && ab.click(); await sleep(600);
  w.eval('A.go("simResult")');
  await sleep(600);
  let t = d.body.textContent.replace(/\s+/g, ' ');
  assert(t.includes('Educational simulation') && t.includes('Analysis summary')
    && t.includes('Create my consultation questions'),
    'L10N-05 simResult 영어 렌더');
  w.eval('A.go("report")');
  await sleep(600);
  t = d.body.textContent.replace(/\s+/g, ' ');
  assert(t.includes('Consultation report —') && t.includes('Consultation questions')
    && t.includes('Print / Save as PDF'),
    'L10N-05 report 영어 렌더');
  w.eval('MM.setLang("ko")');
  w.eval('A.go("report")');
  await sleep(600);
  t = d.body.textContent.replace(/\s+/g, ' ');
  assert(t.includes('상담 리포트 —') && t.includes('인쇄 / PDF 저장'), 'L10N-05 한국어 복귀 렌더');
  assert(errors.length === 0, 'L10N 런타임 오류 0' + (errors.length ? ' → ' + errors.join('|') : ''));
  dom.window.close();

  assert(bundleBytes <= 283000 && previewBytes <= 130000,
    'EX-01 번들 ' + bundleBytes + 'B ≤ 283,000B · 프리뷰 ' + previewBytes + 'B ≤ 130,000B');
  console.log(`\nTOTAL: ${passed} passed / ${failed} failed`);
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
