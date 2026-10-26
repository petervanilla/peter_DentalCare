/* i18n.js — 현지화 키 사전 (PRD_미리미소_v0.1 §9.4 · F-20)
   왜: 사용자 노출 문자열을 코드에서 분리해, 문구 변경과 다국어 확장이 사전 한 곳에서 끝나게 한다.
   원리: MM.STR 사전 + MM.t(key) 조회. 사전에 없는 키는 키 자체를 반환해 누락이 화면에 바로 드러나게 한다.
   키 형식: text.{화면ID}.{요소} / msg.{도메인}.{상황} — 새 화면은 text.{S-xx}.* 키 없이 완료로 보지 않는다. */
!function (t) {
  "use strict";
  var e = t.MM = t.MM || {};
  e.STR = {
  'msg': {
    'legal': {
      'non_diagnosis': '스마일치과는 의료기기가 아니며 진단·치료 목적의 서비스가 아닙니다. 모든 소견은 교육·상담 준비용 참고 자료(가상 데이터)이며 실제 결과와 다를 수 있습니다. 정확한 평가·처방은 치과의사 대면 진료에서만 가능합니다.'
    },
    'consent': {
      'required': '시작 전에 확인해 주세요',
      'signer_empty': '서명자 성명을 입력하세요 (데모)'
    },
    'auth': {
      'code_invalid': '유효하지 않은 초대코드입니다',
      'code_revoked': '회수된 계정입니다 — 병원 실장에게 문의하세요',
      'session_expired': '세션 만료 — 초대코드로 다시 로그인하세요'
    },
    'sync': {
      'offline': '오프라인 — 로컬 상태로 처리 (서버 미연결)',
      'conflict': '서버 동기화 실패 — 복원 (데모)'
    },
    'storage': { 'full': '파일 서버 저장 실패 — 화면 등록은 유지 (데모)' },
    'file': { 'parse_failed': '3D 파일 로드 실패' },
    'capture': { 'quality_low': '품질이 낮아요 — 빛이 충분한 곳에서 다시 촬영해 보세요', 'no_server_upload': '서버 업로드 없음 — 기기 저장만' },
    'validation': { 'memo_too_long': '메모는 60자까지만 저장됩니다' },
    'server': { 'unavailable': '서버 연결 실패 — 잠시 후 다시 시도하세요' }
  },
  'text': {
    'S-01': {
      'official_badge': '🦷 스마일치과 공식 프리상담',
      'hero_desc': '방문 전 가상 시뮬레이션과 사전 문진으로 더 만족스러운 치과 상담을 경험하세요.',
      'pick_title': '접속 유형을 선택하세요',
      'pick_note': ' · 모드 변경 가능',
      'recommend': '★ 추천',
      'role_patient_desc': '미소 시뮬레이션 · 상담 질문지 · 예약<br>Pro 3D 구강 스캔 및 셀프 리포트',
      'role_staff_desc': '환자 스캔 리뷰 · 소견 및 코멘트 확인<br>구강 스캐너 STL/PLY 데이터 연동',
      'role_lab_desc': '주문 큐 모니터링 · 보철 호환성 자동 검증<br>3D 밀링 및 제작 진행 상태 관리',
      'preview_badge': '3분 소요',
      'preview_step1': 'AI 안면·치열 분석',
      'preview_step2': '가상 스마일 시뮬레이션',
      'start_patient': '환자 모드로 바로 시작하기',
      'photo_note': '입력한 사진은 저장·전송되지 않습니다',
      'title': '치과 상담, 미리 준비하고 오세요',
      'role_patient': '일반 환자 모드',
      'role_staff': '의료진 모드 (Clinic)',
      'role_lab': '기공소 모드 (Lab)',
      'preview_title': '미리미소 미리보기',
      'notice_patient': '· 스마일치과는 의료기기가 아닌 상담 준비·교육 서비스입니다.<br>· 시뮬레이션·소견은 실제 결과가 아니며 진단·처방을 대체하지 않습니다.<br>· 정확한 평가·계획은 치과의사 대면 진료에서.<br>· 입력한 사진은 저장·전송되지 않습니다.',
      'notice_staff': '· 스마일치과 Clinic은 상담 준비·스캔 리뷰 도구이며 의료기기가 아닙니다.<br>· AI 소견은 비진단 참고 — 최종 판단은 담당 치과의사.<br>· 환자 리포트는 명시적 동의 시에만 열람.<br>· 환자·수치는 가상 데모 데이터입니다.',
      'notice_lab': '· 기공소 계정은 주문 케이스(제작 정보·3D 파일)만 열람 가능 — 환자 소견·리포트는 권한 없음.<br>· 열람 기록은 감사로그 기록 (데모).<br>· 호환성 검증은 참고 — 최종 판단은 기공사·치과의사.<br>· 케이스·주문은 가상 데모 데이터입니다.',
      'agree_text': '위 내용을 이해했으며, 교육 목적의 데모임에 동의합니다.',
      'agree_start': '동의하고 시작하기'
    },
    'S-02': {
      'greeting': '안녕하세요, {name}님<br>오늘도 내 미소를 미리 봐요',
      'quick_sim': '미소 시뮬레이션',
      'quick_records': '스캔 기록',
      'quick_report': '상담 리포트',
      'quick_care': '치료 후 관리',
      'quick_today': '오늘의 관리'
    }
    ,
    'S-03': {
      'step_upload': '1. 사진 업로드',
      'step_select': '2. 시술 선택',
      'step_preview': '3. AI 미리보기',
      'title': '정면 미소 사진을 올려주세요',
      'intro': '미리미소 AI 엔진이 안면 윤곽에 맞는 스마일 라인을 예측합니다. 치아가 6개 이상 보이는 밝은 정면 사진이 가장 정확합니다. 타인 사진은 동의 후 사용.',
      'tips_title': '시뮬레이션 정확도를 높이는 3가지 팁',
      'tips': '1. 정면 30~40cm 거리<br>2. 자연스럽게 입꼬리를 올린 밝은 미소<br>3. 그림자 없는 밝은 조명',
      'proc_title': '어떤 시술의 변화를 확인하고 싶으신가요?',
      'proc_desc': '복수 선택 가능 — 복합 플랜에 맞춘 가상 스마일을 생성합니다.',
      'run': 'AI 시뮬레이션 시작'
    },
    'S-04': {
      'badge': '교육용 시뮬레이션<br>실제 결과와 다를 수 있음',
      'compare_note': '현재 미소 (Before) ↔ 시뮬레이션 후 (After) — 슬라이더를 움직여 비교해 보세요',
      'demo_note': '업로드 사진에 데모 결과가 표시됩니다. 실서비스에서는 본인 사진 기준입니다.',
      'summary_title': '분석 요약 ',
      'summary_badge': '화면 추정 · 교육용',
      'metric_tooth': '치아 노출도 ',
      'metric_sym': '좌우 대칭성 ',
      'metric_gum': '잇몸 노출량 ',
      'note': '사진 기반 추정값 — 의학적 판단 근거 아님',
      'cta_report': '맞춤 상담 질문지 만들기',
      'cta_retry': '다른 사진으로 다시 시도'
    },
    'S-08': {
      'title': '상담 리포트 — ',
      'guide_title': 'AI 소견 및 상담 가이드 ',
      'questions_title': '상담 질문지 ',
      'cost_title': '예상 비용 범위 ',
      'print': '◉ 인쇄 / PDF 저장',
      'share': '병원에 리포트 공유하기 (케이스 시작)',
      'share_done': '✓ 병원에 리포트 공유됨 — 상태 보기'
    },
    'S-12': {
      'memo_placeholder': '특이사항'
    },
    'S-13': {
      'order_title': 'OrderInfo',
      'design_title': 'Design'
    }
  }
  };
  /* Q-03 확정: English(en) 1차 번역본 — 키 이행 완료 화면(S-01~S-03)과 공통 고지만 번역하고, 없는 키는 한국어(기본 사전)로 폴백한다. */
  e.LOCALES = {
    'en': {
      'msg': {
        'legal': { 'non_diagnosis': 'Smile Dental is not a medical device. Findings are educational references (virtual data), not diagnosis or treatment. Confirm care in person.' },
        'capture': { 'no_server_upload': 'No server upload — stays on this device' },
        'validation': { 'memo_too_long': 'Memos save up to 60 characters' },
        'consent': { 'required': 'Please review before starting' }
      },
      'text': {
        'S-01': {
          'official_badge': '🦷 Smile Dental official pre-consultation',
          'hero_desc': 'Prepare with a virtual smile preview and pre-visit questions for a better dental consultation.',
          'pick_title': 'Choose how to continue',
          'pick_note': ' · You can switch modes later',
          'recommend': '★ Recommended',
          'role_patient_desc': 'Smile simulation · Questions · Booking<br>Pro 3D oral scan and self-report',
          'role_staff_desc': 'Patient scan review · Findings<br>STL/PLY scanner import',
          'role_lab_desc': 'Order queue · Prosthetic compatibility check<br>3D milling status',
          'preview_badge': 'Takes 3 min',
          'preview_step1': 'AI face and teeth analysis',
          'preview_step2': 'Virtual smile simulation',
          'start_patient': 'Start in patient mode',
          'photo_note': 'Photos you enter are not saved or sent',
          'title': 'Prepare for your dental visit in advance',
          'role_patient': 'Patient mode',
          'role_staff': 'Clinician mode (Clinic)',
          'role_lab': 'Lab mode (Lab)',
          'preview_title': 'MiriMiso preview',
          'notice_patient': '· Education and consultation prep only — not a medical device.<br>· Results are illustrative, not diagnosis.<br>· Confirm care in person.<br>· Photos are not saved or sent.',
          'notice_staff': '· Consultation prep and scan review only — not a medical device.<br>· AI findings are non-diagnostic; the dentist decides.<br>· Reports require consent.<br>· Virtual demo data.',
          'notice_lab': '· Lab accounts see order cases only.<br>· Views are audit-logged (demo).<br>· Compatibility is a reference; the dentist decides.<br>· Virtual demo data.',
          'agree_text': 'I understand the above and agree that this is an educational demo.',
          'agree_start': 'Agree and start'
        },
        'S-02': {
          'greeting': 'Hello, {name}<br>Preview your smile again today',
          'quick_sim': 'Smile simulation',
          'quick_records': 'Scan records',
          'quick_report': 'Consultation report',
          'quick_care': 'Aftercare',
          'quick_today': "Today’s care"
        },
        'S-03': {
          'step_upload': '1. Upload photo',
          'step_select': '2. Choose treatment',
          'step_preview': '3. AI preview',
          'title': 'Upload a front smile photo',
          'intro': 'The MiriMiso AI engine predicts a natural smile line for your face. Use a bright front photo showing at least six teeth, with little shadow. Use another person’s photo only with consent.',
          'tips_title': '3 tips for a more accurate simulation',
          'tips': '1. Front view, 30–40 cm away<br>2. Bright natural smile<br>3. Bright, shadow-free light',
          'proc_title': 'Which treatment change would you like to preview?',
          'proc_desc': 'Multiple choices are available — we create a virtual smile for combined plans.',
          'run': 'Start AI simulation'
        },
        'S-04': {
          'badge': 'Educational simulation<br>Results may differ',
          'compare_note': 'Before ↔ After — move the slider to compare',
          'demo_note': 'Demo results on your photo. Live service uses your own photo.',
          'summary_title': 'Analysis summary ',
          'summary_badge': 'On-screen estimate · Educational',
          'metric_tooth': 'Tooth exposure ',
          'metric_sym': 'Left-right symmetry ',
          'metric_gum': 'Gum exposure ',
          'note': 'Photo-based estimates — not a medical judgment',
          'cta_report': 'Create my consultation questions',
          'cta_retry': 'Try another photo'
        },
        'S-08': {
          'title': 'Consultation report — ',
          'guide_title': 'AI findings and consultation guide ',
          'questions_title': 'Consultation questions ',
          'cost_title': 'Estimated cost range ',
          'print': '◉ Print / Save as PDF',
          'share': 'Share report with clinic (start case)',
          'share_done': '✓ Shared with clinic — view status'
        },
        'S-12': {
          'memo_placeholder': 'Anything unusual'
        },
        'S-13': {
          'order_title': 'OrderInfo',
          'design_title': 'Design'
        }
      }
    }
  };
  e.lang = 'ko';
  try { if (t.localStorage && t.localStorage.MM_LANG === 'en') e.lang = 'en'; } catch (err) {}
  function lookup(root, key) {
    var parts = key.split('.'), cur = root;
    for (var i = 0; i < parts.length; i++) { if (cur == null || typeof cur !== 'object') return null; cur = cur[parts[i]]; }
    return typeof cur === 'string' ? cur : null;
  }
  e.setLang = function (lang) {
    e.lang = lang === 'en' ? 'en' : 'ko';
    try { t.localStorage.MM_LANG = e.lang; } catch (err) {}
    try { t.document.documentElement.lang = e.lang === 'en' ? 'en' : 'ko'; } catch (err) {}
    return e.lang;
  };
  e.t = function (key) {
    if (e.lang === 'en') { var v = lookup(e.LOCALES.en, key); if (v !== null) return v; }
    var ko = lookup(e.STR, key);
    return ko !== null ? ko : key;
  };
}("undefined" != typeof window ? window : this);
