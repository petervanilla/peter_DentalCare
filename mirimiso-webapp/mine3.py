#!/usr/bin/env python3
"""mine3.py — 경계 인지 단축 태그 + 전체-리터럴 단반복 마이닝 (JS) · CSS 긴 값 var화
   사용: python3 mine3.py"""
import os, re, subprocess
from collections import Counter

ROOT = os.path.dirname(os.path.abspath(__file__))
JFILES = ['views.js', 'casehub.js', 'app.js', 'data.js', 'formats.js', 'analysis.js', 'dental3d.js']
POOL = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

def segments(src):
    out, i, n = [], 0, len(src)
    while i < n:
        if src[i] == "'":
            j = i + 1
            while j < n:
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == "'":
                    break
                j += 1
            out.append((i, j + 1))
            i = j + 1
        else:
            i += 1
    return out

def is_key_lit(src, end):
    k = end
    while k < len(src) and src[k] in ' \t':
        k += 1
    return k < len(src) and src[k] == ':'

def js_pass():
    """단축 태그(경계만) + 전체-리터럴 단반복(2~7B) 상수화"""
    tags = ['</div>', '</span>', '</p>', '</button>', '</h3>', '</label>', '</option>', '</select>', '</b>', '</small>']
    used_names = 0
    for fn in JFILES:
        path = os.path.join(ROOT, 'js', fn)
        src = open(path, encoding='utf-8').read()
        segs = segments(src)
        texts = [(a, b, src[a + 1:b - 1]) for (a, b) in segs if not is_key_lit(src, b)]
        joined = '\x00'.join(t[2] for t in texts)
        cands = Counter()
        # 단축 태그: 경계 발생만 절감 인정
        for t in tags:
            L, sv = len(t), 0
            for (a, b, c) in texts:
                i = 0
                while True:
                    k = c.find(t, i)
                    if k < 0:
                        break
                    if k == 0 and k + L == len(c):
                        sv += L
                    elif k == 0 or k + L == len(c):
                        sv += L - 1
                    i = k + L
            if sv - (L + 12) > 0:
                cands[t] = sv - (L + 12)
        # 전체-리터럴 단반복 (2~7B — 버튼 라벨 등)
        whole = Counter()
        for (a, b, c) in texts:
            whole[c] += 1
        for c, n in whole.items():
            if 2 <= len(c) <= 7 and n >= 2 and "'" not in c and '\\' not in c:
                sv = n * (len(c) + 2 - 2) - (len(c) + 12)
                if sv > 0 and not any(c in t or t in c for t in cands):
                    cands[c] = sv
        if not cands:
            continue
        chosen = []
        for c, sc in sorted(cands.items(), key=lambda x: -x[1]):
            if any(c in s or s in c for s in chosen):
                continue
            chosen.append(c)
        existing = set(re.findall(r'\b[ZY][0-9A-Za-z]\b', src))
        free = [p for p in POOL if 'Z' + p not in existing]
        names = {c: 'Z' + free[i] for i, c in enumerate(chosen)}
        def repl_tok(tok):
            parts = [('t', tok[1:-1])]
            for c in chosen:
                hit = False
                for kind, val in parts:
                    if kind == 't' and c in val:
                        hit = True
                        break
                if not hit:
                    continue
                nm, res = names[c], []
                for kind, val in parts:
                    if kind == 'n':
                        res.append((kind, val))
                        continue
                    i = 0
                    while True:
                        k = val.find(c, i)
                        if k < 0:
                            res.append(('t', val[i:]))
                            break
                        if k > i:
                            res.append(('t', val[i:k]))
                        res.append(('n', nm))
                        i = k + len(c)
                parts = res
            seg = []
            for kind, val in parts:
                if kind == 'n':
                    seg.append(val)
                elif val != '':
                    seg.append("'" + val + "'")
            return '+'.join(seg) if seg else "''"
        new_src, last = [], 0
        for (a, b) in segs:
            if is_key_lit(src, b):
                continue
            new_src.append((a, b, repl_tok(src[a:b])))
        for (a, b, tok) in sorted(new_src, key=lambda x: -x[0]):
            src = src[:a] + tok + src[b:]
        decl_new = ','.join(names[c] + "='" + c + "'" for c in dict.fromkeys(chosen))
        anchor = src.find('(function')
        nl = src.find('\n', anchor)
        head = src[nl + 1:]
        m0 = re.match(r'var Z[0-9A-Za-z]=', head)
        if False and m0:
            eol = head.find('\n')
            head = head[:eol] + ',' + decl_new + head[eol:]
            src = src[:nl + 1] + head
        else:
            src = src[:nl + 1] + 'var ' + decl_new + ';\n' + src[nl + 1:]
        open(path + '.bak', 'w', encoding='utf-8').write(open(path, encoding='utf-8').read())
        open(path, 'w', encoding='utf-8').write(src)
        r = subprocess.run(['node', '--check', path], capture_output=True)
        if r.returncode != 0:
            open(path + '.bad', 'w', encoding='utf-8').write(src if 'src' in dir() else '')
            open(path, 'w', encoding='utf-8').write(open(path + '.bak', encoding='utf-8').read())
            print(f'[롤백] {fn}:', r.stderr.decode()[:300])
        else:
            os.remove(path + '.bak')
            print(f'[mine3] {fn}: {len(chosen)}개')

def css_pass():
    """minified CSS 기준 긴 반복 값 → var(--zN)"""
    path = os.path.join(ROOT, 'css', 'app.css')
    css = open(path, encoding='utf-8').read()
    mc = re.sub(r'\s+', ' ', re.sub(r'/\*.*?\*/', '', css, flags=re.S))
    mc = re.sub(r'\s*([{};:,>])\s*', r'\1', mc)
    mc = mc.replace(';}', '}')
    vals = Counter()
    for L in range(34, 17, -1):
        for i in range(len(mc) - L):
            s = mc[i:i + L]
            if '{}' in s or '{' in s or '}' in s or s.count(';') > 0 or ':' in s:
                continue
            if not re.match(r'^[a-z0-9#().,%\s-]+$', s):
                continue
            if not re.search(r'[a-z]', s):
                continue
            if mc.count(s) >= 3:
                vals[s] = mc.count(s)
    chosen = []
    for s, n in sorted(vals.items(), key=lambda x: (-x[0].__len__(), -x[1])):
        if n * (len(s) - 10) - (len(s) + 10) > 0 and not any(s in t or t in s for t in chosen):
            chosen.append(s)
    used = 0
    for s in chosen:
        if s not in mc:
            continue
        nm = '--z' + POOL[used % 62] + POOL[(used // 62) % 62]
        used += 1
        mc = mc.replace(s, 'var(' + nm + ')')
        css = mc
    if used:
        css = ':root{' + ';'.join('--z' + POOL[(i % 62)] + POOL[(i // 62) % 62] + ':' + s for i, s in enumerate(chosen)) + '}' + css
        open(path, 'w', encoding='utf-8').write(css)
        print(f'[css] 값 var화 {used}개')

if __name__ == '__main__':
    js_pass()
    subprocess.run(['python3', os.path.join(ROOT, 'build.py')])
    print('[build]', os.path.getsize('/home/user/미리미소-웹앱.html'), 'B')
