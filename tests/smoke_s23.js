/* smoke_s23.js — S23 스모크: 3역할 완성도 — 계정 발급(초대코드 운영) + 환자 치아 건강 요약 + 기공 접수 품질 가시화(서버 스냅샷·SHA-256·원본 다운로드)
   실행: cd /home/user/tests && node smoke_s23.js */
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
  console.log('=== A. 계정 발급 — 초대코드 운영 (auth 모드) ===');
  const srvA = createApp({ auth: true }).listen(0, '127.0.0.1');
  await sleep(120);
  const base = 'http://127.0.0.1:' + srvA.address().port;
  const login = async function (b, code) {
    const r = await fetch(b + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code || 'MIRI-CLINIC-2026' }) });
    return (r.headers.get('set-cookie') || '').split(';')[0].split('=')[1];
  };
  const tok = await login(base);
  const H = () => ({ 'Content-Type': 'application/json', Cookie: 'mm_session=' + tok });
  const J = async (m, p, b, t) => await (await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', Cookie: 'mm_session=' + (t || tok) }, body: b ? JSON.stringify(b) : undefined })).json();

  const h = await J('GET', '/api/health');
  assert(parseInt(String(h.version).replace('S',''), 10) >= 23, 'health: version S23 이상 (' + h.version + ')');
  const iv = await J('POST', '/api/auth/invite', { role: 'lab', name: 'OO기공소 신규' });
  assert(iv.ok === true && /^MM-[0-9A-F]{8}$/.test(iv.code), '기공소 계정 발급 → ' + iv.code);
  const newTok = await login(base, iv.code);
  const nl = await (await fetch(base + '/api/cases', { headers: { Cookie: 'mm_session=' + newTok } })).json();
  assert(nl.role === 'lab' && nl.cases.some(c => c._masked), '발급 코드로 로그인 → lab 권한 동작 (마스킹 응답)');
  const badP = await J('POST', '/api/auth/invite', { role: 'patient', name: '환자테스트' });
  assert(badP.error !== undefined, '환자 발급에 caseId 누락 → 400');
  const okP = await J('POST', '/api/auth/invite', { role: 'patient', name: '박○○', caseId: 'C-2602' });
  assert(okP.ok === true && okP.caseId === 'C-2602', '환자 계정 발급 → 케이스 바인딩');
  const badR = await J('POST', '/api/auth/invite', { role: 'admin', name: 'x' });
  assert(badR.error !== undefined, '역할 화이트리스트 외 → 400');
  const ul = await J('GET', '/api/auth/users');
  assert(ul.users.length >= 2 && ul.users.some(u => u.code === iv.code), '계정 목록: 발급분 포함 (최근 20)');
  const au = await (await fetch(base + '/api/audit?limit=50', { headers: H() })).json();
  assert(au.audit.some(a => a.act === 'invite'), '발급 → 감사로그 기록');
  if (srvA.closeAllConnections) srvA.closeAllConnections();
  await new Promise(r => srvA.close(r));

  console.log('=== B. 기공 원본 다운로드 허용 (POST는 clinic 유지) ===');
  const srvB = createApp().listen(0, '127.0.0.1');
  await sleep(120);
  const baseB = 'http://127.0.0.1:' + srvB.address().port;
  const up = await fetch(baseB + '/api/cases/C-2601/sessions/SS-2601-1/files?filename=lab-src.stl', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: Buffer.from('solid lab\nendsolid lab') });
  const fid = (await up.json()).file.id;
  const labDn = await fetch(baseB + '/api/cases/C-2601/sessions/SS-2601-1/files?f=' + fid + '&role=lab');
  assert(labDn.status === 200, 'lab 원본 다운로드 → 200 (제작 원본 접근)');
  const patDn = await fetch(baseB + '/api/cases/C-2601/sessions/SS-2601-1/files?f=' + fid + '&role=patient');
  assert(patDn.status === 403, 'patient 다운로드 → 403 유지');
  const labUp = await fetch(baseB + '/api/cases/C-2601/sessions/SS-2601-1/files?role=lab&filename=x.stl', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: Buffer.from('x') });
  assert(labUp.status === 403, 'lab 업로드 → 403 유지');
  if (srvB.closeAllConnections) srvB.closeAllConnections();
  await new Promise(r => srvB.close(r));

  console.log('=== C. 온라인 통합 — 기공 접수 품질(서버 스냅샷·SHA-256) + 계정 발급 UI ===');
  const srvC = createApp().listen(0, '127.0.0.1');
  await sleep(120);
  const baseC = 'http://127.0.0.1:' + srvC.address().port;
  const errors = [];
  const dom = new JSDOM(BUNDLE, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: baseC + '/',
    beforeParse(w) {
      w.fetch = (u, o) => fetch(new URL(u, baseC + '/').href, o);
      w.scrollTo = () => {};
      w.addEventListener('error', e => errors.push('onerror: ' + e.message));
    }
  });
  const w = dom.window, d = w.document, $ = s => d.querySelector(s);
  await sleep(700);
  $('.role-card').parentNode.querySelectorAll('.role-card')[1].click();
  if ($('#agreeRow')) { $('#agreeRow').click(); $('#agreeBtn').click(); }
  await sleep(300);
  /* 주문 제출 + 파일 업로드 → labCase 품질 표시 */
  await w.MM.Api.push({ type: 'order', caseId: 'C-2603', order: { shade: 'A1' } });
  await w.MM.Api.push({ type: 'session', caseId: 'C-2603', session: { label: '제작 기준 (데모)' } });
  const buf = Buffer.from('solid s23\nendsolid s23');
  assert(await w.MM.Api.uploadScanFile('C-2603', 'SS-2603-1', { name: 'c2603.stl', arrayBuffer: () => Promise.resolve(buf) }) === true, 'C-2603 세션 파일 업로드');
  w.MM.app.state.caseId = 'C-2603';
  w.MM.app.state.role = 'lab';
  w.MM.app.go('labCase');
  await sleep(400);
  const labTxt = d.getElementById('root').textContent;
  assert(labTxt.includes('서버 검증 스냅샷') && labTxt.includes('4/4'), 'labCase: 서버 호환 스냅샷 표시 (S20 기록)');
  assert(labTxt.includes('문서 서명') && labTxt.includes('위변조 방지'), 'labCase: 의뢰서 문서 서명 표시');
  assert(labTxt.includes('SHA-256 검증') && labTxt.includes('c2603.stl') && labTxt.includes('해시 기록'), 'labCase: 세션 원본 + SHA-256 표시');
  /* 계정 발급 버튼 — 데모 모드 서버 → 안내 모달 가드 */
  w.MM.app.state.role = 'staff';
  w.MM.app.go('caseHub');
  await sleep(300);
  assert($('#qaInvite'), 'caseHub: 계정 발급 버튼');
  $('#qaInvite').click();
  await sleep(200);
  assert(d.getElementById('modalBody').textContent.includes('인증 모드 서버'), '데모 모드: 인증 모드 안내 가드');
  $('#ivOk').click();
  assert(errors.length === 0, 'C 최종: errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  await dom.window.close();
  if (srvC.closeAllConnections) srvC.closeAllConnections();
  await new Promise(r => srvC.close(r));

  console.log('=== D. 오프라인 — 환자 치아 건강 요약 카드 ===');
  const errors2 = [];
  const dom2 = new JSDOM(BUNDLE, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://demo.local/',
    beforeParse(w2) {
      w2.scrollTo = () => {};
      w2.addEventListener('error', e => errors2.push('onerror: ' + e.message));
    }
  });
  const w2 = dom2.window, d2 = w2.document, $2 = s => d2.querySelector(s);
  await sleep(400);
  $2('.role-card').click();
  if ($2('#agreeRow')) { $2('#agreeRow').click(); $2('#agreeBtn').click(); }
  await sleep(300);
  w2.MM.app.state.referral = { caseId: 'C-2602', shared: true };
  w2.MM.app.go('home');
  await sleep(300);
  const home2 = $2('#root').textContent;
  assert(home2.includes('내 치아 건강 요약') && home2.includes('비진단'), '환자 홈: 치아 건강 요약 카드 · 비진단 고지');
  assert(home2.includes('임플란트 · 크라운') && home2.includes('관찰 필요 치아'), '요약 행: 임플란트·크라운·관찰 치아 카운트');
  assert(home2.includes('플라크 부착 지수') && home2.includes('치료 케이스'), '요약 행: 플라크 게이지(S98) + 케이스 진행 통합');
  $2('#hToRecords').click();
  await sleep(200);
  assert(d2.getElementById('root').textContent.includes('입안 상태 추이'), '기록 보기 버튼 → records 이동 (입안 상태 추이 뷰)');
  assert(errors2.length === 0, 'D 최종: errors 없음' + (errors2.length ? ' → ' + errors2.join('|') : ''));
  await dom2.window.close();

  console.log('--- S23 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
