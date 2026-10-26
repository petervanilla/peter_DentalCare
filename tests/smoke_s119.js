#!/usr/bin/env node
/* S119 스모크 — S-12·S-13 문자열 키 이행 (AC-120 · PRD §19 T-02 5차 · §26 보강 표):
   I18N-11 S-12 memo_placeholder 등록·today 사전 참조·문구 불변 (memo_too_long 기등록 확인)
   I18N-12 msg.capture.no_server_upload 등록·캡처 모달 고지 표시 (NG-5)
   I18N-13 S-13 order_title·design_title 등록·treatment 사전 참조·문구 불변 (consent.required 기등록 확인)
   EX-01 번들 ≤283,000B · 프리뷰 ≤130,000B
   실행: cd /home/user/tests && node smoke_s119.js */
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
const s12 = MM.STR.text['S-12'] || {}, s13 = MM.STR.text['S-13'] || {};
assert(s12.memo_placeholder === '특이사항' && MM.STR.msg.validation.memo_too_long === '메모는 60자까지만 저장됩니다',
  'I18N-11 S-12 memo_placeholder 사전 등록 (memo_too_long 기등록 확인)');
assert((MM.STR.msg.capture.no_server_upload || '').includes('서버 업로드 없음'),
  'I18N-12 msg.capture.no_server_upload 사전 등록');
assert(s13.order_title === 'OrderInfo' && s13.design_title === 'Design' && MM.STR.msg.consent.required === '시작 전에 확인해 주세요',
  'I18N-13 S-13 order_title·design_title 사전 등록 (consent.required 기등록 확인)');
assert(views.includes('text.S-12.memo_placeholder') && views.includes('text.S-13.order_title')
  && views.includes('text.S-13.design_title') && views.includes('msg.capture.no_server_upload'),
  'I18N-11~13 views today·treatment·capture 사전 참조');

(async () => {
  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const w = dom.window, d = w.document;
  await sleep(900);
  w.eval('A.chooseRole("patient")');
  await sleep(400);
  const ag = d.getElementById('agreeRow'); ag && ag.click(); await sleep(150);
  const ab = d.getElementById('agreeBtn'); ab && ab.click(); await sleep(600);
  w.eval('A.go("today")');
  await sleep(600);
  const memo = d.getElementById('tmMemo');
  assert(!!memo && memo.getAttribute('placeholder') === '특이사항' && memo.getAttribute('maxlength') === '60',
    'I18N-11 today 메모 placeholder 문구 불변 (사전 값 = 렌더)');
  const cam = d.getElementById('tdCam'); cam && cam.click(); await sleep(500);
  let t = d.body.textContent.replace(/\s+/g, ' ');
  assert(t.includes('서버 업로드 없음 — 기기 저장만') && t.includes('비진단 참고 정보'),
    'I18N-12 캡처 모달 서버 업로드 없음 고지 표시 (NG-5)');
  w.eval('A.closeModal()'); await sleep(200);
  w.eval('A.chooseRole("staff")');
  await sleep(400);
  const ag2 = d.getElementById('agreeRow'); ag2 && ag2.click(); await sleep(150);
  const ab2 = d.getElementById('agreeBtn'); ab2 && ab2.click(); await sleep(600);
  w.eval('A.go("treatment")');
  await sleep(600);
  t = d.body.textContent.replace(/\s+/g, ' ');
  assert(t.includes('OrderInfo') && t.includes('주문 정보') && t.includes('진료 — Order·Scan·Design'),
    'I18N-13 treatment Order 제목 문구 불변 (사전 값 = 렌더)');
  assert(errors.length === 0, 'I18N 런타임 오류 0' + (errors.length ? ' → ' + errors.join('|') : ''));
  dom.window.close();

  assert(bundleBytes <= 283000 && previewBytes <= 130000,
    'EX-01 번들 ' + bundleBytes + 'B ≤ 283,000B · 프리뷰 ' + previewBytes + 'B ≤ 130,000B');
  console.log(`\nTOTAL: ${passed} passed / ${failed} failed`);
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
