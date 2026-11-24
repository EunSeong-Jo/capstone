#!/usr/bin/env bash
# 로컬 단독 실행용 화면 묶음(tools/standalone/web.zip)을 만든다. Node 없이 실행하려고 빌드 결과를 묶어 둔다.
# 화면(frontend/src)이 바뀌면 이 스크립트를 다시 돌리고 GitHub Releases에 올린다(저장소에는 커밋하지 않는다):
#   tools/ops/upload_release_assets.sh tools/standalone/web.zip
#
#   tools/standalone/make_web.sh
#
# API 주소는 빈 값(같은 주소의 /api) — 운영 이미지(Dockerfile.prod)와 같다. 내려받기용 swappy.apk 는 앱 안에 한 번 더 들어가지 않게 뺀다.
set -euo pipefail
cd "$(dirname "$0")/../../frontend"
echo "▶ 화면 빌드"
VITE_API_BASE_URL="" npm run build >/dev/null
rm -f dist/swappy.apk
mkdir -p ../tools/standalone
python3 - <<'PY'
import os, zipfile
out = '../tools/standalone/web.zip'
if os.path.exists(out):
    os.remove(out)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for root, _, files in os.walk('dist'):
        for f in sorted(files):
            p = os.path.join(root, f)
            z.write(p, os.path.relpath(p, 'dist'))
print('✔', out, round(os.path.getsize(out) / 1e6, 1), 'MB')
PY
echo "  올리기: tools/ops/upload_release_assets.sh tools/standalone/web.zip"
