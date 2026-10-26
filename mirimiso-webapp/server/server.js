/* server.js — 미리미소 목서버 (S7): 케이스 CRUD · 주문 API · 3역할 실동기화
   - 순수 Node http (외부 의존성 0). 실행: node server/server.js  (PORT 환경변수, 기본 8080)
   - 시드: 웹앱 js/casehub.js의 CASES를 vm으로 로드 — 데이터 단일 출처 (데모 데이터 · 가상)
   - 권한 분리 서버 강제: role=lab 응답은 임상 필드 마스킹(_masked 고지), 역할 위반 변이는 403
   - 모든 변이는 감사로그 기록(GET /api/audit), 개별 케이스 열람도 기록
   - 제한(데모 기본): 메모리 DB(재시작 시 시드 복원) · 2초 폴링 동기화
   - M1 옵트인 계층(실서비스 전환 설계 ADR-002/003): createApp({auth:true}) 초대코드 인증 · createApp({persist:file}) SQLite 영속
   - M2 계층(ADR-004/005): 스캔 파일 업로드·다운로드(raw 바이너리·SHA-256) · SSE /api/stream 실시간 푸시 · SQLite 증분 기록(D50)
   - M3 계층: 전자동의 서명(SHA-256 문서 해시 + HMAC 서명·재시작 후에도 검증) · 운영 지표 리포트 자동 수집(6h 주기 + on-demand)
   - S19: 주문 pontic 반영(브리지 교두 위치) · 파일 GC(참조 없는 스캔 파일 주기 정리 — 파일럿 전 정리 과제 해소)
   - S20: 주문 무결성(제출 시 호환 검증 스냅샷 + 문서 해시·HMAC 서명, /api/order/verify) — 기공 의뢰서 위변조 방지 계층(전자서증 확장)
   - S21: 온라인 백업(/api/maintenance/backup · better-sqlite3 backup API · 7개 보존) — ADR-006 배포·운영 계층 (배포 런북 문서 참조)
   - S23: 계정 발급(POST /api/auth/invite·GET /api/auth/users — clinic 권한·감사로그) · 기공 원본 다운로드 허용(세션 파일 GET lab 허용 — 제작 원본 필요)
     - better-sqlite3는 lazy require — 데모 기본은 외부 의존성 0 유지. env: MM_AUTH=1 · MM_DB=파일경로
     - 인증 모드에서 role은 세션이 결정(클라 전송값 무시 · D51), 환자는 자기 케이스만 열람, 로그인도 감사로그 기록 */
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var zlib = require('zlib'); /* S45: 대용량 응답 압축 — 트래픽 절감 (TR-01/02) */
var os = require('os');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..');            /* mirimiso-webapp/ */
var BUNDLE = path.join(ROOT, '..', '미리미소-웹앱.html');
var DEMO_DATE = '2026-10-13';                     /* 데모 고정일 (클라이언트 DEMO_TODAY와 일치) */
var NOTICE = '데모 목서버 — 모든 케이스·환자 데이터는 가상입니다. 인증·영구 저장 없는 프로토타입입니다.';
var STEPS = ['상담', '스캔', '계획', '동의', '주문', '제작', '장착', '관리'];

/* ---- 시드: 웹앱 casehub.js 단일 출처 ---- */
function seedCases() {
  var src = fs.readFileSync(path.join(ROOT, 'js', 'casehub.js'), 'utf8');
  var sandbox = { MM: { VIEWS: {} }, console: console };
  vm.runInNewContext(src, sandbox, { filename: 'casehub.js' });
  if (!sandbox.MM.CASES_DATA || !sandbox.MM.CASES_DATA.items) throw new Error('seed load 실패');
  return JSON.parse(JSON.stringify(sandbox.MM.CASES_DATA.items));
}

/* ---- 상태 (메모리 DB) ---- */
var db = null;
var FILES_DIR_TMP = path.join(os.tmpdir(), 'mirimiso-scans'); /* 데모(비영속) 모드 파일 저장소 — 휘발성 */
function freshData() {
  return { seq: 0, cases: seedCases(), changes: [], audit: [], metrics: [], activity: [], filesDir: FILES_DIR_TMP,
    sigSecret: crypto.randomBytes(32).toString('hex'), /* M3: 동의서 HMAC 서명 키 (영속 모드는 meta에 저장) */
    lastReport: null };
}
function resetDb() {
  var prev = db || {};
  db = freshData();
  /* M1: 리셋은 '데모 데이터'만 초기화 — 계정·세션·저장소 컨텍스트는 보존 */
  if (prev.auth) {
    db.auth = true;
    db.users = prev.users || [];
    db.sessions = prev.sessions || {};
    db.store = prev.store || null;
    if (db.store) { db.store.reseed(db); db.store.sync(db); } /* 재시동 후에도 시드 상태 유지 */
  }
  if (prev.filesDir) {
    db.filesDir = prev.filesDir;
    try { fs.rmSync(prev.filesDir, { recursive: true, force: true }); } catch (e) {} /* 리셋 = 파일도 초기화 */
  }
}
resetDb();

