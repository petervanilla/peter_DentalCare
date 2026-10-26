#!/usr/bin/env node
/* S68 스모크 — 일 상세 캡처 확장(지표 표시) + 소형 일 표 메모 아이콘
   단정 원칙: 캡처 지표·메모 모두 기기 로컬 기록 열람만(비진단) · 기존 계약(s62 '정면·A' 선행·dayCard 행) 유지 */
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
  const dN = iso(1), dC = iso(0);
  w.MM.todaySave({ d: dN, pain: 0, swell: 0, bleed: 0, chew: 0, brush: 1, vice: 0, m: '양치 잘함' });
  w.MM.capSave({ d: dC, p: 1, a: '정면', q: 'A', b: 140, s: 12, f: 15 });
  w.MM.todaySave({ d: dC, pain: 1, swell: 0, bleed: 0, chew: 0, brush: 1, vice: 0, m: '' });
  w.MM.app.rerender();
  await sleep(400);
  const list = d.getElementById('dlList');
  const row = dd => Array.from(list.querySelectorAll('[data-dl]')).find(r => r.getAttribute('data-dl') === dd);
  const txt = r => r.textContent.replace(/\s+/g, ' ');

  /* A. 소형 일 표 메모 아이콘 (MM-01) */
  assert(txt(row(dN)).includes('📝'), '메모 보유일 행 — 📝 아이콘 (' + dN + ') (MM-01)');
  assert(!txt(row(dC)).includes('📝'), '메모 없는 기록일 행 — 아이콘 없음 (MM-01)');
  assert(txt(row(dN)).includes('0/6'), '기존 행 표기 유지 — 점수 (S65 회귀)');

  /* B. 일 상세 캡처 확장 — 지표 표시 (DM-01) */
  row(dC).click();
  await sleep(300);
  const mb = () => d.getElementById('modalBody').textContent;
  assert(d.getElementById('modalOverlay').classList.contains('show'), '행 탭 → 일 상세 모달 (S65 회귀)');
  assert(mb().includes('정면·A — 사진 1 · 영상 0 · 선명도 15 · 밝기 140'), '캡처 행 — 템플릿·등급·사진/영상·선명도·밝기 (DM-01)');
  assert(mb().includes('비진단 — 기기 로컬 기록만 표시.'), '일 상세 비진단 고지 유지 (DM-02·회귀)');
  d.getElementById('dClose').click();
  await sleep(200);

  /* C. 경계 — 캡처 없는 날 (DM-02) */
  row(dN).click();
  await sleep(300);
  assert(mb().includes('없음'), '캡처 없는 날 — 없음 (DM-02)');
  assert(mb().includes('양치 잘함'), '메모 표시 유지 (S62 회귀)');
  d.getElementById('dClose').click();
  await sleep(200);

  /* D. 예산 */
  assert(fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size <= 283000, '번들 예산 — 276KiB 이하 (' + fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size + 'B)');

  console.log('--- S68 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
