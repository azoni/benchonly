import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.benchonly.app',
  appName: 'Bench Only',
  webDir: 'dist',
  
  server: {
    // Allow all connections to your API
    allowNavigation: [
      'benchpressonly.com',
      '*.firebaseapp.com',
      '*.googleapis.com',
      'cloud.ouraring.com',
    ],
  },

  ios: {
    scheme: 'Bench Only',
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    backgroundColor: '#0a0a0a',
  },

  android: {
    backgroundColor: '#0a0a0a',
    allowMixedContent: false,
  },

  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: '#0a0a0a',
      showSpinner: false,
      splashImmersive: true,
      splashFullScreen: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0a',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
