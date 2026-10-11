import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'fi.kasinmiehet.app',
  appName: 'Kasinmiehet',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    Geolocation: {
      // Permissions requested at runtime by plugins
    },
  },
  android: {
    allowMixedContent: false,
  },
}

export default config
