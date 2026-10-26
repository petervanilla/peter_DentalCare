/* run_script.js — S48 원고 러너: 골든 매니페스트(golden/manifest.json)를 읽어
   가상 환자 페르소나 여정을 재실행하고 실행 결과(A)를 기대값(B)과 대조하는 전체 원고 회귀 테스트.
   - 비공개 내부 자산: 번들·배포물에 미포함
   - 결정적 골든: 실행할 때마다 동일 결과 (재실행 가능성 자체가 검증 대상)
   - GS-03 이중 등록 원칙: 여기서 발견된 결함은 반드시 (1) tests/repro/ 짧은 최소 재현 테스트와
     (2) 본 전체 원고 회귀(매니페스트 기대값 갱신 또는 코드 수정) 양쪽에 동시에 추가한다
   실행: cd /home/user/tests && node run_script.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { createApp } = require('/home/user/mirimiso-webapp/server/server.js');

const M = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden', 'manifest.json'), 'utf8'));
let pass = 0, fail = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg);
  cond ? pass++ : (fail++, process.exitCode = 1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(120); } return null; };
const clickFresh = async (d, sel, ms) => { const b = await waitFor(() => d.querySelector(sel), ms || 3000); if (b) b.click(); return !!b; };
const BUNDLE = fs.readFileSync('/home/user/미리미소-웹앱.html', 'utf8');

(async () => {
  console.log('=== 0. 매니페스트 무결성 — 캐릭터·관계·샘플·여정 ===');
  assert(M.characters.length === M.manifestChecks.characters, '캐릭터 ' + M.characters.length + '명 (환자 5·의료진 1·기공소 1 — 페르소나 포함)');
  assert(M.relationships.length === M.manifestChecks.relationships, '관계 ' + M.relationships.length + '개 (담당의·수주·계정 바인딩·수정 요청·주문 루프)');
  assert(M.sample.cases.length === M.manifestChecks.sampleCases, '샘플 시드 ' + M.sample.cases.length + '케이스');
  assert(M.journeys.length === M.manifestChecks.journeys, '여정 ' + M.journeys.length + '개 (J-A·J-B·J-C)');

  /* ---------- API 여정 (auth 모드 · 단일 인스턴스 규칙) ---------- */
  console.log('=== J-A. ' + M.journeys[0].title + ' ===');
  console.log('=== J-B. ' + M.journeys[1].title + ' ===');
  const srv = createApp({ auth: true }).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  await sleep(120);
  const base = 'http://127.0.0.1:' + srv.address().port;
  let clinicCk = null, cur = null, newCode = null;
  const REQ = async (ck, m, p, b) => await (await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', ...(ck ? { Cookie: ck } : {}) }, body: b ? JSON.stringify(b) : undefined }));
  const login = async (code) => { const r = await REQ(null, 'POST', '/api/auth/login', { code }); const j = await r.json(); return { r, j, ck: (r.headers.get('set-cookie') || '').split(';')[0] }; };
  let lastCases = null;

  for (const jn of M.journeys.filter(x => x.mode === 'auth')) {
    for (const st of jn.steps) {
      const tag = jn.id + ' · ' + st.kind;
      if (st.kind === 'login') {
        const { r, j, ck } = await login(st.code);
        if (st.expect.status !== undefined) assert(r.status === st.expect.status, tag + ' — 로그인 ' + st.expect.status);
        if (st.expect.role !== undefined) assert(j.role === st.expect.role, tag + ' — 역할 ' + st.expect.role);
        if (st.expect.name !== undefined) assert(j.name === st.expect.name, tag + ' — 이름 ' + st.expect.name);
        if (r.status === 200) { cur = ck; if (st.expect.role === 'clinic') clinicCk = ck; }
      } else if (st.kind === 'getCases') {
        const r = await REQ(cur, 'GET', '/api/cases'); const j = await r.json();
        lastCases = j.cases || [];
        if (st.expect.count !== undefined) assert(lastCases.length === st.expect.count, tag + ' — 열람 케이스 ' + lastCases.length + '건 (관계: 자기 케이스만)');
        if (st.expect.firstId !== undefined) assert(lastCases[0] && lastCases[0].id === st.expect.firstId, tag + ' — 바인딩 케이스 ' + st.expect.firstId);
      } else if (st.kind === 'caseFields') {
        const c = lastCases.filter(x => x.id === st.id)[0] || {};
        Object.keys(st.expect).forEach(k => {
          if (st.expect[k] === null) assert(c[k] === undefined || c[k] === null, tag + ' — ' + st.id + ' ' + k + ' 미노출 (권한 경계·설계 고정)');
          else assert(c[k] === st.expect[k], tag + ' — ' + st.id + ' ' + k + '=' + st.expect[k]);
        });
      } else if (st.kind === 'clinicCaseFields') {
        const cj = await (await REQ(clinicCk, 'GET', '/api/cases')).json();
        const c = (cj.cases || []).filter(x => x.id === st.id)[0] || {};
        Object.keys(st.expect).forEach(k => assert(c[k] === st.expect[k], tag + ' — ' + st.id + ' ' + k + '=' + st.expect[k] + ' (관계 고정·clinic 스코프)'));
      } else if (st.kind === 'prefsPost') {
        const r = await REQ(cur, 'POST', '/api/me/prefs', { prefs: st.prefs }); const j = await r.json();
        assert(j.ok === st.expect.ok, tag + ' — 저장 ok');
        Object.keys(st.expect).filter(k => k !== 'ok').forEach(k => assert(j.prefs && j.prefs[k] === st.expect[k], tag + ' — ' + k + '=' + JSON.stringify(st.expect[k]) + ' (S46 정규화 통과)'));
      } else if (st.kind === 'prefsGet') {
        const j = await (await REQ(cur, 'GET', '/api/me/prefs')).json();
        Object.keys(st.expect).forEach(k => assert(j.prefs && j.prefs[k] === st.expect[k], tag + ' — ' + k + ' 복원 (다른 기기 동기화)'));
      } else if (st.kind === 'invite') {
        const j = await (await REQ(clinicCk, 'POST', '/api/auth/invite', { role: st.role, name: st.name, caseId: st.caseId })).json();
        assert(/^MM-[0-9A-F]{8}$/.test(j.code || ''), tag + ' — 코드 형식 MM-XXXXXXXX');
        assert(j.name === st.expect.name, tag + ' — 발급 계정명 ' + st.expect.name);
        newCode = j.code;
      } else if (st.kind === 'loginNew') {
        const { r, j, ck } = await login(newCode);
        if (st.expect.status !== undefined) assert(r.status === st.expect.status, tag + ' — 신규 코드 로그인 ' + st.expect.status);
        if (st.expect.caseId !== undefined) assert(j.caseId === st.expect.caseId, tag + ' — 바인딩 ' + st.expect.caseId + ' (관계: 발급 시 케이스 지정)');
        if (r.status === 200) cur = ck;
      } else if (st.kind === 'revokeNew') {
        const j = await (await REQ(clinicCk, 'POST', '/api/auth/revoke', { code: newCode })).json();
        if (st.expect.ok !== undefined) assert(j.ok === st.expect.ok, tag + ' — 회수 ok');
        if (st.expect.killed !== undefined) assert(j.killed === st.expect.killed, tag + ' — 세션 ' + j.killed + '건 즉시 차단');
        if (st.expect.noticeIncludes) assert((j.notice || '').includes(st.expect.noticeIncludes), tag + ' — 안내 문구');
      } else if (st.kind === 'loginRevoked') {
        const { r, j } = await login(newCode);
        if (st.expect.status !== undefined) assert(r.status === st.expect.status, tag + ' — 회수 코드 로그인 ' + st.expect.status);
        if (st.expect.errorIncludes) assert((j.error || '').includes(st.expect.errorIncludes), tag + ' — 안내 문구');
      } else if (st.kind === 'reactivateNew') {
        const j = await (await REQ(clinicCk, 'POST', '/api/auth/reactivate', { code: newCode })).json();
        if (st.expect.ok !== undefined) assert(j.ok === st.expect.ok, tag + ' — 재활성 ok');
      }
    }
  }
  if (srv.closeAllConnections) srv.closeAllConnections();
  await new Promise(r => srv.close(r));

  /* ---------- UI 여정 (demo · 오프라인 단일 파일 조건 — 실제 데모와 동일) ---------- */
  const uiJourneys = M.journeys.filter(x => x.mode === 'demo-ui');
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; } });
  const w = dom.window, d = w.document;
  await sleep(900);
  for (const jc of uiJourneys) {
  console.log('=== ' + jc.id + '. ' + jc.title + ' ===');
  for (const st of jc.steps) {
    const tag = jc.id + ' · ' + st.kind;
    if (st.kind === 'uiPatientReturn') {
      w.MM.app.chooseRole('patient'); /* 앱 중반 — API로 환자 모드 복귀 */
      await sleep(400);
      const ar = d.getElementById('agreeRow');
      if (ar) { ar.click(); d.getElementById('agreeBtn').click(); }
      await sleep(600);
      assert(w.MM.app.current === 'home', tag + ' — 환자 모드 복귀·홈');
    } else if (st.kind === 'uiToday') {
      assert(await clickFresh(d, '[data-goto="today"]', 4000), tag + ' — 홈 → 오늘의 관리 진입');
      await waitFor(() => w.MM.app.current === 'today', 3000);
      const rows = await waitFor(() => d.querySelectorAll('[data-tq]').length === st.expect.groups ? d.querySelectorAll('[data-tq]') : null, 3000);
      assert(!!rows, tag + ' — 기록 폼 ' + st.expect.groups + '그룹 (통증·부음·출혈·씹기·양치·흡연음주)');
      const save = await waitFor(() => d.getElementById('tdSave'), 3000);
      if (save) save.click();
      await sleep(500);
      const t = d.getElementById('root').textContent;
      assert(st.expect.suggestions.every(x => t.includes(x)), tag + ' — 맞춤 제안: ' + st.expect.suggestions.join('·') + ' (기본 양호 경로)');
    } else if (st.kind === 'uiRoutine') {
      assert(await clickFresh(d, '#pfoot [data-pf="routine"]', 4000), tag + ' — 풋터 [루틴] 진입 (S52)');
      await waitFor(() => w.MM.app.current === 'routine', 3000);
      const t = await waitFor(() => { const el = d.getElementById('root'); return el && el.textContent.includes('오늘의 케어 루틴') ? el.textContent : null; }, 3000);
      assert(!!t, tag + ' — 오늘의 케어 루틴 체크리스트');
      assert(d.querySelectorAll('[data-rt]').length === 4, tag + ' — 체크리스트 4항목 (가글·치간칫솔·냉찜질·스트레칭)');
      assert(st.expect.sections.every(x => t.includes(x)), tag + ' — 단계 매칭 3기둥: ' + st.expect.sections.join('·') + ' (S51·S52)');
      assert(st.expect.products.every(x => t.includes(x)), tag + ' — 케어 제품 4종');
      d.querySelector('[data-rt]').click();
      await sleep(400);
      assert(d.getElementById('root').textContent.includes(st.expect.points), tag + ' — 루틴 토글 점수 (' + st.expect.points + ')');
    } else if (st.kind === 'uiJourney') {
      assert(await clickFresh(d, '#pfoot [data-pf="journey"]', 4000), tag + ' — 풋터 [여정] 진입 (S52)');
      await waitFor(() => w.MM.app.current === 'journey', 3000);
      const t = await waitFor(() => { const el = d.getElementById('root'); return el && el.textContent.includes('치아 관리 여정') ? el.textContent : null; }, 3000);
      assert(!!t, tag + ' — 치아 관리 여정 카드');
      assert(d.querySelector('.jrow').querySelectorAll('.jd').length === st.expect.dots, tag + ' — 여정 도트 ' + st.expect.dots + '칸');
      assert(new RegExp(st.expect.day).test(t), tag + ' — D+N일차 배지');
      assert(t.includes('일 연속'), tag + ' — 연속 기록 배지');
      assert(!!d.getElementById('tdShare'), tag + ' — 기록 공유 버튼');
    } else if (st.kind === 'uiCapture') {
      assert(await clickFresh(d, '#pfoot [data-pf="journey"]', 4000), tag + ' — 풋터 [여정] 진입 (S55)');
      await waitFor(() => w.MM.app.current === 'journey', 3000);
      const t = await waitFor(() => { const el = d.getElementById('root'); return el && el.textContent.includes('데일리 캡처 퀘스트') ? el.textContent : null; }, 3000);
      assert(!!t, tag + ' — 데일리 캡처 퀘스트 카드');
      assert(d.querySelector('.cdots').querySelectorAll('.jd').length === st.expect.dots, tag + ' — 퀘스트 도트 ' + st.expect.dots + '칸');
      assert(!!d.getElementById('cpP') && !!d.getElementById('cpV') && !!d.getElementById('cpL'), tag + ' — 사진·영상·LiDAR 3버튼');
      assert(t.includes('비진단') && t.includes('규칙 기반'), tag + ' — 규칙 기반·비진단 고지');
      w.MM.capSave({ d: new Date().toISOString().slice(0, 10), p: 1, q: 'A', b: 140, s: 12, f: 15 });
      w.MM.app.rerender();
      await sleep(400);
      assert(d.getElementById('root').textContent.includes(st.expect.after), tag + ' — 캡처 1일 → 퀘스트 갱신 (' + st.expect.after + ')');
    } else if (st.kind === 'uiProfile') {
      assert(await clickFresh(d, '#pfoot [data-pf="profile"]', 4000), tag + ' — 풋터 [프로필] 진입 (S54)');
      await waitFor(() => w.MM.app.current === 'profile', 3000);
      const nm = await waitFor(() => d.getElementById('prName'), 3000);
      nm.value = st.expect.name;
      d.getElementById('prSave').click();
      await sleep(400);
      assert(d.getElementById('root').textContent.includes(st.expect.greet), tag + ' — 프로필 저장 → 인사 반영 (' + st.expect.greet + ')');
    } else if (st.kind === 'uiPatientStart') {
      const card = await waitFor(() => Array.from(d.querySelectorAll('button')).find(x => x.textContent.includes('일반 환자 모드')), 4000);
      assert(!!card, tag + ' — 시작 화면 환자 카드 (실제 데모 진입)');
      if (card) card.click();
      await sleep(300);
      d.getElementById('agreeRow').click();
      d.getElementById('agreeBtn').click();
      await sleep(600);
      assert(w.MM.app.current === 'home', tag + ' — 동의 → 환자 홈');
    } else if (st.kind === 'uiCareEntry') {
      assert((await clickFresh(d, '[data-goto="care"]', 5000)), tag + ' — 홈 → 치료 후 관리 진입');
      await waitFor(() => d.body.textContent.includes(st.expect.text), 3000);
      assert(d.body.textContent.includes(st.expect.text) && d.body.textContent.includes('통증'), tag + ' — 사후관리 화면 (통증·붓기)');
    } else if (st.kind === 'uiCaseHub') {
      w.MM.app.state.role = 'staff';
      w.MM.app.go('caseHub');
      await waitFor(() => /긴급\s*2건/.test(d.body.textContent), 4000);
      const t = d.body.textContent;
      assert(new RegExp(st.expect.urgentText).test(t), tag + ' — "' + st.expect.urgentText.replace('\\s*', ' ') + '" (관계: 기공소 수정 요청→긴급)');
      assert(!!d.querySelector('[data-case="' + st.expect.patientRow + '"]'), tag + ' — ' + st.expect.patientName + '(' + st.expect.patientRow + ') 행 (캐릭터·케이스 대조)');
      assert(!!d.querySelector('[data-case="' + st.expect.targetCase + '"]'), tag + ' — ' + st.expect.targetCase + ' 행 (주문 시연 대상)');
      /* uiOrderFlow 준비 — 대상 케이스 진입 */
      (await waitFor(() => d.querySelector('[data-case="' + st.expect.targetCase + '"]'), 3000)).click();
      await sleep(300);
      assert(await clickFresh(d, '#cdTabs [data-t="ord"]'), tag + ' — 주문 탭');
    } else if (st.kind === 'uiOrderFlow') {
      assert(await clickFresh(d, '#goLabOrder', 4000), tag + ' — 기공 주문서 작성');
      let checks = null;
      for (let i = 0; i < 4 && !checks; i++) {
        if (d.querySelectorAll('.lo-check').length !== st.expect.checks) { const gl = d.querySelector('#goLabOrder'); if (gl) gl.click(); }
        checks = await waitFor(() => { const els = d.querySelectorAll('.lo-check'); return els.length === st.expect.checks ? els : null; }, 2500);
      }
      assert(checks && checks.length === st.expect.checks, tag + ' — 제출 전 체크 ' + st.expect.checks + '개');
      for (let i = 0; i < st.expect.checks; i++) { const el = await waitFor(() => d.querySelectorAll('.lo-check')[i], 2000); if (el) el.click(); await sleep(80); }
      const submit = await waitFor(() => { const el = d.getElementById('loSubmit'); return el && !el.disabled ? el : null; }, 3000);
      assert(submit && submit.textContent.includes(st.expect.submitText), tag + ' — "' + st.expect.submitText + '" 활성');
      submit.click();
      await sleep(600);
      const c = w.MM.CASES_DATA.items.filter(x => x.id === st.case)[0];
      assert(c && c.status === st.expect.statusAfter, tag + ' — 상태 \'' + st.expect.statusAfter + '\' 전환');
    } else if (st.kind === 'uiLabQueue') {
      w.MM.app.state.role = 'lab';
      w.MM.app.go('labHome');
      await waitFor(() => d.body.textContent.includes(st.expect.compat), 4000);
      assert(d.body.textContent.includes(st.expect.compat), tag + ' — 호환 ' + st.expect.compat + ' 접수 (관계: 병원 주문→기공소 검증)');
    }
  }
  }

  /* ---------- 문서 — 명세 AC-48 ---------- */
  const spec = fs.readFileSync('/home/user/미리미소-작업명세.md', 'utf8');
  assert(spec.includes('AC-48') && spec.includes('GS-01') && spec.includes('GS-03'), '명세 AC-48 (원고 러너·골든 매니페스트·이중 등록) 반영');

  console.log('--- S48 golden finished: ' + pass + ' pass / ' + fail + ' fail ---');
  if (fail > 0) console.log('[GS-03] 발견된 결함은 tests/repro/ 최소 재현 테스트와 본 원고 회귀(매니페스트 갱신) 양쪽에 동시 등록할 것.');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
