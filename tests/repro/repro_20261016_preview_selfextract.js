/* repro/repro_20261016_preview_selfextract.js — GS-03 최소 재현 테스트 (S49·D161)
   결함: 파일 뷰어 프리뷰에서 원본 번들(~261KB)이 전송 경계에 걸려 잘리고, 잘린 지점부터 소스가 텍스트로 노출
        (사용자 보고: "프리뷰어 화면에 코드가 보인다" — D57 계열 재발)
   수정: 자가 추출 프리뷰 빌드(미리미소-프리뷰.html ~114KB) — 원본을 gzip+base64로 품고 브라우저가 스스로 복원
   이 테스트: (1) 프리뷰 아티팩트 예산·무결 (2) 복원이 원본과 바이트 동일 (3) 복원 후 앱 부팅 — 재발 시 여기서 잡는다
   실행: cd /home/user/tests && node repro/repro_20261016_preview_selfextract.js  (~3초) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const zlib = require('zlib');

let pass = 0, fail = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg);
  cond ? pass++ : (fail++, process.exitCode = 1);
}

(async () => {
  console.log('=== 재현: 프리뷰 전송 경계로 소스 노출 — 자가 추출 빌드로 차단 (D161) ===');
  const p = fs.readFileSync('/home/user/미리미소-프리뷰.html', 'utf8');
  const orig = fs.readFileSync('/home/user/미리미소-웹앱.html', 'utf8');

  assert(fs.statSync('/home/user/미리미소-프리뷰.html').size <= 130000, '프리뷰 예산 — ' + fs.statSync('/home/user/미리미소-프리뷰.html').size + 'B ≤ 130,000B (뷰어 한계선 아래)');
  assert(orig.length > 0 && orig.trimEnd().endsWith('</html>'), '공식 파일 무결 — 단일 파일 원본 보존 (전달물 영향 없음)');

  const m = p.match(/var B64 = "([A-Za-z0-9+\/=]+)";/);
  assert(!!m, '로더에 gzip+base64 페이로드 존재');
  if (m) {
    const bin = Buffer.from(m[1], 'base64');
    assert(bin[0] === 0x1f && bin[1] === 0x8b, '페이로드가 gzip 매직(1f 8b)으로 시작');
    const back = zlib.gunzipSync(bin).toString('utf8');
    assert(back === orig, '복원 무결 — 추출 결과가 공식 파일과 바이트 동일 (' + back.length + '자)');
  }

  const dom = new JSDOM(p, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://127.0.0.1:1/', beforeParse(w) {
    /* 시험 환경 한계: jsdom Blob은 .stream() 미지원 — Node 표준 객체 주입 (실브라우저는 네이티브 지원) */
    w.DecompressionStream = DecompressionStream;
    w.Response = Response;
    w.Blob = Blob;
    if (typeof w.TextDecoder === 'undefined') w.TextDecoder = TextDecoder;
    w.scrollTo = () => {};
  } });
  const w = dom.window, d = w.document;
  await new Promise(r => setTimeout(r, 2500));
  const t = d.body ? d.body.textContent : '';
  assert(t.includes('일반 환자 모드') && t.includes('의료진') && t.includes('기공소'), '복원 후 부팅 — 역할 카드 3개 렌더');
  assert(typeof w.MM !== 'undefined' && w.MM.Api && w.MM.Api.online === false, '복원 후 앱 전역 — MM·오프라인 데모 모드 (네트워크 없이 동작)');
  assert(!t.includes('추출 실패'), '추출 실패 메시지 없음');
  const _sc = Array.from(d.querySelectorAll('script'));
  const _code = _sc.map(x => x.textContent).join('');
  assert(_sc.length >= 1 && _code.includes('_q(') && _code.includes('treatment'), '복원된 문서에 앱 스크립트 존재 (단일 유닛 · S74 포함)');

  console.log('--- repro finished: ' + pass + ' pass / ' + fail + ' fail ---');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL - ' + (e && e.stack || e)); process.exit(1); });
