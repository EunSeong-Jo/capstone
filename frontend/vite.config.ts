import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // vite.config은 .env를 자동으로 읽지 않습니다. Vite가 .env에 넣어주는 것은
  // 클라이언트 코드의 import.meta.env뿐이고, 여기의 process.env는 셸에서 온
  // 값만 들고 있습니다. 그래서 프록시 대상을 .env.local에 적어두려면
  // loadEnv로 직접 읽어와야 합니다.
  //
  // 세 번째 인자 ''는 접두사 필터를 끄는 것으로, VITE_ 없는 이름도 읽힙니다.
  const env = loadEnv(mode, process.cwd(), '')

  // 기본값이 Docker Compose 서비스 이름이라 컨테이너 밖에서는 해석되지
  // 않습니다(getaddrinfo ENOTFOUND backend). 로컬에서 백엔드를 직접 띄웠다면
  // frontend/.env.local에 한 줄 적으세요:
  //   VITE_API_BASE_URL=http://localhost:8000
  const apiTarget = env.API_PROXY_TARGET || env.VITE_API_BASE_URL || 'http://backend:8000'

  return {
    plugins: [react()],
    // Capacitor: 네이티브 빌드 시 상대 경로 필요
    base: env.CAPACITOR_BUILD ? './' : '/',
    build: {
      outDir: 'dist',
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      // Docker(Windows 호스트 bind mount) 환경에서 파일시스템 이벤트가
      // 컨테이너로 전달되지 않아 HMR이 감지 못 하는 문제 방지.
      watch: {
        usePolling: true,
        interval: 300,
      },
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
