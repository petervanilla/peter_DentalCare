/* smoke_s17.js — S17 스모크 (M2): 스캔 파일 스토리지(ADR-004) + SSE 실시간(ADR-005) + SQLite 증분 기록(D50)
   실행: cd /home/user/tests && node smoke_s17.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createApp, sqliteRaw } = require('/home/user/mirimiso-webapp/server/server.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg);
  cond ? pass++ : (fail++, process.exitCode = 1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BUNDLE = fs.readFileSync('/home/user/미리미소-웹앱.html', 'utf8');

(async () => {
  console.log('=== A. 서버 — 스캔 파일 스토리지 (ADR-004, 데모 모드) ===');
  const srvA = createApp().listen(0, '127.0.0.1');
  await sleep(120);
  const base = 'http://127.0.0.1:' + srvA.address().port;
  const api = (m, p, body, raw) => fetch(base + p, { method: m, headers: body ? { 'Content-Type': raw ? 'application/octet-stream' : 'application/json' } : undefined, body: body ? (raw ? body : JSON.stringify(body)) : undefined });
  const h = await (await api('GET', '/api/health')).json();
  assert(h.files === true && h.sse === true, 'health: files·sse 플래그 (M2)');

  let cases = (await (await api('GET', '/api/cases')).json()).cases;
  let c = cases.find(x => (x.scanSessions || []).length);
  if (!c) { await api('POST', '/api/cases/' + cases[0].id + '/sessions', { role: 'clinic', session: { label: 's17 체크 (데모)' } }); c = cases[0]; }
  const sid = (c.scanSessions || [])[0].id;
  const payload = Buffer.from('solid s17\nendsolid s17\n' + 'B'.repeat(4096));
  const shaLocal = crypto.createHash('sha256').update(payload).digest('hex');

  const up = await api('POST', '/api/cases/' + c.id + '/sessions/' + sid + '/files?filename=s17-check.stl', payload, true);
  const uj = await up.json();
  assert(up.status === 200 && uj.sha256 === shaLocal, '업로드 → 200 · SHA-256 서버 기록 일치');
  cases = (await (await api('GET', '/api/cases')).json()).cases;
  const c2 = cases.find(x => x.id === c.id);
  const fm = (c2.scanSessions.find(x => x.id === sid).files || [])[0];
  assert(fm && fm.name === 's17-check.stl' && fm.size === payload.length && fm.sha256 === shaLocal, '세션 파일 메타 영속 데이터에 반영 (name·size·sha256)');

  const dn = await fetch(base + '/api/cases/' + c.id + '/sessions/' + sid + '/files?f=' + fm.id);
  const got = Buffer.from(await dn.arrayBuffer());
  assert(got.equals(payload) && dn.headers.get('x-sha256') === shaLocal, '다운로드 바이트 완전 일치 + X-SHA256 헤더');

  const bad = await api('POST', '/api/cases/' + c.id + '/sessions/' + sid + '/files?filename=virus.exe', payload, true);
  assert(bad.status === 400, '포맷 화이트리스트 외(.exe) → 400');
  const nf = await api('GET', '/api/cases/' + c.id + '/sessions/' + sid + '/files?f=F-9999-9');
  assert(nf.status === 404, '없는 파일 → 404');
  const lab = await api('POST', '/api/cases/' + c.id + '/sessions/' + sid + '/files?role=lab&filename=x.stl', payload, true);
  assert(lab.status === 403, 'lab 권한 업로드 → 403');
  const mx = await (await api('GET', '/api/metrics')).json();
  assert(mx.activity.uploads >= 1 && mx.activity.downloads >= 1, 'activity 계수: uploads·downloads 반영');
  const hist = c2.history[0] && c2.history[0].t || '';
  assert(hist.includes('스캔 파일 업로드'), '케이스 히스토리에 업로드 기록');
  await new Promise(r => srvA.close(r));

  console.log('=== B. SSE 실시간 (ADR-005) ===');
  const srvB = createApp().listen(0, '127.0.0.1');
  await sleep(120);
  const baseB = 'http://127.0.0.1:' + srvB.address().port;
  const ctrl = new AbortController();
  const sse = await fetch(baseB + '/api/stream', { signal: ctrl.signal });
  assert((sse.headers.get('content-type') || '').includes('text/event-stream'), 'SSE content-type');
  const reader = sse.body.getReader();
  let buf = '';
  const collector = (async () => { try { while (1) { const { done, value } = await reader.read(); if (done) break; buf += Buffer.from(value).toString(); } } catch (e) {} })();
  await sleep(200);
  assert(buf.includes('"hello":true'), 'SSE 첫 이벤트 수신 (hello)');
  const seq0 = (await (await fetch(baseB + '/api/events')).json()).seq;
  await fetch(baseB + '/api/cases/C-2601', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'clinic', patch: { urgent: true } }) });
  const t0 = Date.now();
  while (Date.now() - t0 < 3000 && !buf.includes('"seq":' + (seq0 + 1))) await sleep(80);
  assert(buf.includes('"seq":' + (seq0 + 1)), '변이 → SSE 푸시 수신 (' + (Date.now() - t0) + 'ms)');
  ctrl.abort();
  await collector.catch(() => {});
  if (srvB.closeAllConnections) srvB.closeAllConnections();
  await new Promise(r => srvB.close(r));

  console.log('=== C. SQLite 증분 기록 + 영속 (D50) ===');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-s17-'));
  const dbf = path.join(tmp, 'pilot.db');
  let srvC = createApp({ auth: true, persist: dbf }).listen(0, '127.0.0.1');
  await sleep(150);
  const baseC = 'http://127.0.0.1:' + srvC.address().port;
  const H = tok => ({ 'Content-Type': 'application/json', Cookie: 'mm_session=' + tok });
  const login = async b2 => {
    const r = await fetch(b2 + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'MIRI-CLINIC-2026' }) });
    return (r.headers.get('set-cookie') || '').split(';')[0].split('=')[1];
  };
  const tok = await login(baseC);
  await fetch(baseC + '/api/cases', { method: 'POST', headers: H(tok), body: JSON.stringify({ patient: '증분테스트', tooth: '36', proc: 'D50 검증 (데모)' }) });
  const raw = sqliteRaw();
  const nCases = raw.prepare('SELECT count(*) n FROM cases').get().n;
  const nChanges = raw.prepare('SELECT count(*) n FROM case_changes').get().n;
  assert(nCases === 6 && nChanges >= 1, '증분 기록 — cases ' + nCases + '·changes ' + nChanges + ' (전체 재기록 없이 행 추가)');
  if (srvC.closeAllConnections) srvC.closeAllConnections();
  await new Promise(r => srvC.close(r));

  srvC = createApp({ auth: true, persist: dbf }).listen(0, '127.0.0.1');
  await sleep(150);
  const baseC2 = 'http://127.0.0.1:' + srvC.address().port;
  const tok2 = await login(baseC2);
  const cases2 = (await (await fetch(baseC2 + '/api/cases', { headers: H(tok2) })).json()).cases;
  assert(cases2.length === 6 && cases2.some(x => x.proc === 'D50 검증 (데모)'), '재시작 → 증분 기록분 생존 (6건)');
  await fetch(baseC2 + '/api/reset', { method: 'POST', headers: H(tok2) });
  if (srvC.closeAllConnections) srvC.closeAllConnections();
  await new Promise(r => srvC.close(r));
  srvC = createApp({ auth: true, persist: dbf }).listen(0, '127.0.0.1');
  await sleep(150);
  const baseC3 = 'http://127.0.0.1:' + srvC.address().port;
  const tok3 = await login(baseC3);
  const cases3 = (await (await fetch(baseC3 + '/api/cases', { headers: H(tok3) })).json()).cases;
  assert(cases3.length === 5, 'reset 후 재시작 → 시드 5건 (리셋 영속 버그 수정 검증)');
  if (srvC.closeAllConnections) srvC.closeAllConnections();
  await new Promise(r => srvC.close(r));

  console.log('=== D. 클라이언트 통합 — 파일 업로드 훅 + 폴링 폴백 ===');
  const srvD = createApp().listen(0, '127.0.0.1');
  await sleep(120);
  const baseD = 'http://127.0.0.1:' + srvD.address().port;
  const errors = [];
  const dom = new JSDOM(BUNDLE, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: baseD + '/',
    beforeParse(w) {
      w.fetch = (u, o) => fetch(new URL(u, baseD + '/').href, o);
      w.addEventListener('error', e => errors.push('onerror: ' + e.message));
    }
  });
  const w = dom.window, d = w.document, $ = s => d.querySelector(s);
  await sleep(700);
  assert(w.MM.Api.online === true && typeof w.EventSource === 'undefined', 'jsdom: EventSource 없음 → 폴링 폴백 경로');
  const upBuf = Buffer.from('solid s17d\nendsolid s17d');
  const okUp = await w.MM.Api.uploadScanFile('C-2601', 'SS-2601-1', { name: 'client.stl', arrayBuffer: () => Promise.resolve(upBuf) });
  assert(okUp === true, 'Api.uploadScanFile → 서버 저장 (더크 타입 파일)');
  const upJ = await (await fetch(baseD + '/api/cases/C-2601')).json();
  const fD = (((upJ.case.scanSessions || [])[0] || {}).files || [])[0];
  assert(fD && fD.sha256 === crypto.createHash('sha256').update(upBuf).digest('hex'), '클라 업로드 파일 SHA-256 서버 일치');
  /* 폴링 폴백 검증: API 직접 변이 → dom 수신 (2초 폴링) */
  await fetch(baseD + '/api/cases/C-2602', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'clinic', patch: { urgent: true } }) });
  const t1 = Date.now();
  while (Date.now() - t1 < 3500) {
    const cc = w.MM.CASES_DATA.items.find(x => x.id === 'C-2602');
    if (cc && cc.urgent === true) break;
    await sleep(120);
  }
  const cc2 = w.MM.CASES_DATA.items.find(x => x.id === 'C-2602');
  assert(cc2 && cc2.urgent === true, '폴링 폴백: 외부 변이 → dom 반영 (' + (Date.now() - t1) + 'ms)');
  assert(errors.length === 0, 'D 최종: errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  await dom.window.close();
  if (srvD.closeAllConnections) srvD.closeAllConnections();
  await new Promise(r => srvD.close(r));

  console.log('--- S17 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
