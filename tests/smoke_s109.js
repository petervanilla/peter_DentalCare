#!/usr/bin/env node
/* S109 스모크 — 에러 키 통일 1차 (AC-110 · PRD §19 T-03 · F-21 · §10.2):
   ERR-01 §10.2 메시지 키가 사전에 등록된다 (msg.* 13키)
   ERR-02 서버 로그인·세션 에러 응답에 code(error.*) 병기 + version S114
   ERR-03 핵심 발생 지점이 사전 문구로 표시된다 (todaySave 61자 거부 포함)
   ERR-04 화면에 error 키 문자열 자체가 노출되지 않는다
   EX-01 번들 ≤283,000B · 헤드룸 ≥100B
   실행: cd /home/user/tests && node smoke_s109.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(root, f), 'utf8');
const i18n = R('mirimiso-webapp/js/i18n.js'), api = R('mirimiso-webapp/js/api.js'),
  appJs = R('mirimiso-webapp/js/app.js'), views = R('mirimiso-webapp/js/views.js'),
  hub = R('mirimiso-webapp/js/casehub.js'), server = R('mirimiso-webapp/server/server.js');
const BUNDLE = R('미리미소-웹앱.html');
const bundleBytes = fs.statSync(path.join(root, '미리미소-웹앱.html')).size;
const LIMIT = 283000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(i18n, sandbox);
const MM = sandbox.window.MM;
const MSG_KEYS = ['msg.auth.code_invalid', 'msg.auth.code_revoked', 'msg.auth.session_expired',
  'msg.consent.required', 'msg.consent.signer_empty', 'msg.sync.offline', 'msg.sync.conflict',
  'msg.storage.full', 'msg.file.parse_failed', 'msg.capture.quality_low',
  'msg.validation.memo_too_long', 'msg.server.unavailable', 'msg.legal.non_diagnosis'];
assert(MSG_KEYS.every(k => MM.t(k) !== k), 'ERR-01 §10.2 메시지 키 12종 + legal 사전 등록');

assert(server.includes("code: 'error.auth.code_invalid'") && server.includes("code: 'error.auth.code_revoked'")
  && server.includes("code: 'error.auth.session_expired'") && server.includes("version: 'S114'"),
  'ERR-02 서버 code 병기 (auth 3종) · version S114');

assert(api.includes('i.code=t&&t.code') && api.includes('t.t("msg.sync.conflict")') && api.includes('t.t("msg.sync.offline")')
  && api.includes('t.t("msg.storage.full")') && appJs.includes('o.t("msg.auth.session_expired")')
  && views.includes('t.code.replace("error.","msg.")') && views.includes('a.t("msg.file.parse_failed")')
  && hub.includes('E.t("msg.consent.signer_empty")'),
  'ERR-03 발생 지점 8곳 사전 참조 (api·app·views·casehub)');

(async () => {
  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const w = dom.window, d = w.document;
  await sleep(900);
  /* 메모 61자: 저장 거부 + 안내 (PRD AC-04 방향) */
  const before = w.MM.todayLogs().length;
  const res = w.MM.todaySave({ d: '2026-10-25', pain: 0, swell: 0, bleed: 0, chew: 0, brush: 0, vice: 0, m: '가'.repeat(61) });
  assert(res === false && w.MM.todayLogs().length === before
    && d.body.textContent.includes(w.MM.t('msg.validation.memo_too_long')),
    'ERR-03 메모 61자 — 저장 거부 + msg.validation.memo_too_long 안내');
  /* 화면에 error 키 노출 없음 */
  const vis = () => { const c = d.body.cloneNode(true); c.querySelectorAll('script,style').forEach(e => e.remove()); return c.textContent; };
  assert(!/error\.(auth|sync|file|consent)\./.test(vis()), 'ERR-04 화면에 error 키 문자열 미노출');
  assert(errors.length === 0, 'ERR-04 런타임 오류 0');
  dom.window.close();

  assert(bundleBytes <= LIMIT && (LIMIT - bundleBytes) >= 100,
    'EX-01 번들 ' + bundleBytes + 'B ≤ 283,000B · 헤드룸 ' + (LIMIT - bundleBytes) + 'B');
  console.log(`\nTOTAL: ${passed} passed / ${failed} failed`);
})();
