import { Capacitor, registerPlugin } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

export interface GeoPoint {
  lat: number
  lng: number
  t: string
  accuracy?: number
}

interface BackgroundGeolocationPlugin {
  addWatcher(
    options: {
      backgroundMessage?: string
      backgroundTitle?: string
      requestPermissions?: boolean
      stale?: boolean
      distanceFilter?: number
    },
    callback: (
      location?: { latitude: number; longitude: number; accuracy?: number },
      error?: { code: string },
    ) => void,
  ): Promise<string>
  removeWatcher(options: { id: string }): Promise<void>
  openSettings(): Promise<void>
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
  'BackgroundGeolocation',
)

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

export async function getCurrentPosition(): Promise<GeoPoint | null> {
  try {
    if (isNativePlatform()) {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 12000,
      })
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        t: new Date().toISOString(),
      }
    }

    if (!navigator.geolocation) return null
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 5000,
      })
    })
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      t: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

type PointHandler = (point: GeoPoint) => void

let watcherId: string | null = null
let webWatchId: number | null = null

export async function startRouteTracking(onPoint: PointHandler): Promise<{
  ok: boolean
  mode: 'native-background' | 'web' | 'none'
  error?: string
}> {
  await stopRouteTracking()

  if (isNativePlatform()) {
    try {
      watcherId = await BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: 'Kasinmiehet tallentaa kalastusreittiä',
          backgroundTitle: 'Kalastus käynnissä',
          requestPermissions: true,
          stale: false,
          distanceFilter: 25,
        },
        (location, error) => {
          if (error) {
            if (error.code === 'NOT_AUTHORIZED') {
              void BackgroundGeolocation.openSettings()
            }
            return
          }
          if (!location) return
          onPoint({
            lat: location.latitude,
            lng: location.longitude,
            accuracy: location.accuracy,
            t: new Date().toISOString(),
          })
        },
      )
      return { ok: true, mode: 'native-background' }
    } catch (e) {
      return {
        ok: false,
        mode: 'none',
        error: e instanceof Error ? e.message : 'GPS epäonnistui',
      }
    }
  }

  if (!navigator.geolocation) {
    return { ok: false, mode: 'none', error: 'Selain ei tue GPS:ää' }
  }

  webWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      onPoint({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        t: new Date().toISOString(),
      })
    },
    () => {
      /* keep session even if one fix fails */
    },
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
  )

  return { ok: true, mode: 'web' }
}

export async function stopRouteTracking(): Promise<void> {
  if (watcherId) {
    try {
      await BackgroundGeolocation.removeWatcher({ id: watcherId })
    } catch {
      /* ignore */
    }
    watcherId = null
  }
  if (webWatchId != null) {
    navigator.geolocation.clearWatch(webWatchId)
    webWatchId = null
  }
}
