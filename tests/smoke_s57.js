#!/usr/bin/env node
/* S57 스모크 — 캡처 모달 워크플로: 팝업 촬영(웹캠·핸드폰)·촬영 템플릿 4종·3단계 진행(선택→촬영→확인)
   단정 원칙: 모달 내용은 #modalBody 기준 · jsdom은 웹캠 미지원 → 안내 폴백 경로 단정 · 측정은 capPrep 유닛 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); } }

(async () => {
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; } });
  const w = dom.window, d = w.document;
  await sleep(900);
  await sleep(300);
  Array.from(d.querySelectorAll('button')).find(x => x.textContent.includes('일반 환자 모드')).click();
  await sleep(300);
  d.getElementById('agreeRow').click();
  d.getElementById('agreeBtn').click();
  await sleep(700);
  d.getElementById('pfoot').children[3].click();
  await sleep(400);
  const body = () => d.getElementById('modalBody');

  /* A. 팝업(모달) 오픈 — 카드 📷 버튼 → 촬영 모달 (CQ-01) */
  d.getElementById('cpP').click();
  await sleep(300);
  assert(d.getElementById('modalOverlay').classList.contains('show') && body().textContent.includes('📷 촬영'), '팝업 오픈 — 📷 버튼 → 캡처 모달 (S57·CQ-01)');
  assert(body().querySelectorAll('.ctpl').length === 4, '촬영 템플릿 4종 칩 (CQ-02)');
  const tl = Array.from(body().querySelectorAll('.ctpl')).map(x => x.textContent);
  assert(tl[0].includes('정면 미소') && tl[1].includes('좌측') && tl[2].includes('우측') && tl[3].includes('30초 영상'), '템플릿 — 정면 미소·좌측·우측 교합면·30초 영상');
  assert(tl[0].includes('on') || body().querySelector('.ctpl').classList.contains('on'), '기본 템플릿 — 첫 칩 선택 상태');

  /* B. 템플릿 가이드 — 선택 시 방법·거리·조명 문구 갱신 (CQ-02) */
  body().querySelectorAll('.ctpl')[1].click();
  await sleep(200);
  assert(body().querySelectorAll('.ctpl')[1].classList.contains('on') && body().querySelector('#capHow').textContent.includes('어금니'), '템플릿 선택 — 가이드 문구 갱신(좌측 교합면)');
  assert(body().textContent.includes('웹캠') && body().textContent.includes('핸드폰'), '촬영 방식 고지 — 웹캠·핸드폰 모두 지원 (CQ-01)');

  /* C. 3단계 진행 — 선택→촬영→확인 스텝 표시 (CQ-03) */
  assert(body().querySelectorAll('.cst').length === 3 && body().querySelector('.cst').classList.contains('on'), '진행 단계 3개 — 첫 단계 on');
  body().querySelector('#capN1').click();
  await sleep(300);
  assert(body().querySelector('#capS2').hidden === false && body().querySelector('#capS1').hidden === true, '다음 → 2단계(촬영) 진입');
  assert(body().querySelectorAll('.cst')[1].classList.contains('on'), '단계 표시 — 2단계 강조');

  /* D. 웹캠 미지원 폴백 안내 + 기기 카메라 입력 (jsdom 경로) */
  assert(body().querySelector('#cpHint').textContent.includes('웹캠 미지원') && body().querySelector('#cpHint').textContent.includes('기기 카메라'), '웹캠 미지원 — 핸드폰(기기 카메라) 폴백 안내 (CQ-01)');
  const mf = body().querySelector('#cpMFile');
  assert(!!mf && mf.getAttribute('capture') === 'environment' && (mf.accept || '').includes('image') && (mf.accept || '').includes('video'), '기기 카메라 입력 — capture=environment · image+video');
  assert(!!body().querySelector('#cpGuide') && BUNDLE.includes('cpGuide:after'), '촬영 가이드 오버레이 — 가이드라인 타원 (CQ-04)');
  assert(body().textContent.includes('비진단'), '모달 내 비진단 고지 유지');

  /* E. 실시간 힌트 규칙 — 밝기 3분기 (CQ-04) */
  assert(w.MM.capHint(60).includes('조명'), '실시간 힌트 — 어두움 → 조명 안내');
  assert(w.MM.capHint(230).includes('역광'), '실시간 힌트 — 과노출 → 역광 안내');
  assert(w.MM.capHint(150).includes('좋아요'), '실시간 힌트 — 적정 → 유지 안내');

  /* F. 촬영→확인→저장 3단계 완주 (CQ-03) */
  const pend = w.MM.capPrep(320, 240, 240, '좌측'); /* jsdom 측정 생략 — pend 구조 검증 */
  assert('a' in pend && 'q' in pend && pend.a === '좌측', '촬영 데이터 — 각도 좌측·측정 필드 보류');
  w.MM.capConfirm();
  await sleep(200);
  assert(body().querySelector('#capS3').hidden === false && body().querySelector('#capCk').textContent.includes('각도 좌측'), '확인 단계 — 등급·각지 표시');
  body().querySelector('#capSave2').click();
  await sleep(400);
  const saved = w.MM.capLogs()[0];
  assert(saved && saved.a === '좌측' && saved.p === 1, '저장 — MM_CAP_V1에 각도·사진 기록 (CQ-03 완주)');
  assert(!d.getElementById('modalOverlay').classList.contains('show'), '저장 후 모달 자동 닫힘');
  assert(d.getElementById('root').textContent.includes('1/30일'), '여정 카드 — 퀘스트 1/30일 갱신');

  /* G. 모달 닫힘 → 카메라·타이머 정리 계약 (CQ-05) */
  assert(w.MM.app.closeModal.toString().includes('stopCam'), 'closeModal → stopCam 연결 — 배경·ESC 닫힘 시 정리');
  d.getElementById('cpV').click();
  await sleep(300);
  assert(body().querySelectorAll('.ctpl')[3].classList.contains('on'), '🎥 버튼 → 영상 템플릿 프리셋 오픈');
  body().querySelector('#cpMShot').click();
  await sleep(400);
  assert(w.MM.capLogs()[0].v === 1, '영상 템플릿 촬영 — MM_CAP_V1에 영상 기록');
  assert(!d.getElementById('modalOverlay').classList.contains('show'), '영상 기록 후 모달 닫힘');

  /* H. 예산 */
  assert(fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size <= 283000, '번들 예산 — 276KiB 이하 (' + fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size + 'B)');

  console.log('--- S57 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
