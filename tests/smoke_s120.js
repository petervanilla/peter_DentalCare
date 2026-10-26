#!/usr/bin/env node
/* S120 스모크 — 영어 번역본 3차 (AC-121 · S-12·S-13 영어 확장):
   L10N-06 영어 사전 S-12·S-13 키·msg 3종 제공
   L10N-07 English 설정 시 메모 placeholder·캡처 고지·동의 메시지가 영어로 렌더되고 한국어로 복귀한다
   EX-01 번들 ≤283,000B · 프리뷰 ≤130,000B
   실행: cd /home/user/tests && node smoke_s120.js */
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
const en = sandbox.window.MM.LOCALES.en;
assert(en.text['S-12'].memo_placeholder === 'Anything unusual' && en.text['S-13'].order_title === 'OrderInfo'
  && en.text['S-13'].design_title === 'Design',
  'L10N-06 영어 사전 S-12·S-13 키 제공');
assert((en.msg.capture.no_server_upload || '').includes('No server upload')
  && (en.msg.validation.memo_too_long || '').includes('60') && (en.msg.consent.required || '').includes('review'),
  'L10N-06 영어 사전 msg 3종 (capture·validation·consent) 제공');

(async () => {
  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const w = dom.window, d = w.document;
  await sleep(900);
  w.eval('MM.setLang("en")');
  await sleep(300);
  w.eval('A.chooseRole("patient")');
  await sleep(400);
  let t = d.body.textContent.replace(/\s+/g, ' ');
  assert(t.includes('Please review before starting'), 'L10N-07 English 동의 모달 제목 (consent.required)');
  const ag = d.getElementById('agreeRow'); ag && ag.click(); await sleep(150);
  const ab = d.getElementById('agreeBtn'); ab && ab.click(); await sleep(600);
  w.eval('A.go("today")');
  await sleep(600);
  const memo = d.getElementById('tmMemo');
  assert(!!memo && memo.getAttribute('placeholder') === 'Anything unusual',
    'L10N-07 English 메모 placeholder 렌더');
  const cam = d.getElementById('tdCam'); cam && cam.click(); await sleep(500);
  t = d.body.textContent.replace(/\s+/g, ' ');
  assert(t.includes('No server upload — stays on this device'), 'L10N-07 English 캡처 고지 렌더');
  w.eval('A.closeModal()'); await sleep(200);
  w.eval('MM.setLang("ko")');
  await sleep(300);
  w.eval('A.go("today")');
  await sleep(600);
  const memo2 = d.getElementById('tmMemo');
  assert(!!memo2 && memo2.getAttribute('placeholder') === '특이사항', 'L10N-07 한국어 복귀 렌더');
  assert(errors.length === 0, 'L10N 런타임 오류 0' + (errors.length ? ' → ' + errors.join('|') : ''));
  dom.window.close();

  assert(bundleBytes <= 283000 && previewBytes <= 130000,
    'EX-01 번들 ' + bundleBytes + 'B ≤ 283,000B · 프리뷰 ' + previewBytes + 'B ≤ 130,000B');
  console.log(`\nTOTAL: ${passed} passed / ${failed} failed`);
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
