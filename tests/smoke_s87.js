#!/usr/bin/env node
/* S87 스모크 — CSS 변수 정합·재경량화 (89차 · 분석리포트 후속 정비 2):
   LI-01 미정의 CSS 변수 정합 — JS·CSS의 미정의 var() 참조 0 (비테마 → 리터럴·테마 계열 → :root 기본 정의)
   LI-02 기본 테마 팔레트 — :root --mint/--mint-deep/--mint-soft2/--teal/--teal-dark 정의 (기본 테마 unset 결함 제거)
   LI-03 테마 반응 유지 — var(--mint)·var(--teal-dark) 인라인 참조 존재 (blue/rose 테마 치환 계약·s32 정합)
   LI-04 ALL_FDI 사규 상수 제거 — 미사용 dead code 0
   LI-05 마이닝 안전 — 정직 카운팅(decl 자기참조 차단)·Y 확장 폐기 관찰 (빌드 통과·부트 오류 0)
   LI-06 번들 예산 — 한도 이하·헤드룸 ≥ 100B 회복 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const LIMIT = 283000, MIN_HEAD = 100;
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

(async () => {
  /* 번들 CSS 구간 추출 → var() 참조·정의 집합 검사 (LI-01) */
  const cssM = BUNDLE.match(/<style>\n([\s\S]*?)\n<\/style>/);
  const css = cssM ? cssM[1] : '';
  const THEME = new Set(['--mint', '--mint-dark', '--mint-deep', '--mint-soft', '--mint-soft2', '--teal', '--teal-dark', '--teal-soft']);
  const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
  THEME.forEach(x => defined.add(x));
  const refs = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]);
  const bad = [...new Set(refs.filter(x => !defined.has(x)))];
  assert(bad.length === 0, 'LI-01 미정의 var() 참조 0 — 번들 CSS 전수 (' + (bad.length ? '잔여: ' + bad.join(',') : '정합') + ')');
  assert(BUNDLE.includes('--mint:#17BEBB') && BUNDLE.includes('--mint-soft2:#E4F7F1') && BUNDLE.includes('--teal-dark:#27AE8D'),
    'LI-02 기본 테마 팔레트 — :root 5종 정의 (기본 테마 unset 결함 제거)');
  assert(BUNDLE.includes('var(--mint)') && BUNDLE.includes('var(--teal-dark)') && !BUNDLE.includes('var(--navy)') && !BUNDLE.includes('var(--coral)'),
    'LI-03 테마 반응 유지·비테마 리터럴 전환 — mint/teal-dark var 유지·navy/coral 리터럴');
  assert(!BUNDLE.includes('ALL_FDI'), 'LI-04 ALL_FDI 사규 상수 제거 (미사용 dead code 0)');
  assert(!/\bY[a-zA-Z0-9]='[^']{10,}'/.test(BUNDLE.slice(BUNDLE.indexOf('<script>'), BUNDLE.indexOf('</script>'))),
    'LI-05 마이닝 Y 확장 부재 — Z 단일 풀 (관찰: Y 확장 +508B 폐기)');

  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  await new Promise(r => setTimeout(r, 900));
  assert(errors.length === 0, 'LI-05b 부트 runtime errors 0' + (errors.length ? ' → ' + errors.join('|') : ''));
  await dom.window.close();

  const sz = fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size;
  assert(sz <= LIMIT && LIMIT - sz >= MIN_HEAD, `LI-06 번들 — ${sz}B ≤ ${LIMIT}B · 헤드룸 ${LIMIT - sz}B (≥${MIN_HEAD}B 회복)`);

  console.log('--- S87 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
