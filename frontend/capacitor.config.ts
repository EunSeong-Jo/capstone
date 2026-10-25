import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 안드로이드 앱 설정. 빌드 절차는 README의 '안드로이드 디버그 APK' 절.
 *
 * `CAP_LOCAL=1`은 **디버그 빌드에서 내 PC의 로컬 서버(http://localhost:8000)** 를 부를 때만 쓴다. 앱 화면이
 * `https://localhost`라 HTTP 호출은 혼합 콘텐츠로 막히므로 그때만 허용한다. 운영(HTTPS) 서버로 빌드할 때는 켜지 않는다.
 */
const config: CapacitorConfig = {
  appId: 'com.swappy.app',
  appName: 'swappy',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: process.env.CAP_LOCAL === '1',
  },
  plugins: {
    // 안드로이드 15+(targetSdk 35 이상)는 엣지-투-엣지가 강제라 화면이 시스템 바 아래까지 그려진다.
    // `css`는 시스템 바 높이를 --safe-area-inset-* 변수로 주입한다(src/index.css의 --safe-top/--safe-bottom이 읽는다).
    SystemBars: {
      insetsHandling: 'css',
      style: 'DEFAULT',
    },
  },
};

export default config;
