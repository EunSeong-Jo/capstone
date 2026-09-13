import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.swappy.app',
  appName: 'swappy',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
