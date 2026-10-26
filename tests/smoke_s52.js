#!/usr/bin/env node
/* S52 스모크 — 하단 풋터 네비·오늘의 루틴·관리 여정 (dailyskin Progress/Routine 탭 대응)
   단정 원칙: 렌더 결과는 #root textContent 기준 (body는 인라인 스크립트 소스를 포함하므로 오탐) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); } }

(async () => {
  /* A. 진입 — 환자 모드 → 풋터 네비 */
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; } });
  const w = dom.window, d = w.document;
  await sleep(900);
  assert(!!BUNDLE.match(/<nav class="pfoot" id="pfoot"><button data-pf="home"><i>🏠<\/i>홈<\/button><button data-pf="today"><i>📅<\/i>오늘<\/button><button data-pf="routine"><i>✅<\/i>루틴<\/button><button data-pf="journey"><i>📈<\/i>여정<\/button><button data-pf="profile"><i>🙂<\/i>프로필<\/button><\/nav>/),
    '풋터 네비 마크업 — 홈·오늘·루틴·여정·프로필 5버튼 (index.html)');
  await sleep(400);
  Array.from(d.querySelectorAll('button')).find(x => x.textContent.includes('일반 환자 모드')).click();
  await sleep(300);
  d.getElementById('agreeRow').click();
  d.getElementById('agreeBtn').click();
  await sleep(700);
  const pf = d.getElementById('pfoot');
  assert(pf.className.includes('show') && pf.children.length === 5, '환자 모드 진입 → 풋터 표시 (5버튼)');
  assert(d.body.className.includes('pfo'), '본문 하단 여백 클래스 (pfo)');
  const ar = d.querySelector('.appbar-r');
  assert(!!ar && !!ar.querySelector('#setBtn') && !!ar.querySelector('#helpBtn') && !!ar.querySelector('.demo-ribbon'),
    '앱바 우측 그룹 — 개인화 설정(⚙)·사용 가이드(?)·DEMO 리본 (S53·FN-02)');
  assert(d.querySelector('.appbar').lastElementChild === ar && ar.lastElementChild.id === 'helpBtn',
    '우측 그룹이 앱바 최우측 — 버튼이 화면 오른쪽 끝에 배치');
  const root = () => d.getElementById('root').textContent;

  /* B. 오늘 기록 (통증 심함) — 이후 단계의 기준 데이터 */
  pf.children[1].click();
  await sleep(400);
  assert(d.querySelectorAll('[data-tq]').length === 6 && !!d.getElementById('tdSave'), 'today — 6그룹 기록 폼·저장 (풋터 [오늘] 진입)');
  d.querySelectorAll('[data-tq]')[0].querySelector('[data-tv="2"]').click();
  d.getElementById('tdSave').click();
  await sleep(400);
  assert(root().includes('이상 신호 점검') && w.MM.todayLogs()[0].pain === 2, '기록 저장 → 맞춤 제안 (경고 경로)');
  const yst = new Date(); yst.setDate(yst.getDate() - 1);
  w.MM.todaySave({ d: yst.toISOString().slice(0, 10), pain: 1, swell: 1, bleed: 0, chew: 0, brush: 1, vice: 0 }); /* 어제 시드 → 연속 2일 */

  /* C. 오늘의 루틴 — FOCUS·체크리스트 점수·완료 배너·3기둥 */
  pf.children[2].click();
  await sleep(400);
  assert(w.MM.app.current === 'routine', '풋터 [루틴] 클릭 → routine 뷰 이동');
  let t = root();
  assert(/D\+2 FOCUS/.test(t) && t.includes('회복기') && t.includes('무리하지 마세요'), 'D+N FOCUS 카드 — 회복기 단계 문구 (비진단)');
  assert(d.querySelectorAll('[data-rt]').length === 4 && t.includes('0/4점'), '케어 체크리스트 4항목 · 0/4점');
  assert(t.includes('관리 정보') && t.includes('오늘의 운동') && t.includes('케어 제품 제안'), '단계 매칭 3기둥 — 정보·운동·제품 (S51 이관)');
  assert(t.includes('초미세 칫솔') && t.includes('워터픽'), '케어 제품 카드 — 4종 중 단정 2종');
  assert(t.includes('치료나 처방을 대신하지 않습니다'), '루틴 비진단 고지 — 치료·처방 대신 아님');
  d.querySelectorAll('[data-rt]')[0].click();
  await sleep(300);
  assert(root().includes('1/4점'), '루틴 토글 → 1/4점 (MM_RT_V1 저장)');
  d.querySelectorAll('[data-rt]')[1].click(); await sleep(250);
  d.querySelectorAll('[data-rt]')[2].click(); await sleep(250);
  d.querySelectorAll('[data-rt]')[3].click(); await sleep(250);
  t = root();
  assert(t.includes('4/4점') && t.includes('모두 마쳤어요'), '4개 완료 → 완료 배너 🎉');
  const rt = JSON.parse(w.localStorage.getItem('MM_RT_V1'));
  assert(rt.length === 1 && rt[0].m === 15, '루틴 이력 저장 — 당일 1건·비트마스크 15');

  /* D. 관리 여정 — D+N일차·도트 15·연속·추이·공유 */
  pf.children[3].click();
  await sleep(400);
  assert(w.MM.app.current === 'journey', '풋터 [여정] 클릭 → journey 뷰 이동');
  t = root();
  assert(t.includes('D+2일차') && t.includes('최근 15일 중 2일 기록'), 'D+2일차 배지 · 최근 15일 중 2일 기록');
  const dots = d.querySelector('.jrow').querySelectorAll('.jd');
  assert(dots.length === 15 && dots[14].classList.contains('t') && dots[14].textContent === '2', '여정 도트 15칸 — 오늘(D+N) 강조');
  assert(dots[13].classList.contains('d') && dots[13].textContent === '✓', '어제 기록 도트 ✓ (완료 상태)');
  assert(t.includes('2일 연속'), '연속 기록 배지 — 여정으로 이관');
  assert(d.querySelectorAll('.tr').length === 2 && !!d.querySelector('.tb div[style*=width]'), '추이 바차트 — 최근 2일 행');
  const sh = d.getElementById('tdShare');
  let shared = null;
  w.MM.shareText = (a, b) => { shared = b; };
  if (sh) sh.click();
  await sleep(200);
  assert(shared && shared.includes('[참고 자료 · 비진단]') && shared.includes('통증 2/2'), '기록 공유 — 비진단 머리말 요약');

  /* E. today 분리 — 기록·제안 전용 (3기둥은 루틴으로) */
  pf.children[1].click();
  await sleep(400);
  assert(w.MM.app.current === 'today' && !root().includes('오늘의 운동'), 'today 뷰 — 3기둥 부재 (루틴으로 이관 확인)');
  d.querySelectorAll('[data-tq]')[0].querySelector('[data-tv="0"]').click();
  d.getElementById('tdSave').click();
  await sleep(400);
  assert(w.MM.todayLogs().length === 2 && w.MM.todayLogs().filter(x => x.d === new Date().toISOString().slice(0, 10))[0].pain === 0, '당일 재저장 — 덮어쓰기(dedupe)·이력 2일 유지');

  /* E2. 브랜드·프로필·방문 알람·병원 기록 — S54 */
  pf.children[4].click();
  await sleep(400);
  assert(w.MM.app.current === 'profile' && d.title.includes('스마일치과') && d.getElementById('brandTitle').textContent === '내 프로필', '프로필 탭 진입 · 브랜드 스마일치과 (title)·뷰 타이틀 (S54·PF-01)');
  d.getElementById('prName').value = '정○○';
  d.getElementById('prNick').value = '';
  d.getElementById('prAge').value = '42';
  d.getElementById('prSave').click();
  await sleep(400);
  assert(w.MM.prof().name === '정○○' && w.MM.prof().age === 42 && root().includes('안녕하세요, 정○○님'), '프로필 저장(이름·나이) → 인사 반영 (S54·PF-02)');
  const fut = new Date(); fut.setDate(fut.getDate() + 3);
  const fd = fut.toISOString().slice(0, 10);
  d.getElementById('vsDate').value = fd;
  d.getElementById('vsTime').value = '10:00';
  d.getElementById('vsSave').click();
  await sleep(400);
  assert(w.MM.visit() && w.MM.visit().d === fd && root().includes('D-3'), '병원 방문 알람 저장 → D-3 표기 (S54·PF-03)');
  d.querySelectorAll('#tpRow .slot')[1].click();
  await sleep(200);
  assert(d.getElementById('vrMemo').value.includes('FDI'), '병원 기록 템플릿 — 임플란트 시술 양식 채움 (S54·PF-04)');
  d.getElementById('vrHos').value = '스마일치과';
  d.getElementById('vrAdd').click();
  await sleep(400);
  assert(w.MM.visits().length === 1 && root().includes('1건') && root().includes('스마일치과'), '병원 기록 추가 · 목록 표시 (S54·PF-04)');
  d.getElementById('pfoot').children[0].click();
  await sleep(400);
  assert(root().includes('안녕하세요, 정○○님') && root().includes('다음 방문'), '홈 인사 이름 · 방문 배지 (S54·PF-02/03)');

  /* F. 역할 분리 — staff 전환 시 풋터 숨김 */
  w.MM.app.state.role = 'staff';
  w.MM.app.rerender();
  await sleep(400);
  assert(!d.getElementById('pfoot').className.includes('show') && !d.body.className.includes('pfo'), 'staff 모드 — 풋터 숨김 (환자 모드 전용)');

  /* G. 번들 예산 */
  const size = fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size;
  assert(size <= 283000, '번들 276KiB 이하 — ' + size.toLocaleString() + 'B (헤드룸 ' + (283000 - size).toLocaleString() + 'B)');

  console.log('--- S52 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
