/* S74: 진료 워크플로 v3 (AIDENT형 Order·Scan·Design — 가상 시연 · 비진단 · 경량판) */
(function () {
  'use strict';
  var DATA = window.MM.DATA, $ = function (id) { return document.getElementById(id); };
  var TU = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28], TL = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
  var TXDT = ['Anatomic Crown', 'Inlay · Onlay', 'Veneer', 'Anatomic Post', 'Antagonist', 'Offset Coping'];
  var TXIB = ['🚫', 'I·1', 'I·2', 'I·3', 'I·4'];
  var TXS = { step: 1, t: {}, dt: null, ib: 0, col: 'A1', mat: 'Zirkon', pts: 0, ms: 0, paused: false, scan: false };
  var txIv = null;
  window.MM.treat = jb('MM_TREAT_V1', '[]');
  window.MM.treatAdd = function (r) { var a = window.MM.treat(); a.unshift(r); if (a.length > 8) a = a.slice(0, 8); jset('MM_TREAT_V1', a); };
  function txFdi() { return Object.keys(TXS.t).sort().join('·'); }
  function txRow(l, v) { return '<div class="txr"><span>' + l + '</span><b>' + v + '</b></div>'; }
  function txFoot() {
    var a = window.MM.treat();
    return CH + '최근 진료 기록 ' + BG + '기기 저장 · 가상' + E5 + (a.length ? a.map(function (r) {
      return '<div class="txr"><b>' + r.p + '</b><span>' + r.d + ' · ' + r.f + ' · ' + r.t + ' · ' + r.pt + 'P</span></div>';
    }).join('') : PD + '기록이 없습니다 — 처방 → 스캔 → 디자인을 진행하세요.</p>') + FN + '⚠️ AIDENT형 워크플로 학습용 가상 시연 — 실제 스캐너 연동·진단·처방이 아닙니다 (비진단).</p></div>';
  }
  function txRail() {
    return '<div class="csteps">' + ['처방', '스캔', '디자인'].map(function (x, i) {
      return '<span class="cst' + (TXS.step === i + 1 ? ' on' : '') + '">' + (i + 1) + '. ' + x + '</span>';
    }).join('') + '</div>';
  }
  function txGate() { var b = _q('#txGo'); if (b) b.disabled = !(Object.keys(TXS.t).length && TXS.dt); }
  function ck(sel, c, fn) { _qa(sel, c).forEach(function (b) { ob(b, 'click', function () { fn(b); }); }); }
  function txScanInner() {
    var q = '', i;
    for (i = 0; i < 96; i++) q += '<circle cx="' + (36 + (i * 37) % 128) + '" cy="' + (24 + (i * 53) % 90) + '" r="1.6"/>';
    return CH + 'Step 1: Scan the Working Arch ' + BI + '가상 스캔' + E5 +
      '<div class="scan-st"><span class="sst"><span id="txPt">0 P</span><span id="txTm">00:00</span></span><svg id="txSvg" viewBox="0 0 200 140">' +
      '<path d="M62 78Q60 52 88 46 100 44 100 56 100 44 112 46 140 52 138 78 136 102 100 104 64 102 62 78Z" fill="#F3E7CE" stroke="#C9B990"/>' + q + '</svg></div>' +
      '<div class="scan-g">🦷 <b>Scanning strategy</b> — 이동 속도를 일정하게 유지하세요.</div>' +
      '<div class="slot-row">' + BF + ' id="txPz">⏸ 일시정지</button>' + BF + ' id="txRs">⟲ 초기화</button>' + BP + ' id="txDn">스캔 완료 · 디자인 ▶</button></div>';
  }
  function txTick() {
    if (!_q('#txSvg') && !_q('#txPt')) { if (txIv) { clearInterval(txIv); txIv = null; } return; }
    if (!TXS.paused) {
      TXS.pts = Math.min(96, TXS.pts + 3); TXS.ms += 0.45;
      var vs = _qa('#txSvg circle'), i;
      for (i = 0; i < TXS.pts; i++) vs[i].classList.add('v');
      $('txPt').textContent = TXS.pts + ' P';
      $('txTm').textContent = ('0' + Math.floor(TXS.ms / 60)).slice(-2) + ':' + ('0' + Math.floor(TXS.ms % 60)).slice(-2);
      if (TXS.pts >= 96 && txIv) { clearInterval(txIv); txIv = null; }
    }
  }
  function txScanMount(c) {
    ob($('txPz'), 'click', function () { TXS.paused = !TXS.paused; $('txPz').textContent = TXS.paused ? '▶ 재개' : '⏸ 일시정지'; });
    ob($('txRs'), 'click', function () {
      TXS.pts = 0; TXS.ms = 0; TXS.paused = false; $('txPt').textContent = '0 P'; $('txTm').textContent = '00:00';
      _qa('#txSvg circle', c).forEach(function (x) { x.classList.remove('v'); });
      if (!txIv) txIv = setInterval(txTick, 450);
    });
    ob($('txDn'), 'click', function () { TXS.pts = 96; TXS.step = 3; A.go('treatment'); });
    if (!txIv) txIv = setInterval(txTick, 450);
    return function () { if (txIv) { clearInterval(txIv); txIv = null; } };
  }
  window.MM.VIEWS.treatment = {
    render: function () {
      var h, no = 'IScan' + new Date().toISOString().replace(/\D/g, '').slice(0, 14);
      if (A.state.txNew) { TXS.step = 1; TXS.t = {}; TXS.dt = null; TXS.ib = 0; TXS.pts = 0; TXS.ms = 0; TXS.paused = false; TXS.scan = false; A.state.txNew = 0; }
      h = VW + CH + '진료 — Order·Scan·Design ' + BI + 'Clinic · 가상 시연' + E5 + txRail();
      if (TXS.step === 1) {
        h += CH + 'OrderInfo ' + BG + '주문 정보' + E5 +
          '<b class="fl">환자</b><select id="txP">' + DATA.patients.map(function (p) { return '<option>' + p.name + ' · ' + p.age + '·' + p.gender + '</option>'; }).join('') + '</select>' +
          '<b class="fl">주문번호</b><input type="text" id="txNo" value="' + no + '" readonly>' +
          CH + '치아 위치 선택 ' + BI + 'FDI · 재클릭 Delete' + E5 +
          '<div class="tarch ta-u">' + TU.map(function (f) { return '<button class="tt" data-f="' + f + '" data-u="1">' + f + '</button>'; }).join('') + '</div>' +
          '<div class="tarch ta-l">' + TL.map(function (f) { return '<button class="tt" data-f="' + f + '">' + f + '</button>'; }).join('') + '</div>' +
          '<div class="tc-mid">' + BSS + ' id="txClear">ClearAll</button><span class="lgd"><i style="background:#93362A"></i>크라운(상악)<i style="background:#1F7E8C"></i>임플란트(하악)</span></div></div>' +
          CH + 'DesignType ' + BG + '보철 유형' + E5 + '<div class="dtg">' + TXDT.map(function (x) { return '<button class="dtc' + (TXS.dt === x ? ' on' : '') + '" data-d="' + x + '">' + x + '</button>'; }).join('') + '</div></div>' +
          CH + 'DesignMethod ' + BI + 'Reference Model' + E5 + '<label class="frow"><input type="checkbox" id="txRef"> Reference Model 사용</label>' +
          '<div class="dm-l">ImplantBody — 4종 모두 동일 워크플로 (시연)</div><div class="ibg">' + TXIB.map(function (x, i) { return '<button class="ib' + (TXS.ib === i ? ' on' : '') + '" data-i="' + i + '">' + x + '</button>'; }).join('') + '</div></div>' +
          CH + '색조 · 재료' + E5 + '<div class="half"><div><b class="fl">Color</b><select id="txCol">' + ['A1', 'A2', 'A3', 'B2', 'C3'].map(function (x) { return '<option' + (TXS.col === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div><div><b class="fl">Material</b><select id="txMat">' + ['Zirkon', 'PMMA', 'PEEK', 'Co-Cr'].map(function (x) { return '<option' + (TXS.mat === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div></div></div>' +
          '<b class="fl">Note</b><input type="text" id="txNt" maxlength="200" placeholder="기공 전달 메모 (최대 200자)">' +
          '<div class="slot-row">' + BQ + ' data-goto="staffHome">취소</button>' + BF + ' id="txSave1">주문 저장</button>' + BP + ' id="txGo" disabled>스캔 시작 ▶</button></div>' + txFoot();
      } else if (TXS.step === 2) {
        h += '<div id="txSc">' + (TXS.scan ? txScanInner() : CH + 'Data processing… ' + BI + '가상 처리' + E5 + MT + MU + '진행률 <span id="txPct">0%</span>' + E1 + MB + WT + '0%;" id="txBar">' + E2 + '</div>') + '</div>' + txFoot();
      } else {
        h += CH + 'Design — ' + TXS.dt + ' ' + BT + '가상 결과 · 비진단' + E5 +
          txRow('환자', TXS.p) + txRow('치아 (FDI)', txFdi()) + txRow('DesignType', TXS.dt) + txRow('ImplantBody', TXS.ib ? TXIB[TXS.ib] : '없음') + txRow('색조 · 재료', TXS.col + ' · ' + TXS.mat) + '</div>' +
          '<div class="slot-row">' + BF + ' id="txBack">← 스캔으로</button>' + BP + ' id="txSave">기록 저장 · 종료</button></div>' + txFoot();
      }
      return {
        html: h,
        mount: function (c) {
          if (TXS.step === 1) {
            ck('.tt', c, function (b) {
              var f = b.getAttribute('data-f');
              if (TXS.t[f]) { delete TXS.t[f]; b.classList.remove('on-u', 'on-l'); }
              else { TXS.t[f] = b.getAttribute('data-u') ? 'u' : 'l'; b.classList.add(TXS.t[f] === 'u' ? 'on-u' : 'on-l'); }
              txGate();
            });
            ob($('txClear'), 'click', function () { TXS.t = {}; _qa('.tt', c).forEach(function (b) { b.classList.remove('on-u', 'on-l'); }); txGate(); });
            ck('.dtc', c, function (b) { TXS.dt = b.getAttribute('data-d'); _qa('.dtc', c).forEach(function (x) { x.classList.toggle('on', x === b); }); txGate(); });
            ck('.ib', c, function (b) { TXS.ib = +b.getAttribute('data-i'); _qa('.ib', c).forEach(function (x) { x.classList.toggle('on', x === b); }); });
            ob($('txCol'), 'change', function () { TXS.col = $('txCol').value; });
            ob($('txMat'), 'change', function () { TXS.mat = $('txMat').value; });
            ob($('txSave1'), 'click', function () {
              if (!Object.keys(TXS.t).length) return A.toast('치아를 먼저 선택하세요');
              window.MM.treatAdd({ d: new Date().toISOString().slice(5, 10), p: $('txP').value.split(' · ')[0], f: txFdi(), t: TXS.dt || '주문', ib: TXS.ib, pt: 0 });
              A.toast('주문 저장 — 기기 로컬');
            });
            ob($('txGo'), 'click', function () { TXS.p = $('txP').value; TXS.pts = 0; TXS.ms = 0; TXS.scan = false; TXS.step = 2; A.go('treatment'); });
          } else if (TXS.step === 2) {
            if (TXS.scan) return txScanMount(c);
            var pc = 0, piv = setInterval(function () {
              if (!_q('#txBar')) { clearInterval(piv); return; }
              pc = Math.min(100, pc + 8); $('txBar').style.width = pc + '%'; $('txPct').textContent = pc + '%';
              if (pc >= 100) { clearInterval(piv); TXS.scan = true; ih($('txSc'), txScanInner()); txScanMount(c); }
            }, 100);
            return function () { clearInterval(piv); if (txIv) { clearInterval(txIv); txIv = null; } };
          } else {
            ob($('txBack'), 'click', function () { TXS.step = 2; A.go('treatment'); });
            ob($('txSave'), 'click', function () {
              window.MM.treatAdd({ d: new Date().toISOString().slice(5, 10), p: TXS.p.split(' · ')[0], f: txFdi(), t: TXS.dt, ib: TXS.ib, pt: TXS.pts });
              A.toast('진료 기록 저장 — 기기 로컬 (가상 · 비진단)');
              TXS.step = 1; TXS.t = {}; TXS.dt = null; TXS.pts = 0; TXS.ms = 0; TXS.scan = false; A.go('staffHome');
            });
          }
          gb(c);
          return undefined;
        }
      };
    }
  };
})();
