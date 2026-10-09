export type UserId = 'olli' | 'matti' | 'jussi'

export type Screen =
  | 'login'
  | 'home'
  | 'catch'
  | 'catches'
  | 'calendar'
  | 'settings'
  | 'map'

export interface User {
  id: UserId
  name: string
  initials: string
}

export interface Species {
  id: string
  name: string
}

export interface CatchRecord {
  id: string
  userId: UserId
  speciesId: string
  lat: number
  lng: number
  createdAt: string
  lengthCm?: number
  note?: string
  weather: WeatherSnapshot
}

export interface WeatherSnapshot {
  tempC: number
  windMs: number
  windDir: string
  pressureHpa: number
  waterTempC?: number
  /** SYKE / ympäristö.fi -havaintopaikka */
  waterTempStation?: string
  waterTempDistanceKm?: number
  waterTempObservedAt?: string
}

export interface RoutePoint {
  lat: number
  lng: number
  t: string
  userId?: UserId | string
}

export interface FishingSession {
  id?: string | null
  active: boolean
  startedAt: string | null
  points: RoutePoint[]
  startedBy?: UserId | string | null
  participants?: (UserId | string)[]
}

export interface FishingDay {
  id: string
  date: string
  title: string
  participants: UserId[]
  /** Näytä reitti kartalla */
  mapVisible?: boolean
  /** Tallennettu GPS-reitti */
  routePoints?: RoutePoint[]
}

export interface AppState {
  currentUserId: UserId | null
  undesiredSpecies: Record<UserId, string[]>
  customSpecies: Species[]
  catches: CatchRecord[]
  session: FishingSession
  fishingDays: FishingDay[]
  waterPromptDismissedToday: number
}
