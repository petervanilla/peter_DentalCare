/* smoke_s44.js — S44 스모크: 세팅 리허설 — 영속·인증 모드에서 계정 수명주기가 재시작·백업·복원을 거쳐 생존
   (런북 §4-1 계정 수명주기 + §5 복원 절차를 운영자 순서 그대로 실행 실증)
   실행: cd /home/user/tests && node smoke_s44.js */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('/home/user/mirimiso-webapp/server/server.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg);
  cond ? pass++ : (fail++, process.exitCode = 1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = async (base, m, p, b, ck) => await (await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', ...(ck ? { Cookie: ck } : {}) }, body: b ? JSON.stringify(b) : undefined })).json();

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-s44-'));
  const dbf = path.join(tmp, 'pilot.db');
  let srv = createApp({ auth: true, persist: dbf }).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  await sleep(150);
  let base = 'http://127.0.0.1:' + srv.address().port; /* 재시작 시 재계산 (listen(0)은 포트 재할당) */
  const login = async function (code) {
    const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) });
    return { st: r.status, ck: (r.headers.get('set-cookie') || '').split(';')[0].split('=')[1], j: await r.json() };
  };

  console.log('=== A. 세팅 리허설 — 발급→사용→회수→재시작→재활성→백업→복원 (운영자 순서) ===');
  const h = await J(base, 'GET', '/api/health');
  assert(h.authRequired === true && parseInt(h.version.slice(1), 10) >= 44, 'health: 영속·인증 모드 기동 — version S44 이상');
  const tC1 = await login('MIRI-CLINIC-2026');
  assert(tC1.st === 200, 'clinic 로그인 (시드 코드)');
  const iP = await J(base, 'POST', '/api/auth/invite', { role: 'patient', name: '리허설환자', caseId: 'C-2601' }, 'mm_session=' + tC1.ck);
  const iL = await J(base, 'POST', '/api/auth/invite', { role: 'lab', name: '리허설기공소' }, 'mm_session=' + tC1.ck);
  assert(/^MM-[0-9A-F]{8}$/.test(iP.code) && /^MM-[0-9A-F]{8}$/.test(iL.code), '발급 — 코드 형식 MM-XXXXXXXX (온보딩 예시와 일치)');
  const tP1 = await login(iP.code);
  const casesP = await J(base, 'GET', '/api/cases', null, 'mm_session=' + tP1.ck);
  const listP = casesP.cases || casesP || [];
  assert(tP1.st === 200 && listP.length === 1 && listP[0].id === 'C-2601', '발급 환자 로그인 — 자기 케이스 1건만 (스코프)');
  const rv = await J(base, 'POST', '/api/auth/revoke', { code: iP.code }, 'mm_session=' + tC1.ck);
  assert(rv.ok === true && rv.killed === 1 && rv.seed === false, '회수 — 세션 1건 즉시 차단 (비시드=정식 회수)');
  const cs401 = await J(base, 'GET', '/api/cases', null, 'mm_session=' + tP1.ck);
  assert(cs401.error !== undefined, '회수 후 기존 세션 → 401');
  const re403 = await login(iP.code);
  assert(re403.st === 403 && re403.j.error.includes('회수된'), '회수코드 재로그인 → 403 안내');
  /* 재시작 — 같은 DB 파일 재적재 (런북: systemctl restart 상당) */
  if (srv.closeAllConnections) srv.closeAllConnections();
  await new Promise(r => srv.close(r));
  srv = createApp({ auth: true, persist: dbf }).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  base = 'http://127.0.0.1:' + srv.address().port;
  await sleep(150);
  const tC2 = await login('MIRI-CLINIC-2026');
  assert(tC2.st === 200, '재시작 후 clinic 로그인 성립 (시크릿 영속 확인)');
  const us2 = await J(base, 'GET', '/api/auth/users', null, 'mm_session=' + tC2.ck);
  assert(us2.users.length === 5 && us2.users.some(u => u.code === iP.code && u.active === false) && us2.users.some(u => u.code === iL.code && u.active !== false), '재시작 생존 — 발급 2계정 유지·회수 상태(active:false) 유지');
  const rct = await J(base, 'POST', '/api/auth/reactivate', { code: iP.code }, 'mm_session=' + tC2.ck);
  const tP2 = await login(iP.code);
  assert(rct.ok === true && tP2.st === 200, '재활성 → 환자 재로그인 성립');
  const b1 = await J(base, 'POST', '/api/maintenance/backup', null, 'mm_session=' + tC2.ck);
  const bdir = path.join(tmp, 'backups');
  const bexists = b1.ok === true && fs.existsSync(path.join(bdir, b1.file || ''));
  assert(bexists, '백업 — data/backups/ 스냅샷 생성 (보존 정책)');
  /* 복원 — 런북 §5 절차 그대로: 정지 → wal/shm 제거 → 백업을 원본 위치로 → 재시작 */
  if (srv.closeAllConnections) srv.closeAllConnections();
  await new Promise(r => srv.close(r));
  const kept = fs.readdirSync(bdir).filter(f => /^backup-.*\.db$/.test(f)).sort().pop();
  fs.rmSync(dbf, { force: true }); fs.rmSync(dbf + '-wal', { force: true }); fs.rmSync(dbf + '-shm', { force: true });
  fs.copyFileSync(path.join(bdir, kept), dbf);
  srv = createApp({ auth: true, persist: dbf }).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  base = 'http://127.0.0.1:' + srv.address().port;
  await sleep(150);
  const tC3 = await login('MIRI-CLINIC-2026');
  const us3 = await J(base, 'GET', '/api/auth/users', null, 'mm_session=' + tC3.ck);
  assert(us3.users.length === 5 && us3.users.some(u => u.code === iP.code && u.active !== false), '복원 생존 — 계정 5건·재활성 시점 상태(active:true) 유지');
  const au3 = await J(base, 'GET', '/api/audit?limit=100', null, 'mm_session=' + tC3.ck);
  assert(au3.audit.some(a => a.act === 'account:revoke') && au3.audit.some(a => a.act === 'account:reactivate') && au3.audit.some(a => a.act === 'login:revoked'), '복원 생존 — 감사로그(회수·재활성·차단 로그인) 유지');

  console.log('=== B. 경계 — 데모 모드 백업 거부 ===');
  const srvD = createApp().listen(0, '127.0.0.1');
  await new Promise(r => srvD.on('listening', r));
  const bd = await J('http://127.0.0.1:' + srvD.address().port, 'POST', '/api/maintenance/backup');
  assert(bd.error !== undefined && bd.error.includes('영속'), '데모 모드 백업 → 400 안내 (영속 모드 필요)');
  if (srvD.closeAllConnections) srvD.closeAllConnections();
  await new Promise(r => srvD.close(r));

  console.log('=== D. 문서 — 런북 복원 절차에 수명주기 생존 명기 ===');
  const runbook = fs.readFileSync('/home/user/미리미소-배포런북.md', 'utf8');
  assert(runbook.includes('회수 상태') && runbook.includes('S44'), '런북: 복원 검증 문구에 계정·회수 상태 생존 (S44 리허설) 명기');

  if (srv.closeAllConnections) srv.closeAllConnections();
  await new Promise(r => srv.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('--- S44 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
})();
