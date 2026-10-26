#!/usr/bin/env python3
"""build.py — mirimiso-webapp 소스를 단일 파일 번들로 빌드
   사용: python3 build.py  →  /home/user/미리미소-웹앱.html 생성
   - JS는 terser로 minify (2026-10-15: 프리뷰 뷰어의 대용량 전송 경계 문제 회피 — 352KiB 경계에서
     스크립트가 깨져 소스가 텍스트로 노출되는 사고 D57). terser 미설치 시 원본으로 폴백.
   - 먼저 npm install (mirimiso-webapp/)로 terser 확보 필요 — node_modules는 세션 스냅샷 제외 대상"""
import os, re, subprocess

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(ROOT), "미리미소-웹앱.html")

html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()

def minify_js(src, path):
    """terser로 minify. 실패 시 원본 반환(빌드 중단 없음)."""
    
UNIT_POOL = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

def mine_unit(unit):
    import re as _re
    def segments(src):
        out, i = [], 0
        while i < len(src):
            if src[i] == "'":
                j = i + 1
                while j < len(src):
                    if src[j] == '\\': j += 2; continue
                    if src[j] == "'": break
                    j += 1
                out.append((i, j + 1)); i = j + 1
            else: i += 1
        return out
    def is_key(src, end):
        k = end
        while k < len(src) and src[k] in ' \t': k += 1
        return k < len(src) and src[k] == ':'
    for _round in range(6):
        segs = segments(unit)
        texts = [unit[a + 1:b - 1] for (a, b) in segs if not is_key(unit, b)]
        joined = '\x00'.join(texts)
        cands = {}
        for L in range(10, 81):
            seen = set()
            for pos in range(len(joined) - L):
                c = joined[pos:pos + L]
                if c in seen or '\x00' in c or "'" in c or '\\' in c or '\n' in c: continue
                seen.add(c)
                if _re.fullmatch(r'[a-zA-Z_$][a-zA-Z0-9_$]*', c): continue
                cnt = joined.count(c)
                if cnt >= 2 and cnt * (L - 7) - (L + 12) > 0: cands[c] = cnt * (L - 7) - (L + 12)
        if not cands: break
        chosen = []
        for c, sc in sorted(cands.items(), key=lambda x: -x[1]):
            if any(c in t or t in c for t in chosen): continue
            chosen.append(c)
            if len(chosen) >= 120: break
        existing = set(_re.findall(r'\b[ZY][0-9A-Za-z]\b', unit))
        free = [p for p in UNIT_POOL if ('Z' + p) not in existing and ('Y' + p) not in existing]
        chosen = chosen[:len(free)]
        if not chosen: break
        names = {c: 'Z' + free[i] for i, c in enumerate(chosen)}
        def repl(tok, unsafe_prefix):
            parts = [('t', tok[1:-1])]
            for c in chosen:
                if not any(k == 't' and c in v for k, v in parts): continue
                res = []
                for kind, val in parts:
                    if kind == 'n': res.append((kind, val)); continue
                    i = 0
                    while True:
                        k = val.find(c, i)
                        if k < 0: res.append(('t', val[i:])); break
                        if k > i: res.append(('t', val[i:k]))
                        if k == 0 and unsafe_prefix:
                            res.append(('t', val[0:len(c)])); i = len(c); continue
                        res.append(('n', names[c])); i = k + len(c)
                parts = res
            seg = []
            for kind, val in parts:
                if kind == 'n': seg.append(val)
                elif val != '': seg.append("'" + val + "'")
            return '+'.join(seg) if seg else "''"
        new_src, last = [], 0
        for (a, b) in segs:
            if is_key(unit, b): continue
            unsafe = a > 0 and unit[a - 1] in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$'
            new_src.append((a, b, repl(unit[a:b], unsafe)))
        for (a, b, tok) in sorted(new_src, key=lambda x: -x[0]):
            unit = unit[:a] + tok + unit[b:]
        decl = 'var ' + ','.join(names[c] + "='" + c + "'" for c in dict.fromkeys(chosen)) + ';'
        unit = decl + '\n' + unit
        _lit = set()
        _i2, _n2 = 0, len(unit)
        while _i2 < _n2:
            _ch = unit[_i2]
            if _ch in '\'"`':
                _j2 = _i2 + 1
                while _j2 < _n2:
                    if unit[_j2] == '\\':
                        _j2 += 2
                        continue
                    if unit[_j2] == _ch:
                        break
                    _j2 += 1
                _lit.update(range(_i2, min(_j2 + 1, _n2)))
                _i2 = _j2 + 1
            else:
                _i2 += 1
        for nm in names.values():
            for _m in re.finditer(re.escape(nm), unit):
                _j = _m.start()
                if _j in _lit:
                    continue
                if _j > 0 and unit[_j - 1] in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$':
                    raise SystemExit('마이닝 토큰 융합 — 중단: ' + nm + ' · 컨텍스트: ' + unit[max(0, _j - 90):_j + 20])
    return unit

    bin_ = os.path.join(ROOT, "node_modules", ".bin", "terser")
    if not os.path.exists(bin_):
        print("  [warn] terser 없음 — 원본 유지 (npm install 필요):", os.path.basename(path))
        return src
    try:
        r = subprocess.run([bin_, path, "-c", "drop_console=true", "-m"], capture_output=True, timeout=60)
        if r.returncode != 0 or not r.stdout:
            print("  [warn] terser 실패 — 원본 유지:", r.stderr.decode()[:120])
            return src
        return r.stdout.decode("utf-8")
    except Exception as e:
        print("  [warn] terser 예외 — 원본 유지:", e)
        return src

