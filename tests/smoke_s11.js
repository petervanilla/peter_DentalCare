/* smoke_s11.js — S11 스모크: 스캔 세션(G3 재스캔 이력)·세션 비교 분석(추이)·서버 세션 API
   실행: cd /home/user/tests && node smoke_s11.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');

const html = fs.readFileSync('/home/user/미리미소-웹앱.html', 'utf8');
const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://demo.local/',
  beforeParse(window) {
    window.addEventListener('error', e => errors.push('onerror: ' + e.message));
  }
});
const { window } = dom;
const { document } = window;

let pass = 0, fail = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg);
  cond ? pass++ : (fail++, process.exitCode = 1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await sleep(400);
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const A = window.MM.Analysis, D3 = window.Dental3D;

  /* A. 순수 함수 — 세션 변형·비교 */
  assert(errors.length === 0, 'boot: no errors');
  assert(typeof A.scaleScenes === 'function' && typeof A.compareStats === 'function', 'S11 함수 등록 (scaleScenes·compareStats)');
  const base = [D3.buildArch('lower', {}, []), D3.buildArch('upper', {}, [])];
  const st1 = A.statsFromScenes(base);
  const scaled = A.scaleScenes(base, 1.03);
  const st2 = A.statsFromScenes(scaled);
  assert(A.statsFromScenes(base).areaMm2 === st1.areaMm2 && scaled[0].verts.length === base[0].verts.length, 'scaleScenes: 원본 비변경·구조 보존');
  const ratio = st2.areaMm2 / st1.areaMm2;
  assert(Math.abs(ratio - 1.0609) < 0.001, 'scaleScenes: 면적 비 f² (' + ratio.toFixed(4) + ' ≈ 1.0609)');
  const d = A.compareStats(st1, st2);
  assert(d.areaPct === 6.1 && d.volumePct === 9.3 && d.triDelta === 0, 'compareStats: +6.1% · +9.3% · tri Δ0');

  /* B. UI — C-2605 (세션 2건) 비교 분석 */
  $$('.role-card')[1].click();
  if ($('#agreeRow')) { $('#agreeRow').click(); $('#agreeBtn').click(); }
  $('#goCaseHub').click();
  window.MM.app.state.caseId = 'C-2605';
  window.MM.app.go('caseDetail');
  $$('#cdTabs button')[1].click();
  await sleep(30);
  const sessRows = $$('#cdSessions .file-row').length;
  assert(sessRows === 2, 'C-2605 세션 2건 표시 (1차 기준 + 2차 재스캔)');
  assert(document.body.textContent.includes('emergence profile'), '세션 노트: emergence profile');
  assert($('#ssCompare'), '세션 2건 → 비교 버튼');
  $('#ssCompare').click();
  await sleep(30);
  const mb = document.querySelector('#modalBody').textContent;
  assert($('#modalOverlay').classList.contains('show') && mb.includes('비진단'), '비교 모달 + 비진단 배지');
  assert(mb.includes('+6.1%') && mb.includes('+9.3%'), '델타: 표면적 +6.1% · 부피 +9.3% (실계산)');
  assert(mb.includes('시뮬레이션') && mb.includes('담당 치과의사'), '고지: 데모 변형 시뮬레이션·판단 주체');
  $('#ssCmpClose').click();

  /* C. UI — C-2601 세션 등록 (오프라인 로컬) */
  window.MM.app.state.caseId = 'C-2601';
  window.MM.app.go('caseDetail');
  $$('#cdTabs button')[1].click();
  await sleep(30);
  assert($$('#cdSessions .file-row').length === 1 && $('#ssAdd'), 'C-2601 세션 1건 + 등록 버튼');
  $('#ssAdd').click();
  await sleep(30);
  assert($('#toast').textContent.includes('스캔 세션 등록'), '등록 토스트');
  const c1 = window.MM.CASES_DATA.items.find(c => c.id === 'C-2601');
  assert(c1.scanSessions.length === 2 && c1.history[0].t.includes('스캔 세션 등록'), '로컬 세션 추가 + 히스토리');
  window.MM.app.state.caseId = 'C-2601';
  window.MM.app.go('caseDetail');
  $$('#cdTabs button')[1].click();
  await sleep(30);
  assert($$('#cdSessions .file-row').length === 2 && $('#ssCompare'), '재진입: 세션 2건 → 비교 버튼 활성');
  await window.MM.Api.push({ type: 'session', caseId: 'C-2601', session: c1.scanSessions[1] });
  assert(window.MM.Api.localAudit.some(a => a.act === 'session'), '오프라인 push → 세션 감사로그 (act=session)');

  /* D. 허브 지표에 세션 칩 */
  window.MM.app.go('caseHub');
  await sleep(30);
  assert($('#mxBody') && $('#mxBody').textContent.includes('스캔 세션'), '운영 지표: 스캔 세션 칩');
  assert($('#mxMode').textContent.includes('로컬 계량'), '오프라인 로컬 계량');

  console.log('--- S11 client smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');

  /* E. 서버 — 세션 API·시드·메트릭 */
  const { createApp } = require('/home/user/mirimiso-webapp/server/server.js');
  const server = createApp().listen(0, '127.0.0.1');
  await sleep(150);
  const baseUrl = 'http://127.0.0.1:' + server.address().port;
  const api = (m, p, b) => fetch(baseUrl + p, { method: m, headers: b ? { 'Content-Type': 'application/json' } : undefined, body: b ? JSON.stringify(b) : undefined });
  const J = async (m, p, b) => await (await api(m, p, b)).json();

  const c2605 = await J('GET', '/api/cases/C-2605?role=clinic');
  assert(c2605.case.scanSessions && c2605.case.scanSessions.length === 2, '시드: C-2605 세션 2건 (vm 로드 단일 출처)');
  let mx = await J('GET', '/api/metrics');
  assert(mx.funnel.scanSessions === 3, 'metrics: 초기 스캔 세션 3건');
  const ss = await J('POST', '/api/cases/C-2601/sessions', { role: 'clinic', session: { label: '2차 — 재스캔 (서버)', date: '2026-10-20', fileCount: 1 } });
  assert(ss.ok && ss.case.scanSessions.length === 2 && ss.case.scanSessions[1].id === 'SS-2601-2', 'POST sessions: clinic 등록 → SS-2601-2');
  assert(ss.case.history[0].t.includes('스캔 세션 등록'), '서버: 히스토리 기록');
  assert((await api('POST', '/api/cases/C-2601/sessions', { role: 'lab', session: { label: 'x' } })).status === 403, 'POST sessions: lab 403');
  assert((await J('POST', '/api/cases/C-2601/sessions', { role: 'clinic', session: {} })).error !== undefined, 'POST sessions: label 누락 400');
  assert((await J('POST', '/api/cases/C-2601/sessions', { role: 'clinic', session: { label: 'x'.repeat(70) } })).error !== undefined, 'POST sessions: label 70자 400');
  mx = await J('GET', '/api/metrics');
  assert(mx.funnel.scanSessions === 4, 'metrics: 세션 4건으로 갱신');
  const ev = await J('GET', '/api/events?since=0');
  assert(ev.changes.some(ch => ch.kind === 'session'), 'events: session 변경 기록');
  const au = await J('GET', '/api/audit?limit=50');
  assert(au.audit.some(a => a.act === 'session'), 'audit: 세션 등록 감사로그');
  await J('POST', '/api/reset');
  mx = await J('GET', '/api/metrics');
  assert(mx.funnel.scanSessions === 3, 'reset: 세션 3건 복원');
  server.close();

  assert(errors.length === 0, '최종: runtime errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  console.log('--- S11 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
