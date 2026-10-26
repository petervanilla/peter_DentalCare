/* repro/TEMPLATE.js — 최소 재현 테스트 템플릿 (GS-03 이중 등록 원칙)
   규칙: 원고 러너(run_script.js)·어떤 스모크에서 결함이 발견되면 —
   (1) 이 템플릿으로 짧은 최소 재현 테스트를 tests/repro/repro_<날짜>_<한줄명>.js 로 만들고 (10초 내 단독 실행)
   (2) 전체 원고 회귀(run_script.js 매니페스트 기대값 또는 해당 스모크)에도 동일 시나리오를 추가한다
   → 수정 후 둘 다 PASS가 되어야 같은 문제가 재발하지 않음. 파일명은 고친 뒤에도 유지(회귀 이력 자산). */
const { createApp } = require('/home/user/mirimiso-webapp/server/server.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg);
  cond ? pass++ : (fail++, process.exitCode = 1);
}
(async () => {
  console.log('=== 재현: <결함 한 줄 요약 — 발견 경로(원고 러너 J-? / smoke_s??>) ===');
  // 최소 단계만: 결함을 재현하는 가장 짧은 호출·클릭 시퀀스
  // assert(수정된 기대 동작, '기대 한 줄');

  console.log('--- repro finished: ' + pass + ' pass / ' + fail + ' fail ---');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
