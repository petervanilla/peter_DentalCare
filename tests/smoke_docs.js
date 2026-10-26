/* smoke_docs.js — 문서 정합성 감시: 패키지 7종의 수치·버전·키워드 교차 검증
   (수치 드리프트 방지 — 스프린트마다 이 파일의 기대값을 갱신)
   실행: cd /home/user/tests && node smoke_docs.js */
const fs = require('fs');

let pass = 0, fail = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg);
  cond ? pass++ : (fail++, process.exitCode = 1);
}
const read = p => { try { return fs.readFileSync('/home/user/' + p, 'utf8'); } catch (e) { return null; } };

console.log('=== 문서 패키지 존재·수치 교차 검증 ===');
const readme = read('README.md'), spec = read('미리미소-작업명세.md'), report = read('미리미소-작업리포트.md');
const proposal = read('미리미소-파일럿제안서.md'), demo = read('미리미소-데모시나리오.md');
const runbook = read('미리미소-배포런북.md'), reg = read('미리미소-규제전략.md');
const convert = read('미리미소-실서비스설계.md');

const TESTS = 1709; /* 108종 러너 finished 합계 (smoke 106종 1,623 + 원고 77 + 재현 9) — bump 시 갱신 (실측) */
assert(readme && readme.includes(TESTS + '개 검증'), 'README: 총 검증 ' + TESTS + ' 표기');
assert(spec && spec.includes(TESTS + '개 검증'), '명세: 총 ' + TESTS + '개 검증 표기');
assert(report && report.includes(TESTS + '개 검증 PASS'), '리포트: 총 ' + TESTS + '개 검증 PASS 표기');
assert(proposal && proposal.includes('자동화 검증 ' + TESTS), '제안서: 자동화 검증 ' + TESTS + ' 표기');
assert(!(readme + proposal).includes('445개 시나리오') && !(readme + proposal).includes('347개'), 'README·제안서: 구버전 수치 잔여 없음');

