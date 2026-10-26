/* smoke_core.js — S3+S4 회귀: 부팅·역할·Pro 게이트·스캔 플로우·포맷 라운드트립·크레딧
   실행: cd /home/user/tests && node smoke_core.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');

const html = fs.readFileSync('/home/user/미리미소-웹앱.html', 'utf8');
const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://demo.local/',
  beforeParse(window) {
    window.addEventListener('error', e => errors.push('onerror: ' + e.message));
  }
});
const { window } = dom;
const { document } = window;

let pass = 0, fail = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg);
  cond ? pass++ : (fail++, process.exitCode = 1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await sleep(400);
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  /* 0. 부팅 + 역할 선택 */
  assert(errors.length === 0, 'boot: no runtime errors');
  assert($$('.role-card').length === 3, '3 role cards (환자/의료진/기공소)');
  assert(document.body.textContent.includes('가상 시뮬레이션과 사전 문진'), 'positioning: 기존 제품 사용 편의성');
  assert($('#bellBtn') && $('#bellBtn').style.display === 'none', 'S8: bell hidden before role select');
  assert($('#apiDot') && !$('#apiDot').classList.contains('on'), 'S7: api dot off (서버 없이 단일 파일 모드)');

  /* 1. 환자 진입 + 동의 */
  $$('.role-card')[0].click();
  assert($('#modalOverlay').classList.contains('show') && document.body.textContent.includes('의료기기가 아닌'), 'patient consent modal');
  $('#agreeRow').click(); $('#agreeBtn').click();
  assert($('.role-chip').textContent === '환자 모드', 'patient mode chip');
  assert($('#bellBtn').style.display === 'none', 'bell hidden for patient');

  /* 2. Pro 게이트 → 스캔 플로우 */
  window.MM.app.go('scanIntro');
  assert($('#modalOverlay').classList.contains('show') && document.body.textContent.includes('PRO'), 'Pro gate modal (스캔 최초 진입)');
  $('#proTrial').click();
  await sleep(30);
  assert(document.getElementById('brandTitle').textContent === '구강 스캔' && !$('#modalOverlay').classList.contains('show'), 'Pro trial → scanIntro');
  $('#btnScanGo').click();
  await sleep(30);
  assert($('#modalOverlay').classList.contains('show') && document.body.textContent.includes('실시간 데모'), '스캔 시작 → 실시간 데모 팝업 (S79 — 화면 이동 없음)');
  $('#scPrep').click();
  await sleep(30);
  assert(document.getElementById('brandTitle').textContent === '캡처 가이드', '팝업 → 촬영 준비 체크(captureGuide) 진입');
  assert($('#btnCapStart').disabled === true, '캡처 준비 미달 시 스캔 시작 불가 (2항목↑)');
  $$('[data-ci]')[0].click();
  await sleep(30);
  assert(window.MM.app.state.capture.checks[0] === true, '체크 항목 토글 반영');
  window.MM.app.state.capture.checks = [true, true, true, false];
  window.MM.app.rerender();
  await sleep(30);
  assert($('#btnCapStart').disabled === false, '2항목↑ 충족 → 스캔 시작 활성');
  $('#btnCapStart').click();
  await sleep(80);
  assert(document.getElementById('brandTitle').textContent === '스캔 진행' && $('#scanBar'), 'scanRun 진행 (진행 바)');
  await sleep(8300);
  assert(document.getElementById('brandTitle').textContent === '스캔 결과', '스캔 완료 → 자동 결과 전환');
  assert($('#resCanvas'), 'scanResult 3D 캔버스 마운트');
  assert($$('[data-fdi]').length === 32, 'FDI 32치아 차트');
  assert(document.body.textContent.includes('비진단'), 'AI 소견 비진단 배지');
  $('[data-fdi="46"]').click();
  await sleep(40);
  assert(document.body.textContent.includes('ISQ'), '46 선택 → 임플란트 패널 (ISQ)');

  /* 3. 기록 + 스캐너 안내 */
  window.MM.app.go('records');
  assert($$('.rec-item').length === 3, 'records: 히스토리 3건');
  assert(document.body.textContent.includes('ISQ (안정도)'), 'records: ISQ 추이');
  window.MM.app.go('scannerInfo');
  const t = document.body.textContent;
  assert(t.includes('STL') && t.includes('OBJ') && t.includes('PLY'), '포맷 안내 3종 (Formats.INFO 단일 출처)');
  assert(t.includes('TRIOS'), 'TRIOS 연동 안내');

  /* 4. S8: 감사로그 환자 가드 */
  window.MM.app.go('auditLog');
  assert(document.body.textContent.includes('전용'), '감사로그는 의료진·기공소 전용 (환자 가드)');

  /* 5. 포맷 로직 (라운드트립) */
  const F = window.MM.Formats, D3 = window.Dental3D;
  const sc = [D3.buildArch('lower', {}, [])];
  const m = F.fromScenes(sc, false);
  assert(m.positions && m.positions.length >= 9 && m.positions.length % 9 === 0, 'fromScenes: 삼각형 positions');
  const stl = F.buildBinarySTL(m.positions);
  const nTri = Math.floor(m.positions.length / 9);
  assert(stl && stl.byteLength === 84 + nTri * 50, 'buildBinarySTL: 바이너리 크기 정확 (' + stl.byteLength + 'B)');
  const pr = D3.parseSTL(stl);
  assert(pr.original === nTri && pr.count > 0, 'parseSTL 라운드트립 (' + pr.original + ' tri)');
  const obj = F.parseOBJ('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
  assert(obj.positions && obj.positions.length === 9, 'parseOBJ: 삼각형 1개');
  const plyTxt = F.buildPLY(m.positions, null);
  assert(/format ascii 1\.0/.test(plyTxt) && /element vertex/.test(plyTxt), 'buildPLY: ascii + vertex');
  const pj = F.parsePLY(plyTxt);
  assert(pj.positions && pj.positions.length === m.positions.length, 'parsePLY 라운드트립');
  const pc = F.parsePLY('ply\nformat ascii 1.0\nelement vertex 2\nproperty float x\nproperty float y\nproperty float z\nend_header\n0 0 0\n1 1 1\n');
  assert(pc.vertexPositions && pc.vertexPositions.length === 6 && pc.hadFaces === false, 'PLY 점군 폴백 (면 없음 → vertexPositions)');
  assert(F.INFO.some(i => /STL/.test(i.name || '')) || F.INFO.length >= 3, 'Formats.INFO 기준정보 3종');

  /* 6. 엔진 크레딧 */
  const E = window.MM.Engine;
  window.localStorage.clear();
  window.MM.app.state.proUnlocked = false; /* Pro 체험 해제 상태 초기화 (스캔 플로우에서 해제됨) */
  let ci = E.creditInfo('patient');
  assert(ci.plan === 'Free' && ci.limit === 3 && ci.remaining === 3, 'Free 주 3회 크레딧');
  E.consumeExport('patient'); E.consumeExport('patient'); E.consumeExport('patient');
  ci = E.creditInfo('patient');
  assert(ci.used === 3 && ci.remaining === 0, '크레딧 3회 소진');
  assert(E.consumeExport('patient').ok === false, '크레딧 소진 시 차단');
  assert(E.creditInfo('staff').unlimited === true, 'Clinic 무제한');
  assert(typeof E.createScan === 'function' && typeof E.qualityEstimate === 'function', '엔진 계약 (createScan·qualityEstimate)');

  assert(errors.length === 0, '최종: runtime errors 없음' + (errors.length ? ' → ' + errors.join('|') : ''));
  console.log('--- S3/S4 core smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  window.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
