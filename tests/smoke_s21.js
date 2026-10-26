/* smoke_s21.js — S21 스모크: 온라인 백업(better-sqlite3 backup API·7개 보존) + 복원 리허설(백업→복원→재시작→검증 성립)
   실행: cd /home/user/tests && node smoke_s21.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { createApp } = require('/home/user/mirimiso-webapp/server/server.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg);
  cond ? pass++ : (fail++, process.exitCode = 1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BUNDLE = fs.readFileSync('/home/user/미리미소-웹앱.html', 'utf8');

(async () => {
  console.log('=== A. 데모 모드 — 백업 대상 없음 안내 ===');
  const srvA = createApp().listen(0, '127.0.0.1');
  await sleep(120);
  const baseA = 'http://127.0.0.1:' + srvA.address().port;
  const h = await (await fetch(baseA + '/api/health')).json();
  assert(parseInt(String(h.version).replace('S',''), 10) >= 21, 'health: version S21 이상 (' + h.version + ')');
  const demo = await (await fetch(baseA + '/api/maintenance/backup', { method: 'POST' })).json();
  assert(demo.error && demo.error.includes('영속 모드'), '데모 모드 백업 → 영속 모드 안내 400');
  if (srvA.closeAllConnections) srvA.closeAllConnections();
  await new Promise(r => srvA.close(r));

  console.log('=== B. 영속 모드 — 온라인 백업 + 보존 정책(7개) ===');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-s21-'));
  const dbf = path.join(tmp, 'pilot.db');
  const bdir = path.join(tmp, 'backups');
  const login = async b => {
    const r = await fetch(b + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'MIRI-CLINIC-2026' }) });
    return (r.headers.get('set-cookie') || '').split(';')[0].split('=')[1];
  };
  const HB = tok => ({ 'Content-Type': 'application/json', Cookie: 'mm_session=' + tok });
  const post = async (b, tok, p) => await (await fetch(b + p, { method: 'POST', headers: HB(tok), body: '{}' })).json();

  let srv = createApp({ auth: true, persist: dbf }).listen(0, '127.0.0.1');
  await sleep(150);
  let base = 'http://127.0.0.1:' + srv.address().port;
  let tok = await login(base);
  await fetch(base + '/api/cases', { method: 'POST', headers: HB(tok), body: JSON.stringify({ patient: '백업테스트', tooth: '36', proc: 'S21 검증 (데모)' }) });
  await fetch(base + '/api/cases/C-2601/consent', { method: 'POST', headers: HB(tok), body: JSON.stringify({ signerName: '백업서명' }) });
  const b1 = await post(base, tok, '/api/maintenance/backup');
  assert(b1.ok === true && b1.size > 0, '온라인 백업 → ' + b1.file + ' (' + b1.size + 'B)');
  const hdr = fs.readFileSync(path.join(bdir, b1.file)).subarray(0, 15).toString();
  assert(hdr === 'SQLite format 3', '백업 파일: 유효한 SQLite 헤더');
  for (let i = 0; i < 8; i++) await post(base, tok, '/api/maintenance/backup');
  const bLast = await post(base, tok, '/api/maintenance/backup');
  assert(bLast.kept === 7 && fs.readdirSync(bdir).filter(f => /^backup-.*\.db$/.test(f)).length === 7, '보존 정책: 10회 백업 후 7개 유지');
  if (srv.closeAllConnections) srv.closeAllConnections();
  await new Promise(r => srv.close(r));

  console.log('=== C. 복원 리허설 — 원본 소실 → 백업 복원 → 재시작 → 검증 성립 ===');
  const kept = fs.readdirSync(bdir).filter(f => /^backup-.*\.db$/.test(f)).sort().pop();
  fs.rmSync(dbf, { force: true });
  fs.rmSync(dbf + '-wal', { force: true });
  fs.rmSync(dbf + '-shm', { force: true });
  fs.copyFileSync(path.join(bdir, kept), dbf); /* 복원 = 백업 파일을 원본 위치로 */
  srv = createApp({ auth: true, persist: dbf }).listen(0, '127.0.0.1');
  await sleep(150);
  base = 'http://127.0.0.1:' + srv.address().port;
  tok = await login(base);
  const cases = (await (await fetch(base + '/api/cases', { headers: HB(tok) })).json()).cases;
  assert(cases.length === 6 && cases.some(c => c.proc === 'S21 검증 (데모)'), '복원 후: 케이스 생존 (6건 · 생성분 포함)');
  const cj = (await (await fetch(base + '/api/cases/C-2601', { headers: HB(tok) })).json()).case;
  assert(cj.consents && cj.consents[0] && cj.consents[0].signerName === '백업서명', '복원 후: 동의서 생존');
  const v = await (await fetch(base + '/api/consent/verify', { method: 'POST', headers: HB(tok), body: JSON.stringify({ caseId: 'C-2601', cid: 'CS-1' }) })).json();
  assert(v.valid === true, '복원 후: 동의 서명 검증 ✓ — 백업에 서명 키(meta)까지 포함');
  if (srv.closeAllConnections) srv.closeAllConnections();
  await new Promise(r => srv.close(r));

  console.log('=== D. backup.sh — 운영 스크립트 (별도 프로세스 서버: execSync가 루프를 막으면 같은 프로세스 서버는 교착) ===');
  const cp = require('child_process');
  const PORTD = 18400 + Math.floor(Math.random() * 99);
  const srvD = cp.spawn('node', ['-e', `const { createApp } = require('/home/user/mirimiso-webapp/server/server.js'); createApp({ auth: true, persist: ${JSON.stringify(dbf)} }).listen(${PORTD}, '127.0.0.1'); setInterval(function(){}, 1000);`], { stdio: 'ignore' });
  await sleep(700);
  const baseD = 'http://127.0.0.1:' + PORTD;
  const out = execSync('bash /home/user/mirimiso-webapp/scripts/backup.sh ' + baseD + ' MIRI-CLINIC-2026', { encoding: 'utf8', timeout: 60000 });
  assert(out.includes('✓ 백업 완료') && out.includes('보존 정책'), 'backup.sh: 성공 메시지·보존 안내 (별도 프로세스 서버 대상)');
  srvD.kill();

  console.log('=== E. 온라인 통합 — 번들 무손상 가드 ===');
  const errors = [];
  const dom = new JSDOM(BUNDLE, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://demo.local/',
    beforeParse(w) { w.addEventListener('error', e => errors.push('onerror: ' + e.message)); }
  });
  await sleep(400);
  assert(dom.window.document.querySelectorAll('.role-card').length === 3, '번들 부팅: 역할 카드 3개 (클라 변경 없음 확인)');
  assert(errors.length === 0, 'E 최종: errors 없음');
  await dom.window.close();

  console.log('--- S21 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
