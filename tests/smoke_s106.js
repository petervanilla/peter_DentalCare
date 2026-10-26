#!/usr/bin/env node
/* S106 스모크 — 디자인 일관성 개선 (AC-107: hover·폰트·대비·간격):
   HV-01 hover 가능 환경에서 버튼 계열색 피드백 (@media hover — .btn 명도 + 카드형 버튼 민트 틴트)
   FT-01 폰트 스택 통일 (본문 -apple-system 포함 디자인.md §2 스택 · 인쇄 리포트 동일 스택)
   CT-01 밝은/그레이 배경 위 흰 글자 제거 (pl-step·pstep·cst·fdi·qc·disabled — 토큰 텍스트색)
   SP-01 텍스트-버튼 간격 (.card>.btn margin-top 12px — 미리보기 #pvGo 실측 12px)
   EX-01 번들 예산 (≤283,000B · 헤드룸 ≥100B)
   실행: cd /home/user/tests && node smoke_s106.js */
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'mirimiso-webapp', 'css', 'app.css'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'mirimiso-webapp', 'js', 'app.js'), 'utf8');
const bundle = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const bundleBytes = fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size;
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

assert(css.includes('@media(hover:hover){.btn:hover{filter:brightness(.94)}')
  && css.includes('.role-card:hover,.chip:hover,.slot:hover,.case-row:hover{background:var(--z);border-color:var(--l)}'),
  'HV-01 버튼 hover 계열색 (@media hover)');

assert(css.includes('font-family:-apple-system,"Segoe UI",Roboto,"Noto Sans KR","Malgun Gothic",sans-serif')
  && appJs.includes('body{font-family:"Segoe UI",Roboto,"Noto Sans KR","Malgun Gothic",sans-serif;')
  && appJs.includes('font:13px/1.7 "Segoe UI",Roboto,"Noto Sans KR","Malgun Gothic",sans-serif;')
  && !appJs.includes('Apple SD Gothic Neo'),
  'FT-01 폰트 스택 통일 (본문·인쇄)');

assert(css.includes('background:#E3E8EE;color:var(--o)')
  && css.includes('.pl-step.done i{background:var(--t);color:var(--q)}')
  && css.includes('.pl-step.cur i{background:var(--m);color:#fff}')
  && css.includes('.cst.on{background:var(--l);color:var(--q)}')
  && css.includes('.fdi-cell.implant{background:var(--l);border-color:var(--a2);color:var(--q)}')
  && css.includes('justify-content:center;background:var(--j);color:var(--c);font-size:11px}')
  && css.includes('.btn.primary:disabled{background:#CFE5DE;color:var(--c);cursor:not-allowed}'),
  'CT-01 밝은 배경 흰 글자 제거 (토큰 텍스트색)');

assert(css.includes('.card>.btn{margin-top:12px}'), 'SP-01 카드 내 텍스트-버튼 간격 12px');

assert(bundleBytes <= 283000 && (283000 - bundleBytes) >= 100 && bundle.includes('brightness(.94)'),
  'EX-01 번들 ' + bundleBytes + 'B ≤ 283,000B · 헤드룸 ' + (283000 - bundleBytes) + 'B');

console.log(`\nTOTAL: ${passed} passed / ${failed} failed`);
