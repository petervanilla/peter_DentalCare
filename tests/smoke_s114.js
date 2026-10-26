#!/usr/bin/env node
/* S114 스모크 — 밀링 현황(기공소 수동 입력) (AC-115 · PRD §19 T-06 · F-23 · Q-04 확정):
   MILL-01 기공소 케이스에 밀링 현황 5단계·현재 단계·수동 입력 출처 표시 (장비 실측 아님)
   MILL-02 다음 단계로만 전진, 제작 시작=설계·완료 보고=완료 연결
   MILL-03 서버 전이 검증(역행·건너뜀·완료 직접 전이 거부)과 기공소 큐 단계 표시
   EX-01 번들 ≤283,000B
   실행: cd /home/user/tests && node smoke_s114.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { createApp } = require('/home/user/mirimiso-webapp/server/server.js');

const root = path.join(__dirname, '..');
const BUNDLE = fs.readFileSync(path.join(root, '미리미소-웹앱.html'), 'utf8');
const bundleBytes = fs.statSync(path.join(root, '미리미소-웹앱.html')).size;
const casehub = fs.readFileSync(path.join(root, 'mirimiso-webapp', 'js', 'casehub.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(root, 'mirimiso-webapp', 'server', 'server.js'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

(async () => {
  /* 정적 계약 */
  assert(casehub.includes('millingStage:"밀링"') && casehub.includes('millingStage:"접수"') && casehub.includes('millingStage:"완료"')
    && casehub.includes('var MS=["접수","설계","밀링","후가공","완료"]'),
    'MILL-01 시드 단계 (C-2601 밀링 · C-2604 접수 · C-2605 완료) · 5단계 정의');
  assert(serverSrc.includes("act === 'milling'") && serverSrc.includes('다음 단계로만 전진')
    && serverSrc.includes("version: 'S114'"),
    'MILL-03 서버 milling 액션·전이 검증·version S114');

  /* 서버 전이 검증 */
  const srv = createApp().listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const J = async (m, p, b) => {
    const r = await fetch(base + p, { method: m, headers: b ? { 'Content-Type': 'application/json' } : undefined, body: b ? JSON.stringify(b) : undefined });
    return { s: r.status, j: await r.json().catch(() => ({})) };
  };
  const lab = await J('GET', '/api/cases?role=lab');
  const c1 = lab.j.cases.find(c => c.id === 'C-2601');
  assert(lab.s === 200 && c1 && c1.millingStage === '밀링', 'MILL-03 서버 시드 밀링 단계 로드 (C-2601=밀링)');
  let r = await J('POST', '/api/cases/C-2601/lab-actions', { role: 'lab', action: 'milling', stage: '설계' });
  assert(r.s === 409, 'MILL-03 역행 거부 (밀링→설계 409)');
  r = await J('POST', '/api/cases/C-2601/lab-actions', { role: 'lab', action: 'milling', stage: '완료' });
  assert(r.s === 409, 'MILL-03 완료 직접 전이 거부 (완료 보고로만)');
  r = await J('POST', '/api/cases/C-2601/lab-actions', { role: 'clinic', action: 'milling', stage: '후가공' });
  assert(r.s === 403, 'MILL-03 clinic 역할 milling 거부 (403)');
  r = await J('POST', '/api/cases/C-2601/lab-actions', { role: 'lab', action: 'milling', stage: '후가공' });
  assert(r.s === 200 && r.j.cases.find(c => c.id === 'C-2601').millingStage === '후가공',
    'MILL-02 다음 단계 전진 (밀링→후가공)');
  r = await J('POST', '/api/cases/C-2601/lab-actions', { role: 'lab', action: 'done' });
  assert(r.s === 200 && r.j.cases.find(c => c.id === 'C-2601').millingStage === '완료',
    'MILL-02 완료 보고 → 밀링 완료 연결');
  r = await J('POST', '/api/cases/C-2604/lab-actions', { role: 'lab', action: 'start' });
  assert(r.s === 200 && r.j.cases.find(c => c.id === 'C-2604').millingStage === '설계',
    'MILL-02 제작 시작 → 설계 단계 연결');
  if (srv.closeAllConnections) srv.closeAllConnections();
  await new Promise(res => srv.close(res));

  /* 번들 UI */
  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const w = dom.window, d = w.document;
  await sleep(900);
  d.querySelectorAll('.role-card')[2].click();
  await sleep(300);
  const ag = d.getElementById('agreeRow'); ag && ag.click(); await sleep(120);
  const ab = d.getElementById('agreeBtn'); ab && ab.click(); await sleep(600);
  let t = d.body.textContent.replace(/\s+/g, ' ');
  assert(t.includes('밀링 현황') && t.includes('기공소 수동 입력 · 장비 실측 아님') && t.includes('밀링 밀링'),
    'MILL-01 기공소 큐 — 밀링 현황·수동 입력 출처·단계 배지');
  const row = d.querySelector('[data-lc="C-2601"]'); row && row.click(); await sleep(500);
  t = d.body.textContent.replace(/\s+/g, ' ');
  assert(['접수', '설계', '밀링', '후가공', '완료'].every(x => t.includes(x)) && t.includes('현재 단계: 밀링')
    && !t.includes('회전수') || t.includes('장비 회전수·온도 같은 장비 실측값은 표시하지 않습니다'),
    'MILL-01 상세 5단계·현재 단계 표시 (실측값 미표시 고지)');
  assert(d.getElementById('lbMill') && d.getElementById('lbMill').textContent.includes('후가공'),
    'MILL-02 다음 단계 버튼 (밀링→후가공)');
  d.getElementById('lbMill').click(); await sleep(300);
  const c = w.MM.CASES_DATA.items.find(x => x.id === 'C-2601');
  assert(c.millingStage === '후가공', 'MILL-02 클라이언트 단계 전진 반영');
  assert(errors.length === 0, 'MILL 런타임 오류 0' + (errors.length ? ' → ' + errors.join('|') : ''));
  dom.window.close();

  assert(bundleBytes <= 283000, 'EX-01 번들 ' + bundleBytes + 'B ≤ 283,000B');
  console.log(`\nTOTAL: ${passed} passed / ${failed} failed`);
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
