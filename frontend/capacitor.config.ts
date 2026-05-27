import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.daechemuya.app',
  appName: '대체뭐야',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