/* ---- M1 (ADR-002): 초대코드 계정 — 코드에 역할 바인딩, 환자는 케이스까지 바인딩 ---- */
var crypto = require('crypto');
var INVITE_SEED = [
  { code: 'MIRI-CLINIC-2026', role: 'clinic', name: '김민수 원장' },
  { code: 'MIRI-LAB-2026', role: 'lab', name: 'OO기공소 담당자' },
  { code: 'MIRI-PAT-2601', role: 'patient', name: '김○○', caseId: 'C-2601' }
];
function seedUsers(st) {
  st.users = INVITE_SEED.map(function (u) { return Object.assign({ active: true }, u); });
  if (st.store) st.users.forEach(function (u) { st.store.upsertUser(u); });
}
function cookieAttrs(req, maxAge) { /* S46 (SV-01): HTTPS 프록시 경유(X-Forwarded-Proto: https) 시 Secure 추가 — 세션 쿠키 평문 전송 차단. 로컬 http는 쿠키 동작 유지 */
  var secure = String((req && req.headers && req.headers['x-forwarded-proto']) || '') === 'https' ? '; Secure' : '';
  return 'Path=/; HttpOnly; SameSite=Lax' + secure + '; Max-Age=' + (maxAge || 2592000); /* 30일 */
}
var SESSION_TTL_MS = 30 * 24 * 3600 * 1000; /* S29: 세션 만료 — 30일 (쿠키 Max-Age와 일치) */
var LOGIN_FAILS = {}; /* S29: 로그인 실패 카운터 — ip -> { n, first } (15분 창 10회) */
function loginGuard(ip) {
  var f = LOGIN_FAILS[ip];
  if (!f) return true;
  if (Date.now() - f.first > 15 * 60 * 1000) { delete LOGIN_FAILS[ip]; return true; }
  return f.n < 10;
}
function loginFail(ip) {
  var f = LOGIN_FAILS[ip];
  if (!f || Date.now() - f.first > 15 * 60 * 1000) LOGIN_FAILS[ip] = { n: 1, first: Date.now() };
  else f.n++;
}
function parseCookies(req) {
  var out = {}, raw = req.headers.cookie || '';
  raw.split(';').forEach(function (kv) {
    var i = kv.indexOf('=');
    if (i > 0) out[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  });
  return out;
}
function getSession(req) {
  var tok = parseCookies(req).mm_session;
  if (!tok || !db.sessions) return null;
  var v = db.sessions[tok];
  if (!v) return null;
  /* S29: 세션 만료 — 30일 경과 시 서버 측 폐기 (영속 모드는 저장소에서도 삭제) */
  var seen = new Date(v.lastSeen || v.ts).getTime();
  if (isFinite(seen) && Date.now() - seen > SESSION_TTL_MS) {
    delete db.sessions[tok];
    if (db.store) db.store.dropSession(tok);
    return null;
  }
  return { token: tok, role: v.role, name: v.name, caseId: v.caseId || null };
}
function newToken() { return crypto.randomBytes(24).toString('hex'); }

/* ---- M1 (ADR-003): SQLite 영속 저장소 — 전체 데이터 테이블을 단일 트랜잭션으로 원자 기록(D50) ---- */
function SqliteStore(file) {
  var Database = require('better-sqlite3'); /* lazy — 데모 기본 경로는 require 자체가 없음 */
  fs.mkdirSync(path.dirname(file), { recursive: true });
  var sq = new Database(file);
  sq.pragma('journal_mode = WAL');
  sq.exec('CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);' +
    'CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY, json TEXT);' +
    'CREATE TABLE IF NOT EXISTS case_changes(seq INTEGER PRIMARY KEY, json TEXT);' +
    'CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT);' +
    'CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT);' +
    'CREATE TABLE IF NOT EXISTS metrics(seq INTEGER PRIMARY KEY, json TEXT);' +
    'CREATE TABLE IF NOT EXISTS users(code TEXT PRIMARY KEY, json TEXT);' +
    'CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, json TEXT);');
  var upMeta = sq.prepare('INSERT OR REPLACE INTO meta(k,v) VALUES (?,?)');
  var upUser = sq.prepare('INSERT OR REPLACE INTO users(code,json) VALUES (?,?)');
  var upSession = sq.prepare('INSERT OR REPLACE INTO sessions(token,json) VALUES (?,?)');
  var delSession = sq.prepare('DELETE FROM sessions WHERE token=?');
  function run(fn) { sq.transaction(fn)(); }
  return {
    file: file,
    raw: sq,
    load: function () {
      if (!sq.prepare("SELECT v FROM meta WHERE k='seed'").get()) return null; /* 최초: 시드 필요 */
      var js = function (r) { return JSON.parse(r.json); };
      var out = {
        seq: parseInt(sq.prepare("SELECT v FROM meta WHERE k='seq'").get().v, 10) || 0,
        cases: sq.prepare('SELECT json FROM cases ORDER BY rowid').all().map(js),
        changes: sq.prepare('SELECT json FROM case_changes ORDER BY seq').all().map(js).slice(-200), /* 메모리 cap 일치 */
        audit: sq.prepare('SELECT json FROM audit_log ORDER BY id').all().map(js).slice(-500),
        activity: sq.prepare('SELECT json FROM activity ORDER BY id').all().map(js).slice(-500),
        metrics: sq.prepare('SELECT json FROM metrics ORDER BY seq').all().map(js).slice(-24),
        users: sq.prepare('SELECT json FROM users ORDER BY rowid').all().map(js),
        sessions: {}
      };
      sq.prepare('SELECT token, json FROM sessions').all().forEach(function (r) { out.sessions[r.token] = JSON.parse(r.json); });
      var sec = sq.prepare("SELECT v FROM meta WHERE k='sigSecret'").get();
      out.sigSecret = sec ? sec.v : null;
      var lr = sq.prepare("SELECT v FROM meta WHERE k='lastReport'").get();
      if (lr) { try { out.lastReport = JSON.parse(lr.v); } catch (e) { out.lastReport = null; } }
      return out;
    },
    sync: function (st) {
      run(function () {
        sq.exec('DELETE FROM cases; DELETE FROM case_changes; DELETE FROM audit_log; DELETE FROM activity; DELETE FROM metrics;');
        var ic = sq.prepare('INSERT INTO cases(id,json) VALUES (?,?)');
        st.cases.forEach(function (c) { ic.run(c.id, JSON.stringify(c)); });
        var ih = sq.prepare('INSERT INTO case_changes(seq,json) VALUES (?,?)');
        st.changes.forEach(function (h) { ih.run(h.seq, JSON.stringify(h)); });
        var ia = sq.prepare('INSERT INTO audit_log(json) VALUES (?)');
        st.audit.forEach(function (a) { ia.run(JSON.stringify(a)); });
        var iv = sq.prepare('INSERT INTO activity(json) VALUES (?)');
        st.activity.forEach(function (a) { iv.run(JSON.stringify(a)); });
        var im = sq.prepare('INSERT INTO metrics(seq,json) VALUES (?,?)');
        st.metrics.forEach(function (m) { im.run(m.seq, JSON.stringify(m)); });
        upMeta.run('seq', String(st.seq));
      });
    },
    reseed: function (st) {
      run(function () {
        sq.exec('DELETE FROM cases; DELETE FROM case_changes; DELETE FROM audit_log; DELETE FROM activity; DELETE FROM metrics;');
        sq.exec("DELETE FROM meta WHERE k='lastReport'");
        upMeta.run('seed', '1');
        upMeta.run('seq', '0');
      });
    },
    incrCase: function (st, cc) {
      var lc = cc || st.cases[st.cases.length - 1], lh = st.changes[st.changes.length - 1], lm = st.metrics[st.metrics.length - 1]; /* 변경된 케이스를 정확히 upsert (S18: 마지막 요소 오류 수정) */
      run(function () {
        if (lc) sq.prepare('INSERT OR REPLACE INTO cases(id,json) VALUES (?,?)').run(lc.id, JSON.stringify(lc));
        if (lh) sq.prepare('INSERT OR REPLACE INTO case_changes(seq,json) VALUES (?,?)').run(lh.seq, JSON.stringify(lh));
        if (lm) sq.prepare('INSERT OR REPLACE INTO metrics(seq,json) VALUES (?,?)').run(lm.seq, JSON.stringify(lm));
        upMeta.run('seq', String(st.seq));
      });
    },
    incrAudit: function (st) {
      var la = st.audit[st.audit.length - 1];
      run(function () { if (la) sq.prepare('INSERT INTO audit_log(json) VALUES (?)').run(JSON.stringify(la)); });
    },
    incrActivity: function (st) {
      var lv = st.activity[st.activity.length - 1];
      run(function () { if (lv) sq.prepare('INSERT INTO activity(json) VALUES (?)').run(JSON.stringify(lv)); });
    },
    setMeta: function (k, v) { run(function () { upMeta.run(k, v); }); },
    upsertUser: function (u) { run(function () { upUser.run(u.code, JSON.stringify(u)); }); },
    saveSession: function (tok, v) { run(function () { upSession.run(tok, JSON.stringify(v)); }); },
    dropSession: function (tok) { run(function () { delSession.run(tok); }); },
    backup: function (dest) { return sq.backup(dest); }, /* S21: 온라인 백업 — WAL 모드에서도 일관된 스냅샷 */
    close: function () { sq.close(); }
  };
}

/* ---- M1: 상태 팩토리 — auth/persist 조합 (기본 demoDb와 동일 형태 + 확장 필드) ---- */
function makeState(opts) {
  var st = freshData();
  st.auth = !!opts.auth;
  st.users = [];
  st.sessions = {};
  if (opts.persist) {
    var pfile = typeof opts.persist === 'string' ? opts.persist : path.join(ROOT, 'data', 'mirimiso.db');
    st.dbFile = pfile; /* S21: 백업·복원이 DB 파일 위치를 알아야 함 */
    st.filesDir = path.join(path.dirname(pfile), 'scans'); /* 영속 모드: DB 파일 곁에 scans/ */
    st.store = SqliteStore(pfile);
    var loaded = st.store.load();
    if (loaded) {
      st.seq = loaded.seq; st.cases = loaded.cases; st.changes = loaded.changes;
      st.audit = loaded.audit; st.activity = loaded.activity; st.metrics = loaded.metrics;
      st.users = loaded.users; st.sessions = loaded.sessions;
      if (loaded.sigSecret) st.sigSecret = loaded.sigSecret; else st.store.setMeta('sigSecret', st.sigSecret);
      st.lastReport = loaded.lastReport || null;
    } else {
      st.store.reseed(st);
      st.store.sync(st); /* 최초 기동: 시드 케이스를 DB에 기록 (증분 전제 — 미기록 시 재시동 시 빈 DB) */
      st.store.setMeta('sigSecret', st.sigSecret); /* 최초 기동: 서명 키도 즉시 영속 (재부팅 재생성 시 기존 서명 검증 불가) */
    }
  }
  if (st.auth && !st.users.length) seedUsers(st);
  return st;
}

function now() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function audit(role, act, caseId, detail) {
  db.audit.push({ seq: db.seq, ts: now(), role: role, act: act, caseId: caseId || '-', detail: detail || '' });
  var trimmed = db.audit.length > 500;
  if (trimmed) db.audit.splice(0, db.audit.length - 500);
  if (db.store) { if (trimmed || db._full) { db.store.sync(db); db._full = false; } else db.store.incrAudit(db); }
}
function change(role, kind, c, summary) {
  db.seq += 1;
  db.changes.push({ seq: db.seq, ts: now(), kind: kind, caseId: c.id, role: role, summary: summary });
  if (db.changes.length > 200) db.changes.splice(0, db.changes.length - 200);
  db.metrics.push(snapshot()); /* 지표 스냅샷 (S12 히스토리 — S17 T5 패치에서 누락됐던 라인 복원) */
  var trimmed = false;
  if (trimmed) db.changes.splice(0, db.changes.length - 200);
  if (db.metrics.length > 24) { db.metrics.splice(0, db.metrics.length - 24); trimmed = true; }
  if (db.store) {
    if (trimmed || db._full) { db.store.sync(db); db._full = false; } /* cap 절단 시 전체 재동기화 */
    else db.store.incrCase(db, c); /* M2 (D50): 증분 — 케이스 upsert + 변경/지표 행 추가 */
  }
  broadcastSeq();
}
/* M2 (ADR-005): SSE 클라이언트 브로드캐스트 — seq 변경 푸시(프로세스당 단일 라이브 서버 전제 · D53) */
var BOOT = Date.now(); /* S24: uptime 계산 기준 */
var SIGNER = null, SIGNER_NOTICE = null; /* S25: 활성 서명 어댑터 — createApp 기동 시 대입 (모듈 레벨 signConsent·doOrder가 참조) */

/* S24: 저장소 통계 — 참조/orphan 계량 (metrics·대시보드 공용 · S17 파일 스토리지 위생) */
function scanStorage(d) {
  var ref = {};
  (d.cases || []).forEach(function (c) { (c.scanSessions || []).forEach(function (s) { (s.files || []).forEach(function (f) { if (f.path) ref[f.path] = true; }); }); });
  var n = 0, bytes = 0, orph = 0, orphBytes = 0;
  try {
    fs.readdirSync(d.filesDir).forEach(function (fn) {
      var p = path.join(d.filesDir, fn);
      var sz = 0; try { sz = fs.statSync(p).size; } catch (e) {}
      n++; bytes += sz;
      if (!ref[p]) { orph++; orphBytes += sz; }
    });
  } catch (e) {}
  return { files: n, bytes: bytes, orphans: orph, orphansBytes: orphBytes };
}

var SSE_CLIENTS = [];
function broadcastSeq() {
  var line = 'data: ' + JSON.stringify({ seq: db.seq }) + '\n\n';
  SSE_CLIENTS.forEach(function (res) { try { if (!res.writableEnded) res.write(line); } catch (e) {} });
}
function snapshot() {
  var cs = db.cases;
  var orders = cs.filter(function (cc) { return !!cc.order; }).length;
  return { seq: db.seq, ts: now(), cases: cs.length, orders: orders, conversion: cs.length ? Math.round(100 * orders / cs.length) : 0, sessions: cs.reduce(function (s, cc) { return s + ((cc.scanSessions || []).length); }, 0) };
}

/* ---- 권한 필터 (서버 강제 — 클라이언트 마스킹은 UX, 서버 마스킹은 보안 계층) ---- */
var CLINICAL_RE = /(상담|동의|설명|리포트)/;
function filterForRole(c, role) {
  if (role === 'clinic') return c;
  if (role === 'lab') {
    var m = clone(c);
    var masked = [];
    if (m.plan && m.plan.aiNote) { delete m.plan.aiNote; masked.push('plan.aiNote(AI 임상 제안)'); }
    if (m.history && m.history.length) {
      var before = m.history.length;
      m.history = m.history.filter(function (h) { return !CLINICAL_RE.test(h.t); });
      if (m.history.length < before) masked.push('history 임상 기록 ' + (before - m.history.length) + '건(상담·동의)');
    }
    if (m.careLog) { delete m.careLog; masked.push('careLog(환자 상태 기록)'); } /* S31: 환자 소견 계열 — 기공 제공 제외 */
    m._masked = masked;
    m._maskNotice = '기공소 권한: 주문 케이스(제작 정보·파일)만 제공 — 환자 소견·상태 기록·상담 리포트는 서버에서 제외되었습니다.';
    return m;
  }
  if (role === 'patient') {
    return { id: c.id, patient: c.patient, tooth: c.tooth, proc: c.proc, status: c.status, due: c.due,
      careLog: (c.careLog || []).slice(-10) }; /* S31: 환자가 자기 기록(공유분) 확인 */
  }
  return null;
}

/* ---- 유틸 ---- */
function json(res, code, obj, req) {
  var body = JSON.stringify(obj);
  var hdrs = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  };
  /* S45 (TR-02): 대용량 JSON 압축 — 1KiB 초과 & 클라이언트가 gzip 지원 시 (pull·목록 트래픽 절감) */
  if (req && body.length > 1024 && /gzip/.test(String(req.headers['accept-encoding'] || ''))) {
    body = zlib.gzipSync(body);
    hdrs['Content-Encoding'] = 'gzip';
  }
  res.writeHead(code, hdrs);
  res.end(body);
}
function readBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [], size = 0;
    req.on('data', function (ch) {
      size += ch.length;
      if (size > 1e6) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(ch);
    });
    req.on('end', function () {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('bad-json')); }
    });
    req.on('error', reject);
  });
}
function readRaw(req, cap) {
  return new Promise(function (resolve, reject) {
    var chunks = [], size = 0;
    req.on('data', function (ch) {
      size += ch.length;
      if (size > cap) { reject(new Error('파일이 너무 큽니다 (최대 200MB)')); req.destroy(); return; }
      chunks.push(ch);
    });
    req.on('end', function () { resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}
var FILE_EXT = ['stl', 'obj', 'ply']; /* formats.js F.INFO 화이트리스트와 일치 (서버측 이중 검증) */
function safeName(raw) {
  return String(raw || '').split(/[\\/]/).pop().replace(/[^A-Za-z0-9._\-가-힣]/g, '_').slice(0, 80);
}
function nextCaseId() {
  var max = 2600;
  db.cases.forEach(function (c) {
    var m = /^C-(\d+)$/.exec(c.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'C-' + (max + 1);
}
function findCase(id) {
  return db.cases.filter(function (c) { return c.id === id; })[0] || null;
}

/* ---- 변이 규칙 (웹앱 casehub.js S5/S6 규칙과 동일) ---- */
function doCreate(role, b) {
  if (!b.patient || !String(b.patient).trim()) return { err: 400, msg: 'patient 필요' };
  if (!b.tooth || !/^[0-9A-Za-z가-힣\s\-\+]{1,12}$/.test(String(b.tooth))) return { err: 400, msg: 'tooth 필요 (예: 36)' };
  if (!b.proc || String(b.proc).length > 40) return { err: 400, msg: 'proc 필요 (40자 이하)' };
  var due = (b.due && String(b.due).length <= 12) ? String(b.due) : '2026-12-31';
  var c = {
    id: nextCaseId(), patient: String(b.patient).trim(), tooth: String(b.tooth).trim(),
    proc: String(b.proc).trim(), status: '상담', urgent: false, urgentNote: null,
    assignee: '김민수 원장', lab: 'OO기공소', due: due,
    scanDevice: '미지정 (데모)', scanDate: '-', cbct: { linked: false, note: '미연결 (데모)' },
    files: [],
    plan: { implant: '-', angle: '-', depth: '-', abutment: '-', connection: '-', scanbody: '-', crown: '-', material: '-', shade: '-', guide: { id: '-', kit: '-', state: '-' }, aiNote: 'AI 초기 제안 — 스캔·계획 정보 확보 후 생성 (데모)' },
    order: null,
    history: [{ d: DEMO_DATE, t: '케이스 생성 (목서버 · 데모)' }],
    modifyReq: null
  };
  db.cases.push(c);
  change(role, 'create', c, '케이스 생성 — ' + c.patient + ' ' + c.proc);
  audit(role, 'create', c.id, c.proc);
  return { c: c };
}
function doPatch(role, c, p) {
  if (!p || typeof p !== 'object') return { err: 400, msg: 'patch 필요' };
  var allowed = { status: 1, due: 1, urgent: 1, urgentNote: 1 };
  var keys = Object.keys(p);
  if (!keys.length) return { err: 400, msg: 'patch 항목 없음' };
  for (var i = 0; i < keys.length; i++) if (!allowed[keys[i]]) return { err: 400, msg: '허용되지 않는 필드: ' + keys[i] };
  if (p.status !== undefined && STEPS.indexOf(p.status) < 0) return { err: 400, msg: 'status는 8단계 중 하나: ' + STEPS.join('→') };
  if (p.urgent !== undefined && typeof p.urgent !== 'boolean') return { err: 400, msg: 'urgent는 boolean' };
  if (p.due !== undefined && String(p.due).length > 12) return { err: 400, msg: 'due 12자 이하' };
  keys.forEach(function (k) { c[k] = p[k]; });
  if (p.status !== undefined) c.history.unshift({ d: DEMO_DATE, t: '상태 변경 → ' + p.status + ' (서버 데모)' });
  else if (p.due !== undefined) c.history.unshift({ d: DEMO_DATE, t: '납기 변경 → ' + p.due + ' (서버 데모)' });
  else if (p.urgent !== undefined) c.history.unshift({ d: DEMO_DATE, t: p.urgent ? '긴급 표시 설정 (서버 데모)' : '긴급 해제 (서버 데모)' });
  change(role, 'patch', c, '케이스 수정 — ' + keys.join(','));
  audit(role, 'patch', c.id, keys.join(','));
  return { c: c };
}
/* S20: 주문 상태 해시 — 주문 본문 필드 바인딩 (이후 변경 감지 기준) */
function orderStateHash(c) {
  var o = c.order || {};
  return crypto.createHash('sha256').update([c.id, o.lab || '', o.due || '', o.shade || '', o.pontic || '', o.status || ''].join('|')).digest('hex');
}
function doOrder(role, c, o) {
  /* UI 흐름 일치 (D41 후속): '동의' 다음 단계가 주문서 작성 → 제출 시 제작 전환. '스캔' 등 이전 단계는 여전히 409 */
  if (!(c.status === '주문' || c.status === '동의')) return Promise.reject({ status: 409, msg: '주문 가능 단계가 아닙니다 (현재: ' + c.status + ')' });
  if (c.order && c.order.status === '완료') return Promise.reject({ status: 409, msg: '이미 완료된 주문' });
  o = o || {};
  c.order = {
    lab: (o.lab && String(o.lab).slice(0, 20)) || c.lab,
    submitted: DEMO_DATE,
    due: (o.due && String(o.due).length <= 12) ? String(o.due) : c.due,
    shade: (o.shade && String(o.shade).slice(0, 6)) || c.plan.shade,
    status: '제작 중'
  };
  if (o.pontic && String(o.pontic).trim()) c.order.pontic = String(o.pontic).trim().slice(0, 30); /* S19: 브리지 교두 위치 반영 (기존 표시 전용 갭 해소) */
  c.millingStage = '접수';
  /* S20: 호환성 검증 스냅샷 — 클라 compatCheck(S6)와 동일 규칙을 서버에서 재판정해 주문에 기록 (핵심 증거의 서버 강제 계층) */
  var SB = ['SB-001', 'SB-002'], SH = ['A1', 'A2', 'A3', 'B1', 'B2', 'C1'];
  var compat = [
    { ok: c.plan.connection === '내부 육각' || c.plan.connection === '모스테이퍼', label: '연결부 ' + c.plan.connection + ' — 자사 온리 시스템 호환' },
    { ok: SB.indexOf(c.plan.scanbody) >= 0, label: '스캔바디 ' + c.plan.scanbody + ' — 라이브러리 등록 제품' },
    { ok: SH.indexOf(c.order.shade) >= 0, label: '색조 ' + c.order.shade + ' — 표준 음영' },
    { ok: (c.files.length > 0) || ((c.scanSessions || []).some(function (x) { return (x.files || []).length > 0; })), label: '스캔 파일 ' + c.files.length + '개 — 업로드 검증 체계' }
  ];
  var okN = compat.filter(function (x) { return x.ok; }).length;
  c.order.compat = { items: compat, okCount: okN, verdict: okN === 4 ? '적합 (참고 자료 · 최종 판단은 기공사·치과의사)' : '정보 확인 필요 (' + okN + '/4)', checkedAt: now() };
  /* S20: 주문 문서 서명 — 해시(SHA-256) + HMAC. 제출 시점 문서를 고정해 기공 의뢰서 위변조를 방지 (전자서증 확장 계층) */
  c.order.docHash = crypto.createHash('sha256').update(orderStateHash(c) + '|' + role).digest('hex');
  var preState = orderStateHash(c);
  return SIGNER.sign(c.order.docHash, { sigMaterial: c.order.docHash, kind: 'order' }).then(function (sr) {
    c.order.sig = sr.sig;
    c.order.alg = sr.alg;
    c.order.keyId = sr.keyId;
    c.order.cStateHash = preState;
    c.order.signedAt = now();
    c.status = '제작';
    c.history.unshift({ d: DEMO_DATE, t: '기공 주문 제출 → ' + c.order.lab + ' · ' + sr.alg + ' 서명 (S25)' });
    change(role, 'order', c, '기공 주문 접수 — ' + c.id);
    audit(role, 'order', c.id, '제작 중 · ' + sr.alg);
    return { c: c };
  });
}
function doLabAction(role, c, act, reason, memo, stage) {
  if (act === 'start') {
    if (c.status !== '주문') return { err: 409, msg: '접수 가능 단계 아님 (현재: ' + c.status + ')' };
    c.status = '제작';
    c.millingStage = '설계';
    c.history.unshift({ d: DEMO_DATE, t: '기공소 접수 확인 · 제작 시작 (서버 데모)' });
  } else if (act === 'modify') {
    if (!(c.order && c.order.status === '제작 중' && c.status === '제작')) return { err: 409, msg: '제작 중인 주문이 아닙니다 (현재: ' + c.status + ')' };
    if (!reason || !String(reason).trim()) return { err: 400, msg: '수정 사유(reason) 필요' };
    reason = String(reason).slice(0, 30);
    memo = memo ? String(memo).slice(0, 120) : '';
    c.modifyReq = '기공소 수정 요청 — ' + reason + (memo ? ' · ' + memo : '') + ' (병원 확인 대기)';
    c.urgent = true;
    c.urgentNote = '기공소 수정 요청 — ' + reason;
    c.history.unshift({ d: DEMO_DATE, t: '기공소 수정 요청 전송: ' + reason + ' (서버 데모)' });
  } else if (act === 'done') {
    if (c.status !== '제작') return { err: 409, msg: '제작 중이 아닙니다 (현재: ' + c.status + ')' };
    if (c.order) c.order.status = '완료';
    c.millingStage = '완료';
    c.status = '장착';
    c.urgent = false;
    c.history.unshift({ d: DEMO_DATE, t: '기공 제작 완료 보고 — 병원 장착 준비 (서버 데모)' });
  } else if (act === 'milling') {
    var stages = ['접수', '설계', '밀링', '후가공', '완료'];
    if (c.status !== '제작') return { err: 409, msg: '제작 중이 아닙니다 (현재: ' + c.status + ')' };
    var cur = stages.indexOf(c.millingStage || '설계'); if (cur < 0) cur = 1;
    if (stages.indexOf(stage) !== cur + 1 || stage === '완료') return { err: 409, msg: '밀링 단계는 다음 단계로만 전진할 수 있습니다 (현재: ' + (c.millingStage || '설계') + ')' };
    c.millingStage = stage;
    c.history.unshift({ d: DEMO_DATE, t: '밀링 단계 변경 — ' + stage + ' (기공소 수동 입력 · 서버 데모)' });
  } else {
    return { err: 400, msg: 'action은 start|modify|done|milling' };
  }
  change(role, 'lab', c, '기공 액션 ' + act + ' — ' + c.id);
  audit(role, 'lab:' + act, c.id, act === 'milling' ? (stage || '') : (reason || ''));
  return { c: c };
}

function doAddSession(role, c, ss) {
  ss = ss || {};
  if (!ss.label || !String(ss.label).trim()) return { err: 400, msg: 'session.label 필요' };
  if (String(ss.label).length > 60) return { err: 400, msg: 'label은 60자 이하' };
  var list = c.scanSessions || (c.scanSessions = []);
  if (list.length >= 5) return { err: 409, msg: '세션은 케이스당 최대 5개' };
  var entry = {
    id: 'SS-' + c.id.slice(2) + '-' + (list.length + 1),
    label: String(ss.label).slice(0, 60),
    date: (ss.date && String(ss.date).length <= 12) ? String(ss.date) : DEMO_DATE,
    device: (ss.device && String(ss.device).slice(0, 40)) || '미지정 (데모)',
    fileCount: (typeof ss.fileCount === 'number' && ss.fileCount >= 0 && ss.fileCount <= 99) ? ss.fileCount : 0,
    state: '완료',
    note: (ss.note && String(ss.note).slice(0, 100)) || ''
  };
  list.push(entry);
  c.history.unshift({ d: DEMO_DATE, t: '스캔 세션 등록 — ' + entry.label + ' (서버 데모)' });
  change(role, 'session', c, '스캔 세션 등록 — ' + entry.id);
  audit(role, 'session', c.id, entry.label);
  return { c: c };
}

/* ---- S25 (ES-01): 서명 어댑터 계층 — D63 승격. 동의·주문 서명이 동일 인터페이스를 거친다 ----
   hmacSigner: 기본(데모) — 서버 키 HMAC-SHA256 (기존 S18/S20 바이트 호환)
   externalSigner: 공인 인증서 기반 외부 전자서명 게이트웨이 연동 (MM_SIGNER=external + MM_SIGNER_ENDPOINT)
     계약: POST {ep}/sign {docHash, kind} → {sig, alg, keyId} · POST {ep}/verify {docHash, sig} → {valid}
     무외부 의존 원칙 유지 — 서버 자체는 HTTP 클라이언트 호출만 하며 SDK를 갖지 않는다 */
function hmacSigner(secret) {
  var mac = function (mat) { return crypto.createHmac('sha256', secret).update(mat).digest('hex'); };
  return {
    id: 'hmac', alg: 'HMAC-SHA256', ep: null,
    sign: function (docHash, ctx) { return Promise.resolve({ sig: mac((ctx && ctx.sigMaterial) || docHash), alg: 'HMAC-SHA256', keyId: 'server-hmac' }); },
    verify: function (docHash, sig, ctx) { return Promise.resolve(sig === mac((ctx && ctx.sigMaterial) || docHash)); }
  };
}
function externalSigner(ep) {
  function call(p, body) {
    return new Promise(function (resolve, reject) {
      try {
        var u = new URL(ep.replace(/\/+$/, '') + p);
        var rq = http.request({ hostname: u.hostname, port: u.port || 80, path: u.pathname + (u.search || ''), method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 2500 }, function (rs) {
          var chunks = [];
          rs.on('data', function (ch) { chunks.push(ch); });
          rs.on('end', function () { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(new Error('외부 서명 서비스 응답 파싱 실패')); } });
        });
        rq.on('timeout', function () { rq.destroy(new Error('외부 서명 서비스 응답 지연 (2.5s)')); });
        rq.on('error', reject);
        rq.end(JSON.stringify(body));
      } catch (e) { reject(e); }
    });
  }
  return {
    id: 'external', alg: 'EXT', ep: ep,
    sign: function (docHash, ctx) {
      return call('/sign', { docHash: docHash, kind: (ctx && ctx.kind) || '' }).then(function (j) {
        if (!j || !j.sig) throw new Error('외부 서명 서비스 응답에 sig 없음');
        return { sig: String(j.sig).slice(0, 512), alg: String(j.alg || 'EXT').slice(0, 24), keyId: String(j.keyId || 'external').slice(0, 24) };
      });
    },
    verify: function (docHash, sig) {
      return call('/verify', { docHash: docHash, sig: sig }).then(function (j) { return !!j.valid; }).catch(function () { return null; }); /* null = 판정 보류 (서비스 미연결) */
    }
  };
}

/* ---- M3: 전자동의 서명 — 문서 해시(SHA-256) + 서명 어댑터 (S25) ---- */
function consentStateHash(c) {
  return crypto.createHash('sha256').update([c.id, c.patient, c.status].join('|')).digest('hex');
}
function signConsent(role, c, b) {
  var name = String((b && b.signerName) || '').trim();
  if (!name || name.length > 20) return Promise.reject({ status: 400, msg: 'signerName 필요 (20자 이하)' });
  c.consents = c.consents || [];
  if (c.consents.length >= 20) return Promise.reject({ status: 409, msg: '동의서는 케이스당 최대 20건' });
  var purpose = (b && b.purpose && String(b.purpose).slice(0, 60)) || '임플란트 치료 계획 동의 (데모)';
  var docHash = crypto.createHash('sha256').update([c.id, c.patient, c.status, role, name, purpose].join('|')).digest('hex');
  var maxCS = 0;
  db.cases.forEach(function (x) { (x.consents || []).forEach(function (y) { var m = /^CS-(\d+)$/.exec(y.id); if (m) maxCS = Math.max(maxCS, parseInt(m[1], 10)); }); });
  return SIGNER.sign(docHash, { sigMaterial: docHash + '|' + name, kind: 'consent' }).then(function (sr) {
    var rec = { id: 'CS-' + (maxCS + 1), caseId: c.id, signerRole: role, signerName: name, purpose: purpose, docHash: docHash, sig: sr.sig, alg: sr.alg, keyId: sr.keyId, cStateHash: consentStateHash(c), ts: now() };
    c.consents.push(rec);
    c.history.unshift({ d: DEMO_DATE, t: '전자동의 서명 — ' + name + ' · SHA-256/' + sr.alg + ' 기록' });
    change(role, 'consent', c, '전자동의 서명 — ' + name);
    audit(role, 'consent:sign', c.id, name);
    return { c: c, consent: rec };
  });
}
/* M3: 리포트 수집 — keep=true면 lastReport에 저장하지 않고 현재값만 */
function captureReport(keep) {
  var cs = db.cases;
  var rep = {
    ts: now(), seq: db.seq,
    funnel: { cases: cs.length, orders: cs.filter(function (x) { return !!x.order; }).length, sessions: cs.reduce(function (s, x) { return s + ((x.scanSessions || []).length); }, 0) },
    activity: { changes: db.changes.length, audit: db.audit.length, uploads: db.activity.filter(function (a) { return a.kind === 'upload'; }).length, downloads: db.activity.filter(function (a) { return a.kind === 'download'; }).length, exports: db.activity.filter(function (a) { return a.kind === 'export'; }).length },
    consents: cs.reduce(function (s, x) { return s + ((x.consents || []).length); }, 0)
  };
  if (!keep) {
    db.lastReport = rep;
    if (db.store) db.store.setMeta('lastReport', JSON.stringify(rep));
  }
  return rep;
}

/* ---- S19: 파일 GC — 케이스 세션에서 참조하지 않는 스캔 파일 정리 (orphan 제거) ---- */
function gcSweep() {
  var ref = {};
  db.cases.forEach(function (c) {
    (c.scanSessions || []).forEach(function (ss) {
      (ss.files || []).forEach(function (f) { if (f.path) ref[f.path] = true; });
    });
  });
  var scanned = 0, removed = 0, freed = 0; /* S24: freed 바이트 계량 추가 */
  try {
    fs.readdirSync(db.filesDir).forEach(function (fn) {
      var p = path.join(db.filesDir, fn);
      var sz = 0; try { sz = fs.statSync(p).size; } catch (e) {}
      scanned++;
      if (!ref[p]) { try { fs.unlinkSync(p); removed++; freed += sz; } catch (e) {} }
    });
  } catch (e) { /* 저장소 없음 — 제거할 것도 없음 */ }
  return { scanned: scanned, removed: removed, kept: scanned - removed, freed: freed, ts: now() };
}

/* ---- 정적 서빙 ---- */
var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
function serveStatic(res, rel, req) {
  var p = path.normalize(path.join(ROOT, rel));
  if (p.indexOf(ROOT) !== 0) return json(res, 403, { error: '금지된 경로', demo: true });
  fs.stat(p, function (e, st) {
    if (e || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 not found'); return; }
    var etag = '"' + st.size + '-' + Math.round(st.mtimeMs) + '"'; /* S45 (TR-01): 재검증 ETag — 불변 파일 재열람 시 304 (재다운로드 제거) */
    if (req && req.headers['if-none-match'] === etag) { res.writeHead(304, { 'ETag': etag, 'Cache-Control': 'no-cache' }); return res.end(); }
    fs.readFile(p, function (e2, buf) {
      if (e2) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 not found'); return; }
      var hdrs = { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'ETag': etag };
      if (req && buf.length > 1024 && /gzip/.test(String(req.headers['accept-encoding'] || ''))) { buf = zlib.gzipSync(buf); hdrs['Content-Encoding'] = 'gzip'; } /* S45: 대용량 정적 압축 */
      res.writeHead(200, hdrs);
      res.end(buf);
    });
  });
}

/* ---- 앱 팩토리 (테스트에서 포트 0으로 기동) ---- */
function createApp(opts) {
  opts = opts || {};
  /* M1: 옵트인 계층 — auth/persist 지정 시 격리 상태. 기본(데모)은 항상 새 시드로 시작
     (프로세스당 단일 라이브 서버 전제 — 기존 테스트 하니스와 동일한 운용 패턴) */
  db = (opts.auth || opts.persist) ? makeState(opts) : freshData();
  /* S25: 활성 서명 어댑터 선택 — 기본 HMAC · external 지정 시 엔드포인트 필수(미설정 시 폴백+공지) */
  (function () {
    var smode = (opts && opts.signer) || process.env.MM_SIGNER || 'hmac';
    if (smode === 'external') {
      var sep = (opts && opts.signerEndpoint) || process.env.MM_SIGNER_ENDPOINT;
      if (sep) { SIGNER = externalSigner(sep); return; }
      SIGNER = hmacSigner(db.sigSecret);
      SIGNER_NOTICE = '외부 서명 어댑터 엔드포인트 미설정 — HMAC 폴백 (MM_SIGNER_ENDPOINT 필요)';
      return;
    }
    SIGNER = hmacSigner(db.sigSecret);
  })();
  var repTimer = setInterval(function () { try { captureReport(); gcSweep(); } catch (e) {} }, 6 * 3600 * 1000); /* M3: 6시간 자동 수집 + S19 GC */
  if (repTimer.unref) repTimer.unref();
  return http.createServer(function (req, res) {
    /* S29: 보안 기본 헤더 — 모든 응답 (프레임 임베드는 Caddy 레벨 정책 — 런북 v1.2) */
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    var u = (req.url || '/').split('?');
    var pathname = '/';
    try { pathname = decodeURIComponent(u[0]); } catch (e) { return json(res, 400, { error: 'bad url', demo: true }); }
    var q = {};
    (u[1] || '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      q[kv.slice(0, i < 0 ? kv.length : i)] = i < 0 ? '' : kv.slice(i + 1);
    });

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      return res.end();
    }

    /* ---------- API ---------- */
    if (pathname.indexOf('/api/') === 0 || pathname === '/api') {
      var m = req.method;

      /* M1: 인증 게이트(옵트인) — health·auth 제외 전면 401. 이후 모든 role은 세션이 결정 (D51) */
      var sess = null;
      if (db.auth && pathname !== '/api/health' && pathname.indexOf('/api/auth/') !== 0 &&
          !(m === 'GET' && /^\/api\/mirror\/[0-9a-f]{6}\/frame$/.test(pathname))) { /* S39 FX-01: 뷰어 폴링은 링크 소유 모델(D118) — id가 보기 권한(POST 전송은 계속 clinic 세션 필요) */
        sess = getSession(req);
        if (!sess) return json(res, 401, { error: '인증 필요 — 초대코드로 로그인하세요 (POST /api/auth/login)', code: 'error.auth.session_expired', authRequired: true });
        /* S37 (GT-01): 활동 세션 터치 — 월간 활성율 계측 기준 (60초 스로틀 · 로그인 이후 실사용 반영) */
        var stouch = db.sessions[sess.token];
        if (stouch && Date.now() - new Date(stouch.lastSeen || stouch.ts).getTime() > 60000) {
          stouch.lastSeen = now();
          if (db.store) db.store.saveSession(sess.token, stouch);
        }
      }

      /* S32 (PE-01): 개인화 설정 — 인증 모드에서 계정 동기화 (데모는 클라 localStorage만) */
      if (pathname === '/api/me/prefs' && m === 'GET') {
        if (!db.auth) return json(res, 400, { error: '인증 모드가 아닙니다 — 설정은 이 기기에만 저장됩니다', demo: true });
        if (!sess) return json(res, 401, { error: '인증 필요', code: 'error.auth.session_expired', demo: true });
        var pu = db.users.filter(function (x) { return x.role === sess.role && x.name === sess.name; })[0];
        return json(res, 200, { prefs: (pu && pu.prefs) || {} });
      }
      if (pathname === '/api/me/prefs' && m === 'POST') {
        return readBody(req).then(function (b) {
          if (!db.auth) return json(res, 400, { error: '인증 모드가 아닙니다 — 설정은 이 기기에만 저장됩니다', demo: true });
          if (!sess) return json(res, 401, { error: '인증 필요', code: 'error.auth.session_expired', demo: true });
          var pj = JSON.stringify(b.prefs || {});
          if (pj.length > 400) return json(res, 400, { error: '설정 데이터가 너무 큽니다', demo: true });
          var pu2 = db.users.filter(function (x) { return x.role === sess.role && x.name === sess.name; })[0];
          if (!pu2) return json(res, 404, { error: '사용자 없음', demo: true });
          /* S46 (SV-02): 서버 정규화 — 클라 제한만 신뢰하지 않음(D141). zoom·theme 화이트리스트·nick 12자 절단 */
          var pIn = b.prefs || {};
          var pFx = { zoom: ['s', 'm', 'l'].indexOf(pIn.zoom) >= 0 ? pIn.zoom : 'm',
                      theme: ['', 'blue', 'rose'].indexOf(pIn.theme) >= 0 ? pIn.theme : '',
                      nick: String(pIn.nick || '').slice(0, 12) };
          pu2.prefs = pFx;
          if (db.store) db.store.sync(db);
          return json(res, 200, { ok: true, prefs: pFx, demo: true });
        }).catch(function (e) { return json(res, 400, { error: e.message, demo: true }); });
      }

      if (pathname === '/api/health' && m === 'GET') {
        return json(res, 200, { ok: true, service: 'mirimiso-mock', version: 'S114', seq: db.seq, cases: db.cases.length, demo: true, authRequired: !!db.auth, sse: true, files: true, notice: db.auth ? '실서비스 모드 미리보기(M1) — 초대코드 인증 활성. 케이스 데이터는 여전히 가상입니다.' : NOTICE,
          signer: { mode: SIGNER.id, alg: SIGNER.id === 'external' ? '외부 전자서명 어댑터' : SIGNER.alg, fallback: !!SIGNER_NOTICE, notice: SIGNER_NOTICE } });
      }

      if (pathname === '/api/cases' && m === 'GET') {
        var role = db.auth ? sess.role : (q.role || 'clinic');
        var list = db.cases.map(function (c) { return filterForRole(c, role); });
        if (list.indexOf(null) >= 0) return json(res, 400, { error: 'role은 clinic|lab|patient', demo: true });
        if (db.auth && role === 'patient') list = list.filter(function (x) { return x.id === sess.caseId; });
        return json(res, 200, { seq: db.seq, role: role, demo: true, notice: NOTICE, cases: list }, req); /* S45: pull 응답 압축 */
      }

      if (pathname === '/api/cases' && m === 'POST') {
        return readBody(req).then(function (b) {
          if (db.auth) b.role = sess.role;
          if (!b.role) return json(res, 400, { error: 'role 필요', demo: true });
          if (b.role !== 'clinic') return json(res, 403, { error: '케이스 생성은 clinic 권한만', demo: true });
          var r = doCreate(b.role, b);
          if (r.err) return json(res, r.err, { error: r.msg, demo: true });
          return json(res, 200, { ok: true, seq: db.seq, demo: true, notice: NOTICE, case: clone(r.c), cases: db.cases.map(function (x) { return filterForRole(x, b.role); }) });
        }).catch(function (e) { return json(res, 400, { error: e.message, demo: true }); });
      }

      var mc = /^\/api\/cases\/([^\/]+)(\/(order|lab-actions|sessions|consent|care-log))?$/.exec(pathname);
      if (mc) {
        var c = findCase(mc[1]);
        var sub = mc[3];

        if (!sub && m === 'GET') {
          if (!c) return json(res, 404, { error: '케이스 없음: ' + mc[1], demo: true });
          var r2 = db.auth ? sess.role : (q.role || 'clinic');
          if (db.auth && r2 === 'patient' && mc[1] !== sess.caseId) return json(res, 403, { error: '환자는 자기 케이스만 열람할 수 있습니다', demo: true });
          var view = filterForRole(c, r2);
          if (!view) return json(res, 400, { error: 'role은 clinic|lab|patient', demo: true });
          if (r2 === 'lab') audit('lab', 'read', c.id, '기공소 케이스 열람 (감사로그)'); /* 열람 기록 */
          return json(res, 200, { seq: db.seq, role: r2, demo: true, notice: NOTICE, case: view });
        }

        if (m === 'PATCH' && !sub) {
          return readBody(req).then(function (b) {
            if (!c) return json(res, 404, { error: '케이스 없음: ' + mc[1], demo: true });
              if (db.auth) b.role = sess.role;
            if (!b.role) return json(res, 400, { error: 'role 필요', demo: true });
            if (b.role !== 'clinic') return json(res, 403, { error: '케이스 수정은 clinic 권한만', demo: true });
            var r3 = doPatch(b.role, c, b.patch);
            if (r3.err) return json(res, r3.err, { error: r3.msg, demo: true });
            return json(res, 200, { ok: true, seq: db.seq, demo: true, notice: NOTICE, case: clone(r3.c), cases: db.cases.map(function (x) { return filterForRole(x, b.role); }) });
          }).catch(function (e) { return json(res, 400, { error: e.message, demo: true }); });
        }

        if (m === 'POST' && sub === 'order') {
          return readBody(req).then(function (b) {
            if (!c) return json(res, 404, { error: '케이스 없음: ' + mc[1], demo: true });
              if (db.auth) b.role = sess.role;
            if (!b.role) return json(res, 400, { error: 'role 필요', demo: true });
            if (b.role !== 'clinic') return json(res, 403, { error: '주문 제출은 clinic 권한만', demo: true });
            return doOrder(b.role, c, b.order).then(function (r4) {
              return json(res, 200, { ok: true, seq: db.seq, demo: true, notice: NOTICE, case: clone(r4.c), cases: db.cases.map(function (x) { return filterForRole(x, b.role); }) });
            }).catch(function (oe) {
              if (oe && oe.status) return json(res, oe.status, { error: oe.msg, demo: true });
              return json(res, 502, { error: '주문 서명 실패: ' + (oe && oe.message || oe), demo: true });
            });
          }).catch(function (e) { return json(res, 400, { error: e.message, demo: true }); });
        }

        if (m === 'POST' && sub === 'sessions') {
          return readBody(req).then(function (b) {
            if (!c) return json(res, 404, { error: '케이스 없음: ' + mc[1], demo: true });
              if (db.auth) b.role = sess.role;
            if (!b.role) return json(res, 400, { error: 'role 필요', demo: true });
            if (b.role !== 'clinic') return json(res, 403, { error: '스캔 세션 등록은 clinic 권한만', demo: true });
            var r6 = doAddSession(b.role, c, b.session);
            if (r6.err) return json(res, r6.err, { error: r6.msg, demo: true });
            return json(res, 200, { ok: true, seq: db.seq, demo: true, notice: NOTICE, case: clone(r6.c), cases: db.cases.map(function (x) { return filterForRole(x, b.role); }) });
          }).catch(function (e) { return json(res, 400, { error: e.message, demo: true }); });
        }

        if (m === 'POST' && sub === 'consent') {
          return readBody(req).then(function (b) {
            if (!c) return json(res, 404, { error: '케이스 없음: ' + mc[1], demo: true });
            if (db.auth) b.role = sess.role;
            return signConsent(b.role || 'clinic', c, b).then(function (cr) {
              return json(res, 200, { ok: true, seq: db.seq, demo: true, consent: cr.consent, case: clone(cr.c), cases: db.cases.map(function (x) { return filterForRole(x, b.role); }) });
            }).catch(function (ce) {
              if (ce && ce.status) return json(res, ce.status, { error: ce.msg, demo: true });
              return json(res, 502, { error: '서명 실패: ' + (ce && ce.message || ce), demo: true });
            });
          }).catch(function (e) { return json(res, 400, { error: e.message, demo: true }); });
        }

        /* S31: 환자 상태 기록 공유 — 환자 본인 케이스 전용 (auth: 세션 caseId 일치 / 데모: q.role=patient) */
        if (m === 'POST' && sub === 'care-log') {
          return readBody(req).then(function (b) {
            if (!c) return json(res, 404, { error: '케이스 없음: ' + mc[1], demo: true });
            var prole = db.auth ? (sess && sess.role) : b.role;
            if (prole !== 'patient') return json(res, 403, { error: '상태 기록 공유는 환자 계정 전용입니다', demo: true });
            if (db.auth && sess.caseId !== c.id) return json(res, 403, { error: '본인 케이스에만 기록을 공유할 수 있습니다', demo: true });
            c.careLog = c.careLog || [];
            if (c.careLog.length >= 20) return json(res, 409, { error: '기록은 케이스당 최대 20건', demo: true });
            var cats = ['통증', '붓기', '출혈'];
            var e = { d: /^\d{4}-\d{2}-\d{2}$/.test(b.d || '') ? b.d : now().slice(0, 10), ts: now() };
            for (var ci = 0; ci < cats.length; ci++) {
              var vv = String(b[cats[ci]] || '').trim();
              if (!vv || vv.length > 12) return json(res, 400, { error: cats[ci] + ' 값 필요 (12자 이하)', demo: true });
              e[cats[ci]] = vv;
            }
            if (b.photo) e.photo = String(b.photo).slice(0, 80);
            c.careLog.forEach(function (x) { if (!x.id) x.id = 'L' + crypto.randomBytes(3).toString('hex'); }); /* S33: 기존 항목에도 정정용 id 부여 */
            e.id = 'L' + crypto.randomBytes(3).toString('hex');
            c.careLog.push(e);
            c.history.unshift({ d: e.d, t: '환자 상태 기록 공유 — 통증 ' + e['통증'] + ' · 붓기 ' + e['붓기'] + ' · 출혈 ' + e['출혈'] + ' (S31)' });
            change('patient', 'care', c, '환자 상태 기록 공유 — ' + c.id);
            audit('patient', 'care-log', c.id, '통증 ' + e['통증'] + ' · 출혈 ' + e['출혈']);
            return json(res, 200, { ok: true, seq: db.seq, demo: true, entry: e, count: c.careLog.length });
          }).catch(function (e2) { return json(res, 400, { error: e2.message, demo: true }); });
        }

        /* ---- S33 (RE-01/02): 상태 기록 정정 — 수정·삭제 (환자 전용·감사 후행) ---- */
        if ((m === 'PATCH' || m === 'DELETE') && sub === 'care-log') {
          return readBody(req).then(function (b) {
            if (!c) return json(res, 404, { error: '케이스 없음: ' + mc[1], demo: true });
            var prole = db.auth ? (sess && sess.role) : b.role;
            if (prole !== 'patient') return json(res, 403, { error: '기록 정정은 환자 계정 전용입니다', demo: true });
            if (db.auth && sess.caseId !== c.id) return json(res, 403, { error: '본인 케이스의 기록만 정정할 수 있습니다', demo: true });
            c.careLog = c.careLog || [];
            c.careLog.forEach(function (x) { if (!x.id) x.id = 'L' + crypto.randomBytes(3).toString('hex'); });
            var ix = -1;
            c.careLog.forEach(function (x, i2) { if (x.id === b.logId) ix = i2; });
            if (ix < 0) return json(res, 404, { error: '기록 없음 — 이미 삭제되었거나 공유 이력이 없습니다', demo: true });
            if (m === 'DELETE') {
              var old2 = c.careLog.splice(ix, 1)[0];
              c.history.unshift({ d: DEMO_DATE, t: '환자 상태 기록 삭제 — ' + old2.d + ' 기록 정정 (S33 · 감사로그 추적)' });
              change('patient', 'care', c, '환자 상태 기록 삭제 — ' + c.id);
              audit('patient', 'care-log:del', c.id, old2.d + ' 통증 ' + old2['통증'] + ' · 출혈 ' + old2['출혈']);
              return json(res, 200, { ok: true, seq: db.seq, demo: true, count: c.careLog.length });
            }
            var cats = ['통증', '붓기', '출혈'];
            var e3 = c.careLog[ix];
            var prev2 = e3['통증'] + '/' + e3['붓기'] + '/' + e3['출혈'];
            for (var ci = 0; ci < cats.length; ci++) {
              var vv = String(b[cats[ci]] || '').trim();
              if (!vv || vv.length > 12) return json(res, 400, { error: cats[ci] + ' 값 필요 (12자 이하)', demo: true });
              e3[cats[ci]] = vv;
            }
            if (b.photo !== undefined) { if (b.photo) e3.photo = String(b.photo).slice(0, 80); else delete e3.photo; }
            e3.edited = now();
            c.history.unshift({ d: e3.d, t: '환자 상태 기록 수정 — ' + prev2 + ' → ' + e3['통증'] + '/' + e3['붓기'] + '/' + e3['출혈'] + ' (S33 정정)' });
            change('patient', 'care', c, '환자 상태 기록 수정 — ' + c.id);
            audit('patient', 'care-log:edit', c.id, '수정 전 [' + prev2 + '] → 통증 ' + e3['통증'] + ' · 출혈 ' + e3['출혈']);
            return json(res, 200, { ok: true, seq: db.seq, demo: true, entry: e3 });
          }).catch(function (e4) { return json(res, 400, { error: e4.message, demo: true }); });
        }

        if (m === 'POST' && sub === 'lab-actions') {
          return readBody(req).then(function (b) {
            if (!c) return json(res, 404, { error: '케이스 없음: ' + mc[1], demo: true });
              if (db.auth) b.role = sess.role;
            if (!b.role) return json(res, 400, { error: 'role 필요', demo: true });
            if (b.role !== 'lab') return json(res, 403, { error: '기공 액션은 lab 권한만', demo: true });
            var r5 = doLabAction(b.role, c, b.action, b.reason, b.memo, b.stage);
            if (r5.err) return json(res, r5.err, { error: r5.msg, demo: true });
            return json(res, 200, { ok: true, seq: db.seq, demo: true, notice: NOTICE, case: clone(r5.c), cases: db.cases.map(function (x) { return filterForRole(x, b.role); }) });
          }).catch(function (e) { return json(res, 400, { error: e.message, demo: true }); });
        }
      }

      /* ---- M3: 동의서 서명 검증 — 서명 무결성 + 서명 이후 케이스 변경 감지 ---- */
      if (pathname === '/api/consent/verify' && m === 'POST') {
        return readBody(req).then(function (b) {
          var cv = findCase(String(b.caseId || ''));
          var rec = cv ? (cv.consents || []).filter(function (x) { return x.id === b.cid; })[0] : null;
          if (!cv || !rec) return json(res, 404, { error: '동의서 없음: ' + (b.cid || ''), demo: true });
          var changed = consentStateHash(cv) !== rec.cStateHash;
          var cAlg = rec.alg || 'HMAC-SHA256'; /* S25: 구기록(alg 무기록)은 HMAC로 검증 — 영속 데이터 하위 호환 */
          var cMat = cAlg === 'HMAC-SHA256' ? { sigMaterial: rec.docHash + '|' + rec.signerName } : {};
          Promise.resolve(SIGNER.verify(rec.docHash, rec.sig, cMat)).then(function (cval) {
            if (cval === null) return json(res, 200, { ok: true, demo: true, valid: false, unverified: true, alg: cAlg, caseChanged: changed, caseId: cv.id, cid: rec.id, notice: '외부 검증 서비스 미연결 — 판정 보류' });
            return json(res, 200, { ok: true, demo: true, valid: cval, alg: cAlg, caseChanged: changed, caseId: cv.id, cid: rec.id });
          });
        }).catch(function (e) { return json(res, 400, { error: e.message, demo: true }); });
      }

      /* ---- S20: 주문 서명 검증 — 무결성 + 제출 이후 주문 변경 감지 ---- */
      if (pathname === '/api/order/verify' && m === 'POST') {
        return readBody(req).then(function (b) {
          var ov = findCase(String(b.caseId || ''));
          var od = ov ? ov.order : null;
          if (!ov || !od) return json(res, 404, { error: '주문 없음: ' + (b.caseId || ''), demo: true });
          if (!od.sig) return json(res, 200, { ok: true, demo: true, signed: false, caseId: ov.id, notice: '시드 주문 — 서명 기록 전 (데모)' });
          var oAlg = od.alg || 'HMAC-SHA256'; /* S25: 구기록 하위 호환 */
          var oMat = oAlg === 'HMAC-SHA256' ? { sigMaterial: od.docHash } : {};
          var oChanged = orderStateHash(ov) !== od.cStateHash;
          Promise.resolve(SIGNER.verify(od.docHash, od.sig, oMat)).then(function (oval) {
            if (oval === null) return json(res, 200, { ok: true, demo: true, signed: true, valid: false, unverified: true, alg: oAlg, orderChanged: oChanged, caseId: ov.id, docHash: od.docHash, notice: '외부 검증 서비스 미연결 — 판정 보류' });
            return json(res, 200, { ok: true, demo: true, signed: true, valid: oval, alg: oAlg, orderChanged: oChanged, caseId: ov.id, docHash: od.docHash });
          });
        }).catch(function (e) { return json(res, 400, { error: e.message, demo: true }); });
      }

      /* ---- M3: 운영 지표 리포트 — 자동 수집(6h) + on-demand ---- */
      if (pathname === '/api/report' && m === 'GET') {
        return json(res, 200, { demo: true, generatedAt: now(), current: captureReport(true), last: db.lastReport });
      }
      if (pathname === '/api/report/capture' && m === 'POST') {
        return json(res, 200, { ok: true, demo: true, report: captureReport() });
      }

      /* S19: 파일 GC — on-demand (S24: 데모 모드도 role 게이트 + 감사로그 — 보호된 유지보수 행동으로 승격) */
      if (pathname === '/api/maintenance/gc' && m === 'POST') {
        var gro = db.auth ? (sess && sess.role) : q.role;
        if (gro !== 'clinic') return json(res, 403, { error: '유지보수 작업은 clinic 권한만', demo: true });
        var gres = gcSweep();
        if (gres.removed) audit('clinic', 'maintenance:gc', '-', gres.removed + '개 미참조 파일 정리 (' + gres.freed + 'B)');
        return json(res, 200, { ok: true, demo: true, gc: gres });
      }

      /* S21: 온라인 백업 — 영속 모드 전용, 최근 7개 보존 (배포 런북 · ADR-006) */
      if (pathname === '/api/maintenance/backup' && m === 'POST') {
        if (db.auth && sess && sess.role !== 'clinic') return json(res, 403, { error: '백업은 clinic 권한만', demo: true });
        if (!db.store || !db.dbFile) return json(res, 400, { error: '백업은 영속 모드(MM_DB 지정)에서만 가능합니다 — 데모 모드는 메모리 DB입니다', demo: true });
        var bdir = path.join(path.dirname(db.dbFile), 'backups');
        fs.mkdirSync(bdir, { recursive: true });
        var bname = 'backup-' + Date.now() + '.db'; /* ms 타임스탬프 — 연속 백업 동명 충돌 방지 (S21) */
        var bpath = path.join(bdir, bname);
        return db.store.backup(bpath).then(function () {
          var files = fs.readdirSync(bdir).filter(function (f) { return /^backup-.*\.db$/.test(f); }).sort();
          while (files.length > 7) { try { fs.unlinkSync(path.join(bdir, files.shift())); } catch (e) { break; } } /* 보존 정책: 최근 7개 */
          return json(res, 200, { ok: true, demo: true, file: bname, size: fs.statSync(bpath).size, kept: Math.min(files.length, 7) });
        }).catch(function (e) { return json(res, 500, { error: e.message, demo: true }); });
      }

      /* S36 (EX-01): 파일럿 종료 데이터 내보내기 — 계약서 초안 제2조2항("내보내기를 지원")의 기능 이행 */
      if (pathname === '/api/maintenance/export' && m === 'GET') {
        var ero = db.auth ? (sess && sess.role) : q.role;
        if (ero !== 'clinic') return json(res, 403, { error: '데이터 내보내기는 clinic 권한만 (계약 종료 시 병원 요청)', demo: true });
        var efiles = [];
        db.cases.forEach(function (cx) {
          (cx.scanSessions || []).forEach(function (sx) {
            (sx.files || []).forEach(function (fx) { efiles.push({ caseId: cx.id, sessionId: sx.id, name: fx.name, size: fx.size, sha256: fx.sha256 }); });
          });
        });
        audit('clinic', 'data-export', '-', '케이스 ' + db.cases.length + '건 · 파일 ' + efiles.length + '건 내보내기');
        db.activity.push({ ts: now(), role: 'clinic', kind: 'export' });
        if (db.activity.length > 500) db.activity.splice(0, db.activity.length - 500);
        var ebody = JSON.stringify({
          meta: { ts: now(), version: 'S36', notice: '파일럿 종료 데이터 내보내기 — 계약서 제2조2항. 스캔 원본(STL 등)은 아래 sha256 목록으로 개별 다운로드 파일 검증 가능.', counts: { cases: db.cases.length, files: efiles.length, history: db.cases.reduce(function (s2, c2) { return s2 + (c2.history || []).length; }, 0), careLog: db.cases.reduce(function (s2, c2) { return s2 + (c2.careLog || []).length; }, 0) } },
          cases: db.cases,
          files: efiles,
          audit: db.audit.slice(-200)
        }, null, 1);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="mirimiso-export-' + now().slice(0, 10).replace(/-/g, '') + '.json"', 'Access-Control-Expose-Headers': 'Content-Disposition' });
        return res.end(ebody);
      }

      /* S38 (DL-01): 데이터 삭제 청구 이행 — 계약서 제4조 제3항("원본·백업 포함 완전 삭제 후 결과 통지") */
      if (pathname === '/api/maintenance/purge' && m === 'POST') {
        return readBody(req).then(function (b) {
          var pro = db.auth ? (sess && sess.role) : q.role;
          if (!db.auth) return json(res, 400, { error: '삭제 청구 이행은 인증 모드(계정)에서만 제공됩니다 — 데모 모드는 데이터가 저장되지 않습니다', demo: true });
          if (pro !== 'clinic') return json(res, 403, { error: '삭제 실행은 clinic 권한만 (계약상 청구 후 실행)', demo: true });
          if (String(b.confirm || '').trim() !== '삭제') return json(res, 400, { error: '확인 문구가 일치하지 않습니다 — 모달에서 "삭제"를 입력하세요', demo: true });
          var fls = 0;
          db.cases.forEach(function (cx) { (cx.scanSessions || []).forEach(function (sx) { (sx.files || []).forEach(function () { fls++; }); }); });
          var blist = [];
          try { if (db.dbFile) blist = fs.readdirSync(path.join(path.dirname(db.dbFile), 'backups')).filter(function (f) { return /^backup-.*\.db$/.test(f); }); } catch (e5) {}
          var proof = { ts: now(), gate: '계약 제4조 제3항', purged: { cases: db.cases.length, scanFiles: fls, histories: db.cases.reduce(function (s2, c2) { return s2 + (c2.history || []).length; }, 0), careLog: db.cases.reduce(function (s2, c2) { return s2 + (c2.careLog || []).length; }, 0), sessions: Object.keys(db.sessions).length, activity: db.activity.length, mirrors: Object.keys(db.mirrors || {}).length, backups: blist.length },
            fileHashes: [] };
          db.cases.forEach(function (cx) { (cx.scanSessions || []).forEach(function (sx) { (sx.files || []).forEach(function (fx) { proof.fileHashes.push({ caseId: cx.id, name: fx.name, sha256: fx.sha256 }); }); }); });
          /* 완전 삭제 — 케이스·기록·활동·지표·세션·스캔 원본. 감사로그와 계정은 유지(증명·접근) */
          db.cases = []; db.changes = []; db.activity = []; db.metrics = []; db.sessions = {}; db.seq = 0; db.lastReport = null; db.mirrors = {}; /* S39 FX-02: 화면 프레임도 데이터 — 완전 삭제 */
          try { if (db.filesDir) { fs.rmSync(db.filesDir, { recursive: true, force: true }); fs.mkdirSync(db.filesDir, { recursive: true }); } } catch (e0) {}
          try { if (db.dbFile) blist.forEach(function (bf) { try { fs.unlinkSync(path.join(path.dirname(db.dbFile), 'backups', bf)); } catch (e6) {} }); } catch (e7) {} /* S39 FX-02: "원본·백업 포함 완전 삭제" (제4조3항) */
          audit('clinic', 'data-purge', '-', '삭제 완료 — 케이스 ' + proof.purged.cases + ' · 파일 ' + fls + ' · 세션 전체 · 백업 ' + blist.length + '개 (계약 제4조3항 · 결과 통지용 해시 목록 응답)');
          if (db.store) db.store.sync(db);
          return json(res, 200, { ok: true, demo: true, proof: proof, notice: '삭제 완료 — 결과 통지: 위 proof(건수·파일 해시)를 병원에 전달하세요. 본문 데이터는 보존하지 않습니다(완전 삭제 원칙).' });
        }).catch(function (e) { return json(res, 400, { error: e.message, demo: true }); });
      }

      /* ---- M1: 초대코드 인증 (ADR-002) ---- */
      /* S23: 계정 발급 — 실장(clinic)이 환자·기공소·의료진 계정을 초대코드로 발급 (ADR-002 운영 완성) */
      if (pathname === '/api/auth/invite' && m === 'POST') {
        return readBody(req).then(function (b) {
          var inv = sess || getSession(req);
          if (!db.auth) return json(res, 400, { error: '인증 모드가 아닙니다 (MM_AUTH=1)' });
          if (!inv || inv.role !== 'clinic') return json(res, 403, { error: '계정 발급은 clinic 권한만' });
          var rl = ['clinic', 'lab', 'patient'];
          if (rl.indexOf(b.role) < 0) return json(res, 400, { error: 'role은 clinic|lab|patient' });
          var nm = String(b.name || '').trim();
          if (!nm || nm.length > 20) return json(res, 400, { error: 'name 필요 (20자 이하)' });
          if (db.users.length >= 100) return json(res, 409, { error: '계정은 최대 100개' });
          var cid = null;
          if (b.role === 'patient') {
            cid = String(b.caseId || '');
            if (!findCase(cid)) return json(res, 400, { error: '환자 계정은 유효한 caseId가 필요합니다' });
          }
          var code = 'MM-' + crypto.randomBytes(4).toString('hex').toUpperCase();
          var u = { code: code, role: b.role, name: nm, caseId: cid, active: true, issued: now(), by: inv.name };
          db.users.push(u);
          if (db.store) db.store.upsertUser(u);
          audit('clinic', 'invite', cid || '-', b.role + ' 계정 발급 — ' + nm);
          return json(res, 200, { ok: true, demo: true, code: code, role: b.role, name: nm, caseId: cid });
        }).catch(function (e) { return json(res, 400, { error: e.message, demo: true }); });
      }
      if (pathname === '/api/auth/users' && m === 'GET') {
        var lu = sess || getSession(req);
        if (!db.auth) return json(res, 400, { error: '인증 모드가 아닙니다' });
        if (!lu || lu.role !== 'clinic') return json(res, 403, { error: '계정 목록은 clinic 권한만' });
        var rn = { clinic: '의료진', lab: '기공소', patient: '환자' };
        return json(res, 200, { ok: true, demo: true, users: db.users.slice(-20).reverse().map(function (u) { return { code: u.code, role: u.role, roleKo: rn[u.role] || u.role, name: u.name, caseId: u.caseId || null, issued: u.issued, active: u.active !== false }; }) });
      }
      /* S42 (AC-02/03): 계정 회수·재활성 — 수명주기 완결 (퇴사·종료 시 접근 차단) */
      if (pathname === '/api/auth/revoke' && m === 'POST') {
        /* S42 검증 루프 정정: 요청자 clinic 필수 — lab 세션으로 회수 실행 가능했던 누락(D141 원칙) */
        var ru = sess || getSession(req); /* S42: /api/auth/*는 게이트 우회 경로 — users 엔드포인트와 동일 패턴(D141) */
        if (!db.auth) return json(res, 400, { error: '계정 회수는 인증 모드(계정)에서 제공됩니다 — 데모는 계정이 없습니다', demo: true });
        if (!ru || ru.role !== 'clinic') return json(res, 403, { error: '계정 회수는 clinic 권한만', demo: true });
        return readBody(req).then(function (b) {
          var tu = (db.users || []).filter(function (u) { return u.code === b.code; })[0];
          if (!tu) return json(res, 404, { error: '계정 없음: ' + b.code, demo: true });
          var isSeed = ['MIRI-CLINIC-2026', 'MIRI-LAB-2026', 'MIRI-PAT-2601'].indexOf(b.code) >= 0;
          if (tu.role === 'clinic' && tu.name === ru.name) return json(res, 400, { error: '본인 계정은 회수할 수 없습니다', demo: true });
          if (tu.role === 'clinic' && db.users.filter(function (u) { return u.role === 'clinic' && u.active !== false && u.name !== tu.name; }).length === 0) return json(res, 400, { error: '마지막 clinic 계정은 회수할 수 없습니다', demo: true });
          tu.active = false;
          var killed = 0;
          Object.keys(db.sessions).forEach(function (t2) { if (db.sessions[t2].name === tu.name && db.sessions[t2].role === tu.role) { delete db.sessions[t2]; if (db.store) db.store.dropSession(t2); killed++; } });
          if (db.store) db.store.upsertUser(tu);
          audit('clinic', isSeed ? 'account:demo-revoke' : 'account:revoke', tu.caseId || '-', tu.role + ' ' + tu.name + ' 회수 — 세션 ' + killed + '건 즉시 차단');
          return json(res, 200, { ok: true, demo: true, code: tu.code, killed: killed, seed: isSeed, notice: isSeed ? '데모 시드 코드 — 기능 검증용 회수입니다' : '회수 완료 — 해당 계정의 모든 세션이 차단되었습니다' });
        }).catch(function (e) { return json(res, 400, { error: e.message, demo: true }); });
      }
      if (pathname === '/api/auth/reactivate' && m === 'POST') {
        var ra2 = sess || getSession(req);
        if (!db.auth) return json(res, 400, { error: '재활성은 인증 모드(계정)에서 제공됩니다', demo: true });
        if (!ra2 || ra2.role !== 'clinic') return json(res, 403, { error: '재활성은 clinic 권한만', demo: true });
        return readBody(req).then(function (b2) {
          var tu = (db.users || []).filter(function (u) { return u.code === b2.code; })[0];
          if (!tu) return json(res, 404, { error: '계정 없음: ' + b2.code, demo: true });
          tu.active = true;
          if (db.store) db.store.upsertUser(tu);
          audit('clinic', 'account:reactivate', tu.caseId || '-', tu.role + ' ' + tu.name + ' 재활성');
          return json(res, 200, { ok: true, demo: true, code: tu.code });
        }).catch(function (e) { return json(res, 400, { error: e.message, demo: true }); });
      }

      if (pathname === '/api/auth/login' && m === 'POST') {
        return readBody(req).then(function (b) {
          if (!db.auth) return json(res, 400, { error: '인증 모드가 아닙니다 (데모 기본: 역할 카드 진입)' });
          var ip = req.socket && req.socket.remoteAddress || '?';
          if (!loginGuard(ip)) return json(res, 429, { error: '로그인 시도 횟수 초과 — 15분 후 재시도하세요' });
          var code = String(b.code || '').trim();
          /* S29: 타이밍 안전 비교 — 코드·입력을 모두 SHA-256으로 정규화해 길이 고정 후 비교 */
          var ch = crypto.createHash('sha256').update(code).digest('hex');
          var u = null;
          db.users.forEach(function (x) {
            if (x.active === false) return;
            var uh = crypto.createHash('sha256').update(x.code).digest('hex');
            if (crypto.timingSafeEqual(Buffer.from(uh), Buffer.from(ch))) u = x;
          });
          if (!u) {
            /* S42 (AC-03): 회수 계정은 403로 구분 — 타이밍 안전 유지를 위해 해시 매칭으로만 판별 */
            var uOff = null;
            db.users.forEach(function (x) {
              if (x.active !== false) return;
              var uh = crypto.createHash('sha256').update(x.code).digest('hex');
              if (crypto.timingSafeEqual(Buffer.from(uh), Buffer.from(ch))) uOff = x;
            });
            loginFail(ip);
            if (uOff) { audit('unknown', 'login:revoked', '-', '회수된 코드 로그인 시도 (' + ip + ')'); return json(res, 403, { error: '회수된 계정입니다 — 병원 실장에게 문의하세요', code: 'error.auth.code_revoked', demo: true }); }
            audit('unknown', 'login:fail', '-', '코드 불일치 (' + ip + ' · ' + code.length + '자)'); /* 원문 미기록 */
            return json(res, 401, { error: '유효하지 않은 초대코드입니다', code: 'error.auth.code_invalid' });
          }
          delete LOGIN_FAILS[ip]; /* 성공 시 카운터 리셋 */
          var tok = newToken();
          db.sessions[tok] = { role: u.role, name: u.name, caseId: u.caseId || null, ts: now(), lastSeen: now() };
          if (db.store) db.store.saveSession(tok, db.sessions[tok]);
          audit(u.role, 'login', u.caseId || '-', u.name + ' 로그인 (초대코드 · M1)');
          res.setHeader('Set-Cookie', 'mm_session=' + tok + '; ' + cookieAttrs(req));
          return json(res, 200, { ok: true, role: u.role, name: u.name, caseId: u.caseId || null, demo: true });
        }).catch(function (e) { return json(res, 400, { error: e.message, demo: true }); });
      }
      if (pathname === '/api/auth/me' && m === 'GET') {
        if (!db.auth) return json(res, 400, { error: '인증 모드가 아닙니다' });
        var me = sess || getSession(req); /* auth 경로는 게이트 제외 → 세션 직접 조회 */
        if (!me) return json(res, 401, { error: '세션 없음', authRequired: true });
        return json(res, 200, { role: me.role, name: me.name, caseId: me.caseId, demo: true });
      }
      if (pathname === '/api/auth/logout' && m === 'POST') {
        var lo = sess || getSession(req); /* auth 경로는 게이트 제외 → 세션 직접 조회 */
        if (lo) {
          delete db.sessions[lo.token];
          if (db.store) db.store.dropSession(lo.token);
          audit(lo.role, 'logout', '-', lo.name + ' 로그아웃');
        }
        res.setHeader('Set-Cookie', 'mm_session=; ' + cookieAttrs(req, 0));
        return json(res, 200, { ok: true, demo: true });
      }

      /* S32 (MI-01): 화면 미러링 — clinic 탭 캡처 프레임을 내부 네트워크 기기에 보기 전용 전송 (폐쇄 LAN · 30분 만료) */
      if (pathname === '/api/mirror/start' && m === 'POST') {
        return readBody(req).then(function (b) {
          var mro = db.auth ? (sess && sess.role) : b.role;
          if (mro !== 'clinic') return json(res, 403, { error: '화면 공유는 clinic 권한만', demo: true });
          db.mirrors = db.mirrors || {};
          var mw = Date.now();
          Object.keys(db.mirrors).forEach(function (k) { if (mw - db.mirrors[k].ts > 30 * 60 * 1000) delete db.mirrors[k]; });
          if (Object.keys(db.mirrors).length >= 5) return json(res, 409, { error: '미러 세션은 최대 5개', demo: true });
          var mid = crypto.randomBytes(3).toString('hex');
          db.mirrors[mid] = { nick: String(b.nick || '').slice(0, 12) || '스마일치과', ts: mw, frame: null };
          audit('clinic', 'mirror:start', '-', db.mirrors[mid].nick + ' (내부 네트워크 보기 전용)');
          return json(res, 200, { ok: true, demo: true, id: mid, path: '/mirror/' + mid });
        }).catch(function (e) { return json(res, 400, { error: e.message, demo: true }); });
      }
      var mrx = /^\/api\/mirror\/([0-9a-f]{6})\/frame$/.exec(pathname);
      if (mrx && m === 'POST') {
        return readBody(req).then(function (b) {
          var mr = (db.mirrors || {})[mrx[1]];
          if (!mr) return json(res, 404, { error: '미러 세션이 없거나 만료되었습니다', demo: true });
          var mro2 = db.auth ? (sess && sess.role) : (q.role || b.role);
          if (mro2 !== 'clinic') return json(res, 403, { error: '전송은 clinic 권한만', demo: true });
          if (String(b.img || '').length > 300000) return json(res, 413, { error: '프레임이 너무 큽니다', demo: true });
          mr.frame = String(b.img || '');
          mr.ts = Date.now();
          return json(res, 200, { ok: true, demo: true });
        }).catch(function (e) { return json(res, 400, { error: e.message, demo: true }); });
      }
      if (mrx && m === 'GET') {
        var mr2 = (db.mirrors || {})[mrx[1]];
        if (!mr2) return json(res, 404, { error: '미러 세션 만료', demo: true });
        mr2.ts = Date.now();
        return json(res, 200, { nick: mr2.nick, img: mr2.frame });
      }

      /* S35 (SC-03): 미러 중지 — 라이프사이클 완결 (시작 → 전송 → 명시적 중지) */
      var mdx = /^\/api\/mirror\/([0-9a-f]{6})$/.exec(pathname);
      if (mdx && m === 'DELETE') {
        var mr3 = (db.mirrors || {})[mdx[1]];
        if (!mr3) return json(res, 404, { error: '미러 세션이 없거나 이미 중지되었습니다', demo: true });
        var mro3 = db.auth ? (sess && sess.role) : q.role;
        if (mro3 !== 'clinic') return json(res, 403, { error: '미러 중지는 clinic 권한만', demo: true });
        delete db.mirrors[mdx[1]];
        audit('clinic', 'mirror:stop', '-', mr3.nick + ' (전송 중지)');
        return json(res, 200, { ok: true, demo: true });
      }

      if (pathname === '/api/events/log' && m === 'POST') {
        return readBody(req).then(function (b) {
          if (db.auth) b.role = sess.role;
          var kinds = ['upload', 'download', 'export'];
          if (kinds.indexOf(b.kind) < 0) return json(res, 400, { error: 'kind는 upload|download|export', demo: true });
          var roles = ['clinic', 'lab', 'patient'];
          if (roles.indexOf(b.role) < 0) return json(res, 400, { error: 'role은 clinic|lab|patient', demo: true });
          db.activity.push({ ts: now(), role: b.role, kind: b.kind });
          var tAct = db.activity.length > 500;
          if (tAct) db.activity.splice(0, db.activity.length - 500);
          if (db.store) { if (tAct || db._full) { db.store.sync(db); db._full = false; } else db.store.incrActivity(db); }
          return json(res, 200, { ok: true, demo: true, activity: { changes: db.changes.length, audit: db.audit.length, uploads: db.activity.filter(function (a) { return a.kind === 'upload'; }).length, downloads: db.activity.filter(function (a) { return a.kind === 'download'; }).length, exports: db.activity.filter(function (a) { return a.kind === 'export'; }).length } });
        }).catch(function (e) { return json(res, 400, { error: e.message, demo: true }); });
      }

      /* S37 (GT-01): 게이트 1 — 월간 활성율 계측 (계약서 전환 조건 판정 근거) */
      if (pathname === '/api/metrics/gate' && m === 'GET') {
        var gro = db.auth ? (sess && sess.role) : q.role;
        if (gro !== 'clinic') return json(res, 403, { error: '게이트 계측은 clinic 권한만', demo: true });
        if (!db.auth) return json(res, 400, { error: '활성율 계측은 인증 모드(계정)에서 제공됩니다 — 데모는 계정이 없습니다', demo: true, guide: true });
        var gwin = 30 * 24 * 3600 * 1000;
        var gnow = Date.now(), actMap = {};
        Object.keys(db.sessions).forEach(function (t2) {
          var s2 = db.sessions[t2];
          var ls = new Date(s2.lastSeen || s2.ts).getTime();
          if (isFinite(ls) && gnow - ls <= gwin) actMap[s2.role + '|' + s2.name] = true;
        });
        var gusers = (db.users || []).filter(function (u) { return u.active !== false; });
        var groles = { clinic: [0, 0], lab: [0, 0], patient: [0, 0] };
        gusers.forEach(function (u) { if (groles[u.role]) groles[u.role][1]++; });
        Object.keys(actMap).forEach(function (k2) { var r2 = k2.split('|')[0]; if (groles[r2]) groles[r2][0]++; });
        var gact = Object.keys(actMap).length;
        var grate = gusers.length ? Math.round(100 * gact / gusers.length) : 0;
        return json(res, 200, { ok: true, demo: true, gate: '게이트 1', def: '월간 활성율 70%', windowDays: 30,
          activeAccounts: gact, totalAccounts: gusers.length, ratePct: grate, pass: grate >= 70, roles: groles,
          notice: '판정 근거: 최근 30일 활동 계정 ÷ 전체 계정 — 계약서 전환 조건 (S37)' });
      }

      if (pathname === '/api/metrics' && m === 'GET') {
        var cs = db.cases;
        var orders = cs.filter(function (c) { return !!c.order; }).length;
        var done = cs.filter(function (c) { return c.order && c.order.status === '완료'; }).length;
        var byStatus = {};
        STEPS.forEach(function (s) { byStatus[s] = 0; });
        cs.forEach(function (c) { if (byStatus[c.status] !== undefined) byStatus[c.status]++; });
        return json(res, 200, {
          demo: true,
          notice: '운영 지표 — 데모 데이터 계량 (영상분석리포트 §5 성과 지표 초안 기준)',
          funnel: {
            cases: cs.length, byStatus: byStatus,
            ordersSubmitted: orders, ordersDone: done,
            orderConversionPct: cs.length ? Math.round(100 * orders / cs.length) : 0,
            urgent: cs.filter(function (c) { return !!c.urgent; }).length,
            modifyRequests: cs.filter(function (c) { return !!c.modifyReq; }).length,
            scanSessions: cs.reduce(function (s, c) { return s + ((c.scanSessions || []).length); }, 0)
          },
          activity: { changes: db.changes.length, audit: db.audit.length, uploads: db.activity.filter(function (a) { return a.kind === 'upload'; }).length, downloads: db.activity.filter(function (a) { return a.kind === 'download'; }).length, exports: db.activity.filter(function (a) { return a.kind === 'export'; }).length },
          history: db.metrics,
          formulas: '주문 전환율 = 주문 제출 케이스 ÷ 전체 케이스 (데모)',
          storage: scanStorage(db),
          sys: { version: 'S114', uptimeSec: Math.round((Date.now() - BOOT) / 1000), sse: SSE_CLIENTS.length, persist: !!(db.store && db.dbFile), signer: SIGNER.id === 'external' ? '외부 어댑터' : 'HMAC-SHA256' }
        });
      }

      /* ---- M2 (ADR-004): 스캔 파일 업로드·다운로드 — raw 바이너리 + SHA-256 무결성 ---- */
      var mf = /^\/api\/cases\/([^\/]+)\/sessions\/([^\/]+)\/files$/.exec(pathname);
      if (mf) {
        var cf = findCase(mf[1]);
        var frole = db.auth ? sess.role : (q.role || 'clinic');
        if (!cf) return json(res, 404, { error: '케이스 없음: ' + mf[1], demo: true });
        var fget = (m === 'GET' && q.f); /* S23: 원본 다운로드는 lab도 허용 — 제작에 원본 스캔 필요 */
        if (frole !== 'clinic' && !fget) return json(res, 403, { error: '스캔 파일 업로드는 clinic 권한만', demo: true });
        if (['clinic', 'lab'].indexOf(frole) < 0) return json(res, 403, { error: '스캔 파일 접근 권한 없음', demo: true });
        var ssf = (cf.scanSessions || []).filter(function (x) { return x.id === mf[2]; })[0];
        if (!ssf) return json(res, 404, { error: '세션 없음: ' + mf[2], demo: true });

        if (m === 'POST') {
          return readRaw(req, 2e8).then(function (buf) {
            if (!buf.length) return json(res, 400, { error: '빈 파일', demo: true });
            var nm = safeName(q.filename || req.headers['x-filename'] || '');
            var ext = nm.split('.').pop().toLowerCase();
            if (FILE_EXT.indexOf(ext) < 0) return json(res, 400, { error: '지원 포맷은 stl|obj|ply (파일명: ' + (nm || '없음') + ')', demo: true });
            var sha = crypto.createHash('sha256').update(buf).digest('hex');
            ssf.files = ssf.files || [];
            if (ssf.files.length >= 10) return json(res, 409, { error: '세션당 파일은 최대 10개', demo: true });
            var fmeta = { id: 'F-' + ssf.id.slice(3) + '-' + (ssf.files.length + 1), name: nm, size: buf.length, sha256: sha, ts: now() };
            var dir = db.filesDir;
            fs.mkdirSync(dir, { recursive: true });
            var fpath = path.join(dir, cf.id + '_' + ssf.id + '_' + fmeta.id + '.' + ext);
            fs.writeFileSync(fpath, buf);
            fmeta.path = fpath;
            ssf.files.push(fmeta);
            cf.history.unshift({ d: DEMO_DATE, t: '스캔 파일 업로드 — ' + nm + ' · SHA-256 기록 (M2)' });
            db.activity.push({ ts: now(), role: frole, kind: 'upload' });
            if (db.activity.length > 500) db.activity.splice(0, db.activity.length - 500);
            change(frole, 'file', cf, '스캔 파일 업로드 — ' + nm);
            audit(frole, 'file:upload', cf.id, nm + ' (' + buf.length + 'B)');
            var pub = JSON.parse(JSON.stringify(fmeta)); delete pub.path; /* 내부 경로 비노출 */
            return json(res, 200, { ok: true, seq: db.seq, demo: true, file: pub, sha256: sha });
          }).catch(function (e) { return json(res, 400, { error: e.message, demo: true }); });
        }
        if (m === 'GET' && q.f) {
          var fm = (ssf.files || []).filter(function (x) { return x.id === q.f; })[0];
          if (!fm || !fm.path || !fs.existsSync(fm.path)) return json(res, 404, { error: '파일 없음: ' + q.f, demo: true });
          audit(frole, 'file:download', cf.id, fm.name);
          db.activity.push({ ts: now(), role: frole, kind: 'download' });
          if (db.activity.length > 500) db.activity.splice(0, db.activity.length - 500);
          res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="' + encodeURIComponent(fm.name) + '"', 'X-SHA256': fm.sha256, 'Access-Control-Expose-Headers': 'X-SHA256' });
          fs.createReadStream(fm.path).pipe(res);
          return;
        }
      }

      /* ---- M2 (ADR-005): SSE 실시간 스트림 — seq 변경 푸시, 클라 폴링 폴백 ---- */
      if (pathname === '/api/stream' && m === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Connection': 'keep-alive' });
        res.write('retry: 3000\n\n');
        res.write('data: ' + JSON.stringify({ seq: db.seq, hello: true }) + '\n\n');
        SSE_CLIENTS.push(res);
        req.on('close', function () { var i = SSE_CLIENTS.indexOf(res); if (i >= 0) SSE_CLIENTS.splice(i, 1); });
        return;
      }

      if (pathname === '/api/events' && m === 'GET') {
        var since = parseInt(q.since, 10);
        if (isNaN(since)) since = 0;
        return json(res, 200, { seq: db.seq, demo: true, changes: db.changes.filter(function (ch) { return ch.seq > since; }).slice(-50) });
      }

      if (pathname === '/api/audit' && m === 'GET') {
        var limit = Math.min(parseInt(q.limit, 10) || 20, 100);
        var alist = db.audit.slice(-limit).reverse();
        if (db.auth) { /* S41 FX-04: 역할 경계 — patient 403·lab은 환자 소견(care-log) 계열 제외(S31 마스킹 원칙 D114·접근 투명성은 유지) */
          if (sess && sess.role === 'patient') return json(res, 403, { error: '감사로그는 의료진·기공소 계정 전용입니다', demo: true });
          if (sess && sess.role === 'lab') alist = alist.filter(function (a) { return String(a.act || '').indexOf('care-log') !== 0; });
        }
        return json(res, 200, { demo: true, notice: '감사로그 — 누가 언제 무엇을 했는지 (데모)', audit: alist });
      }

      if (pathname === '/api/reset' && m === 'POST') {
        /* S41 FX-03: 초기화는 clinic 전용 — auth 모드에서 환자·기공소 계정의 전체 데이터 리셋 차단 (런북 §8 강제화) */
        var rro = db.auth ? (sess && sess.role) : 'clinic';
        if (rro !== 'clinic') return json(res, 403, { error: '데모 초기화는 clinic 권한만 — 운영 서버(인증 모드)에서는 데이터 복원이 아닌 백업·내보내기를 사용하세요', demo: true });
        resetDb();
        return json(res, 200, { ok: true, seq: 0, demo: true, notice: '데모 데이터 초기화 완료 (케이스·변경·감사로그·activity)' });
      }

      return json(res, 404, { error: '없는 API: ' + m + ' ' + pathname, demo: true });
    }

    /* ---------- S32: 미러 뷰어 페이지 — 내부 네트워크 보기 전용 ---------- */
    var mvx = /^\/mirror\/([0-9a-f]{6})$/.exec(pathname);
    if (mvx && req.method === 'GET') {
      var mpage = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>스마일치과 화면 미러 (보기 전용)</title><style>body{margin:0;background:#0B2545;color:#fff;font-family:sans-serif;}#bar{padding:8px 12px;font-size:13px;background:#0F1D33;position:fixed;top:0;left:0;right:0;}img{width:100%;display:block;margin-top:36px;}#st{padding:40px 20px;color:#B9C7D8;}</style></head><body>' +
        '<div id="bar"><b id="nick">…</b> · 보기 전용 미러 (새로고침·링크 만료 시 종료)</div><div id="st">화면을 기다리는 중…</div><img id="fr" alt="">' +
        '<script>var ID="' + mvx[1] + '";setInterval(function(){fetch("/api/mirror/"+ID+"/frame").then(function(r){return r.json();}).then(function(j){if(j.error){document.getElementById("st").textContent=j.error;return;}document.getElementById("nick").textContent=j.nick;document.getElementById("st").style.display="none";if(j.img)document.getElementById("fr").src=j.img;}).catch(function(){});},600);</scr' + 'ipt></body></html>';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(mpage);
    }

    /* ---------- 정적 ---------- */
    if (pathname === '/bundle') {
      return fs.readFile(BUNDLE, function (e, buf) {
        if (e) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('단일 파일 빌드가 없습니다 — python3 build.py 실행 후 시도'); return; }
        var etag = '"' + buf.length + '"'; /* S45 (TR-01): 빌드 길이 기반 ETag — 새로고침 304 (260KB 재전송 제거) */
        if (req.headers['if-none-match'] === etag) { res.writeHead(304, { 'ETag': etag, 'Cache-Control': 'no-cache' }); return res.end(); }
        var hdrs = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'ETag': etag };
        if (/gzip/.test(String(req.headers['accept-encoding'] || ''))) { buf = zlib.gzipSync(buf); hdrs['Content-Encoding'] = 'gzip'; } /* S45: 최초 전송도 압축 (~70KB) */
        res.writeHead(200, hdrs);
        res.end(buf);
      });
    }
    if (pathname === '/' || pathname === '/index.html') return serveStatic(res, 'index.html', req);
    if (pathname.indexOf('/js/') === 0 || pathname.indexOf('/css/') === 0 || pathname.indexOf('/assets/') === 0) return serveStatic(res, pathname.slice(1), req);
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 not found');
  });
}

/* ---- 직접 실행 ---- */
if (require.main === module) {
  var PORT = parseInt(process.env.PORT, 10);
  if (isNaN(PORT)) PORT = 8080; /* S35: PORT=0 허용 — 테스트 랜덤 포트 */
  var OPTS = { auth: process.env.MM_AUTH === '1', persist: process.env.MM_DB || null };
  var SRV = createApp(OPTS).listen(PORT, '0.0.0.0', function () {
    console.log('[mirimiso-mock] http://localhost:' + SRV.address().port + '  — 케이스 ' + db.cases.length + '건 시드 · 데모 데이터 (가상)' + (OPTS.auth ? ' · 인증 모드(M1)' : '') + (OPTS.persist ? ' · SQLite 영속(' + OPTS.persist + ')' : ''));
    console.log('[mirimiso-mock] 멀티탭 데모: 병원 탭 + 기공소 탭을 열면 2초 내 상호 동기화됩니다');
  });
  /* S35 (SC-04): 우아한 종료 — systemd 재시작 시에도 마감 처리(체크포인트 후 종료) */
  process.on('SIGTERM', function () {
    try { if (db.store && db.store.raw) db.store.raw.pragma('wal_checkpoint(TRUNCATE)'); } catch (e) {}
    SRV.close(function () { console.log('[mirimiso-mock] 정상 종료 — 연결 닫힘 · 체크포인트 완료'); process.exit(0); });
    setTimeout(function () { process.exit(0); }, 1500).unref();
  });
}

module.exports = { createApp: createApp, seedCases: seedCases, resetDb: resetDb, DEMO_DATE: DEMO_DATE, STEPS: STEPS, sqliteRaw: function () { return db.store ? db.store.raw : null; }, filesDirLive: function () { return db.filesDir; } };
