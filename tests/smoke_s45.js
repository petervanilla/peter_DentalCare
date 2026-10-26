/* smoke_s45.js — S45 스모크: 트래픽 절감·오류 절감 (ETag/304·gzip·SSE 병합·자동재접속 존중·모달 보류)
   실행: cd /home/user/tests && node smoke_s45.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const { createApp } = require('/home/user/mirimiso-webapp/server/server.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg);
  cond ? pass++ : (fail++, process.exitCode = 1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BUNDLE = fs.readFileSync('/home/user/미리미소-웹앱.html');

(async () => {
  console.log('=== A. 서버 — ETag/304·gzip (TR-01/02) ===');
  const srv = createApp().listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  await sleep(120);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const h = await (await fetch(base + '/api/health')).json();
  assert(parseInt(h.version.slice(1), 10) >= 45, 'health: version S45 이상');

  const r1 = await fetch(base + '/bundle', { headers: { 'Accept-Encoding': 'gzip' } });
  const body1 = Buffer.from(await r1.arrayBuffer());
  assert(r1.headers.get('content-encoding') === 'gzip' && body1.length === BUNDLE.length,
    '/bundle gzip 전송 — 수신 자동 복원 후 원본과 동일 (' + body1.length + 'B)');

  const etag = r1.headers.get('etag');
  const r2 = await fetch(base + '/bundle', { headers: { 'If-None-Match': etag } });
  const body2 = await r2.arrayBuffer();
  assert(r2.status === 304 && body2.byteLength === 0, '/bundle 재요청 → 304 (260KB 재전송 제거·전송 0B)');

  const s1 = await fetch(base + '/');
  const etagS = s1.headers.get('etag');
  const s2 = await fetch(base + '/', { headers: { 'If-None-Match': etagS } });
  assert(s1.status === 200 && etagS && s2.status === 304, '정적(index) ETag → 재요청 304');

  const c1 = await fetch(base + '/api/cases?role=clinic', { headers: { 'Accept-Encoding': 'gzip' } });
  assert(c1.headers.get('content-encoding') === 'gzip' && (await c1.json()).cases.length === 5,
    '/api/cases pull 응답 gzip (1KiB 초과) — 내용 무결');
  const h2 = await (await fetch(base + '/api/health')).json();
  const rH = await fetch(base + '/api/health');
  assert(h2.ok === true && rH.headers.get('content-encoding') === null, '소형 응답(health)은 무압축 — 임계 적용');

  console.log('=== B. 클라 — SSE 병합·폴백·모달 보류 (TR-03/04·ER-01) ===');
  let FakeRS = 1;
  const jar = {}; let casePulls = 0;
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: base + '/', beforeParse(w) {
    w.EventSource = function (u) { this.url = u; this.readyState = FakeRS; this.close = function () {}; };
    w.fetch = (u, o) => { o = o || {}; const ck = Object.keys(jar).map(k => k + '=' + jar[k]).join('; '); o.headers = Object.assign({}, o.headers, ck ? { Cookie: ck } : {}); const url = String(u); return fetch(new URL(url, base + '/').href, o).then(res => { (res.headers.getSetCookie ? res.headers.getSetCookie() : []).forEach(c => { const kv = c.split(';')[0]; const i = kv.indexOf('='); if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1); }); if (url.indexOf('/api/cases') >= 0) casePulls++; return res; }); };
    w.scrollTo = () => {};
  } });
  const w = dom.window, d = w.document;
  await sleep(900); /* 기동·초기 로드 정착 */
  const Api = w.MM.Api;
  assert(Api.es && !Api.timer, 'SSE 우선 연결 (폴링 미가동)');

  casePulls = 0;
  const seq0 = Api.seq;
  Api.es.onmessage({ data: JSON.stringify({ seq: seq0 + 5 }) });
  Api.es.onmessage({ data: JSON.stringify({ seq: seq0 + 5 }) });
  await sleep(700);
  assert(casePulls === 1, '버스트 이벤트 2건 → pull 1회 병합 (300ms 창·TR-03 — 서버 seq 기준 재동기화)');

  Api.stop(); FakeRS = 0; Api.start();
  const es2 = Api.es;
  es2.onerror();
  assert(Api.es === es2 && !Api.timer, '일시 끊김(CONNECTING) — 자동재접속 존중·폴링 전환 안 함 (TR-04)');

  Api.stop(); FakeRS = 2; Api.start();
  const es3 = Api.es;
  es3.onerror();
  assert(Api.es === null && !!Api.timer, '완전 종료(CLOSED) — 폴링 폴백 전환');
  Api.stop();

  Api.start(); /* SSE 복귀 상태에서 모달 보류 검증 */
  await sleep(100);
  w.MM.app.modal('<div class="grab"></div><h3>보류 검증</h3>');
  const canaryEl = d.querySelector('.view div');
  if (canaryEl) canaryEl.setAttribute('data-canary', '1');
  Api.es.onmessage({ data: JSON.stringify({ seq: Api.seq + 1 }) });
  await sleep(500);
  const holdOk = Api.rerenderRetry !== null && d.querySelector('[data-canary]');
  w.MM.app.closeModal();
  await sleep(1700);
  const doneEl = d.querySelector('[data-canary]');
  assert(holdOk, '모달 열림 중 동기화 — 그리기 보류·재시도 예약 (입력 보존·ER-01)');
  assert(!doneEl, '모달 닫힘 후 1회 재시도 — 보류분 화면 반영 완료');

  console.log('=== C. 문서 — 명세 AC-45 ===');
  const spec = fs.readFileSync('/home/user/미리미소-작업명세.md', 'utf8');
  assert(spec.includes('AC-45') && spec.includes('TR-01') && spec.includes('ER-01'), '명세 AC-45 (트래픽·오류 절감) 반영');

  if (srv.closeAllConnections) srv.closeAllConnections();
  await new Promise(r => srv.close(r));
  console.log('--- S45 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
})();
