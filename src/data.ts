import type { Species, User, WeatherSnapshot } from './types'

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
  waterTempC: undefined,
}

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
