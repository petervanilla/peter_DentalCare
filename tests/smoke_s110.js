#!/usr/bin/env node
/* S110 스모크 — 스캔 스테이션 안내 고도화 (AC-111 · PRD §19 T-04 · F-22 · S-16):
   ST-01 S-16에 스캔 스테이션 안내(팁 각도·결손 표시·재스캔) 섹션 표시
   ST-02 '데모 표시 — 실측 아님' 명시 · 측정 수치(각도·거리) 미표기
   ST-03 기존 워크플로·비진단 고지 유지
   EX-01 번들 ≤283,000B · 헤드룸 ≥100B
   실행: cd /home/user/tests && node smoke_s110.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const BUNDLE = fs.readFileSync(path.join(root, '미리미소-웹앱.html'), 'utf8');
const bundleBytes = fs.statSync(path.join(root, '미리미소-웹앱.html')).size;
const LIMIT = 283000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

(async () => {
  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const w = dom.window, d = w.document;
  await sleep(900);
  w.eval('A.chooseRole("staff")');
  await sleep(400);
  const ag = d.getElementById('agreeRow'); ag && ag.click(); await sleep(150);
  const ab = d.getElementById('agreeBtn'); ab && ab.click(); await sleep(600);
  w.eval('A.go("scannerInfo")');
  await sleep(700);
  const vis = () => { const c = d.body.cloneNode(true); c.querySelectorAll('script,style').forEach(e => e.remove()); return c.textContent.replace(/\s+/g, ' '); };
  const t = vis();
  const sec = t.slice(t.indexOf('스캔 스테이션 안내'), t.indexOf('스캔 스테이션 안내') + 420);
  assert(t.includes('스캔 스테이션 안내') && sec.includes('팁 각도') && sec.includes('결손 표시') && sec.includes('재스캔'),
    'ST-01 스테이션 안내 섹션 (팁 각도·결손 표시·재스캔)');
  assert(sec.includes('데모 표시') && sec.includes('실제 측정값이 아닙니다') && !/\d+\s*(도|°|mm|cm)/.test(sec),
    'ST-02 데모 표시 명시 · 각도/거리 측정 수치 없음');
  assert(t.includes('병원 스캐너(TRIOS·Medit 등)로 구강 스캔 후 STL로 내보냅니다.')
    && t.includes('진단·처방은 치과의사만 수행할 수 있습니다'),
    'ST-03 워크플로·비진단 고지 유지');
  assert(errors.length === 0, 'ST-03 런타임 오류 0');
  dom.window.close();

  assert(bundleBytes <= LIMIT && (LIMIT - bundleBytes) >= 100,
    'EX-01 번들 ' + bundleBytes + 'B ≤ 283,000B · 헤드룸 ' + (LIMIT - bundleBytes) + 'B');
  console.log(`\nTOTAL: ${passed} passed / ${failed} failed`);
})();
