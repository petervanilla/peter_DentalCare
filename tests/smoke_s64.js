#!/usr/bin/env node
/* S64 스모크 — 인쇄 일 상세 표: 완주 리포트에 기간 내 매일 6그룹·점수·캡처 표 (기기 로컬 데이터 · 비진단)
   단정 원칙: 일 상세 표는 MM_TODAY_LOG_V1·MM_CAP_V1 기기 로컬 열람만 · 기존 리포트 계약(히트맵·SMILE30) 유지 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); } }
const iso = t => new Date(Date.now() - t * 864e5).toISOString().slice(0, 10);
const wk = ds => '일월화수목금토'[new Date(ds).getUTCDay()];

(async () => {
  let printed = null;
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/',
    beforeParse(w) { w.scrollTo = () => {}; w.open = function () { return { document: { write: h => { printed = h; }, close() {}, focus() {} } }; }; } });
  const w = dom.window, d = w.document;
  await sleep(900);
  await sleep(300);
  Array.from(d.querySelectorAll('button')).find(x => x.textContent.includes('일반 환자 모드')).click();
  await sleep(300);
  d.getElementById('agreeRow').click();
  d.getElementById('agreeBtn').click();
  await sleep(700);
  d.getElementById('pfoot').children[3].click();
  await sleep(400);
  const dR = iso(40), dC = iso(25), dB = iso(3);
  w.MM.todaySave({ d: dR, pain: 1, swell: 0, bleed: 0, chew: 0, brush: 1, vice: 0, m: '' });
  w.MM.capSave({ d: dC, p: 1, a: '정면', q: 'A', b: 140, s: 12, f: 15 });
  w.MM.todaySave({ d: dB, pain: 2, swell: 0, bleed: 1, chew: 0, brush: 1, vice: 0, m: '컨디션 좋음' });
  w.MM.capSave({ d: dB, p: 1, a: '좌측', q: 'B', b: 130, s: 10, f: 18 });
  w.MM.capSave({ d: dB, p: 1, a: '우측', q: 'C', b: 120, s: 8, f: 21 });

  /* A. MM.dayRows — 표 구조 (PT-01·02) */
  const rows = w.MM.dayRows(dR, dB);
  const days = Math.round((new Date(dB) - new Date(dR)) / 864e5);
  assert(rows.startsWith('<table><tr><th>날짜</th><th>통증</th><th>부음</th><th>출혈</th><th>씹기</th><th>양치</th><th>흡연</th><th>점수</th><th>캡처</th>'), '일 상세 표 — 9열 헤더 (PT-01)');
  assert((rows.match(/<tr>/g) || []).length === days + 2, '기간 내 매일 1행 — ' + days + '일 + 헤더 (PT-02)');
  assert(rows.includes(dR.slice(5) + ' (' + wk(dR) + ')</td><td>약</td><td>없</td><td>없</td><td>편</td><td>실</td><td>없</td><td>1/6'), '기록 행 — 축약 표기(없/약/심·편/불·미/실)·점수 1/6 (PT-03)');
  assert(rows.includes(dB.slice(5) + ' (' + wk(dB) + ')</td><td>심</td><td>없</td><td>있</td><td>편</td><td>실</td><td>없</td><td>4/6</td><td>2건'), '캡처 병행 행 — 점수 4/6·캡처 2건 (PT-01)');
  assert(rows.includes('</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>'), '기록 없는 날 — 전 열 — (PT-03)');
  assert(rows.includes('</td><td>—</td>' + ''.padEnd(0) + '<td>1건</td>') || /<\/td><td>—<\/td><td>—<\/td><td>—<\/td><td>—<\/td><td>—<\/td><td>—<\/td><td>—<\/td><td>1건<\/td>/.test(rows), '캡처만 있는 날 — 기록 —·캡처 1건 (PT-01)');

  /* B. 인쇄 연계 — 표 삽입·기존 계약 유지 (PT-04) */
  w.MM.capRepModal(w.MM.capLogs());
  await sleep(300);
  printed = null;
  d.getElementById('modalBody').querySelector('#cpPr').click();
  await sleep(300);
  assert(!!printed && printed.includes('30일 캡처 퀘스트 완주 리포트'), '인쇄 — 리포트 제목 유지 (RP-02 회귀)');
  assert(printed.includes('<p class="pmeta">일 상세 표 — 기기 로컬 기록(비진단)</p>') && printed.includes('<table><tr><th>날짜</th>'), '인쇄 — 일 상세 표·비진단 캡션 (PT-04)');
  assert(printed.includes('히트맵 — 기기 로컬 기록(비진단)') && printed.includes('SMILE30'), '인쇄 — 히트맵·SMILE30 계약 유지 (HM-04·RP-04 회귀)');
  assert(printed.includes('진단·처방을 대체하지'), '인쇄 — 기본 면책 유지 (회귀)');

  /* C. 예산 */
  assert(fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size <= 283000, '번들 예산 — 276KiB 이하 (' + fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size + 'B)');

  console.log('--- S64 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
