/* smoke_s16.js — S16 스모크 (M1): 초대코드 인증(ADR-002) + SQLite 영속(ADR-003) + 클라 로그인 게이트
   실행: cd /home/user/tests && node smoke_s16.js
   참고: better-sqlite3 필요 — cd /home/user/mirimiso-webapp && npm install (데모 기본 모드는 불필요) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp, sqliteRaw } = require('/home/user/mirimiso-webapp/server/server.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg);
  cond ? pass++ : (fail++, process.exitCode = 1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BUNDLE = fs.readFileSync('/home/user/미리미소-웹앱.html', 'utf8');

/* 요청용 cookie 헤더 문자열 */
function cookieOf(token) { return { 'Content-Type': 'application/json', Cookie: 'mm_session=' + token }; }
/* set-cookie 응답 헤더에서 토큰 추출 */
function tokenFrom(res) {
  const raw = res.headers.get('set-cookie') || '';
  const m = /mm_session=([^;]+)/.exec(raw);
  return m ? m[1] : null;
}

(async () => {
  console.log('=== A0. 데모 기본 모드 — 인증 비활성 (기존 동작 불변 가드) ===');
  const srvD = createApp().listen(0, '127.0.0.1');
  await sleep(120);
  const baseD = 'http://127.0.0.1:' + srvD.address().port;
  const hD = await (await fetch(baseD + '/api/health')).json();
  assert(hD.authRequired === false, '기본 모드: health.authRequired = false (역할 카드 진입 유지)');
  const loginD = await fetch(baseD + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'MIRI-CLINIC-2026' }) });
  assert(loginD.status === 400, '기본 모드: /api/auth/login → 400 (인증 모드 아님)');
  await new Promise(r => srvD.close(r));

  console.log('=== A. 인증 모드 — 초대코드·세션·역할 바인딩 (ADR-002) ===');
  const srvA = createApp({ auth: true }).listen(0, '127.0.0.1');
  await sleep(120);
  const base = 'http://127.0.0.1:' + srvA.address().port;
  const J = async (m, p, b, tok) => {
    const res = await fetch(base + p, { method: m, headers: b || tok ? cookieOf(tok || '') : undefined, body: b ? JSON.stringify(b.body || b) : undefined });
    return { status: res.status, json: await res.json().catch(() => ({})), res };
  };

  let r = await J('GET', '/api/cases');
  assert(r.status === 401 && r.json.authRequired === true, '미인증 /api/cases → 401 + authRequired');
  r = await J('GET', '/api/health');
  assert(r.json.authRequired === true, 'health: authRequired true (게이트 예외)');
  r = await J('POST', '/api/auth/login', { code: 'MIRI-WRONG' });
  assert(r.status === 401, '잘못된 초대코드 → 401');
  r = await J('POST', '/api/auth/login', { body: { code: 'MIRI-CLINIC-2026' } });
  const tokClinic = tokenFrom(r.res);
  assert(r.status === 200 && r.json.role === 'clinic' && !!tokClinic, '의료진 코드 로그인 → 200 + HttpOnly 세션 쿠키');

  r = await J('GET', '/api/cases', null, tokClinic);
  assert(r.status === 200 && r.json.cases.length === 5 && !!r.json.cases[0].plan, '세션으로 /api/cases → 5건 전체 필드 (clinic)');
  r = await J('GET', '/api/audit?limit=50', null, tokClinic);
  assert(r.json.audit.some(a => a.act === 'login'), '감사로그에 login 기록 (M1)');

  r = await J('POST', '/api/auth/login', { body: { code: 'MIRI-PAT-2601' } });
  const tokPat = tokenFrom(r.res);
  assert(r.status === 200 && r.json.role === 'patient' && r.json.caseId === 'C-2601', '환자 코드 로그인 → caseId C-2601 바인딩');
  r = await J('GET', '/api/cases', null, tokPat);
  assert(r.json.cases.length === 1 && r.json.cases[0].id === 'C-2601' && !r.json.cases[0].plan, '환자 목록 = 자기 케이스 1건 · 임상 필드 제외');
  r = await J('GET', '/api/cases/C-2602', null, tokPat);
  assert(r.status === 403, '환자 타 케이스 열람 → 403');
  r = await J('POST', '/api/cases', { body: { role: 'clinic', patient: '위조시도', tooth: '36', proc: '역할 위조' } }, tokPat);
  assert(r.status === 403, '환자 세션 + role 위조(clinic) → 403 (세션 권한 우선 · D51)');

  r = await J('POST', '/api/auth/login', { body: { code: 'MIRI-LAB-2026' } });
  const tokLab = tokenFrom(r.res);
  r = await J('GET', '/api/cases', null, tokLab);
  assert(r.status === 200 && r.json.cases.some(c => c._masked), '기공소 세션 → 마스킹 응답 유지 (_masked)');

  r = await J('POST', '/api/auth/logout', { body: {} }, tokPat);
  assert(r.status === 200, '로그아웃 → 200');
  r = await J('GET', '/api/auth/me', null, tokPat);
  assert(r.status === 401, '로그아웃 후 /api/auth/me → 401');
  await new Promise(res2 => srvA.close(res2));

  console.log('=== B. SQLite 영속 (ADR-003) — 재시작 생존 · 세션 유지 · reset 복원 ===');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-s16-'));
  const dbfile = path.join(tmp, 'pilot.db');
  const srvB = createApp({ auth: true, persist: dbfile }).listen(0, '127.0.0.1');
  await sleep(150);
  const baseB = 'http://127.0.0.1:' + srvB.address().port;
  const JB = async (m, p, b, tok) => {
    const res = await fetch(baseB + p, { method: m, headers: cookieOf(tok || ''), body: b ? JSON.stringify(b.body || b) : undefined });
    return { status: res.status, json: await res.json().catch(() => ({})), res };
  };
  const raw1 = sqliteRaw();
  assert(raw1 && raw1.pragma('journal_mode')[0].journal_mode === 'wal', 'SQLite WAL 모드');
  r = await JB('POST', '/api/auth/login', { body: { code: 'MIRI-CLINIC-2026' } });
  const tokB = tokenFrom(r.res);
  r = await JB('POST', '/api/cases', { body: { role: 'clinic', patient: '영속테스트', tooth: '46', proc: 'M1 영속 검증 (데모)' } }, tokB);
  assert(r.status === 200 && r.json.case.id === 'C-2606', '영속 모드: 케이스 생성 (C-2606) — 세션 role로 권한 통과');
  await new Promise(res2 => srvB.close(res2));
  assert(fs.existsSync(dbfile), '서버 종료 후 DB 파일 존재');

  const srvB2 = createApp({ auth: true, persist: dbfile }).listen(0, '127.0.0.1');
  await sleep(150);
  const baseB2 = 'http://127.0.0.1:' + srvB2.address().port;
  const JB2 = async (m, p, b, tok) => {
    const res = await fetch(baseB2 + p, { method: m, headers: cookieOf(tok || ''), body: b ? JSON.stringify(b.body || b) : undefined });
    return { status: res.status, json: await res.json().catch(() => ({})), res };
  };
  r = await JB2('GET', '/api/auth/me', null, tokB);
  assert(r.status === 200 && r.json.role === 'clinic', '재시작 후 기존 세션 쿠키 유효 (sessions 영속)');
  r = await JB2('GET', '/api/cases', null, tokB);
  assert(r.json.cases.length === 6 && r.json.cases.some(c => c.id === 'C-2606'), '재시작 후 생성 케이스 생존 (6건 · C-2606)');
  r = await JB2('POST', '/api/reset', { body: {} }, tokB);
  assert(r.status === 200, '영속 모드 reset → 200');
  r = await JB2('GET', '/api/cases', null, tokB);
  assert(r.json.cases.length === 5 && !r.json.cases.some(c => c.id === 'C-2606'), 'reset 후 시드 5건 복원');
  await new Promise(res2 => srvB2.close(res2));

  console.log('=== C. 온라인 통합 — 클라 초대코드 게이트 (의료진·환자) ===');
  const srvC = createApp({ auth: true }).listen(0, '127.0.0.1');
  await sleep(120);
  const baseC = 'http://127.0.0.1:' + srvC.address().port;

  function mkdom(jar) {
    const errors = [];
    const dom = new JSDOM(BUNDLE, {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      url: baseC + '/',
      beforeParse(w) {
        w.fetch = (u, o) => {
          o = o || {};
          const ck = Object.keys(jar).map(k => k + '=' + jar[k]).join('; ');
          o.headers = Object.assign({}, o.headers, ck ? { Cookie: ck } : {});
          return fetch(new URL(u, baseC + '/').href, o).then(res => {
            const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
            sc.forEach(c => { const kv = c.split(';')[0]; const i = kv.indexOf('='); if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1); });
            return res;
          });
        };
        w.addEventListener('error', e => errors.push('onerror: ' + e.message));
      }
    });
    return { dom, errors, w: dom.window, d: dom.window.document, $: s => dom.window.document.querySelector(s) };
  }

  /* C1: 의료진 로그인 여정 */
  const c1 = mkdom({});
  await sleep(700);
  assert(c1.w.MM.Api.online === true && c1.w.MM.Api.authRequired === true && !!c1.$('#inviteCode'), 'auth 모드 감지 → 역할 카드 대신 초대코드 게이트');
  c1.$('#inviteCode').value = 'MIRI-WRONG';
  c1.$('#codeLogin').click();
  await sleep(300);
  assert(c1.$('#codeErr').style.display === 'block' && c1.$('#codeErr').textContent.includes('유효하지 않은'), '잘못된 코드 → 게이트 내 오류 메시지');
  c1.$('#inviteCode').value = 'MIRI-CLINIC-2026';
  c1.$('#codeLogin').click();
  await sleep(600);
  assert(!!c1.$('#agreeRow'), '로그인 성공 → 기존 동의 모달 흐름 유지');
  c1.$('#agreeRow').click();
  c1.$('#agreeBtn').click();
  await sleep(400);
  assert(c1.d.getElementById('roleChip').textContent === '의료진 모드' && c1.w.MM.CASES_DATA.items.length === 5, '의료진 세션 진입 — staffHome·케이스 5건 수신');
  assert(c1.errors.length === 0, 'C1 최종: errors 없음' + (c1.errors.length ? ' → ' + c1.errors.join('|') : ''));
  await c1.dom.window.close();

  /* C2: 환자 로그인 → 자기 케이스 진행 카드 */
  const c2 = mkdom({});
  await sleep(700);
  c2.$('#inviteCode').value = 'MIRI-PAT-2601';
  c2.$('#codeLogin').click();
  await sleep(600);
  if (c2.$('#agreeRow')) { c2.$('#agreeRow').click(); c2.$('#agreeBtn').click(); }
  await sleep(400);
  const home2 = c2.$('#root').textContent;
  assert(home2.includes('치료 케이스 시작') && home2.includes('6/8 단계 · 제작'), '환자 로그인 → C-2601 진행 카드 (제작 6/8 · 케이스 바인딩 · S13 연계)');
  assert(c2.errors.length === 0, 'C2 최종: errors 없음' + (c2.errors.length ? ' → ' + c2.errors.join('|') : ''));
  await c2.dom.window.close();
  await new Promise(res2 => srvC.close(res2));

  console.log('--- S16 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
