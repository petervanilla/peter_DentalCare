/* smoke_s13.js — S13 스모크: 환자 리포트 공유 → 의료진 케이스 전환(3역할 여정) + role 매핑 버그(D41) 통합 검증
   실행: cd /home/user/tests && node smoke_s13.js
   A: 실서버 + 앱 번들 jsdom — staff UI 액션의 서버 반영(온라인 실동작)까지 검증
   B: 오프라인 로컬 생성 경로 회귀 */
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

  console.log('=== A. 온라인 통합 — role 매핑(D41) + 리포트 공유 → 케이스 여정 ===');
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
  const $ = s => d.querySelector(s);
  const $$ = s => [...d.querySelectorAll(s)];
  const clickAgree = async () => { if ($('#agreeRow')) { $('#agreeRow').click(); $('#agreeBtn').click(); } };

  await sleep(700);
  assert(errors.length === 0, 'boot: no errors' + (errors.length ? ' → ' + errors.join('|') : ''));
  assert(w.MM.Api.online === true, '서버 자동 감지 → 온라인 (실서버 + 앱 통합)');
  assert(w.MM.CASES_DATA.items.length === 5 && w.MM.CASES_DATA.items[0].id === 'C-2601', '온라인 시드 채택 (5케이스)');

  /* staff UI 주문 제출 → 서버 반영 (D41 role 매핑 검증) */
  $$('.role-card')[1].click();
  await clickAgree();
  await sleep(150);
  assert(d.getElementById('brandTitle').textContent === '스마일치과', 'staff 진입');
  w.MM.app.state.caseId = 'C-2603';
  w.MM.app.go('caseDetail');
  $('#cdNext').click();
  assert(d.getElementById('brandTitle').textContent === '기공 주문서', '주문서 진입');
  $$('.lo-check').forEach(x => x.click());
  $('#loSubmit').click();
  await sleep(900);
  const c2603 = await J('GET', '/api/cases/C-2603?role=clinic');
  assert(!!c2603.case.order && c2603.case.status === '제작', 'D41: staff UI 주문이 서버에 실반영 (role staff→clinic 매핑)');
  assert(w.MM.CASES_DATA.items.find(c => c.id === 'C-2603').order.status === '제작 중', '로컬 adopt: 서버 응답 채택');

  /* 환자 리포트 공유 */
  $('.role-chip').click();
  $('#swPatient').click();
  await clickAgree();
  await sleep(350);
  w.MM.app.go('report');
  assert($('#refShare') && $('#refShare').textContent.includes('병원에 리포트 공유하기'), '리포트: 공유 버튼 (S13)');
  $('#refShare').click();
  assert($('#rfAgree') && $('#rfOk').disabled === true, '공유 모달: 동의 체크 게이트');
  $('#rfAgree').click();
  $('#rfOk').click();
  await sleep(60);
  assert(w.MM.app.state.referral.shared === true && $('#refShare').textContent.includes('공유됨'), '공유 완료 → 상태 전환');

  /* staff: 상담 요청 → 케이스 생성 (서버) */
  $('.role-chip').click();
  $('#swStaff').click();
  await sleep(400);
  assert($('#refStart'), 'staffHome: 새 상담 요청 카드 (환자 공유 감지)');
  $('#refStart').click();
  assert($('#rcGo') && $('#rcPat').value === '김○○' && $('#rcTooth').value === '46', '생성 모달: 환자·치아 사전 채움');
  $('#rcGo').click();
  await sleep(900);
  const newId = w.MM.app.state.referral.caseId;
  assert(!!newId, '케이스 생성 + referral.caseId (' + newId + ')');
  const listAfter = await J('GET', '/api/cases?role=clinic');
  assert(listAfter.cases.length === 6 && listAfter.cases.some(c => c.id === newId && c.proc.includes('리포트 공유')), '서버에 케이스 실반영 (' + newId + ' · 리포트 공유 시술)');
  assert(d.getElementById('brandTitle').textContent === '케이스 상세', '생성 후 케이스 상세 이동');
  assert(listAfter.cases.find(c => c.id === newId).status === '상담', '생성 케이스: 상담 단계 시작');

  /* 환자 화면 상태 카드 */
  $('.role-chip').click();
  $('#swPatient').click();
  await sleep(400);
  assert(d.body.textContent.includes('치료 케이스 시작') && d.body.textContent.includes(newId), '환자 홈: 케이스 시작 카드 (' + newId + ')');
  assert(errors.length === 0, 'A 최종: runtime errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));

  console.log('=== C. 무결성 (S84): push 실패 서버 복원(R4/I-01) + seq 단조 가드(I-03) ===');
  $('.role-chip').click();
  $('#swStaff').click();
  await sleep(400);
  const of2 = w.fetch;
  const pre = w.MM.CASES_DATA.items.find(c => c.id === 'C-2603').status;
  w.MM.CASES_DATA.items.find(c => c.id === 'C-2603').status = '관리'; /* 낙관 변이 시뮬레이션 */
  w.fetch = (u, o) => (o && o.method === 'PATCH') ? Promise.reject(new Error('boom')) : of2(u, o);
  const pr = await w.MM.Api.push({ type: 'patch', caseId: 'C-2603', patch: { status: '관리' } });
  await sleep(700);
  assert(pr === false && w.MM.CASES_DATA.items.find(c => c.id === 'C-2603').status === pre,
    'R4/I-01: push 실패 → 서버 기준 복원 (' + pre + '로 되돌림 — 낙관 변이 무음 반납 제거)');
  const s0 = w.MM.Api.seq;
  const stale = { seq: 0, cases: [{ id: 'FAKE-STALE' }] };
  w.fetch = (u, o) => (String(u).indexOf('/api/cases') >= 0 && (!o || o.method === 'GET'))
    ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(stale) })
    : of2(u, o);
  await w.MM.Api.pull();
  await sleep(50);
  assert(w.MM.Api.seq === s0 && w.MM.CASES_DATA.items.every(c => c.id !== 'FAKE-STALE'),
    'I-03: 구(stale) 응답 미채택 — seq 회귀·adopt 스킵');
  w.fetch = of2;
  assert(errors.length === 0, 'C 최종: runtime errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  await dom.window.close();

  console.log('=== B. 오프라인 로컬 생성 경로 ===');
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
  assert(w2.MM.Api.online === false, '오프라인 모드 (서버 없음)');
  $2('.role-card').click();
  if ($2('#agreeRow')) { $2('#agreeRow').click(); $2('#agreeBtn').click(); }
  await sleep(50);
  w2.MM.app.go('report');
  $2('#refShare').click();
  $2('#rfAgree').click();
  $2('#rfOk').click();
  await sleep(50);
  $2('.role-chip').click();
  $2('#swStaff').click();
  if ($2('#agreeRow')) { $2('#agreeRow').click(); $2('#agreeBtn').click(); }
  await sleep(50);
  assert($2('#refStart'), '오프라인: staffHome 상담 요청 카드');
  $2('#refStart').click();
  $2('#rcGo').click();
  await sleep(100);
  const offId = w2.MM.app.state.referral.caseId;
  assert(offId === 'C-2606' && w2.MM.CASES_DATA.items.length === 6, '오프라인 로컬 생성: ' + offId + ' (6케이스)');
  assert(w2.MM.CASES_DATA.items.find(c => c.id === offId).history[0].t.includes('환자 리포트 공유'), '로컬 생성 히스토리');
  assert(w2.MM.Api.localAudit.some(a => a.act === 'create'), '오프라인 생성 → 세션 감사로그');
  assert(errors2.length === 0, 'B 최종: runtime errors 없음' + (errors2.length ? ' → ' + errors2.join('|') : ''));
  await dom2.window.close();

  /* 서버 초기화 (데모 원복) */
  await J('POST', '/api/reset');
  server.close();
  console.log('--- S13 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
