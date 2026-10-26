#!/usr/bin/env node
/* S113 스모크 — S-03 미소 시뮬레이션 문자열 키 이행 (AC-114 · PRD §19 T-02 3차 · F-20 · §9.4 · §26):
   I18N-07 S-03 필수 키 10종 사전 등록
   I18N-08 sim 렌더 8곳이 사전 참조로 렌더되고 기존 문구와 글자 단위 동일
   EX-01 번들 ≤283,000B · 헤드룸 ≥100B
   실행: cd /home/user/tests && node smoke_s113.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const views = fs.readFileSync(path.join(root, 'mirimiso-webapp', 'js', 'views.js'), 'utf8');
const BUNDLE = fs.readFileSync(path.join(root, '미리미소-웹앱.html'), 'utf8');
const bundleBytes = fs.statSync(path.join(root, '미리미소-웹앱.html')).size;
const LIMIT = 283000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'mirimiso-webapp', 'js', 'i18n.js'), 'utf8'), sandbox);
const MM = sandbox.window.MM;
const s03 = MM.STR.text['S-03'] || {};
const EXPECT = {
  step_upload: '1. 사진 업로드', step_select: '2. 시술 선택', step_preview: '3. AI 미리보기',
  title: '정면 미소 사진을 올려주세요', tips_title: '시뮬레이션 정확도를 높이는 3가지 팁',
  proc_title: '어떤 시술의 변화를 확인하고 싶으신가요?', run: 'AI 시뮬레이션 시작'
};
assert(Object.keys(s03).length === 10
  && Object.keys(EXPECT).every(k => s03[k] === EXPECT[k])
  && s03.intro.includes('미리미소 AI 엔진') && s03.tips.includes('30~40cm') && s03.proc_desc.includes('복수 선택 가능'),
  'I18N-07 S-03 필수 키 10종 사전 등록 (PRD §26)');
assert(Object.keys(MM.STR.text['S-01']).length === 23 && Object.keys(MM.STR.text['S-02']).length === 6,
  'I18N-07 S-01 23키·S-02 6키 유지 (누적 이행)');
assert(['step_upload', 'step_select', 'step_preview', 'title', 'intro', 'tips_title', 'tips', 'proc_title', 'proc_desc', 'run']
  .filter(k => views.includes("a.t('text.S-03." + k + "')")).length >= 8,
  'I18N-08 views sim이 S-03 키를 사전 참조 (8곳 이상)');

(async () => {
  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const w = dom.window, d = w.document;
  await sleep(900);
  w.eval('A.chooseRole("patient")');
  await sleep(400);
  const ag = d.getElementById('agreeRow'); ag && ag.click(); await sleep(150);
  const ab = d.getElementById('agreeBtn'); ab && ab.click(); await sleep(600);
  w.eval('A.go("sim")');
  await sleep(700);
  const t = d.body.textContent.replace(/\s+/g, ' ');
  assert(['1. 사진 업로드', '2. 시술 선택', '3. AI 미리보기', '정면 미소 사진을 올려주세요',
    '시뮬레이션 정확도를 높이는 3가지 팁', '어떤 시술의 변화를 확인하고 싶으신가요?', 'AI 시뮬레이션 시작']
    .every(x => t.includes(x)), 'I18N-08 sim 문구 불변 (사전 값 = 렌더)');
  assert(errors.length === 0, 'I18N-08 런타임 오류 0' + (errors.length ? ' → ' + errors.join('|') : ''));
  dom.window.close();

  assert(bundleBytes <= LIMIT && (LIMIT - bundleBytes) >= 100,
    'EX-01 번들 ' + bundleBytes + 'B ≤ 283,000B · 헤드룸 ' + (LIMIT - bundleBytes) + 'B');
  console.log(`\nTOTAL: ${passed} passed / ${failed} failed`);
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
