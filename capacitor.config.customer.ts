import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.carrycub.customer',
  appName: 'CarryCub',
  webDir: 'www',
  server: {
    url: 'https://carrycub-booking-fb.rock-aman3.workers.dev/',
    cleartext: false
  },
  android: {
    path: 'android-customer'
  }
};

export default config;
