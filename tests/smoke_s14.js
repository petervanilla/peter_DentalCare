/* smoke_s14.js — S14 스모크: 활동 이벤트 지표(업로드·다운로드·익스포트)·데모 원클릭 리셋·환자 케이스 진행 상태
   실행: cd /home/user/tests && node smoke_s14.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const { createApp } = require('/home/user/mirimiso-webapp/server/server.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg);
  cond ? pass++ : (fail++, process.exitCode = 1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BUNDLE = fs.readFileSync('/home/user/미리미소-웹앱.html', 'utf8');

(async () => {
  const server = createApp().listen(0, '127.0.0.1');
  await sleep(150);
  const base = 'http://127.0.0.1:' + server.address().port;
  const api = (m, p, b) => fetch(base + p, { method: m, headers: b ? { 'Content-Type': 'application/json' } : undefined, body: b ? JSON.stringify(b) : undefined });
  const J = async (m, p, b) => await (await api(m, p, b)).json();

  console.log('=== A. 서버 — 활동 이벤트 로그·지표 ===');
  assert((await J('POST', '/api/events/log', { role: 'clinic', kind: 'upload' })).ok === true, 'log: upload 기록');
  await J('POST', '/api/events/log', { role: 'lab', kind: 'download' });
  await J('POST', '/api/events/log', { role: 'clinic', kind: 'export' });
  let mx = await J('GET', '/api/metrics');
  assert(mx.activity.uploads === 1 && mx.activity.downloads === 1 && mx.activity.exports === 1, 'metrics: uploads/downloads/exports 계수');
  assert((await J('POST', '/api/events/log', { role: 'clinic', kind: 'hack' })).error !== undefined, 'log: kind 화이트리스트 외 400');
  assert((await api('POST', '/api/events/log', { role: 'admin', kind: 'upload' })).status === 400, 'log: role 미정의 400');
  await J('POST', '/api/reset');
  mx = await J('GET', '/api/metrics');
  assert(mx.activity.uploads === 0 && mx.activity.downloads === 0, 'reset: activity 초기화');

  console.log('=== B. 온라인 통합 — 클라이언트 이벤트 보고 ===');
  const errors = [];
  const dom = new JSDOM(BUNDLE, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: base + '/',
    beforeParse(w) {
      w.fetch = (u, o) => fetch(new URL(u, base + '/').href, o);
      w.addEventListener('error', e => errors.push('onerror: ' + e.message));
    }
  });
  const w = dom.window, d = w.document;
  await sleep(700);
  assert(w.MM.Api.online === true, '온라인 감지');
  const evOk = await w.MM.Api.pushEvent('upload');
  assert(evOk === true, 'Api.pushEvent(upload) → 서버 보고');
  mx = await J('GET', '/api/metrics');
  assert(mx.activity.uploads === 1, '서버 metrics에 반영됨');
  assert(errors.length === 0, 'B 최종: errors 없음');
  await dom.window.close();

  console.log('=== C. 오프라인 — 환자 진행 상태·리셋 가드 ===');
  const errors2 = [];
  const dom2 = new JSDOM(BUNDLE, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://demo.local/',
    beforeParse(w2) { w2.addEventListener('error', e => errors2.push('onerror: ' + e.message)); }
  });
  const w2 = dom2.window, d2 = w2.document;
  const $2 = s => d2.querySelector(s);
  await sleep(400);
  assert(w2.MM.Api.online === false, '오프라인 모드');
  assert(await w2.MM.Api.pushEvent('upload') === false, '오프라인 pushEvent 무시');

  /* 환자: 리포트 공유 → staff 케이스 생성 시뮬레이션(로컬) → 홈 진행 상태 */
  $2('.role-card').click();
  if ($2('#agreeRow')) { $2('#agreeRow').click(); $2('#agreeBtn').click(); }
  await sleep(50);
  w2.MM.app.go('report');
  $2('#refShare').click();
  $2('#rfAgree').click();
  $2('#rfOk').click();
  await sleep(50);
  w2.MM.createCaseQuick('김○○', '46', '임플란트 상담 (리포트 공유)').then(function (nc) { w2.MM.app.state.referral.caseId = nc.id; });
  await sleep(80);
  w2.MM.app.go('home');
  await sleep(50);
  const card = $2('#root').textContent;
  assert(card.includes('치료 케이스 시작') && card.includes('현재:'), '환자 홈: 진행 카드 + 현재 단계');
  assert(card.includes('1/8 단계 · 상담'), '진행 표시: 1/8 · 상담 (경로 요약)');
  /* 리포트 상태 모달에도 진행 단계 */
  w2.MM.app.go('report');
  $2('#refShare').click();
  await sleep(30);
  assert(d2.querySelector('#modalBody').textContent.includes('현재 단계: 상담'), '리포트 상태 모달: 진행 단계 표기');
  $2('#rfStOk').click();

  /* 감사로그 리셋 버튼 — 온라인 스텁 */
  let resetCalled = false;
  w2.fetch = (u) => {
    if (String(u).includes('/api/reset')) { resetCalled = true; return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, seq: 0 }) }); }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ seq: 0, cases: w2.MM.CASES_DATA.items }) });
  };
  w2.MM.Api.online = true;
  $2('.role-chip').click();
  $2('#swStaff').click();
  if ($2('#agreeRow')) { $2('#agreeRow').click(); $2('#agreeBtn').click(); }
  w2.MM.app.go('caseHub');
  $2('#qaAudit').click();
  await sleep(30);
  assert($2('#demoReset'), '감사로그: 데모 초기화 버튼');
  $2('#demoReset').click();
  $2('#drOk').click();
  await sleep(80);
  assert(resetCalled === true && $2('#toast').textContent.includes('초기화 완료'), '원클릭 리셋: /api/reset 호출 + 토스트');
  assert(errors2.length === 0, 'C 최종: errors 없음' + (errors2.length ? ' → ' + errors2.join('|') : ''));
  await dom2.window.close();
  server.close();

  console.log('--- S14 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