def minify_css(css):
    """보수적 CSS 경량화 — 문자열 리터럴 보호(앱 CSS에 quoted content/data URI 없음을 전제로 확인 후 사용)."""
    if "data:" in css:
        return css
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    css = re.sub(r"\s+", " ", css)
    css = re.sub(r"\s*([{};:,>])\s*", r"\1", css)
    css = re.sub(r"#([0-9a-fA-F])~1([0-9a-fA-F])~2([0-9a-fA-F])~3".replace("~1", r"\1").replace("~2", r"\2").replace("~3", r"\3"), r"#\1\2\3", css)
    css = re.sub(r"([\s:,])0px", r"\g<1>0", css)
    return css.replace(";}", "}").strip()

def minify_html(h):
    """보수적 HTML 압축 — 행 선행 공백·빈 행 제거(태그 내용 불변)."""
    h = re.sub(r"\n[ \t]+", "\n", h)
    h = re.sub(r"\n{2,}", "\n", h)
    h = re.sub(r"<!--.*?-->", "", h, flags=re.S)
    return h

def inline_css(m):
    path = os.path.join(ROOT, m.group(1))
    return "<style>\n" + minify_css(open(path, encoding="utf-8").read()) + "\n</style>"

JS_FILES = []

def inline_js(m):
    JS_FILES.append(os.path.join(ROOT, m.group(1)))
    return "@@JSBLOCK@@"

html = minify_html(html)
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_css, html)
html = re.sub(r'<script src="([^"]+)"></script>', inline_js, html)

assert JS_FILES, "js 없음"
unit = ("\n;\n".join(open(p, encoding="utf-8").read() for p in JS_FILES))
unit = mine_unit(unit)
open("/tmp/unit_check.js", "w", encoding="utf-8").write(unit)
_check = subprocess.run(["node", "--check", "/tmp/unit_check.js"], capture_output=True)
if _check.returncode != 0:
    raise SystemExit("유닛 마이닝 후 문법 파손 — 중단: " + _check.stderr.decode()[:200])
bin2 = os.path.join(ROOT, "node_modules", ".bin", "terser")
r = subprocess.run([bin2, "/dev/stdin", "-c", "drop_console=true", "-m"],
                   input=unit.encode(), capture_output=True, timeout=180)
assert r.returncode == 0 and r.stdout, "terser 단일 유닛 실패: " + (r.stderr or b"").decode()[:200]
html = html.replace("@@JSBLOCK@@", "<script>\n" + r.stdout.decode("utf-8") + "\n</script>", 1).replace("@@JSBLOCK@@", "")
assert not re.search(r'<script\s+src=', html), "inlining 실패: script src 남음"
assert not re.search(r'<link\s+rel="stylesheet"', html), "inlining 실패: stylesheet link 남음"
open(OUT, "w", encoding="utf-8").write(html)
print("built:", OUT, f"{os.path.getsize(OUT)/1024:.0f} KB")
