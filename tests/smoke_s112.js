#!/usr/bin/env node
/* S112 스모크 — S-02 문자열 키 이행 (AC-113 · PRD §19 T-02 2차 · F-20 · §9.4 · §26 보강 표):
   I18N-04 S-02 필수 키 6종 (greeting·quick_sim·quick_records·quick_report·quick_care·quick_today) 사전 등록
   I18N-05 환자 홈 빠른 메뉴 5종이 사전 참조로 렌더되고 문구가 기존과 글자 단위로 동일
   I18N-06 인사말 이름 치환({name})이 기존 인사와 동일하게 표시
   EX-01 번들 ≤283,000B · 헤드룸 ≥100B
   실행: cd /home/user/tests && node smoke_s112.js */
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

/* I18N-04: 사전 등록 */
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'mirimiso-webapp', 'js', 'i18n.js'), 'utf8'), sandbox);
const MM = sandbox.window.MM;
const s02 = MM.STR.text['S-02'] || {};
assert(Object.keys(s02).length === 6
  && MM.t('text.S-02.quick_sim') === '미소 시뮬레이션'
  && MM.t('text.S-02.quick_records') === '스캔 기록'
  && MM.t('text.S-02.quick_report') === '상담 리포트'
  && MM.t('text.S-02.quick_care') === '치료 후 관리'
  && MM.t('text.S-02.quick_today') === '오늘의 관리'
  && MM.t('text.S-02.greeting').includes('{name}'),
  'I18N-04 S-02 필수 키 6종 사전 등록 (PRD §26)');
assert(Object.keys(MM.STR.text['S-01']).length === 23, 'I18N-04 S-01 사전 23키 유지 (누적 이행)');
assert(['quick_sim', 'quick_records', 'quick_report', 'quick_care', 'quick_today', 'greeting']
  .every(k => views.includes("a.t('text.S-02." + k + "')")),
  'I18N-05 views 홈이 S-02 키 6종을 사전 참조');

(async () => {
  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const w = dom.window, d = w.document;
  await sleep(900);
  w.eval('A.chooseRole("patient")');
  await sleep(400);
  const ag = d.getElementById('agreeRow'); ag && ag.click(); await sleep(150);
  const ab = d.getElementById('agreeBtn'); ab && ab.click(); await sleep(600);
  w.eval('A.go("home")');
  await sleep(700);
  const vis = () => { const c = d.body.cloneNode(true); c.querySelectorAll('script,style').forEach(e => e.remove()); return c.textContent.replace(/\s+/g, ' '); };
  const t = vis();
  const grid = d.getElementById('homeQuickGrid');
  const gridT = grid ? grid.textContent.replace(/\s+/g, ' ') : '';
  assert(['미소 시뮬레이션', '스캔 기록', '상담 리포트', '치료 후 관리', '오늘의 관리'].every(x => gridT.includes(x)),
    'I18N-05 빠른 메뉴 5종 문구 불변 (사전 값 = 렌더)');
  const greetRendered = MM.t('text.S-02.greeting').replace('{name}', '게스트').replace(/<[^>]+>/g, '');
  assert(t.includes(greetRendered) && t.includes('안녕하세요, 게스트님') && t.includes('오늘도 내 미소를 미리 봐요'),
    'I18N-06 인사말 {name} 치환 — 기존 인사와 동일 표시');
  assert(errors.length === 0, 'I18N-05 런타임 오류 0' + (errors.length ? ' → ' + errors.join('|') : ''));
  dom.window.close();

  assert(bundleBytes <= LIMIT && (LIMIT - bundleBytes) >= 100,
    'EX-01 번들 ' + bundleBytes + 'B ≤ 283,000B · 헤드룸 ' + (LIMIT - bundleBytes) + 'B');
  console.log(`\nTOTAL: ${passed} passed / ${failed} failed`);
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
