import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dojang.once',
  appName: '도장 한 번',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
