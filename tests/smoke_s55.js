#!/usr/bin/env node
/* S55 스모크 — 데일리 캡처 퀘스트: 카메라 인터페이스(사진·영상·LiDAR)·30일 퀘스트·규칙 기반 품질 분석
   단정 원칙: 렌더 결과는 #root 기준 · 도트 스코프 분리(.jrow 15일 / .cdots 30일 퀘스트) */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', '미리미소-웹앱.html'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('PASS - ' + msg); } else { failed++; console.log('FAIL - ' + msg); } }

(async () => {
  /* A. 진입 — 환자 모드 → 여정 → 캡처 퀘스트 카드 */
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
  const root = () => d.getElementById('root').textContent;
  assert(w.MM.app.current === 'journey' && root().includes('데일리 캡처 퀘스트'), '여정 탭 — 데일리 캡처 퀘스트 카드 (S55·CP-01)');
  const qdots = d.querySelector('.cdots').querySelectorAll('.jd');
  const jdots = d.querySelector('.jrow').querySelectorAll('.jd');
  assert(qdots.length === 30 && jdots.length === 15, '도트 스코프 — 퀘스트 30칸 · 15일 여정 분리 (S55·CP-02)');
  assert(!!d.getElementById('cpP') && !!d.getElementById('cpV') && !!d.getElementById('cpL'), '캡처 3버튼 — 사진·영상·LiDAR (S55·CP-01)');
  d.getElementById('cpP').click(); /* S57: 촬영은 캡처 모달로 */
  await sleep(300);
  const cf = d.getElementById('cpMFile');
  assert(!!cf && cf.getAttribute('capture') === 'environment' && (cf.accept || '').includes('image') && (cf.accept || '').includes('video'),
    '캡처 모달·폴백 입력 — capture=environment · image+video (S57 모달 워크플로)');
  w.MM.app.closeModal();
  await sleep(200);
  assert(root().includes('0/30일') && root().includes('비진단') && root().includes('규칙 기반'), '초기 0/30일 · 규칙 기반·비진단 고지 (S55·CP-03)');

  /* B. LiDAR 정직 고지 (CP-04) */
  d.getElementById('cpL').click();
  await sleep(200);
  const msg = d.getElementById('cpMsg').textContent;
  assert(msg.includes('LiDAR') && msg.includes('미제공') && msg.includes('3각도'), 'LiDAR 웹 제한 고지 — 사진 3각도 대체 안내 (S55·CP-04)');

  /* C. capSave — 퀘스트 1일 · 품질 표시 */
  w.MM.capSave({ d: new Date().toISOString().slice(0, 10), p: 1, q: 'A', b: 140, s: 12, f: 15, tip: '좋아요 — 이 각도를 기억하세요' });
  w.MM.app.rerender();
  await sleep(400);
  let t = root();
  assert(t.includes('1/30일') && t.includes('A등급'), '캡처 저장 → 퀘스트 1/30일 · A등급 표시');
  assert(d.querySelector('.cdots').querySelectorAll('.jd.d').length === 1, '퀘스트 도트 1칸 채움(✓)');
  assert(!!d.querySelector('.tb div[style*=width]'), '선명도 바차트 렌더');

  /* D. imgQ 규칙 — 어두움 → C·조명 팁 / 경계 → 선명도 상승 */
  const dark = new w.Uint8ClampedArray(32 * 32 * 4);
  for (let i = 0; i < dark.length; i += 4) { dark[i] = 10; dark[i + 1] = 10; dark[i + 2] = 10; dark[i + 3] = 255; }
  const r1 = w.MM.imgQ(dark, 32, 32);
  assert(r1 && r1.q === 'C' && r1.tip.includes('조명'), '품질 규칙 — 어두운 사진 → C등급·조명 팁 (비진단 지표)');
  const edge = new w.Uint8ClampedArray(32 * 32 * 4);
  for (let i = 0; i < edge.length; i += 4) { const v = (i / 4) % 2 ? 235 : 15; edge[i] = edge[i + 1] = edge[i + 2] = v; edge[i + 3] = 255; }
  const r2 = w.MM.imgQ(edge, 32, 32);
  assert(r2 && r2.f > r1.f, '품질 규칙 — 경계 많은 사진 → 선명도(f) 상승');

  /* E. capSave 누적 — 당일 횟수 합산 */
  w.MM.capSave({ d: new Date().toISOString().slice(0, 10), p: 1, v: 1 });
  assert(w.MM.capLogs().length === 1 && w.MM.capLogs()[0].p === 2 && w.MM.capLogs()[0].v === 1, '당일 재촬영 — 횟수 누적·날짜 1건 유지');

  /* F. 30일 달성 — 🏆 배너 */
  const today = new Date().toISOString().slice(0, 10);
  const seed = [];
  for (let i = 0; i < 30; i++) { const p = new Date(); p.setDate(p.getDate() - i); seed.push({ d: p.toISOString().slice(0, 10), p: 1, q: i % 2 ? 'B' : 'A' }); }
  try { w.localStorage.setItem('MM_CAP_V1', JSON.stringify(seed)); } catch (e) {}
  w.MM.app.rerender();
  await sleep(400);
  t = root();
  assert(t.includes('30/30일') && t.includes('30일 달성'), '30일 완주 → 퀘스트 성공 배너 🏆 (S55·CP-02)');

  /* G. 예산 */
  const size = fs.statSync(path.join(__dirname, '..', '미리미소-웹앱.html')).size;
  assert(size <= 283000, '번들 276KiB 이하 — ' + size.toLocaleString() + 'B (헤드룸 ' + (283000 - size).toLocaleString() + 'B)');

  console.log('--- S55 smoke finished: ' + passed + ' pass / ' + failed + ' fail ---');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
