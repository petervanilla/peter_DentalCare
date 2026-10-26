#!/usr/bin/env node
/* S65 스모크 — 여정 소형 일 표: 최근 7일 기록 카드 · 탭 → 일 상세 모달 재사용 (인쇄 없이 열람 · 기기 로컬)
   단정 원칙: 소형 표는 MM_TODAY_LOG_V1·MM_CAP_V1 기기 로컬 열람만 · 기존 계약(캘린더·퀘스트 도트) 유지 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); } }
const iso = t => new Date(Date.now() - t * 864e5).toISOString().slice(0, 10);

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
  const dN = iso(1), dC = iso(2), dB = iso(3);
  w.MM.todaySave({ d: dN, pain: 0, swell: 0, bleed: 0, chew: 0, brush: 1, vice: 0, m: '' });
  w.MM.capSave({ d: dC, p: 1, a: '정면', q: 'A', b: 140, s: 12, f: 15 });
  w.MM.todaySave({ d: dB, pain: 2, swell: 0, bleed: 1, chew: 0, brush: 1, vice: 0, m: '' });
  w.MM.capSave({ d: dB, p: 2, a: '좌측', q: 'B', b: 130, s: 10, f: 18 });
  w.MM.app.rerender();
  await sleep(400);
  const root = () => d.getElementById('root').textContent;
  const list = d.getElementById('dlList');
  const rows = list ? Array.from(list.querySelectorAll('[data-dl]')) : [];
  const row = dd => rows.find(r => r.getAttribute('data-dl') === dd);
  const txt = r => r.textContent.replace(/\s+/g, ' ');

  /* A. 카드·7행 윈도우 (JT-01) */
  assert(root().includes('최근 7일 기록') && rows.length === 7, '최근 7일 기록 카드 — 7행 (JT-01)');
  assert(row(iso(0)) && rows[0].getAttribute('data-dl') === iso(6) && rows[6].getAttribute('data-dl') === iso(0), '오름차순 윈도우 (6일 전 → 오늘 — 추이 읽기) (JT-01)');

  /* B. 행 표기 — 점수·이상 항목·캡처 (JT-02) */
  assert(txt(row(dB)).includes('4/6') && txt(row(dB)).includes('통증 심') && txt(row(dB)).includes('출혈 있') && txt(row(dB)).includes('캡처 2건'), '기록 행 — 4/6 · 통증 심 · 출혈 있 · 캡처 2건 (JT-02)');
  assert(txt(row(dN)).includes('0/6 정상'), '무이상 행 — 0/6 정상 (JT-02)');
  assert(txt(row(dC)).includes('—') && txt(row(dC)).includes('캡처 1건'), '캡처만 있는 날 — — · 캡처 1건 (JT-02)');
  assert(txt(row(iso(4))).trim().endsWith('—'), '무기록 행 — — (JT-02)');

  /* C. 탭 → 일 상세 모달 재사용 (JT-03) */
  row(dB).querySelector('small').click();
  await sleep(300);
  const mb = () => d.getElementById('modalBody').textContent;
  assert(d.getElementById('modalOverlay').classList.contains('show') && mb().includes(dB + ' 기록'), '행 탭 → 일 상세 모달 (JT-03)');
  d.getElementById('dClose').click();
  await sleep(200);
  const bEl = row(iso(0)).querySelector('b');
  bEl.click();
  await sleep(300);
  assert(d.getElementById('modalOverlay').classList.contains('show') && mb().includes(iso(0) + ' 기록'), '행 내부 요소 탭(closest) → 오늘 상세 (JT-03)');
  d.getElementById('dClose').click();
  await sleep(200);

  /* D. 경계·기존 계약 (JT-04) */
  assert(root().includes('비진단 — 기기 로컬 기록만 표시.'), '소형 표 비진단 고지 (JT-04)');
  assert(d.querySelectorAll('.cwg i').length === 7 && d.querySelector('.cdots').querySelectorAll('.jd').length === 30, '기존 계약 — 캘린더 요일 7·퀘스트 30도트 (회귀)');

  /* E. 예산 */
  assert(fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size <= 283000, '번들 예산 — 276KiB 이하 (' + fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size + 'B)');

  console.log('--- S65 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
