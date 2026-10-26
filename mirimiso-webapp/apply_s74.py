#!/usr/bin/env python3
"""apply_s74.py — S74 진료 워크플로 재적용 (복원된 minified 소스 기준)"""
import re

p = 'js/views.js'
s = open(p, encoding='utf-8').read()
assert 'treatment' not in s, '잔존 확인'

MODULE = open('s74_module.js', encoding='utf-8').read()

# 1) staffHome 헤더 진료 버튼 (가이드 버튼 왼쪽·프라이머리)
a1 = '\' + BQ + \' data-goto="scannerInfo"'
if a1 not in s:
    # minified 형태
    a1 = "'+BQ+' data-goto=\"scannerInfo\""
assert a1 in s, 'header anchor 미발견'
n1 = "'+BP+' id=\"txEntry\" data-goto=\"treatment\">🦷 진료 시작'+E8+BQ+' data-goto=\"scannerInfo\""
s = s.replace(a1, n1, 1)

# 2) 가이드 버튼 좌마진
a2 = 'style="background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.35);color:#fff'
assert a2 in s, 'guide style anchor 미발견'
s = s.replace(a2, 'style="margin-left:8px;background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.35);color:#fff', 1)

# 3) staffHome mount — txNew 플래그 바인딩
m = re.search(r',\w+\.staffHome=\{render', s)
assert m, 'staffHome 정의 미발견'
mi = s.find('mount:function(', m.end())
assert mi > 0, 'staffHome mount 미발견'
m2 = re.search(r'mount:function\(([a-zA-Z$_]+)\)\{', s[mi:mi + 48])
assert m2, 'mount 시그니처 미발견'
ins = mi + m2.end()
s = s[:ins] + 'ob(_q("#txEntry"),"click",function(){A.state.txNew=1});' + s[ins:]

# 4) 모듈 추가 (파일 말미 — 독립 IIFE)
s = s.rstrip('\n') + '\n' + MODULE
open(p, 'w', encoding='utf-8').write(s)
print('[OK] views.js — 버튼·마진·txNew·모듈')

# 5) app.js TITLES + CB
p = 'js/app.js'
s = open(p, encoding='utf-8').read()
a = 'staffPatient:"환자 스캔 리뷰"'
assert a in s, 'TITLES anchor'
s = s.replace(a, a + ',treatment:"진료 — Order·Scan·Design"', 1)
a = 'staffPatient:["staffHome","환자"]'
assert a in s, 'CB anchor'
s = s.replace(a, a + ',treatment:["staffHome","진료"]', 1)
open(p, 'w', encoding='utf-8').write(s)
print('[OK] app.js — TITLES·CB')
