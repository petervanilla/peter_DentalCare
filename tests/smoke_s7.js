/* smoke_s7.js — S7 목서버 스모크: REST API 통합 + 클라이언트 어댑터(온라인/오프라인)
   실행: cd /home/user/tests && node smoke_s7.js
   구성: [A1] 정적·헬스·권한 필터 읽기 → [B] jsdom 클라이언트 어댑터(실서버 브리지+오프라인) →
         [reset] → [A2] CRUD·주문·기공 액션·권한 403/409 → [events/audit] → [reset] */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const { createApp } = require('/home/user/mirimiso-webapp/server/server.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg);
  cond ? pass++ : (fail++, process.exitCode = 1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  /* 서버 기동 (랜덤 포트) */
  const server = createApp().listen(0, '127.0.0.1');
  await sleep(150);
  const port = server.address().port;
  const base = 'http://127.0.0.1:' + port;
  const api = (m, p, b) => fetch(base + p, { method: m, headers: b ? { 'Content-Type': 'application/json' } : undefined, body: b ? JSON.stringify(b) : undefined });
  const J = async (m, p, b) => await (await api(m, p, b)).json();

  console.log('=== [A1] 정적 서빙 · 헬스 · 권한 필터 읽기 ===');

  /* 헬스 */
  const h = await J('GET', '/api/health');
  assert(h.service === 'mirimiso-mock' && h.ok === true, 'health: service 식별');
  assert(h.seq === 0 && h.cases === 5 && h.demo === true, 'health: 초기 시드 5케이스·seq 0·demo 플래그');

  /* 정적 */
  const idx = await (await api('GET', '/')).text();
  assert(idx.includes('스마일치과') && idx.includes('js/api.js'), 'GET / → index.html (api.js 포함 · 브랜드 스마일치과 S54)');
  const cj = await (await api('GET', '/js/casehub.js')).text();
  assert(cj.includes('CASES_DATA'), 'GET /js/casehub.js 서빙 (데이터 단일 출처 — 시드 런타임 검증은 서버 seedCases)');
  assert((await api('GET', '/nope.js')).status === 404, '없는 정적 파일 404');
  assert((await api('GET', '/../server/server.js')).status !== 200, '경로 탐색 차단');

  /* 읽기 + 권한 필터 */
  const list = await J('GET', '/api/cases?role=clinic');
  assert(list.cases.length === 5 && list.cases[0].id === 'C-2601', 'clinic: 5케이스 전체 열람');
  const one = await J('GET', '/api/cases/C-2601?role=clinic');
  assert(one.case.order && one.case.order.status === '제작 중', '단건 조회: C-2601 주문 제작 중');
  assert((await api('GET', '/api/cases/C-9999')).status === 404, '없는 케이스 404');

  const lab = await J('GET', '/api/cases?role=lab');
  const labC1 = lab.cases.find(c => c.id === 'C-2601');
  assert(labC1.plan.aiNote === undefined && labC1.plan.connection === '내부 육각', 'lab 필터: aiNote 제거·제작 정보(연결부) 유지');
  assert(labC1._masked && labC1._masked.length >= 2, 'lab 필터: 마스킹 내역 고지(_masked ' + (labC1._masked || []).length + '건)');
  assert(!labC1.history.some(hh => /상담|동의/.test(hh.t)), 'lab 필터: 임상 히스토리(상담·동의) 서버 제거');
  const pat = await J('GET', '/api/cases/C-2601?role=patient');
  assert(pat.case.plan === undefined && pat.case.files === undefined && pat.case.status === '제작', 'patient 필터: 경로 요약만 제공');
  assert((await J('GET', '/api/cases?role=hacker')).error !== undefined, '알 수 없는 role 400');

  /* CORS */
  const cors = await api('GET', '/api/health');
  assert(cors.headers.get('access-control-allow-origin') === '*', 'CORS: 단일 파일(file://)에서도 연결 가능');
  const opt = await api('OPTIONS', '/api/cases');
  assert(opt.status === 204, 'OPTIONS 프리플라이트 204');

  console.log('=== [B] 클라이언트 어댑터 (jsdom + 실서버) ===');

  /* 온라인: 어댑터 부팅 → 감지·채택 */
  const apiSrc = fs.readFileSync('/home/user/mirimiso-webapp/js/api.js', 'utf8');
  const dom = new JSDOM('<!doctype html><html><body><div id="toast"></div><div id="modalOverlay" class="overlay"></div><div id="root"></div></body></html>', { url: base + '/', runScripts: 'outside-only' });
  const w = dom.window;
  w.fetch = (u, o) => fetch(new URL(u, base + '/').href, o);
  w.MM = { CASES_DATA: { items: [{ id: 'local-only', status: '상담' }] }, app: { state: { role: 'clinic' }, toast() {}, rerender() {} } };
  w.eval(apiSrc);
  await sleep(400);
  assert(w.MM.Api.online === true, '어댑터: 서버 자동 감지(health) → 온라인');
  assert(w.MM.CASES_DATA.items.length === 5 && w.MM.CASES_DATA.items[0].id === 'C-2601', '어댑터: 서버 시드 in-place 채택 (local-only 교체)');

  /* push: 주문 제출 → 서버 규칙 적용 → 로컬 채택 */
  const ok1 = await w.MM.Api.push({ type: 'order', caseId: 'C-2604', order: {} });
  const lc = w.MM.CASES_DATA.items.find(c => c.id === 'C-2604');
  assert(ok1 === true && lc.status === '제작' && lc.order.status === '제작 중', 'push(order): C-2604 서버 전이 제작 → 로컬 반영');

  /* 폴링: 다른 탭의 변이를 2초 내 수신 */
  const seqBefore = (await J('GET', '/api/health')).seq;
  await api('PATCH', '/api/cases/C-2602', { role: 'clinic', patch: { status: '주문' } });
  await sleep(2600);
  const lc2 = w.MM.CASES_DATA.items.find(c => c.id === 'C-2602');
  assert(lc2.status === '주문' && w.MM.Api.seq >= seqBefore + 1, '폴링: 타 탭 PATCH를 2.6초 내 수신·채택');
  w.MM.Api.stop();

  /* 오프라인: 단일 파일 모드 — 기존 동작 유지 */
  const dom2 = new JSDOM('<div id="toast"></div>', { url: 'file:///demo.html', runScripts: 'outside-only' });
  dom2.window.MM = { CASES_DATA: { items: [{ id: 'keep-me', status: '상담' }] }, app: { state: { role: 'clinic' }, toast() {} } };
  dom2.window.eval(apiSrc);
  await sleep(250);
  assert(dom2.window.MM.Api.online === false, '어댑터(오프라인): 서버 없으면 오프라인 모드');
  const ok2 = await dom2.window.MM.Api.push({ type: 'order', caseId: 'C-2604', order: {} });
  assert(ok2 === false && dom2.window.MM.CASES_DATA.items.length === 1 && dom2.window.MM.CASES_DATA.items[0].id === 'keep-me', '어댑터(오프라인): push 무시·로컬 데이터 무손상');
  assert(dom2.window.MM.Api.localAudit.length === 1 && dom2.window.MM.Api.localAudit[0].act === 'order', '오프라인 push → 세션 감사로그 기록 (S8)');

  console.log('=== [reset] 후 [A2] CRUD · 주문 · 기공 액션 · 권한 ===');
  const rst = await J('POST', '/api/reset');
  assert(rst.ok === true && rst.seq === 0, 'reset: 시드 복원·seq 0');

  /* CREATE */
  const cr = await J('POST', '/api/cases', { role: 'clinic', patient: '홍○○', tooth: '36', proc: '테스트 임플란트 (데모)', due: '2026-12-15' });
  assert(cr.ok && cr.case.id === 'C-2606' && cr.case.status === '상담' && cr.cases.length === 6, 'create: C-2606 상담 케이스 생성');
  assert((await J('POST', '/api/cases', { role: 'clinic', patient: '홍○○', tooth: '36' })).error !== undefined, 'create: proc 누락 400');
  assert((await api('POST', '/api/cases', { role: 'lab', patient: '홍', tooth: '36', proc: 'x' })).status === 403, 'create: lab 권한 403 (서버 강제)');
  assert((await api('POST', '/api/cases', { tooth: '36', proc: 'x' })).status === 400, 'create: role 누락 400');

  /* PATCH */
  const pa = await J('PATCH', '/api/cases/C-2606', { role: 'clinic', patch: { status: '주문' } });
  assert(pa.ok && pa.case.status === '주문' && pa.case.history[0].t.includes('상태 변경'), 'patch: 상태 전이 + 히스토리 기록');
  assert((await J('PATCH', '/api/cases/C-2606', { role: 'clinic', patch: { status: '완료' } })).error !== undefined, 'patch: 8단계 외 값 400');
  assert((await J('PATCH', '/api/cases/C-2606', { role: 'clinic', patch: { patient: '해킹' } })).error !== undefined, 'patch: 화이트리스트 외 필드 400');
  assert((await api('PATCH', '/api/cases/C-2606', { role: 'lab', patch: { status: '관리' } })).status === 403, 'patch: lab 권한 403');

  /* ORDER */
  assert((await J('POST', '/api/cases/C-2602/order', { role: 'clinic', order: {} })).error !== undefined, 'order: 주문 단계 아님 409 (C-2602 스캔)');
  const od = await J('POST', '/api/cases/C-2606/order', { role: 'clinic', order: { due: '2026-12-10', shade: 'A1' } });
  assert(od.ok && od.case.status === '제작' && od.case.order.status === '제작 중' && od.case.order.shade === 'A1', 'order: 주문→제작 전이 + 주문 객체 서버 부여');
  assert((await J('POST', '/api/cases/C-2606/order', { role: 'clinic', order: {} })).error !== undefined, 'order: 중복 제출 409');
  assert((await api('POST', '/api/cases/C-2606/order', { role: 'lab', order: {} })).status === 403, 'order: lab 권한 403');

  /* LAB ACTIONS */
  const st = await J('POST', '/api/cases/C-2604/lab-actions', { role: 'lab', action: 'start' });
  assert(st.ok && st.case.status === '제작', 'lab start: 접수 확인 → 제작');
  assert((await J('POST', '/api/cases/C-2604/lab-actions', { role: 'lab', action: 'start' })).error !== undefined, 'lab start: 중복 409');
  const md = await J('POST', '/api/cases/C-2601/lab-actions', { role: 'lab', action: 'modify', reason: '접촉점', memo: '근원측 조정' });
  assert(md.ok && md.case.urgent === true && md.case.urgentNote.includes('접촉점') && md.case.modifyReq.includes('근원측 조정'), 'lab modify: 긴급 배지·수정요청 서버 반영');
  assert((await J('POST', '/api/cases/C-2601/lab-actions', { role: 'lab', action: 'modify', reason: '' })).error !== undefined, 'lab modify: 사유 누락 400');
  const dn = await J('POST', '/api/cases/C-2606/lab-actions', { role: 'lab', action: 'done' });
  assert(dn.ok && dn.case.order.status === '완료' && dn.case.status === '장착' && dn.case.urgent === false, 'lab done: 완료 보고 → 장착 전환·urgent 해제');
  assert((await J('POST', '/api/cases/C-2606/lab-actions', { role: 'lab', action: 'done' })).error !== undefined, 'lab done: 중복 409');
  assert((await api('POST', '/api/cases/C-2602/lab-actions', { role: 'clinic', action: 'done' })).status === 403, 'lab action: clinic 권한 403');

  console.log('=== [events / audit / reset] ===');
  const ev = await J('GET', '/api/events?since=0');
  assert(ev.seq >= 6 && ev.changes.length >= 6 && ev.changes[0].seq === 1, 'events: 전체 변경 로그 (seq ' + ev.seq + ', ' + ev.changes.length + '건)');
  const ev2 = await J('GET', '/api/events?since=' + ev.seq);
  assert(ev2.changes.length === 0, 'events: since 이후 변경 없음 → 빈 배열');
  await J('GET', '/api/cases/C-2601?role=lab');
  const au = await J('GET', '/api/audit?limit=100');
  assert(au.audit.length >= 7, 'audit: 변이 전체 기록 (' + au.audit.length + '건)');
  assert(au.audit.some(a => a.role === 'lab' && a.act === 'read'), 'audit: 기공소 케이스 열람 기록');
  assert(au.audit[0].ts && au.audit[0].act, 'audit: 최신 항목 우선·ts 포함');
  const rst2 = await J('POST', '/api/reset');
  assert(rst2.seq === 0 && (await J('GET', '/api/cases?role=clinic')).cases.length === 5, 'reset: 재초기화 확인');

  server.close();
  console.log('--- S7 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
