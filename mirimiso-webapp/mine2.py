#!/usr/bin/env python3
"""mine2.py — 문자열 리터럴 n-gram 상수 마이닝 v2 (런타임 불변 · 문법 검증 게이트)
   D177 교정: parts 기반 치환(접두부 유실·후보 중복 제거)·파일별 .bak·node --check 실패 시 롤백.
   사용: python3 mine2.py <목표바이트>"""
import os, re, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
FILES = ['views.js', 'casehub.js', 'app.js', 'data.js', 'formats.js', 'analysis.js', 'dental3d.js']
POOL = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
MIN_LEN, MAX_LEN = 8, 48
BUNDLE = '/home/user/미리미소-웹앱.html'

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

def apply_cand(parts, c, nm):
    res = []
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
    return res

def assemble(parts):
    segs = []
    for kind, val in parts:
        if kind == 'n':
            segs.append(val)
        elif val != '':
            segs.append("'" + val + "'")
    return '+'.join(segs) if segs else "''"

def mine_file(path):
    src = open(path, encoding='utf-8').read()
    segs = segments(src)
    texts, skippable = [], set()
    for (a, b) in segs:
        if is_key_lit(src, b):
            skippable.add((a, b))
        else:
            texts.append(src[a + 1:b - 1])
    joined = '\x00'.join(texts)
    cands = {}
    for L in range(MIN_LEN, MAX_LEN + 1):
        seen = set()
        for pos in range(len(joined) - L):
            c = joined[pos:pos + L]
            if c in seen or '\x00' in c or "'" in c or '\\' in c or '\n' in c:
                continue
            seen.add(c)
            if not re.search(r'[<>="#;:·]', c) and not re.search(r'[^\x00-\x7f]', c):
                continue
            cnt = joined.count(c)
            if cnt < 2:
                continue
            score = cnt * (L - 7) - (L + 12)
            if score > 0:
                cands[c] = score
    if not cands:
        return 0
    chosen = []
    for c, sc in sorted(cands.items(), key=lambda x: -x[1]):
        if any(c in s or s in c for s in chosen):
            continue
        chosen.append(c)
        if len(chosen) >= 80:
            break
    existing = set(re.findall(r'\b[ZY][0-9A-Za-z]\b', src))
    free = [p for p in POOL if 'Z' + p not in existing and 'Y' + p not in existing]
    names = {c: ('Z' if i < 62 else 'Y') + free[i % len(free)] for i, c in enumerate(chosen)}
    new_src, last, decls = [], 0, []
    for (a, b) in segs:
        if (a, b) in skippable:
            continue
        tok = src[a:b]
        parts = [('t', tok[1:-1])]
        used = []
        for c in chosen:
            if any(kind == 't' and c in v for kind, v in parts):
                parts = apply_cand(parts, c, names[c])
                used.append(c)
        if used:
            new_src.append((a, b, assemble(parts)))
            decls.extend(used)
    if not decls:
        return 0
    for (a, b, newtok) in sorted(new_src, key=lambda x: -x[0]):
        src = src[:a] + newtok + src[b:]
    decl_txt = 'var ' + ','.join(names[c] + "='" + c + "'" for c in dict.fromkeys(decls)) + ';'
    key = '"use strict";'
    pos = src.find(key)
    assert pos > 0, 'use strict 앵커 없음'
    src = src[:pos + len(key)] + decl_txt + src[pos + len(key):]
    open(path + '.bak', 'w', encoding='utf-8').write(open(path, encoding='utf-8').read())
    open(path, 'w', encoding='utf-8').write(src)
    r = subprocess.run(['node', '--check', path], capture_output=True)
    if r.returncode != 0:
        open(path, 'w', encoding='utf-8').write(open(path + '.bak', encoding='utf-8').read())
        print(f'[롤백] {os.path.basename(path)} — node --check 실패')
        return 0
    os.remove(path + '.bak')
    return len(dict.fromkeys(decls))

def build():
    subprocess.run(['python3', os.path.join(ROOT, 'build.py')], capture_output=True)
    return os.path.getsize(BUNDLE)

target = int(sys.argv[1]) if len(sys.argv) > 1 else 262050
prev = build()
for r in range(8):
    if prev <= target:
        break
    print(f'--- 라운드 {r + 1} (현재 {prev}B) ---')
    total = 0
    for fn in FILES:
        n = mine_file(os.path.join(ROOT, 'js', fn))
        if n:
            print(f'[mine] {fn}: 상수 {n}개')
        total += n
    if not total:
        print('[중단] 후보 소진')
        break
    prev = build()
    print(f'[build] {prev}B (목표 {target})')
print(f'[완료] {prev}B')
