#!/usr/bin/env node
/* S111 스모크 — 게이트 지표 목표/실측 구분 표시 (AC-112 · PRD §19 T-05 · F-19 · §4.3):
   GT-01 게이트 카드에 목표(70% · 목표치)와 실측(서버 계측 활성율)이 라벨로 구분 표시
   GT-02 데모 모드에서는 '실측 없음 — 인증 모드에서 계측' 명시
   GT-03 판정(통과/미달)은 실측↔목표 비교로만 표기 (서버 pass = ratePct>=70 · 데모는 판정 없음)
   EX-01 번들 ≤283,000B · 헤드룸 ≥100B
   실행: cd /home/user/tests && node smoke_s111.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const BUNDLE = fs.readFileSync(path.join(root, '미리미소-웹앱.html'), 'utf8');
const bundleBytes = fs.statSync(path.join(root, '미리미소-웹앱.html')).size;
const LIMIT = 283000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

(async () => {
  /* A. 서버 — 판정은 실측↔목표 비교로만 (GT-03 서버 근거) */
  const { createApp } = require(path.join(root, 'mirimiso-webapp/server/server.js'));
  try { fs.unlinkSync('/tmp/s111t.db'); } catch (e) {}
  const srv = createApp({ auth: true, persist: '/tmp/s111t.db' }).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  await sleep(150);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const J = async (m, p, ck) => await (await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', ...(ck ? { Cookie: ck } : {}) } })).json();
  const login = async code => {
    const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    return 'mm_session=' + (r.headers.get('set-cookie') || '').split(';')[0].split('=')[1];
  };
  const ckC = await login('MIRI-CLINIC-2026');
  await login('MIRI-PAT-2601');
  const g1 = await J('GET', '/api/metrics/gate', ckC);
  assert(g1.ratePct === 67 && g1.pass === false && g1.pass === (g1.ratePct >= 70),
    'GT-03 서버: 실측 67% < 목표 70% → 미달 (판정은 비교로만)');
  await login('MIRI-LAB-2026');
  const g2 = await J('GET', '/api/metrics/gate', ckC);
  assert(g2.ratePct === 100 && g2.pass === true && g2.def === '월간 활성율 70%',
    'GT-03 서버: 실측 100% ≥ 목표 70% → 통과 · 목표 정의 필드 유지');
  if (srv.closeAllConnections) srv.closeAllConnections();
  await new Promise(r => srv.close(r));

  /* B. 클라이언트 — 데모 모드 운영 대시보드 게이트 카드 */
  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const w = dom.window, d = w.document;
  await sleep(900);
  w.eval('A.chooseRole("staff")');
  await sleep(400);
  const ag = d.getElementById('agreeRow'); ag && ag.click(); await sleep(150);
  const ab = d.getElementById('agreeBtn'); ab && ab.click(); await sleep(600);
  w.eval('A.go("opsDash")');
  await sleep(900);
  const gate = d.getElementById('odGate');
  assert(!!gate, 'GT-01 운영 대시보드 — 게이트 1 카드 존재');
  const card = gate ? gate.closest('.card') : null;
  const cardT = card ? card.textContent.replace(/\s+/g, ' ') : '';
  const gateT = gate ? gate.textContent.replace(/\s+/g, ' ') : '';
  assert(cardT.includes('목표: 월간 활성율 70%') && cardT.includes('계약 전환 판정'),
    'GT-01 카드 배지 — 목표 라벨 (목표: 월간 활성율 70%)');
  assert(cardT.includes('실측 = 최근 30일 활동 계정 ÷ 전체 계정 (서버 계측)')
    && cardT.includes('목표 70%는 §4.3 목표치로 실측과 구분해 표시'),
    'GT-01 하단 고지 — 실측 정의(서버 계측)와 목표(§4.3 목표치) 구분 표기');
  assert(gateT.includes('실측 없음') && gateT.includes('인증 모드(계정)에서 제공됩니다')
    && gateT.includes('목표: 게이트 1 활성율 70% 이상 (목표치)'),
    'GT-02 데모 — 실측 없음 · 인증 모드에서 계측 · 목표치 병기');
  assert(!gateT.includes('판정:') && !/통과|미달/.test(gateT),
    'GT-03 데모 — 실측 없으면 판정(통과/미달) 미표기');
  assert(BUNDLE.includes('실측</b> 활성율') && BUNDLE.includes('목표</b> 70% 이상 · 판정:'),
    'GT-03 인증 표시형 — 실측 라벨 + 목표 라벨 + 판정 (실측↔목표 비교)');
  assert(errors.length === 0, 'GT-01 런타임 오류 0' + (errors.length ? ' → ' + errors.join('|') : ''));
  dom.window.close();

  assert(bundleBytes <= LIMIT && (LIMIT - bundleBytes) >= 100,
    'EX-01 번들 ' + bundleBytes + 'B ≤ 283,000B · 헤드룸 ' + (LIMIT - bundleBytes) + 'B');
  console.log(`\nTOTAL: ${passed} passed / ${failed} failed`);
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
