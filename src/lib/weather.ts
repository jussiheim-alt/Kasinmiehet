import type { WeatherSnapshot } from '../types'
import { DEMO_WEATHER } from '../data'
import { apiUrl } from './api'

const WIND_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

function degToDir(deg: number): string {
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8
  return WIND_DIRS[i]
}

async function fetchSykeWaterTemp(
  lat: number,
  lng: number,
): Promise<Pick<
  WeatherSnapshot,
  'waterTempC' | 'waterTempStation' | 'waterTempDistanceKm' | 'waterTempObservedAt'
>> {
  try {
    const res = await fetch(
      apiUrl(
        `/api/water-temp?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
      ),
    )
    if (!res.ok) return {}
    const data = (await res.json()) as {
      waterTempC?: number | null
      stationName?: string
      distanceKm?: number
      observedAt?: string
    }
    if (data.waterTempC == null || !Number.isFinite(Number(data.waterTempC))) {
      return {}
    }
    return {
      waterTempC: Number(data.waterTempC),
      waterTempStation: data.stationName,
      waterTempDistanceKm: data.distanceKm,
      waterTempObservedAt: data.observedAt,
    }
  } catch {
    return {}
  }
}

export async function fetchWeather(
  lat: number,
  lng: number,
): Promise<WeatherSnapshot> {
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lng))
    url.searchParams.set(
      'current',
      'temperature_2m,wind_speed_10m,wind_direction_10m,surface_pressure',
    )
    url.searchParams.set('wind_speed_unit', 'ms')

    const [airRes, water] = await Promise.all([
      fetch(url.toString()),
      fetchSykeWaterTemp(lat, lng),
    ])
    if (!airRes.ok) throw new Error(`weather ${airRes.status}`)
    const data = (await airRes.json()) as {
      current?: {
        temperature_2m?: number
        wind_speed_10m?: number
        wind_direction_10m?: number
        surface_pressure?: number
      }
    }
    const c = data.current
    if (!c) throw new Error('no current weather')

    return {
      tempC: Math.round((c.temperature_2m ?? DEMO_WEATHER.tempC) * 10) / 10,
      windMs: Math.round((c.wind_speed_10m ?? DEMO_WEATHER.windMs) * 10) / 10,
      windDir: degToDir(c.wind_direction_10m ?? 225),
      pressureHpa: Math.round(c.surface_pressure ?? DEMO_WEATHER.pressureHpa),
      ...water,
    }
  } catch {
    const water = await fetchSykeWaterTemp(lat, lng)
    return { ...DEMO_WEATHER, ...water }
  }
}
