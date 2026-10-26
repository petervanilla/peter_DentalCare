#!/usr/bin/env python3
"""mine.py — 문자열 리터럴 n-gram 상수 마이닝 (런타임 불변 — 소스만 경량화)
   사용: python3 mine.py <목표바이트>  (번들 크기가 목표 이하가 될 때까지 라운드 반복)"""
import os, re, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
FILES = ['views.js', 'casehub.js', 'app.js', 'data.js', 'formats.js', 'analysis.js', 'dental3d.js']
POOL = [c for c in '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz']
MIN_LEN, MAX_LEN = 7, 42

def segments(src):
    """문자열 리터럴 토큰 분리 → [(start, end, quote_open, content, quote_close)]"""
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
            out.append((i, j + 1, src[i:j + 1]))  # 전체 리터럴 토큰
            i = j + 1
        else:
            i += 1
    return out

def is_key_lit(src, end):
    k = end
    while k < len(src) and src[k] in ' \t':
        k += 1
    return k < len(src) and src[k] == ':'

def mine_round(target):
    for fn in FILES:
        p = os.path.join(ROOT, 'js', fn)
        src = open(p, encoding='utf-8').read()
        segs = segments(src)
        # 후보 수집: 리터럴 내용만 대상 (키 위치 리터럴 제외)
        texts = []
        for (a, b, tok) in segs:
            if is_key_lit(src, b):
                continue
            texts.append(tok[1:-1])
        joined = '\x00'.join(texts)
        cands = {}
        for L in range(MIN_LEN, MAX_LEN + 1):
            seen = set()
            for pos in range(len(joined) - L):
                c = joined[pos:pos + L]
                if c in seen or '\x00' in c or "'" in c or '\\' in c or '\n' in c:
                    continue
                seen.add(c)
                if not re.search(r'[<>="#;:]', c) and not re.search(r'[^\x00-\x7f]', c):
                    continue  # 식별자 오염 방지: 마크업/한글 포함만
                cnt = joined.count(c)
                if cnt < 2:
                    continue
                score = cnt * (L - 7) - (L + 12)
                if score > 0:
                    cands[c] = score
        if not cands:
            continue
        # 탐욕 선택 (중첩 금지)
        chosen = []
        for c, sc in sorted(cands.items(), key=lambda x: -x[1]):
            if any(c in s or s in c for s in chosen):
                continue
            chosen.append(c)
            if len(chosen) >= 64:
                break
        # 치환 적용 (경계 인지 glue)
        decls = {}
        def name_for(c):
            if c not in decls:
                decls[c] = 'Z' + POOL[len(decls)]
            return decls[c]
        def repl_tok(tok):
            content = tok[1:-1]
            changed = False
            for c in sorted(chosen, key=len, reverse=True):
                if c not in content:
                    continue
                nm = name_for(c)
                out, i = '', 0
                while True:
                    k = content.find(c, i)
                    if k < 0:
                        out += content[i:]
                        break
                    if k == 0 and k + len(c) == len(content):
                        out += "'" + nm  # 전체 — 코드로
                    elif k == 0:
                        out += nm + "+'" + c  # 선두
                    elif k + len(c) == len(content):
                        out += c + "+'" + nm
                    else:
                        out += c + "'+" + nm + "+'"
                    i = k + len(c)
                content = out
                changed = True
            return content
        new_src_parts, last = [], 0
        for (a, b, tok) in segs:
            if is_key_lit(src, b):
                continue
            new_src_parts.append((a, b, repl_tok(tok)))
        for (a, b, newtok) in sorted(new_src_parts, reverse=True):
            src = src[:a] + newtok + src[b:]
        if decls:
            decl_txt = 'var ' + ', '.join("'" + c + "'===" .replace('===', '') + '' for c in [])
            decl_txt = 'var ' + ','.join(nm + "='" + c.replace("'", "\\'") + "'" for c, nm in decls.items()) + ';'
            anchor = src.find('(function')
            nl = src.find('\n', anchor)
            src = src[:nl + 1] + '  ' + decl_txt + '\n' + src[nl + 1:]
        open(p, 'w', encoding='utf-8').write(src)
        print(f'[mine] {fn}: 상수 {len(decls)}개')
    # 재빌드
    subprocess.run(['python3', os.path.join(ROOT, 'build.py')], capture_output=True)
    size = os.path.getsize('/home/user/미리미소-웹앱.html')
    print(f'[build] {size}B (목표 {target})')
    return size

target = int(sys.argv[1]) if len(sys.argv) > 1 else 262050
for r in range(8):
    size = os.path.getsize('/home/user/미리미소-웹앱.html')
    if size <= target:
        print(f'[done] {size}B ≤ {target}')
        break
    print(f'--- 라운드 {r + 1} ---')
    size = mine_round(target)
