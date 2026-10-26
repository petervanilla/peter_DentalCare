#!/usr/bin/env node
/* S105 스모크 — 전 화면 레이아웃 감찰 (420px 실브라우저 실측으로 검출된 결함 4건 고정):
   LO-01 모바일 최종 규칙이 css 파일 말미 @media(max-width:760px) 단일 블록에 존재
         (appbar wrap·stat-chips 2열·select max-width·staff-table keep-all)
   LO-02 말미 미디어가 base .stat-chips 규칙보다 뒤 (순서 역전으로 무효화됐던 원인 재발 방지)
   LO-03 치아 버튼 .tt 모바일 축소 규칙 존재
   LO-04 데스크톱 진료 3컬럼(.txg3) 가운데 열 minmax(0,1fr) — min-content 팽창으로 1280px에서 넘치던 결함 고정
   EX-01 죽은 규칙 제거 (.view animation fadein / @keyframes fadein 부재)
   EX-02 데모 리본 죽은 규칙 (.demo-ribbon{display:none}) 부재
   실행: cd /home/user/tests && node smoke_s105.js */
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'mirimiso-webapp', 'css', 'app.css'), 'utf8');
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

const tail = css.slice(-900);
assert(css.includes('@media(max-width:760px)') && tail.includes('@media(max-width:760px)')
  && ['.appbar{flex-wrap:wrap}', '.stat-chips{grid-template-columns:repeat(2,1fr)}', 'select{max-width:100%}', 'word-break:keep-all']
    .every(rule => tail.includes(rule)),
  'LO-01 모바일 최종 규칙 말미 미디어 존재');

const baseIdx = css.indexOf('.stat-chips{display:grid;grid-template-columns:repeat(4,1fr)');
const tailIdx = css.lastIndexOf('@media(max-width:760px)');
assert(baseIdx > 0 && tailIdx > baseIdx, 'LO-02 말미 미디어가 base 규칙보다 뒤 순서');

assert(tail.includes('.tt{width:20px;height:24px'), 'LO-03 치아 버튼 모바일 축소');

assert(css.includes('.txg3{display:grid;grid-template-columns:320px minmax(0,1fr) 330px'),
  'LO-04 데스크톱 진료 3컬럼 가운데 열 minmax(0,1fr)');

assert(!css.includes('.view{animation:fadein') && !css.includes('@keyframes fadein'), 'EX-01 죽은 fadein 규칙 부재');
assert((css.match(/\.demo-ribbon\{/g) || []).length === 1 && css.includes('}.demo-ribbon{display:none}'),
  'EX-02 데모 리본 숨김 규칙 단일·전역 유지 (다이어트로 베이스 규칙 소실 시 데스크톱 노출 회귀 방지)');

console.log(`\nTOTAL: ${passed} passed / ${failed} failed`);
