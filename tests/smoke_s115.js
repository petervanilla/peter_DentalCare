#!/usr/bin/env node
/* S115 스모크 — 영어 번역본 (AC-116 · PRD §19 T-07 · F-24 · Q-03 확정 en):
   L10N-01 영어 사전이 S-01~S-03 키와 공통 비진단 고지를 제공
   L10N-02 언어 설정에서 한국어/English 선택·기기 저장·재렌더
   L10N-03 없는 키는 한국어 폴백·기본값 한국어
   EX-01 번들 ≤283,000B
   실행: cd /home/user/tests && node smoke_s115.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const BUNDLE = fs.readFileSync(path.join(root, '미리미소-웹앱.html'), 'utf8');
const bundleBytes = fs.statSync(path.join(root, '미리미소-웹앱.html')).size;
const appSrc = fs.readFileSync(path.join(root, 'mirimiso-webapp', 'js', 'app.js'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'mirimiso-webapp', 'js', 'i18n.js'), 'utf8'), sandbox);
const MM = sandbox.window.MM;
assert(MM.lang === 'ko' && MM.t('text.S-01.title') === '치과 상담, 미리 준비하고 오세요',
  'L10N-03 기본값 한국어');
MM.setLang('en');
assert(MM.t('text.S-01.title') === 'Prepare for your dental visit in advance'
  && MM.t('text.S-01.role_patient') === 'Patient mode'
  && MM.t('text.S-02.quick_sim') === 'Smile simulation'
  && MM.t('text.S-03.run') === 'Start AI simulation',
  'L10N-01 영어 사전 S-01~S-03 키 제공');
assert(MM.LOCALES.en.text['S-01'] && Object.keys(MM.LOCALES.en.text['S-01']).length === 23
  && Object.keys(MM.LOCALES.en.text['S-02']).length === 6
  && Object.keys(MM.LOCALES.en.text['S-03']).length === 10,
  'L10N-01 영어 키 커버리지 S-01 23·S-02 6·S-03 10');
assert(MM.t('msg.legal.non_diagnosis').startsWith('Smile Dental is not a medical device'),
  'L10N-01 공통 비진단 고지 영어 제공');
assert(MM.t('msg.consent.signer_empty') === '서명자 성명을 입력하세요 (데모)',
  'L10N-03 미번역 키 한국어 폴백 (consent.required는 S120에서 번역됨)');
MM.setLang('ko');
assert(MM.t('text.S-03.run') === 'AI 시뮬레이션 시작', 'L10N-02 한국어 복귀');
assert(appSrc.includes('id="pfLang"') && appSrc.includes('data-lang') && appSrc.includes('setLang'),
  'L10N-02 설정 모달 언어 선택 UI (한국어/English)');

(async () => {
  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const w = dom.window, d = w.document;
  await sleep(900);
  assert(d.body.textContent.includes('치과 상담, 미리 준비하고 오세요'), 'L10N-03 초기 렌더 한국어');
  const setBtn = d.getElementById('setBtn'); setBtn && setBtn.click(); await sleep(300);
  const enBtn = d.querySelector('#pfLang [data-lang="en"]');
  assert(!!enBtn, 'L10N-02 English 버튼 표시');
  enBtn && enBtn.click(); await sleep(500);
  assert(w.localStorage.MM_LANG === 'en' && d.body.textContent.includes('Prepare for your dental visit in advance'),
    'L10N-02 English 선택 — 기기 저장·재렌더');
  const setBtn2 = d.getElementById('setBtn'); setBtn2 && setBtn2.click(); await sleep(300);
  const koBtn = d.querySelector('#pfLang [data-lang="ko"]');
  koBtn && koBtn.click(); await sleep(500);
  assert(w.localStorage.MM_LANG === 'ko' && d.body.textContent.includes('치과 상담, 미리 준비하고 오세요'),
    'L10N-02 한국어 선택 — 저장·재렌더');
  assert(errors.length === 0, 'L10N 런타임 오류 0' + (errors.length ? ' → ' + errors.join('|') : ''));
  dom.window.close();

  assert(bundleBytes <= 283000, 'EX-01 번들 ' + bundleBytes + 'B ≤ 283,000B');
  console.log(`\nTOTAL: ${passed} passed / ${failed} failed`);
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
