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
}

export interface FishingSession {
  active: boolean
  startedAt: string | null
  points: { lat: number; lng: number; t: string }[]
}

export interface FishingDay {
  id: string
  date: string
  title: string
  participants: UserId[]
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
