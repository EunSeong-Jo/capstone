# 안드로이드 빌드용 환경 변수. 셸 설정(~/.bashrc)을 건드리지 않으려고 필요할 때만 불러 쓴다:
#
#     source scripts/android-env.sh
#
# JDK·SDK 위치는 아래 기본값(홈 디렉터리)이고, 이미 환경 변수가 있으면 그 값을 존중한다.
# 설치 절차는 frontend/README.md '안드로이드 디버그 APK' 절 참고.
export JAVA_HOME="${JAVA_HOME:-$HOME/tools/jdk-21}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
# Windows의 adb.exe를 WSL에서 부른다. USB로 연결한 폰을 usbipd 없이 쓸 수 있고, 이미 Android Studio가 깔려 있으면 있다.
export ADB="${ADB:-/mnt/c/Users/$USER/AppData/Local/Android/Sdk/platform-tools/adb.exe}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
