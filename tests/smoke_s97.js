#!/usr/bin/env node
/* S97 스모크 — Figma 디자인 가이드 반영: 역할 선택 리디자인 (99차 사용자 요청):
   DS-01 hero 공식 배지·접속 유형 안내
   DS-02 미리보기 섹션 (2단계·CTA·사진 저장/전송 문구)
   DS-03 pvGo CTA — 환자 동의 플로우 진입 (기존 chooseRole 계약)
   DS-04 디자인안의 미검증/부정확 문구 미반영 — 1,428명·종단간 암호화·스마트 케어 부재
   DS-05 주 버튼 그라디언트 (149deg 토큰 그라디언트)
   EX-01 번들 예산 — 283,000B 이하·헤드룸 100B 이상
   EX-02 runtime errors 0 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const LIMIT = 283000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

(async () => {
  const errors = [];
  const dom = new JSDOM(BUNDLE, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) { w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message)); } });
  const w = dom.window, d = w.document;
  await sleep(900);
  const body = d.body.textContent;

  assert(body.includes('스마일치과 공식 프리상담') && body.includes('접속 유형을 선택하세요') && body.includes('모드 변경 가능'),
    'DS-01 hero 공식 배지·접속 유형 안내');
  const pv = d.getElementById('pvGo');
  assert(!!pv && body.includes('미리미소 미리보기') && body.includes('AI 안면·치열 분석') && body.includes('가상 스마일 시뮬레이션') && body.includes('입력한 사진은 저장·전송되지 않습니다') && body.includes('★ 추천'),
    'DS-02 미리보기 섹션·추천 뱃지·사진 문구');
  pv.click();
  await sleep(400);
  assert(!!d.getElementById('agreeBtn') && d.getElementById('modalOverlay').classList.contains('show'),
    'DS-03 pvGo CTA → 환자 동의 모달 (chooseRole 계약 유지)');
  assert(!body.includes('1,428명') && !body.includes('종단간') && !body.includes('스마트 케어'),
    'DS-04 미검증 수치·부정확 보안 표기·미확정 브랜드명 미반영');
  assert(BUNDLE.includes('linear-gradient(149deg,var(--a2),var(--teal))'),
    'DS-05 주 버튼 149deg 그라디언트 (Figma 가이드 정합)');
  const sz = fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size;
  assert(sz <= LIMIT && LIMIT - sz >= 100, `EX-01 번들 — ${sz}B ≤ ${LIMIT}B·헤드룸 ${LIMIT - sz}B ≥ 100B`);
  assert(errors.length === 0, 'EX-02 runtime errors 0' + (errors.length ? ' → ' + errors.join('|').slice(0, 160) : ''));
  await dom.window.close();

  console.log('--- S97 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
