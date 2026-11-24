#!/usr/bin/env bash
# 빌드 결과물을 GitHub Releases(태그 assets)에 올린다. 같은 이름이 있으면 바꿔 끼운다(--clobber).
# 저장소에 바이너리를 커밋하지 않기 위한 것이다 — APK·단독 실행 묶음이 기록에 쌓여 저장소가 수백 MB씩 불었다.
#
#   tools/ops/upload_release_assets.sh frontend/android/app/build/outputs/apk/debug/app-debug.apk=swappy.apk
#   tools/ops/upload_release_assets.sh tools/standalone/web.zip tools/standalone/*.dump
#
# 인자는 "파일" 또는 "파일=올릴이름". 올릴 이름이 곧 내려받기 주소의 끝이다:
#   https://github.com/EunSeong-Jo/capstone/releases/download/assets/<이름>
#   - swappy.apk          로그인 화면 '앱 설치하기'(서버 /swappy.apk가 이리로 넘긴다)
#   - web.zip · *.dump    Swappy.bat(tools/standalone/start.ps1)이 처음 실행할 때 받는다
# Release는 공개다. 올리기 전에 실제 사용자 데이터가 없는지 확인한다(make_dump.sh가 사용자 테이블 행을 뺀다).
set -euo pipefail
cd "$(dirname "$0")/../.."

TAG=assets
[ $# -gt 0 ] || { sed -n '2,12p' "$0"; exit 1; }
command -v gh >/dev/null || { echo "gh(GitHub CLI)가 필요합니다: https://cli.github.com" >&2; exit 1; }

if ! gh release view "$TAG" >/dev/null 2>&1; then
  echo "▶ Release '$TAG'를 만든다"
  gh release create "$TAG" --title "앱·데모 데이터 (assets)" --latest=false --notes \
"빌드 결과물을 저장소 대신 여기에 둡니다. 파일은 같은 이름으로 바꿔 끼우므로 주소가 바뀌지 않습니다.

- \`swappy.apk\` — 안드로이드 앱 (로그인 화면 '앱 설치하기')
- \`web.zip\` · \`catalog.dump\` · \`reviews.dump\` · \`demo_analysis.dump\` — Windows 단독 실행(\`Swappy.bat\`)용 화면·데모 데이터

올리는 방법: \`tools/ops/upload_release_assets.sh\`"
fi

STAGE=$(mktemp -d); trap 'rm -rf "$STAGE"' EXIT
files=()
for arg in "$@"; do
  src="${arg%%=*}"; name="${arg#*=}"; [ "$arg" = "$src" ] && name=$(basename "$src")
  [ -f "$src" ] || { echo "파일이 없습니다: $src" >&2; exit 1; }
  ln -s "$(realpath "$src")" "$STAGE/$name"
  files+=("$STAGE/$name")
  awk -v n="$name" -v b="$(stat -c %s "$src")" -v s="$src" 'BEGIN{printf "  %-22s %6.1f MB  ← %s\n", n, b/1048576, s}'
done
gh release upload "$TAG" "${files[@]}" --clobber
echo "✔ 올렸습니다: $(gh release view "$TAG" --json url -q .url)"
