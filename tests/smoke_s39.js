/* smoke_s39.js — S39 스모크: 설계 오류 수정 (FX-01 미러 뷰어 인증 모드 401 · FX-02 purge 누락 범위)
   실행: cd /home/user/tests && node smoke_s39.js */
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
const J = async (base, m, p, b, ck) => await (await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', ...(ck ? { Cookie: ck } : {}) }, body: b ? JSON.stringify(b) : undefined })).json();

(async () => {
  console.log('=== A. auth+persist — 오류 수정 검증 ===');
  try { fs.rmSync('/tmp/s39', { recursive: true, force: true }); } catch (e) {}
  const srvA = createApp({ auth: true, persist: '/tmp/s39/pilot.db' }).listen(0, '127.0.0.1');
  await new Promise(r => srvA.on('listening', r));
  await sleep(150);
  const baseA = 'http://127.0.0.1:' + srvA.address().port;
  const login = async function (code) {
    const r = await fetch(baseA + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) });
    return (r.headers.get('set-cookie') || '').split(';')[0].split('=')[1];
  };
  const hA = await J(baseA, 'GET', '/api/health');
  assert(parseInt(hA.version.slice(1), 10) >= 39, 'health: version S39 이상');
  const tokC = await login('MIRI-CLINIC-2026');
  const st = await J(baseA, 'POST', '/api/mirror/start', { nick: 'FX' }, 'mm_session=' + tokC);
  assert(st.ok === true, '미러 시작 (인증 모드)');
  const pf = await J(baseA, 'POST', '/api/mirror/' + st.id + '/frame?role=clinic', { img: 'data:image/jpeg;base64,BB' }, 'mm_session=' + tokC);
  assert(pf.ok === true, '프레임 전송 — clinic 세션 유지');
  const vf = await fetch(baseA + '/api/mirror/' + st.id + '/frame');
  const vfj = await vf.json();
  assert(vf.status === 200 && vfj.nick === 'FX' && vfj.img, 'FX-01: 태블릿(무쿠키) 프레임 폴링 → 200 (링크 소유 모델 복원)');
  const vf404 = await fetch(baseA + '/api/mirror/ffffff/frame');
  assert(vf404.status === 404, 'FX-01 경계: 없는 id → 404 (id가 곧 권한)');
  const mf = await fetch(baseA + '/api/mirror/' + st.id + '/frame', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ img: 'x' }) });
  assert(mf.status === 401, 'FX-01 경계: 프레임 전송(POST)은 여전히 인증 필요 → 401');
  const bk = await J(baseA, 'POST', '/api/maintenance/backup', null, 'mm_session=' + tokC);
  assert(bk.ok === true && bk.kept >= 1, '백업 생성 — 삭제 대상 준비');
  const bkDir = '/tmp/s39/backups';
  assert(fs.existsSync(bkDir) && fs.readdirSync(bkDir).filter(f => f.endsWith('.db')).length >= 1, '백업 파일 실측 존재');
  const pg = await J(baseA, 'POST', '/api/maintenance/purge', { confirm: '삭제' }, 'mm_session=' + tokC);
  assert(pg.ok === true && pg.proof.purged.cases === 5, '삭제 실행');
  assert(pg.proof.purged.mirrors === 1, 'FX-02: 미러 프레임 삭제 집계');
  assert(pg.proof.purged.backups >= 1, 'FX-02: 백업 파일 삭제 집계 ("원본·백업 포함")');
  assert(fs.existsSync(bkDir) === false || fs.readdirSync(bkDir).filter(f => f.endsWith('.db')).length === 0, 'FX-02 실측: 백업 디렉터리 비움');
  const vf2 = await fetch(baseA + '/api/mirror/' + st.id + '/frame');
  assert(vf2.status === 404, '삭제 후 미러 프레임 → 404 (완전 삭제)');
  const sess1 = await J(baseA, 'GET', '/api/cases?role=clinic', null, 'mm_session=' + tokC);
  assert(sess1.error !== undefined, '기존 세션 소멸 — 401');
  const tokC2 = await login('MIRI-CLINIC-2026');
  const g2 = await J(baseA, 'GET', '/api/cases?role=clinic', null, 'mm_session=' + tokC2);
  assert(g2.cases && g2.cases.length === 0, '재접근 — 케이스 0건');
  const au = await J(baseA, 'GET', '/api/audit?limit=10', null, 'mm_session=' + tokC2);
  assert(au.audit.some(a => a.act === 'data-purge' && a.detail.includes('백업')), '감사로그에 백업 삭제 포함');
  if (srvA.closeAllConnections) srvA.closeAllConnections();
  await new Promise(r => srvA.close(r));

  console.log('=== B. 데모 — 기존 동작 회귀 가드 ===');
  const srvB = createApp().listen(0, '127.0.0.1');
  await new Promise(r => srvB.on('listening', r));
  await sleep(100);
  const baseB = 'http://127.0.0.1:' + srvB.address().port;
  const st2 = await J(baseB, 'POST', '/api/mirror/start', { role: 'clinic', nick: 'd' });
  await J(baseB, 'POST', '/api/mirror/' + st2.id + '/frame?role=clinic', { img: 'd' });
  const vB = await fetch(baseB + '/api/mirror/' + st2.id + '/frame');
  assert(vB.status === 200, '데모 뷰어 폴링 — 기존 동작 유지');
  const pB = await J(baseB, 'POST', '/api/maintenance/purge?role=clinic', { confirm: '삭제' });
  assert(pB.error !== undefined && pB.error.includes('인증 모드'), '데모 purge — 400 안내 유지');
  if (srvB.closeAllConnections) srvB.closeAllConnections();
  await new Promise(r => srvB.close(r));

  console.log('=== C. 클라 — 번들 회귀 (서버 전용 수정·무변경 확인) ===');
  const srvC = createApp().listen(0, '127.0.0.1');
  await new Promise(r => srvC.on('listening', r));
  await sleep(100);
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
  $('.role-card').click();
  if ($('#agreeRow')) { $('#agreeRow').click(); $('#agreeBtn').click(); }
  await sleep(300);
  w.MM.app.state.role = 'staff';
  w.MM.app.go('opsDash');
  await sleep(400);
  assert($('#odGate') && $('#odExport') && $('#odPurge'), '운영 대시보드 — 게이트·내보내기·삭제 카드 모두 존재');
  assert(errors.length === 0, 'C 최종: errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  await dom.window.close();
  if (srvC.closeAllConnections) srvC.closeAllConnections();
  await new Promise(r => srvC.close(r));

  console.log('=== D. 문서 — 감사 결과 반영 ===');
  const spec = fs.readFileSync('/home/user/미리미소-작업명세.md', 'utf8');
  const contract = fs.readFileSync('/home/user/미리미소-파일럿계약서초안.md', 'utf8');
  assert(spec.includes('AC-39') && spec.includes('FX-01') && spec.includes('FX-02'), '명세 AC-39 (FX-01/02) 반영');
  assert(contract.includes('제4조') && contract.includes('S39'), '계약서 제4조3항 ↔ S39 보강 연계');

  console.log('--- S39 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
