#!/usr/bin/env bash
# 미리미소 백업 — 영속 모드 목서버에서 실행 (S21 · ADR-006)
# 사용: bash scripts/backup.sh [베이스URL]   (기본 http://localhost:8080)
# 전제: 서버가 MM_DB=... 영속 모드로 실행 중이어야 합니다 (데모 메모리 모드는 백업 대상 없음)
BASE="${1:-http://localhost:8080}"
CODE="${2:-}"   # 인증 모드(MM_AUTH=1)일 때 clinic 초대코드 입력
JAR=$(mktemp)
if [ -n "$CODE" ]; then
  curl -s -m 30 -c "$JAR" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d "{\"code\":\"$CODE\"}" > /dev/null
fi
R=$(curl -s -m 60 -b "$JAR" -X POST "$BASE/api/maintenance/backup")
if echo "$R" | grep -q '"ok":true'; then
  echo "✓ 백업 완료 — $R"
  echo "보존 정책: 최근 7개 (서버가 자동 정리) · 복원 절차는 미리미소-배포런북.md §5 참조"
else
  echo "✗ 백업 실패 — $R"
  echo "확인: 서버가 MM_DB=... 영속 모드인지, 인증 모드면 clinic 초대코드를 두 번째 인수로 전달했는지"
  exit 1
fi
