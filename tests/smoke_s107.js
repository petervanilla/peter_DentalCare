#!/usr/bin/env node
/* S107 스모크 — 파일럿 패키지 최종 점검 (AC-108: 남은 공정 #1 준비 상태 상시 감시):
   PK-01 파일럿 패키지 12종 실재 (제안서·데모시나리오·배포런북·미팅플레이북·계약서초안·
         파이프라인트래커·온보딩가이드·완성현황·규제전략·실서비스설계·PRD·작업명세)
   PK-02 제안서·플레이북 현행 표기 (자동화 검증·게이트 1 활성율 70% 연계)
   PK-03 미팅 리허설 절차 (플레이북: 서버 기동·health 확인·인증 모드 초대코드)
   PK-04 온보딩 전달 절차 (온보딩가이드: 초대코드·계정 회수·재활성)
   PK-05 데모 동선 문서 (데모시나리오 STEP 1~6 — 재연 자체는 smoke_s102가 감시)
   실행: cd /home/user/tests && node smoke_s107.js */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = f => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { return null; } };
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); process.exitCode = 1; } }

const PKG = ['미리미소-파일럿제안서.md', '미리미소-데모시나리오.md', '미리미소-배포런북.md', '미리미소-미팅플레이북.md',
  '미리미소-파일럿계약서초안.md', '미리미소-파이프라인트래커.md', '미리미소-온보딩가이드.md', '미리미소-완성현황.md',
  '미리미소-규제전략.md', '미리미소-실서비스설계.md', '미리미소-PRD.md', '미리미소-작업명세.md'];
assert(PKG.every(f => { const c = read(f); return c && c.length > 500; }), 'PK-01 파일럿 패키지 12종 실재');

const proposal = read('미리미소-파일럿제안서.md'), playbook = read('미리미소-미팅플레이북.md');
assert(proposal.includes('자동화 검증') && proposal.includes('게이트 1') && playbook.includes('70%')
  , 'PK-02 제안서·플레이북 현행 표기 (검증·게이트 1)');

assert(playbook.includes('node server/server.js') && playbook.includes('health 확인')
  && playbook.includes('MIRI-CLINIC-2026') && playbook.includes('리허설 체크리스트'),
  'PK-03 미팅 리허설 절차 (기동·헬스·인증 모드)');

const onboard = read('미리미소-온보딩가이드.md');
assert(onboard.includes('초대코드') && onboard.includes('계정 회수') && onboard.includes('재활성'),
  'PK-04 온보딩 전달 절차 (초대코드·회수·재활성)');

const demo = read('미리미소-데모시나리오.md');
assert(demo.includes('STEP 1') && demo.includes('STEP 6'), 'PK-05 데모 동선 STEP 1~6');

console.log(`\nTOTAL: ${passed} passed / ${failed} failed`);
