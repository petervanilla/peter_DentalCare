#!/usr/bin/env python3
"""build_preview.py — 미리미소-웹앱.html을 품은 자가 추출형 프리뷰 빌드 생성
   배경(D161): 파일 뷰어 프리뷰의 전송 경계로 ~261KB 원본이 잘려 소스가 텍스트 노출 (D57 재발 관찰)
   → 원본을 gzip→base64로 품은 ~100KB 러너가 브라우저에서 스스로 풀아 렌더 (DecompressionStream·오프라인 무관)
   - 공식 전달물은 미리미소-웹앱.html(단일 파일·256KiB 이하) 그대로 유지 — 본 파일은 테스트용 프리뷰 자산
   사용: python3 build_preview.py  →  /home/user/미리미소-프리뷰.html 생성"""
import base64, gzip, os

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(ROOT), "미리미소-웹앱.html")
OUT = os.path.join(os.path.dirname(ROOT), "미리미소-프리뷰.html")

html = open(SRC, encoding="utf-8").read()
gz = gzip.compress(html.encode("utf-8"), 9)
b64 = base64.b64encode(gz).decode("ascii")

loader = """<!doctype html>
<html lang=ko>
<head>
<meta charset=utf-8>
<meta name="viewport" content="width=device-width">
<title>미리미소 (프리뷰)</title>
<style>body{margin:0}#mmBoot{font:14px/1.7 sans-serif;padding:36px;max-width:520px}</style>
</head>
<body>
<div id=mmBoot>미리미소 프리뷰 추출 중</div>
<script>
(function(){var boot=function(m){var e=document.getElementById('mmBoot');if(e)e.textContent=m;};try{if(typeof DecompressionStream==='undefined'){boot('자가 추출 미지원 브라우저입니다 — 공식 파일(미리미소-웹앱.html)을 열어주세요.');return;}var B64 = "@@PAYLOAD@@";var bin=atob(B64),u=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text().then(function(h){document.open('text/html','replace');document.write(h);document.close();}).catch(function(e){boot('프리뷰 추출 실패 — '+(e&&e.message||e));});}catch(e){boot('프리뷰 추출 실패 — '+(e&&e.message||e));}})();
</script>
</body>
</html>
"""

out = loader.replace("@@PAYLOAD@@", b64)
open(OUT, "w", encoding="utf-8").write(out)
print("built:", OUT, f"{os.path.getsize(OUT)/1024:.0f} KB (원본 {len(html.encode())//1024} KB · gzip+base64 {len(b64)//1024} KB)")
