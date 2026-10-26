#!/usr/bin/env node
/* S103 스모크 — 첫 병원 온보딩 리허설 (남은 공정 #2 선행 재연):
   OB-01 인증 모드 기동 — health authRequired
   OB-02 무인증 차단 — 케이스 API 401
   OB-03 초대코드 로그인 — MIRI-CLINIC-2026 → 세션 쿠키·me 조회
   OB-04 잘못된 코드 거부 — 401
   OB-05 온라인 백업 — 영속 모드 백업 파일 생성
   OB-06 복원 리허설 — 백업 DB로 재기동해 케이스·세션 정합
   실행: cd /home/user/tests && node smoke_s103.js */
const { createApp } = require('/home/user/mirimiso-webapp/server/server.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
function assert(cond, msg) { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg); cond ? pass++ : (fail++, process.exitCode = 1); }

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-onboard-'));
  const dbFile = path.join(dir, 'pilot.db');
  const srv = createApp({ auth: true, persist: dbFile }).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const J = async (m, p, b, cookie) => {
    const r = await fetch(base + p, { method: m, headers: { ...(b ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: b ? JSON.stringify(b) : undefined });
    return { s: r.status, j: await r.json().catch(() => ({})), cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
  };

  const h = await J('GET', '/api/health');
  assert(h.s === 200 && h.j.authRequired === true, 'OB-01 인증 모드 기동 — health authRequired');
  const denied = await J('GET', '/api/cases');
  assert(denied.s === 401, 'OB-02 무인증 차단 — 케이스 API 401');
  const bad = await J('POST', '/api/auth/login', { code: 'MIRI-WRONG-0000' });
  assert(bad.s === 401, 'OB-04 잘못된 초대코드 거부 — 401');
  const login = await J('POST', '/api/auth/login', { code: 'MIRI-CLINIC-2026' });
  assert(login.s === 200 && login.j.role === 'clinic' && login.cookie.includes('mm_session='), 'OB-03 초대코드 로그인 — clinic 세션 발급');
  const me = await J('GET', '/api/auth/me', null, login.cookie);
  assert(me.s === 200 && me.j.role === 'clinic', 'OB-03b 세션 조회 — /api/auth/me');
  const cases = await J('GET', '/api/cases', null, login.cookie);
  assert(cases.s === 200, 'OB-03c 인증 후 케이스 조회 — 200');
  const bk = await J('POST', '/api/maintenance/backup', {}, login.cookie);
  assert(bk.s === 200 && bk.j.file && fs.existsSync(path.join(dir, 'backups', bk.j.file)), 'OB-05 온라인 백업 — 파일 생성');
  await new Promise(r => srv.close(r));

  /* 복원: 운영자가 백업 파일을 라이브 DB로 되돌린 상황을 재연 */
  fs.copyFileSync(path.join(dir, 'backups', bk.j.file), path.join(dir, 'restored.db'));
  const srv2 = createApp({ auth: true, persist: path.join(dir, 'restored.db') }).listen(0, '127.0.0.1');
  await new Promise(r => srv2.on('listening', r));
  const base2 = 'http://127.0.0.1:' + srv2.address().port;
  const h2 = await fetch(base2 + '/api/health').then(r => r.json());
  assert(h2.cases === 5 && h2.authRequired === true, 'OB-06 복원 리허설 — 케이스 5·인증 모드 유지');
  await new Promise(r => srv2.close(r));
  fs.rmSync(dir, { recursive: true, force: true });

  console.log('--- S103 onboarding smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