console.log('=== 버전·문서 링크 ===');
assert(/v2\.89 \(S120/.test(readme), 'README: 버전 v2.89 (S120)');
assert(spec.includes('AC-89') && spec.includes('CSS 변수 계약'), '명세: AC-89·CSS 변수 계약 11조 (S87)');
assert(spec.includes('AC-88') && spec.includes('TXG'), '명세: AC-88·TXG 계약 10조 (S86)');
assert(spec.includes('.txg3') && spec.includes('AC-87'), '명세: txg3 스코프·AC-87 (S85)');
assert(spec.includes('아키텍처 계약') && spec.includes('MM_VISITS_V1'), '명세: 아키텍처 계약·MM_* 레지스트리 (R6/S84)');
assert(spec.includes('smoke_server') && spec.includes('AC-86'), '명세: 서버 스모크 등재·AC-86 (R3/S84)');
assert(spec && spec.includes('v4.1'), '명세: 문서 버전 v4.1');
assert(report && report.includes('S31 스프린트 작업 리포트') && report.includes('S32 스프린트 작업 리포트') && report.includes('S33 스프린트 작업 리포트'), '리포트: S31·S32·S33 섹션 존재');
assert(readme && readme.includes('미리미소-배포런북.md'), 'README: 런북 동반 문서 연계');
assert(proposal && proposal.includes('미리미소-배포런북.md'), '제안서: 런북 동반 자료 연계');
assert(convert && convert.includes('M1~M3 전부 완료'), '전환설계: M1~M3 완료 표기');

console.log('=== 데모시나리오: 신뢰 계층(S16~S21) 커버 ===');
assert(demo && demo.includes('신뢰 모드 시연'), '데모시나리오: 신뢰 모드 섹션 존재');
assert(demo && demo.includes('MIRI-CLINIC-2026') && demo.includes('초대코드'), '데모시나리오: 초대코드 게이트 커버');
assert(demo && demo.includes('SHA-256') && demo.includes('HMAC'), '데모시나리오: 동의·주문 서명 커버');
assert(demo && demo.includes('backup.sh'), '데모시나리오: 백업 스크립트 연계');
assert(demo && demo.includes('배포런북'), '데모시나리오: 런북 연계');

console.log('=== 런북·규제전략 핵심 요소 ===');
assert(runbook && runbook.includes('systemd') && runbook.includes('Caddyfile'), '런북: systemd·Caddy 절차');
assert(runbook && runbook.includes('복원 절차') && runbook.includes('최근 7개'), '런북: 백업 보존(7개)·복원 절차');
assert(reg && reg.includes('활성 병원 비율 70%'), '규제전략: 게이트 1(활성율 70%) 기준 존재');

console.log('=== S26: 완성현황·패키지 정합 ===');
const status = read('미리미소-완성현황.md');
assert(status && status.includes('90%') && status.includes('완성율'), '완성현황: 영역별 완성율 표기 (합계 90%)');
assert(status && status.includes(TESTS + '개'), '완성현황: 총 검증 ' + TESTS + ' 표기');
assert(status && status.includes('남은 작업') && status.includes('파일럿 계약'), '완성현황: 남은 작업 명기 (파일럿 계약)');
assert(runbook && runbook.includes('MM_SIGNER') && runbook.includes('signer'), '런북: 서명 어댑터 환경변수·헬스 절차');
assert(runbook && runbook.includes('orphan'), '런북: 복원 후 저장소 정합(GC) 절차');
assert(demo && demo.includes('3-3') && demo.includes('운영 모드 시연'), '데모시나리오: §3-3 운영 모드 섹션 존재');

console.log('=== S27: 미팅 플레이북·착수 지원 ===');
const play = read('미리미소-미팅플레이북.md');
assert(play && play.includes('계약 조건 체크리스트') && play.includes('워크플로 인터뷰'), '플레이북: 미팅 운영·계약 조건 커버');
assert(play && play.includes('리허설 체크리스트') && play.includes('npm test'), '플레이북: D-1 리허설 절차 (스모크 포함)');
assert(play && play.includes('비진단') && play.includes('개인정보'), '플레이북: 규제·고지 라인 유지');
assert(status && status.includes('미팅플레이북') && status.includes('v1.2'), '완성현황: v1.2 (12종)');

console.log('=== S28: 계약·온보딩 실행 키트 ===');
const contract = read('미리미소-파일럿계약서초안.md');
assert(contract && contract.includes('법무 검토') && contract.includes('의료기기가 아니며'), '계약서초안: 법무 고지 · 비진단 조문');
assert(contract && contract.includes('소유권은 병원에') && contract.includes('개인정보') && contract.includes('비율 70%') && contract.includes('내보내기'), '계약서초안: 데이터 소유·개인정보·게이트·반환 조항');
const tracker = read('미리미소-파이프라인트래커.md');
assert(tracker && tracker.includes('게이트 1') && tracker.includes('스코어카드') && tracker.includes('30점'), '트래커: 단계 정의·스코어카드 연계');
const onboard = read('미리미소-온보딩가이드.md');
assert(readme && readme.includes('미리미소-파일럿계약서초안.md') && readme.includes('미리미소-온보딩가이드.md') && readme.includes('미리미소-파이프라인트래커.md'), 'README: 실행 키트 3종 동반 문서 편입');
assert(onboard && onboard.includes('초대코드') && onboard.includes('계정 발급') && onboard.includes('비진단'), '온보딩가이드: 시작·실장 업무·고지 커버');

console.log('=== 빌드·서버 상태 ===');
const bundleBytes = fs.statSync('/home/user/미리미소-웹앱.html').size;
assert(bundleBytes <= 283000, '번들: ' + bundleBytes + 'B ≤ 276KiB (프리뷰 한도 이하)');
const psize = fs.statSync('/home/user/미리미소-프리뷰.html').size;
assert(psize <= 130000, '프리뷰: 자가 추출 빌드 ' + psize + 'B ≤ 130,000B (뷰어 전송 경계 아래 — S49)');
const serverSrc = fs.readFileSync('/home/user/mirimiso-webapp/server/server.js', 'utf8');
const mv = /version: 'S(\d+)'/.exec(serverSrc);
assert(mv && parseInt(mv[1], 10) >= 21, '서버: version S' + (mv ? mv[1] : '?') + ' (S21 이상)');
assert(serverSrc.includes('/api/maintenance/backup'), '서버: 백업 엔드포인트 존재');

console.log('=== 미팅 준비물 — 최신성 (S34) ===');
const playbook = read('미리미소-미팅플레이북.md');
assert(demo && demo.includes('v2.4') && demo.includes('smoke_s47'), '데모시나리오: v2.4 · 리허설(smoke_s47) 명기');
assert(demo && demo.includes('미러링') && demo.includes('정정') && demo.includes('블루투스'), '데모시나리오: 미러링·정정·블루투스 FAQ 커버');
assert(playbook && playbook.includes(TESTS + '개 검증'), '플레이북: 총 ' + TESTS + ' 검증 수 현행');
assert(onboard && onboard.includes('개인화') && onboard.includes('미러링') && onboard.includes('정정'), '온보딩: 개인화·미러링·정정 안내');
assert(onboard && onboard.includes('데이터 소유') && onboard.includes('내보내기') && onboard.includes('삭제 청구') && onboard.includes('활성율'), '온보딩: 계약 수명주기 도구 안내 (S40)');
assert(onboard && onboard.includes('백업까지 완전 삭제') && onboard.includes('제4조1항'), '온보딩: 삭제·소유 조항 정확성 (S40)');
assert(onboard && onboard.includes('계정 회수') && demo && demo.includes('재활성') && runbook && runbook.includes('계정 수명주기'), '운영 문서: 계정 수명주기(회수·재활성) 동기화 (S43)');
assert(runbook && runbook.includes('회수 상태') && runbook.includes('S44'), '런북: 복원 생존 범위에 계정·회수 상태 명기 (S44)');
assert(runbook && runbook.includes('content-encoding') && spec && spec.includes('AC-45'), '런북·명세: 트래픽 절감(304·gzip) 확인 절차 (S45)');
assert(demo && demo.includes('게이트 1 측정') && demo.includes('데이터 내보내기'), '데모시나리오: 운영 모드 게이트·내보내기 시연 (S40)');
assert(contract && contract.includes('S38') && contract.includes('S39'), '계약서: 조항↔구현 버전 연계 (S38/S39)');

console.log('=== 파일럿 패키지 존재·정합 (S102) ===');
const trackerDoc = read('미리미소-파이프라인트래커.md'), prdDoc = read('미리미소-PRD.md');
const brandDoc = read('브랜드.md'), designDoc = read('디자인.md'), pilotSpecDoc = read('미리미소-디자인적용-작업명세.md');
assert(contract && contract.includes('데이터 소유권') && contract.includes('의료기기가 아니며'), '패키지: 계약서초안 (소유권·비진단)');
assert(onboard && trackerDoc && prdDoc, '패키지: 온보딩·파이프라인트래커·PRD 존재');
assert(brandDoc && brandDoc.includes('스마일치과'), '패키지: 브랜드.md (S101)');
assert(designDoc && designDoc.includes('컴포넌트 인벤토리'), '패키지: 디자인.md (S101)');
assert(pilotSpecDoc && pilotSpecDoc.includes('18/18'), '패키지: 디자인 적용 명세 종료 기록');

console.log('--- S23 smoke_docs finished: ' + pass + ' pass / ' + fail + ' fail ---');
if (fail) process.exit(1);
