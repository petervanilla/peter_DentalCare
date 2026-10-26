/* smoke_s15.js — S15 스모크: 운영 지표 카드 활동(activity) 시각화 — 서버 집계 → 지표 카드 바 차트
   실행: cd /home/user/tests && node smoke_s15.js */
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

  console.log('=== A. 서버 — activity 집계 기준선 ===');
  await J('POST', '/api/reset');
  let mx = await J('GET', '/api/metrics');
  const keys = ['changes', 'audit', 'uploads', 'downloads', 'exports'];
  assert(keys.every(k => typeof mx.activity[k] === 'number'), 'metrics.activity: 5개 계수 필드');
  assert(keys.every(k => mx.activity[k] === 0), 'reset 직후 activity 전부 0 (기준선)');
  await J('POST', '/api/events/log', { role: 'clinic', kind: 'upload' });
  await J('POST', '/api/events/log', { role: 'lab', kind: 'download' });
  await J('POST', '/api/events/log', { role: 'clinic', kind: 'export' });
  mx = await J('GET', '/api/metrics');
  assert(mx.activity.uploads === 1 && mx.activity.downloads === 1 && mx.activity.exports === 1, '이벤트 3건 → uploads/downloads/exports 각 1');
  assert(mx.funnel && mx.funnel.cases >= 5, 'funnel 시드 유지 (케이스 ' + mx.funnel.cases + '건)');
  await J('POST', '/api/reset');
  mx = await J('GET', '/api/metrics');
  assert(keys.every(k => mx.activity[k] === 0), 'reset: activity 복원');

  console.log('=== B. 온라인 통합 — 케이스 허브 지표 카드 활동 바 ===');
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
  await sleep(700);
  assert(w.MM.Api.online === true, '온라인 감지');
  assert(await w.MM.Api.pushEvent('upload') === true, 'pushEvent(upload) → 서버 보고 (업로드 1건)');
  $('.role-card').parentNode.querySelectorAll('.role-card')[1].click();
  if ($('#agreeRow')) { $('#agreeRow').click(); $('#agreeBtn').click(); }
  w.MM.app.go('caseHub');
  await sleep(600);
  const act = $('#mxAct');
  assert(!!act, '지표 카드: #mxAct 활동 섹션 렌더');
  assert(d.querySelectorAll('#mxAct .mxbar').length === 5, '활동 바 5개 (업로드·다운로드·익스포트·변경·감사)');
  const bars = [...d.querySelectorAll('#mxAct .mxbar')].map(b => parseInt(b.style.width) || 0);
  assert(act.textContent.includes('스캔 업로드') && bars[0] > bars[1], '업로드 바가 최대치 — 나머지 0 대비 우위 (width ' + bars[0] + '% > ' + bars[1] + '%)');
  assert(act.textContent.includes('가상 데이터'), '고지: 데모 가상 데이터 명시');
  const mode = $('#mxMode');
  assert(mode && mode.textContent.includes('서버 계량'), '#mxMode = 서버 계량 · /api/metrics');
  assert(errors.length === 0, 'B 최종: errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  await dom.window.close();

  console.log('=== C. 오프라인 — 활동 섹션 미표시(서버 집계 전용) ===');
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
  assert(w2.MM.Api.online === false, '오프라인 모드');
  $2('.role-card').parentNode.querySelectorAll('.role-card')[1].click();
  if ($2('#agreeRow')) { $2('#agreeRow').click(); $2('#agreeBtn').click(); }
  w2.MM.app.go('caseHub');
  await sleep(100);
  assert(!$2('#mxAct') && $2('#mxMode').textContent.includes('로컬 계량'), '오프라인: 활동 섹션 없음 + 로컬 계량 폴백');
  assert($2('#mxBody').querySelectorAll('.stat-chip').length === 6, '로컬 칩 6개 유지 (케이스·세션·주문·전환·긴급·수정)');
  assert(errors2.length === 0, 'C 최종: errors 없음' + (errors2.length ? ' → ' + errors2.join('|') : ''));
  await dom2.window.close();
  server.close();

  console.log('--- S15 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
