#!/usr/bin/env bash
# 미리미소 데모 원클릭 리셋 — 서버 케이스·로그 초기화 (S14)
# 사용: bash scripts/reset-demo.sh [베이스URL]   (기본 http://localhost:8080)
BASE="${1:-http://localhost:8080}"
R=$(curl -s -X POST "$BASE/api/reset")
if echo "$R" | grep -q '"ok":true'; then
  echo "✓ 서버 초기화 완료 — $R"
else
  echo "✗ 서버 응답: $R (목서버가 실행 중인지 확인: node server/server.js)"
  exit 1
fi
echo "브라우저 팁: 시크릿 모드로 열면 localStorage(스캔 크레딧 등)도 초기 상태로 시작합니다."
