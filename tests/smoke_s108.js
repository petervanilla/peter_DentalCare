#!/usr/bin/env node
/* S108 스모크 — PRD §19 T-01·T-02 이행 (AC-109: 기준선 고정 + S-01 현지화 키 이행):
   BL-01 이행 전 기준선 (회귀 1,595/0 · 번들 274,306B) — 작업명세 AC-109에 고정 기록
   I18N-01 키 사전: MM.t(키) 조회, 없는 키는 키 자체 반환 (누락 가시화)
   I18N-02 S-01 필수 키 (title·role_patient·role_staff·role_lab·preview_title·msg.consent.required)
           + 동의 모달 고지·공통 legal 문구가 사전 참조로 렌더된다
   I18N-03 이행 후 화면 문구 글자 단위 불변 (사전 값 = 렌더 텍스트)
   EX-01 번들 ≤283,000B (S108 상향 승인) · 헤드룸 ≥100B
   실행: cd /home/user/tests && node smoke_s108.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'mirimiso-webapp', 'index.html'), 'utf8');
const views = fs.readFileSync(path.join(root, 'mirimiso-webapp', 'js', 'views.js'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'mirimiso-webapp', 'js', 'app.js'), 'utf8');
const BUNDLE = fs.readFileSync(path.join(root, '미리미소-웹앱.html'), 'utf8');
const bundleBytes = fs.statSync(path.join(root, '미리미소-웹앱.html')).size;
const LIMIT = 283000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

/* I18N-01: 사전 단위 동작 */
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'mirimiso-webapp', 'js', 'i18n.js'), 'utf8'), sandbox);
const MM = sandbox.window.MM;
assert(!!MM && typeof MM.t === 'function' && MM.t('text.S-01.title') === '치과 상담, 미리 준비하고 오세요'
  && MM.t('없는.키.예시') === '없는.키.예시',
  'I18N-01 MM.t 조회 + 없는 키는 키 자체 반환');
const s01Keys = Object.keys(MM.STR.text['S-01']);
assert(s01Keys.length === 23 && MM.STR.msg.legal.non_diagnosis.includes('의료기기가 아니며')
  && MM.t('msg.consent.required') === '시작 전에 확인해 주세요',
  'I18N-01 사전 25키 (S-01 23 + msg 2)');

/* I18N-02: 필수 키·로드 순서·참조 */
assert(['text.S-01.title', 'text.S-01.role_patient', 'text.S-01.role_staff', 'text.S-01.role_lab',
  'text.S-01.preview_title', 'msg.consent.required'].every(k => MM.t(k) !== k),
  'I18N-02 S-01 필수 키 6종 사전 보유');
assert(index.indexOf('js/i18n.js') > -1 && index.indexOf('js/i18n.js') < index.indexOf('js/views.js')
  && views.includes("a.t('text.S-01.role_patient')") && views.includes("a.t('msg.legal.non_diagnosis')")
  && appJs.includes("MM.t('text.S-01.notice_patient')") && appJs.includes("MM.t('msg.consent.required')"),
  'I18N-02 i18n 선행 로드 + views·app 사전 참조');

(async () => {
  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const d = dom.window.document;
  const vis = () => { const c = d.body.cloneNode(true); c.querySelectorAll('script,style').forEach(e => e.remove()); return c.textContent.replace(/\s+/g, ' '); };
  await sleep(900);

  /* I18N-03: 역할 선택 화면 문구가 사전 값과 글자 단위로 동일 */
  const strip = s => s.replace(/<[^>]+>/g, '');
  const s01Text = ['🦷 스마일치과 공식 프리상담', '일반 환자 모드', '의료진 모드 (Clinic)', '기공소 모드 (Lab)',
    '미리미소 미리보기', '3분 소요', '환자 모드로 바로 시작하기', '입력한 사진은 저장·전송되지 않습니다'];
  const dictText = ['official_badge', 'role_patient', 'role_staff', 'role_lab', 'preview_title', 'preview_badge', 'start_patient', 'photo_note']
    .map(k => strip(MM.t('text.S-01.' + k)));
  assert(s01Text.every((t, i) => t === dictText[i]) && s01Text.every(t => vis().includes(t)) && vis().includes(strip(MM.t('msg.legal.non_diagnosis'))),
    'I18N-03 S-01 렌더 문구 = 사전 값 (법률 고지 포함)');

  /* I18N-02/03: 동의 모달 문구도 사전 경유 */
  d.querySelector('.role-card[data-role="patient"]').click();
  await sleep(300);
  assert(vis().includes(MM.t('msg.consent.required')) && vis().includes(strip(MM.t('text.S-01.notice_patient')))
    && vis().includes(MM.t('text.S-01.agree_text')),
    'I18N-02 동의 모달 고지·문구가 사전 값으로 표시');
  assert(errors.length === 0, 'I18N-03 런타임 오류 0');
  dom.window.close();

  assert(bundleBytes <= LIMIT && (LIMIT - bundleBytes) >= 100,
    'EX-01 번들 ' + bundleBytes + 'B ≤ 283,000B · 헤드룸 ' + (LIMIT - bundleBytes) + 'B');

  console.log(`\nTOTAL: ${passed} passed / ${failed} failed`);
})();
