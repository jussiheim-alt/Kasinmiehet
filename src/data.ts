import type { CatchRecord, FishingDay, Species, User, WeatherSnapshot } from './types'

export const USERS: User[] = [
  { id: 'olli', name: 'Olli', initials: 'O' },
  { id: 'matti', name: 'Matti', initials: 'M' },
  { id: 'jussi', name: 'Jussi', initials: 'J' },
]

export const SEED_SPECIES: Species[] = [
  { id: 'jarvilohi', name: 'Järvilohi' },
  { id: 'merilohi', name: 'Merilohi' },
  { id: 'jarvitaimen', name: 'Järvitaimen' },
  { id: 'kuha', name: 'Kuha' },
  { id: 'hauki', name: 'Hauki' },
  { id: 'ahven', name: 'Ahven' },
]

export const DEMO_WEATHER: WeatherSnapshot = {
  tempC: 11,
  windMs: 4.2,
  windDir: 'SW',
  pressureHpa: 1013,
  waterTempC: 8.5,
}

export const DEMO_CATCHES: CatchRecord[] = [
  {
    id: 'c1',
    userId: 'olli',
    speciesId: 'merilohi',
    lat: 60.214,
    lng: 25.032,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    lengthCm: 78,
    note: 'Uistelua, hopeinen lippa',
    weather: { ...DEMO_WEATHER, tempC: 9, windMs: 5.1 },
  },
  {
    id: 'c2',
    userId: 'matti',
    speciesId: 'hauki',
    lat: 60.218,
    lng: 25.041,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
    lengthCm: 62,
    weather: { ...DEMO_WEATHER, tempC: 12, waterTempC: 9 },
  },
  {
    id: 'c3',
    userId: 'jussi',
    speciesId: 'kuha',
    lat: 60.209,
    lng: 25.028,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 80).toISOString(),
    lengthCm: 54,
    weather: DEMO_WEATHER,
  },
]

export const DEMO_DAYS: FishingDay[] = [
  {
    id: 'd1',
    date: new Date(Date.now() + 1000 * 60 * 60 * 36).toISOString().slice(0, 10),
    title: 'Aamulähtö',
    participants: ['olli', 'matti', 'jussi'],
  },
  {
    id: 'd2',
    date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5).toISOString().slice(0, 10),
    title: 'Ilta-uistelu',
    participants: ['olli', 'jussi'],
  },
]

export function formatWhen(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('fi-FI', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDuration(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime()
  const m = Math.floor(ms / 60000)
  const h = Math.floor(m / 60)
  const mins = m % 60
  return h > 0 ? `${h} t ${mins} min` : `${mins} min`
}
