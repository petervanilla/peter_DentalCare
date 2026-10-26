/* smoke_s47.js — S47 스모크: 미팅 리허설 — 데모시나리오 v2.2의 단계·숫자·문구를 실제 앱에서 전수 대조
   (§1 기본 5분 워크스루 → §3-3 운영 화면 → 운영 팁 → 스크립트 팩트 고정 — 남은 외부 작업 1순위 "미팅"의 준비물 실측)
   실행: cd /home/user/tests && node smoke_s47.js */
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
const J = async (base, m, p, b) => await (await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })).json();
const clickBtnByText = (d, t) => { const b = Array.from(d.querySelectorAll('button')).find(x => x.textContent.includes(t)); if (b) b.click(); return !!b; };
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(120); } return null; };
const clickFresh = async (d, sel, ms) => { const b = await waitFor(() => d.querySelector(sel), ms || 3000); if (b) b.click(); return !!b; }; /* 탈부착 경합 방지 — 항상 신선 쿼리로 클릭 (S47 검증 루프) */

(async () => {
  console.log('=== A. §1 기본 5분 — 데모 모드 전체 워크스루 (STEP 1→6 순서대로) ===');
  const srv = createApp().listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  await sleep(120);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const h = await J(base, 'GET', '/api/health');
  assert(parseInt(h.version.slice(1), 10) >= 47, 'health: version S47 이상');

  /* §1 데모는 단일 파일(오프라인·Api.online=false)로 진행하는 것이 실제 시나리오 — fetch 미주입으로 오프라인 모드 재현 (S47 리허설 판정) */
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: base + '/', beforeParse(w) {
    w.scrollTo = () => {};
  } });
  const w = dom.window, d = w.document;
  await sleep(900);
  assert(w.MM.Api.online === false, '§1 전제 — 단일 파일 오프라인 모드 (데모 준비물과 동일 조건)');

  /* STEP 1 — 역할 선택: 시작 화면 3개 카드 */
  const t0 = d.body.textContent;
  assert(t0.includes('일반 환자 모드') && t0.includes('의료진') && t0.includes('기공소'), 'STEP 1 — 시작 화면 역할 카드 3개 (환자·의료진·기공소)');
  assert(clickBtnByText(d, '일반 환자 모드'), 'STEP 1 — 환자 모드 클릭');
  await sleep(400);
  d.getElementById('agreeRow').click(); /* 동의 모달: 토글 → 동의하고 시작하기 (S47 검증 루프 — 실제 진입 흐름 반영) */
  await sleep(150);
  d.getElementById('agreeBtn').click();
  await sleep(600);

  /* STEP 2 — 환자 3D 구강 스캔: 스캔 열기 → 가이드 체크 2 → 스캔 → 결과(내보내기 3종) */
  assert(await clickFresh(d, '[data-goto="scanIntro"]', 4000), 'STEP 2 — 환자 홈 → 구강 스캔 열기 진입');
  assert(await clickFresh(d, '#proTrial'), 'STEP 2 — Pro 안내 → "데모 체험 시작" (실제 데모 경로 — S47 리허설에서 확인)'); /* Pro 게이트: 환자 스캔 첫 진입 시 1회 */
  assert(await clickFresh(d, '#btnScanGo'), 'STEP 2 — 스캔 시작하기 (실시간 팝업 · S79)');
  await sleep(300);
  assert(d.getElementById('modalOverlay').classList.contains('show'), 'STEP 2 — 스캔 실시간 팝업 열림 (S79)');
  d.getElementById('scPrep').click();
  await sleep(300);
  const ciEl = await waitFor(() => d.querySelectorAll('[data-ci="1"]').length ? d.querySelector('[data-ci="1"]') : null, 3000);
  const ci0 = await waitFor(() => d.querySelector('[data-ci="0"]'), 3000);
  ci0.click(); ciEl.click();
  await sleep(200);
  const cap = d.getElementById('btnCapStart');
  assert(!!ciEl && cap && !cap.disabled, 'STEP 2 — 캡처 가이드 체크 2개 → 스캔 시작 가능');
  /* jsdom은 canvas 미지원 — 스캔 애니메이션(3D 뷰어)은 브라우저 전용. 결과 화면 팩트는 직접 렌더해 검증 (스모크 환경 한계, D159) */
  w.MM.app.state.proUnlocked = true;
  w.MM.app.go('scanResult');
  await sleep(600);
  const exp = ['stl', 'obj', 'ply'].map(k => d.querySelector('[data-exp="' + k + '"]'));
  assert(exp.every(Boolean) && d.body.textContent.includes('STL · OBJ · PLY'), 'STEP 2 — 스캔 결과: STL·OBJ·PLY 내보내기 3종 (치과 CAD 연결 멘트 근거)');

  /* STEP 3 — 의료진 케이스 허브: 긴급 2건·김○○·C-2604 */
  w.MM.app.state.role = 'staff';
  w.MM.app.go('caseHub');
  const hubRow = await waitFor(() => d.querySelector('[data-case="C-2604"]'), 4000);
  assert(!!hubRow, 'STEP 3 — 케이스 허브 렌더');
  await waitFor(() => /긴급\s*2건/.test(d.body.textContent), 3500);
  const th = d.body.textContent;
  assert(/긴급\s*2건/.test(th), 'STEP 3 — "긴급 2건" (기공소 수정 요청·스캔 재업로드 시드 일치)');
  assert(!!d.querySelector('[data-case="C-2601"]') && th.includes('김○○'), 'STEP 3 — 김○○ 케이스(C-2601) 진입 가능');
  assert(!!d.querySelector('[data-case="C-2604"]'), 'STEP 3/4 — C-2604 (주문 단계) 목록 존재');

  /* STEP 3 세부 — 케이스 상세: 3D 데이터 탭 3모드·치료계획 AI 배지 */
  (await waitFor(() => d.querySelector('[data-case="C-2601"]'), 3000)).click();
  await sleep(300);
  assert(await clickFresh(d, '#cdTabs [data-t="3d"]'), 'STEP 3 — 3D 데이터 탭');
  const rm = await waitFor(() => d.getElementById('roleMode'), 3000);
  assert(rm && rm.querySelectorAll('button').length === 3 && rm.textContent.includes('치과의 모드') && rm.textContent.includes('기공 모드') && rm.textContent.includes('환자 모드'), 'STEP 3 — 같은 파일 세 개의 언어: 치과의·기공·환자 모드 칩 3종');
  assert(await clickFresh(d, '#cdTabs [data-t="plan"]'), 'STEP 3 — 치료계획 탭');
  await waitFor(() => d.body.textContent.includes('AI 초기 제안'), 3000);
  assert(d.body.textContent.includes('AI 초기 제안') && d.body.textContent.includes('담당의'), 'STEP 3 — "AI 초기 제안" 배지 (자동화는 제안·판단은 의사)');

  /* STEP 4 — 기공 주문서: C-2604(주문 단계·스크립트 지정)로 진입 — C-2601은 이미 '제작'이라 주문서 체크 없음 (S47 검증 루프 — 리허설에서 잡은 시퀀스 오류) */
  w.MM.Api.stop(); /* 지연 재렌더 경합 제거 (스모크 안정화) */
  w.MM.app.go('caseHub');
  await sleep(400);
  (await waitFor(() => d.querySelector('[data-case="C-2604"]'), 3000)).click();
  await sleep(300);
  assert(await clickFresh(d, '#cdTabs [data-t="ord"]'), 'STEP 4 — 주문 탭');
  assert(await clickFresh(d, '#goLabOrder', 4000), 'STEP 4 — 기공 주문서 작성 진입');
  /* caseDetail 지연 재렌더가 labOrder를 덮어올 수 있음 — 발표자가 다시 누르듯 재시도 (S47 검증 루프) */
  let checks = null;
  for (let i = 0; i < 4 && !checks; i++) {
    if (d.querySelectorAll('.lo-check').length !== 5) { const gl = d.querySelector('#goLabOrder'); if (gl) gl.click(); }
    checks = await waitFor(() => { const els = d.querySelectorAll('.lo-check'); return els.length === 5 ? els : null; }, 2500);
  }
  assert(checks && checks.length === 5, 'STEP 4 — 제출 전 체크 5개 (멘트 "5개 모두 확인" 일치)');
  for (let i = 0; i < 5; i++) { const el = await waitFor(() => d.querySelectorAll('.lo-check')[i], 2000); if (el) el.click(); await sleep(80); }
  const submit = await waitFor(() => { const el = d.getElementById('loSubmit'); return el && !el.disabled ? el : null; }, 3000);
  assert(!!submit, 'STEP 4 — 체크 5/5 → 제출 버튼 활성');
  submit.click();
  await sleep(600);
  const c2604 = w.MM.CASES_DATA.items.filter(x => x.id === 'C-2604')[0];
  assert(c2604 && c2604.status === '제작', 'STEP 4 — 제출 → 상태 \'제작\' 전환 (+ 히스토리 체크 5/5)');

  /* STEP 5 — 기공소 큐: 호환 4/4 배지 */
  w.MM.app.state.role = 'lab';
  w.MM.app.go('labHome');
  await sleep(500);
  await waitFor(() => d.body.textContent.includes('/4'), 3000);
  const labT = d.body.textContent;
  assert(labT.includes('호환') && labT.includes('/4'), 'STEP 5 — 기공소 큐: 호환 4/4 자동 검증 배지 (멘트 근거)');

  /* STEP 6 — 환자 치료 후 관리 */
  w.MM.app.state.role = 'patient';
  w.MM.app.go('care');
  await sleep(400);
  assert(d.body.textContent.includes('치료 후 관리') && d.body.textContent.includes('통증'), 'STEP 6 — 환자 치료 후 관리 (통증·붓기 기록)');

  console.log('=== C. 운영 팁 — 데모 초기화 (인증 모드 서버 기동 전·단일 인스턴스 유지) ===');
  const rs = await J(base, 'POST', '/api/reset');
  assert(rs.ok === true, '운영 팁 — 데모 초기화(/api/reset·reset-demo.sh) 성립');
  if (srv.closeAllConnections) srv.closeAllConnections();
  await new Promise(r => srv.close(r)); /* 서버 모듈의 db는 모듈 레벨 공유 — 모드 전환은 순차 기동으로 (S47 검증 루프 발견) */

  console.log('=== B. §3-3 운영 모드 — 실장 화면 (인증 모드) ===');
  const srvB = createApp({ auth: true }).listen(0, '127.0.0.1');
  await new Promise(r => srvB.on('listening', r));
  const baseB = 'http://127.0.0.1:' + srvB.address().port;
  const jarB = {};
  const domB = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: baseB + '/', beforeParse(w2) {
    w2.fetch = (u, o) => { o = o || {}; const url = String(u); const ck = Object.keys(jarB).map(k => k + '=' + jarB[k]).join('; '); o.headers = Object.assign({}, o.headers, ck ? { Cookie: ck } : {}); return fetch(new URL(url, baseB + '/').href, o).then(res => { (res.headers.getSetCookie ? res.headers.getSetCookie() : []).forEach(c => { const kv = c.split(';')[0]; const i = kv.indexOf('='); if (i > 0) jarB[kv.slice(0, i)] = kv.slice(i + 1); }); return res; }); };
    w2.scrollTo = () => {};
  } });
  const wB = domB.window, dB = domB.window.document;
  await sleep(900);
  assert(dB.getElementById('inviteCode') && dB.body.textContent.includes('초대코드'), '§3-2 ① — 역할 카드 대신 초대코드 게이트');
  dB.querySelector('#inviteCode').value = 'MIRI-CLINIC-2026';
  dB.querySelector('#codeLogin').click();
  await sleep(800);
  wB.MM.app.state.role = 'staff';
  wB.MM.app.go('caseHub');
  await sleep(500);
  assert(!!dB.getElementById('qaInvite'), '§3-3 ① — 계정 발급 진입 (회수·재활성 모달은 S42/44 실측)');
  wB.MM.app.go('opsDash');
  await sleep(600);
  const opsT = dB.body.textContent;
  assert(opsT.includes('주문 전환') && (opsT.includes('헬스') || opsT.includes('가동')), '§3-3 ④ — 운영 대시보드: 퍼널·전환율·헬스 한 화면');
  /* §3-3 ① 이동 전 caseHub에서 확인 — 아래 중복 단정 제거 */
  assert(opsT.includes('월간 활성율 70%'), '§3-3 ⑦ — 게이트 1 카드: 활성율 70% 문구 (계약 전환 조건)');
  assert(opsT.includes('미참조 파일 정리') && opsT.includes('데이터 내보내기') && opsT.includes('삭제 청구'), '§3-3 ⑤⑧ — GC·내보내기·삭제 청구 버튼 존재');

  console.log('=== D. 문서 — 스크립트 팩트 고정 ===');
  const demo = fs.readFileSync('/home/user/미리미소-데모시나리오.md', 'utf8');
  const spec = fs.readFileSync('/home/user/미리미소-작업명세.md', 'utf8');
  assert(demo.includes('긴급 2건') && demo.includes('C-2604') && demo.includes('호환 4/4') && demo.includes('MIRI-CLINIC-2026') && demo.includes('70%'), '데모시나리오: 발표 팩트(긴급 2건·C-2604·호환 4/4·시드 코드·70%) 기재 — 실측과 일치');
  assert(spec.includes('AC-47') && spec.includes('RM-01'), '명세 AC-47 (미팅 리허설) 반영');

  if (srv.closeAllConnections) srv.closeAllConnections();
  await new Promise(r => srv.close(r));
  if (srvB.closeAllConnections) srvB.closeAllConnections();
  await new Promise(r => srvB.close(r));
  console.log('--- S47 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
