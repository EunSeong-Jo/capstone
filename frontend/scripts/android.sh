#!/usr/bin/env bash
# 안드로이드 디버그 APK 빌드·설치 도우미. 사용법은 `scripts/android.sh help` 또는 README '안드로이드 디버그 APK' 절.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=android-env.sh
source scripts/android-env.sh

APK=android/app/build/outputs/apk/debug/app-debug.apk
APP_ID=com.swappy.app

die() { echo "오류: $*" >&2; exit 1; }

need_url() {
  [ -n "${1:-}" ] || die "서버 주소가 필요합니다. 예) scripts/android.sh debug https://swappy.example.com"
  case "$1" in https://*|http://*) ;; *) die "서버 주소는 http(s)://로 시작해야 합니다: $1" ;; esac
}

# 웹 번들을 만들고 안드로이드 프로젝트에 복사한다. base는 '/'(CAPACITOR_BUILD를 쓰지 않는다):
# 웹뷰가 https://localhost/ 를 루트로 서빙하고 faceCheck.ts가 /mediapipe/... 절대 경로를 쓴다.
build_web() {
  echo "▶ 웹 빌드 (서버: $1)"
  VITE_API_BASE_URL="$1" npm run build
  npx cap sync android
}

build_apk() {
  echo "▶ Gradle assembleDebug (처음에는 의존성을 받느라 10~20분 걸릴 수 있습니다)"
  (cd android && ./gradlew assembleDebug)
  [ -f "$APK" ] || die "APK가 만들어지지 않았습니다: $APK"
  echo "✔ $APK ($(du -h "$APK" | cut -f1))"
}

devices() {
  [ -x "$ADB" ] || die "adb.exe를 찾지 못했습니다: $ADB (ADB 환경 변수로 지정하세요)"
  "$ADB" devices -l | tr -d '\r'
}

need_device() {
  local n
  n=$("$ADB" devices | tr -d '\r' | awk 'NR>1 && $2=="device"' | wc -l)
  [ "$n" -ge 1 ] || die "연결된 기기가 없습니다. USB 디버깅을 켜고 연결을 허용했는지 확인하세요. (scripts/android.sh devices)"
}

install_apk() {
  need_device
  [ -f "$APK" ] || die "APK가 없습니다. 먼저 debug를 실행하세요."
  # Windows adb가 WSL 경로(UNC)를 못 읽는 경우가 있어, 안 되면 Windows 쪽 임시 폴더로 복사해 설치한다.
  local win
  win=$(wslpath -w "$(realpath "$APK")")
  if ! "$ADB" install -r "$win" 2>&1 | tr -d '\r' | tee /dev/stderr | grep -q Success; then
    local tmp="/mnt/c/Users/$USER/swappy-debug.apk"
    cp "$APK" "$tmp"
    "$ADB" install -r "$(wslpath -w "$tmp")" 2>&1 | tr -d '\r' | grep -q Success || die "설치에 실패했습니다."
  fi
  echo "✔ 설치 완료"
}

launch() {
  "$ADB" shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 && echo "✔ 앱 실행"
}

case "${1:-help}" in
  devices) devices ;;
  build)   need_url "${2:-}"; build_web "$2" ;;
  debug)   need_url "${2:-}"; build_web "$2"; build_apk ;;
  install) install_apk; launch ;;
  # 내 PC의 로컬 서버를 폰에서 쓴다: 폰의 localhost:8000을 USB 너머 PC의 8000으로 이어 주고(adb reverse),
  # 디버그 전용으로 혼합 콘텐츠(CAP_LOCAL=1)·평문 통신(src/debug 매니페스트)을 허용한다.
  local)
    need_device
    "$ADB" reverse tcp:8000 tcp:8000 >/dev/null
    export CAP_LOCAL=1
    build_web "http://localhost:8000"; build_apk; install_apk; launch ;;
  help|*)
    cat <<USAGE
사용법: scripts/android.sh <명령> [서버주소]

  devices            연결된 폰 목록
  build  <주소>      웹 번들만 만들고 android/에 복사
  debug  <주소>      웹 빌드 + 디버그 APK 생성 ($APK)
  install            만든 APK를 폰에 설치하고 실행
  local              로컬 서버(PC의 :8000)로 빌드·설치·실행 — adb reverse + 디버그 전용 평문 허용

예) scripts/android.sh debug https://swappy.1r9x85xv4q310.ap-northeast-2.cs.amazonlightsail.com
USAGE
    ;;
esac
