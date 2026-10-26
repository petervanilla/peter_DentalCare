/* smoke_s50.js — S50 스모크: 오늘의 관리 — 데일리 임플란트 기록·맞춤 제안 (환자 모드)
   S52 갱신: 3기둥·추이·연속·공유 단정은 smoke_s52(루틴·여정 뷰)로 이관 — 본 파일은 기록·제안 집중.
   단정 원칙: 렌더 결과는 #root textContent 기준 (body는 인라인 스크립트 소스를 포함하므로 오탐). */
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
const root = d => d.getElementById('root').textContent;

(async () => {
  console.log('=== A. 진입·기록 폼 ===');
  const srv = createApp().listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; } });
  const w = dom.window, d = w.document;
  await sleep(900);
  Array.from(d.querySelectorAll('button')).find(x => x.textContent.includes('일반 환자 모드')).click();
  await sleep(300);
  d.getElementById('agreeRow').click();
  d.getElementById('agreeBtn').click();
  await sleep(700);
  const chip = d.querySelector('[data-goto="today"]');
  assert(!!chip && chip.textContent.includes('오늘의 관리'), '환자 홈 — 오늘의 관리 칩 존재');
  chip.click();
  await sleep(400);
  assert(w.MM.app.current === 'today' && root(d).includes('매일 한 줄 기록'), '오늘의 관리 화면 진입 — 안내 문구');
  const rows = d.querySelectorAll('[data-tq]');
  assert(rows.length === 6, '기록 폼 — 질문 6그룹 (통증·부음·출혈·씹기·양치·흡연음주)');
  assert(rows[4].querySelector('.on') && rows[4].querySelector('.on').textContent === '실천', '기본값 — 양치·치실 "실천" 선택');
  assert(root(d).includes('비진단'), '고지 — 비진단 문구 노출');

  console.log('=== B. 저장·맞춤 제안 (경고 경로) ===');
  rows[0].querySelector('[data-tv="2"]').click(); /* 통증 심함 */
  rows[1].querySelector('[data-tv="1"]').click(); /* 부음 약간 */
  d.getElementById('tdSave').click();
  await sleep(500);
  let t = root(d);
  assert(t.includes('이상 신호 점검') && t.includes('담당의 연락'), '경고 규칙 — 통증 심함 → 이상 신호·연락 카드');
  assert(t.includes('냉찜질'), '제안 — 냉찜질 카드');
  assert(t.includes('기록 완료'), '저장 상태 — 기록 완료 배지');
  let logs = JSON.parse(w.localStorage.getItem('MM_TODAY_LOG_V1'));
  assert(logs.length === 1 && logs[0].pain === 2 && logs[0].swell === 1, '저장 — 당일 1건·선택값 반영 (기기 로컬 S31)');
  d.getElementById('tdSave').click(); /* 재저장 */
  await sleep(400);
  logs = JSON.parse(w.localStorage.getItem('MM_TODAY_LOG_V1'));
  assert(logs.length === 1, '당일 재저장 — 덮어쓰기(1건 유지)');

  console.log('=== C. 양호 경로 ===');
  d.querySelector('[data-tq="pain"] [data-tv="0"]').click();
  d.querySelector('[data-tq="swell"] [data-tv="0"]').click();
  d.getElementById('tdSave').click();
  await sleep(500);
  assert(root(d).includes('아주 좋아요') && root(d).includes('루틴 유지'), '양호 규칙 — 모두 양호 → 유지 격려 카드');

  console.log('=== D. 문서·예산 ===');
  const st2 = fs.readFileSync('/home/user/미리미소-작업명세.md', 'utf8');
  assert(st2.includes('AC-50') && st2.includes('DL-01'), '명세 AC-50 (오늘의 관리) 반영');
  const size = fs.statSync('/home/user/미리미소-웹앱.html').size;
  assert(size <= 283000, '번들 예산 — ' + size + 'B ≤ 276KiB');

  if (srv.closeAllConnections) srv.closeAllConnections();
  await new Promise(r => srv.close(r));
  console.log('--- S50 smoke finished: ' + pass + ' pass / ' + fail + ' fail ---');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
