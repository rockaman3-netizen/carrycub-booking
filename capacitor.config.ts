import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.carrycub.driver',
  appName: 'Captain',
  webDir: 'public',
  server: {
    url: 'https://carrycub-booking.rock-aman3.workers.dev/driver/login',
    cleartext: false
  },
  plugins: {
    BackgroundGeolocation: {
      locationAuthorizationRequest: 'Always',
      backgroundPermissionRationale: {
        title: 'Allow CarryCub to access location in background?',
        message: 'CarryCub collects location data to track deliveries even when the app is closed or not in use.',
        positiveAction: 'Allow',
        negativeAction: 'Cancel'
      },
      notification: {
        title: 'CarryCub is tracking your location',
        text: 'Tap to open CarryCub driver app'
      },
      desiredAccuracy: 0,
      distanceFilter: 10,
      stopOnTerminate: false,
      startOnBoot: true,
      foregroundService: true,
      debug: false,
      stopTimeout: 5
    }
  }
};

export default config;
