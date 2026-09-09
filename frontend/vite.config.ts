import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Capacitor: 네이티브 빌드 시 상대 경로 필요
  base: process.env.CAPACITOR_BUILD ? './' : '/',
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
        target: process.env.VITE_API_BASE_URL || 'http://backend:8000',
        changeOrigin: true,
      },
    },
  },
})
