/* smoke_s31.js — S31 스모크: 환자 상태 기록의 병원 공유 — 환자 전용 엔드포인트(본인 케이스 403 경계)·lab 마스킹·의료진 케이스 개요 열람 — 환자→의료진 완결 루프
   실행: cd /home/user/tests && node smoke_s31.js */
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
let curBase = '';

(async () => {
  console.log('=== A. auth 모드 — 환자 전용 경계 + 역할별 열람 ===');
  const srvA = createApp({ auth: true }).listen(0, '127.0.0.1');
  await sleep(120);
  const base = 'http://127.0.0.1:' + srvA.address().port;
  curBase = base;
  const login = async function (code) {
    const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) });
    return (r.headers.get('set-cookie') || '').split(';')[0].split('=')[1];
  };
  const tokP = await login('MIRI-PAT-2601');
  const J = async (m, p, b, ck) => await (await fetch(curBase + p, { method: m, headers: { 'Content-Type': 'application/json', ...(ck ? { Cookie: ck } : {}) }, body: b ? JSON.stringify(b) : undefined })).json();

  const h = await J('GET', '/api/health');
  assert(parseInt(String(h.version).replace('S',''), 10) >= 31, 'health: version S31 이상 (' + h.version + ')');
  const e1 = await J('POST', '/api/cases/C-2601/care-log', { d: '2026-10-15', '통증': '없음', '붓기': '없음', '출혈': '없음' }, 'mm_session=' + tokP);
  assert(e1.ok === true && e1.count === 1, '환자 기록 공유 — 1건째 (본인 케이스)');
  const e2 = await J('POST', '/api/cases/C-2601/care-log', { d: '2026-10-16', '통증': '보통', '붓기': '없음', '출혈': '지속', photo: 'gum-01.jpg' }, 'mm_session=' + tokP);
  assert(e2.ok === true && e2.count === 2 && e2.entry.photo === 'gum-01.jpg', '2건째 — 출혈 지속·사진 파일명 포함');
  const bad = await J('POST', '/api/cases/C-2602/care-log', { d: '2026-10-16', '통증': '없음', '붓기': '없음', '출혈': '없음' }, 'mm_session=' + tokP);
  assert(bad.status === undefined && bad.error !== undefined && bad.error.includes('본인 케이스'), '타인 케이스 공유 → 403 (본인 케이스만)');
  const badCat = await J('POST', '/api/cases/C-2601/care-log', { d: '2026-10-16', '통증': '없음' }, 'mm_session=' + tokP);
  assert(badCat.error !== undefined, '붓기·출혈 누락 → 400');
  const tokC = await login('MIRI-CLINIC-2026');
  const clinicTry = await J('POST', '/api/cases/C-2601/care-log', { d: '2026-10-16', '통증': '없음', '붓기': '없음', '출혈': '없음' }, 'mm_session=' + tokC);
  assert(clinicTry.error !== undefined && clinicTry.error.includes('환자'), '의료진 계정 공유 시도 → 403 (환자 전용)');
  const clinicCases = await J('GET', '/api/cases', null, 'mm_session=' + tokC);
  const c2601 = clinicCases.cases.filter(x => x.id === 'C-2601')[0];
  assert(c2601 && c2601.careLog && c2601.careLog.length === 2, '의료진 열람 — 케이스에 환자 기록 2건 포함');
  const patCases = await J('GET', '/api/cases', null, 'mm_session=' + tokP);
  assert(patCases.cases.length === 1 && patCases.cases[0].careLog && patCases.cases[0].careLog.length === 2, '환자 열람 — 자기 기록 목록 확인');
  const iv = await J('POST', '/api/auth/invite', { role: 'lab', name: 'S31 기공소' }, 'mm_session=' + tokC);
  const tokL = await login(iv.code);
  const labCases = await J('GET', '/api/cases', null, 'mm_session=' + tokL);
  assert(labCases.cases.length > 0 && labCases.cases.every(x => !('careLog' in x)), '기공소 열람 — 환자 상태 기록 마스킹 (제작 정보만)');
  const au = await J('GET', '/api/audit?limit=50', null, 'mm_session=' + tokC);
  assert(au.audit.some(a => a.act === 'care-log' && a.role === 'patient'), '공유 → 감사로그 기록 (patient · care-log)');
  if (srvA.closeAllConnections) srvA.closeAllConnections();
  await new Promise(r => srvA.close(r));

  console.log('=== B+C. 데모 서버 — 시연 경로 + 온라인 통합(care 저장→공유→의료진 개요) ===');
  const srvC = createApp().listen(0, '127.0.0.1');
  await new Promise(r => srvC.on('listening', r));
  await sleep(120);
  const baseC = 'http://127.0.0.1:' + srvC.address().port;
  curBase = baseC;
  const de = await J('POST', '/api/cases/C-2601/care-log', { role: 'patient', d: '2026-10-15', '통증': '보통', '붓기': '없음', '출혈': '약간' });
  assert(de.ok === true && de.count === 1, '데모 모드 공유 성립 (role=patient)');
  const deBad = await J('POST', '/api/cases/C-2601/care-log', { role: 'clinic', d: '2026-10-15', '통증': '없음', '붓기': '없음', '출혈': '없음' });
  assert(deBad.error !== undefined, '데모 clinic role → 403');
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
  w.MM.app.state.role = 'patient';
  w.MM.app.go('care');
  await sleep(300);
  assert($('#rvShare'), 'care: 병원 공유 버튼 존재');
  $('#rvSave').click();
  await sleep(400);
  $('#rvShare').click();
  await sleep(500);
  assert(d.getElementById('toast').textContent.includes('병원에 전달 완료'), '공유 토스트 — 병원 전달 완료');
  w.MM.app.state.role = 'staff';
  w.MM.Api.onRoleEnter('staff'); /* 실앱 역할 전환 경로 — 새 역할 기준으로 케이스 재동기화 */
  await sleep(500);
  w.MM.app.state.caseId = 'C-2601';
  w.MM.app.go('caseDetail');
  await sleep(400);
  const ov = d.getElementById('root').textContent;
  assert(ov.includes('환자 상태 기록') && ov.includes('참고 정보(비진단)'), '의료진 개요: 환자 상태 기록 카드 (비진단 고지)');
  assert(ov.includes('통증 보통'), '의료진 개요: 환자가 공유한 값 표시');
  assert(errors.length === 0, 'C 최종: errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  await dom.window.close();
  if (srvC.closeAllConnections) srvC.closeAllConnections();
  await new Promise(r => srvC.close(r));

  console.log('=== D. 오프라인 — 공유 가드 ===');
  const errors2 = [];
  const dom2 = new JSDOM(BUNDLE, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://demo.local/',
    beforeParse(w2) { w2.scrollTo = () => {}; w2.addEventListener('error', e => errors2.push('onerror: ' + e.message)); }
  });
  const w2 = dom2.window, d2 = w2.document;
  await sleep(400);
  d2.querySelector('.role-card').click();
  if (d2.querySelector('#agreeRow')) { d2.querySelector('#agreeRow').click(); d2.querySelector('#agreeBtn').click(); }
  await sleep(300);
  w2.MM.app.state.role = 'patient';
  w2.MM.app.go('care');
  await sleep(300);
  d2.querySelector('#rvShare').click();
  await sleep(200);
  assert(d2.getElementById('toast').textContent.includes('오프라인'), '오프라인 공유 → 가드 토스트 (기기 저장만)');
  assert(errors2.length === 0, 'D 최종: errors 없음');
  await dom2.window.close();

  console.log('--- S31 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
