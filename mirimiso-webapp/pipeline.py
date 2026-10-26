#!/usr/bin/env python3
"""pipeline.py — S73 페이로드 → S74 공식 소스 재구성 (클린 베이스라인)
   추출 → S74 js 패치 → gb() → css(죽은 규칙·병합·select 규칙·S74 블록) → 클래스 리네임"""
import re, os, glob, subprocess, zlib, base64
from collections import defaultdict

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

# ===== 1) 클린 추출 =====
p = open('/home/user/미리미소-프리뷰.html', encoding='utf-8').read()
bundle = zlib.decompress(base64.b64decode(re.search(r'var B64 = "([A-Za-z0-9+/=]+)"', p).group(1)), 31).decode('utf-8')
scripts = re.findall(r'<script>\n(.*?)\n</script>', bundle, re.S)
if len(scripts) != 10:
    # 단일-스크립트(자가 추출) 페이로드 형식: 유닛 분리 불가 — js 재기록 생략(기존 js 유지)
    print(f'[pipeline] 경고: 페이로드 script 블록 {len(scripts)}개(10개 아님) — js 재기록 생략, 기존 js 유지')
    scripts = []
for nm, b in zip(['assets', 'dental3d', 'data', 'formats', 'engine', 'analysis', 'views', 'app', 'casehub', 'api'], scripts):
    open(f'js/{nm}.js', 'w', encoding='utf-8').write(b + '\n')
s73css = re.search(r'<style>\n(.*?)\n</style>', bundle, re.S).group(1)

# ===== 2) S74 js =====
subprocess.run(['python3', 'apply_s74.py'], check=True)
e = open('js/engine.js', encoding='utf-8').read()
if 'function gb(' not in e:
    e = e.replace('jget.bind(null,t,e)}',
                  'jget.bind(null,t,e)}function gb(c){_qa("[data-goto]",c).forEach(function(b){ob(b,"click",function(){A.go(b.getAttribute("data-goto"))})})}', 1)
    open('js/engine.js', 'w', encoding='utf-8').write(e)
pat = re.compile(r'_qa\("\[data-goto\]",(\w+)\)\.forEach\(function\((\w+)\)\{ob\(\2,"click",function\(\)\{A\.go\(\2\.getAttribute\("data-goto"\)\)\}\)\}\)')
for f in ['js/views.js', 'js/casehub.js']:
    t = open(f, encoding='utf-8').read()
    t2, k = pat.subn(lambda mm: 'gb(' + mm.group(1) + ')', t)
    if k:
        open(f, 'w', encoding='utf-8').write(t2)

# ===== 3) css 재구성 =====
S74CSS = open('s74_css.txt', encoding='utf-8').read().strip()
css = s73css + '\n' + S74CSS + '\n'
css = css.replace('input[type=text],textarea{', 'input[type=text],textarea,select{', 1)

js_all = ''.join(open('js/' + f, encoding='utf-8').read() for f in sorted(os.listdir('js')) if f.endswith('.js'))
html = open('index.html', encoding='utf-8').read()
tests = ''.join(open(t, encoding='utf-8').read() for t in glob.glob('/home/user/tests/*.js'))
def used(t, c): return re.search(r'(?<![a-zA-Z0-9_-])' + re.escape(c) + r'(?![a-zA-Z0-9_-])', t)
DEAD = {c for c in set(re.findall(r'\.([a-zA-Z][a-zA-Z0-9_-]*)', css)) if not used(js_all, c) and not used(html, c) and not used(tests, c)}
def dead_sel(sel):
    toks = re.findall(r'\.([a-zA-Z][a-zA-Z0-9_-]*)', sel)
    return bool(toks) and all(t in DEAD for t in toks)
def clean_block(block):
    out, i, n = [], 0, len(block)
    while i < n:
        b = block.find('{', i)
        if b < 0: out.append(block[i:]); break
        sel = block[i:b]
        if sel.strip().startswith('@'):
            depth, j = 1, b + 1
            while j < n and depth:
                if block[j] == '{': depth += 1
                elif block[j] == '}': depth -= 1
                j += 1
            inner = block[b + 1:j - 1]
            if sel.strip().startswith('@media'):
                inner = clean_block(inner)
            if inner.strip(): out.append(sel + '{' + inner + '}')
            i = j
        else:
            e2 = block.find('}', b)
            keep = [x for x in sel.split(',') if not dead_sel(x)]
            if keep: out.append(','.join(keep) + '{' + block[b + 1:e2] + '}')
            i = e2 + 1
    return ''.join(out)
css = clean_block(css)
def merge_equal(block):
    rules, other, i, n = [], [], 0, len(block)
    while i < n:
        b = block.find('{', i)
        if b < 0: other.append(block[i:]); break
        sel = block[i:b]
        if sel.strip().startswith('@'):
            depth, j = 1, b + 1
            while j < n and depth:
                if block[j] == '{': depth += 1
                elif block[j] == '}': depth -= 1
                j += 1
            other.append(block[i:j]); i = j; continue
        e2 = block.find('}', b)
        rules.append((sel, block[b + 1:e2])); i = e2 + 1
    groups = defaultdict(list)
    for sel, body in rules: groups[body].append(sel.strip())
    parts = [(','.join(sels) + '{' + body + '}' if len(sels) > 1 else sels[0] + '{' + body + '}') for body, sels in groups.items()]
    return ''.join(other) + ''.join(parts)
css = merge_equal(css)
assert css.count('{') == css.count('}')


# ===== 5) css 변수명 단축 (css 전용) =====
vnames = sorted(set(re.findall(r'--([a-zA-Z][a-zA-Z0-9-]{2,})', css)), key=len, reverse=True)
vm = {}
for i, v in enumerate(vnames):
    vm[v] = 'a' + '0123456789abcdefghijklmnopqrstuvwxyz'[i % 36] + ('' if i < 36 else 'x')
for old, new in vm.items():
    css = css.replace('--' + old + ':', '--' + new + ':').replace('var(--' + old + ')', 'var(--' + new + ')')
# ===== 6) 전체-값 var화 (자리별 균형 검증) =====
from collections import Counter as _C
vals = _C()
for _m in re.finditer(r'[a-z-]+:([^;{}]+)[;}]', css):
    v = _m.group(1)
    if len(v) >= 14 and v.count('(') == v.count(')') and re.fullmatch(r'[a-z0-9#().,%\s"-]+', v) and not v.startswith('var('):
        vals[v] += 1
cand = [v for v, n in sorted(vals.items(), key=lambda x: -x[1]) if n >= 3 and n * (len(v) - 9) - (len(v) + 14) > 0]
chosen = []
for v in cand:
    if not any(v in t or t in v for t in chosen):
        chosen.append(v)
defs, k = [], 0
for v in chosen:
    nm = '--b' + '0123456789abcdefghijklmnopqrstuvwxyz'[k % 36]
    t = css.replace(':' + v + ';', ':var(' + nm + ');').replace(':' + v + '}', ':var(' + nm + '}')
    if t.count('(') == t.count(')') and t.count('{') == t.count('}'):
        css = t
        defs.append(nm + ':' + v)
        k += 1
css = ':root{' + ';'.join(defs) + '}' + css
assert css.count('{') == css.count('}')
assert css.count('(') == css.count(')')
open('css/app.css', 'w', encoding='utf-8').write(css)
print(f'[pipeline] 완료 · dead {len(DEAD)}  · css {len(css)}B')
