import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { DEMO_CATCHES, DEMO_DAYS, DEMO_WEATHER, SEED_SPECIES, USERS } from './data'
import {
  getCurrentPosition,
  looksNearWater,
  startRouteTracking,
  stopRouteTracking,
} from './lib/geo'
import { shareText } from './lib/share'
import { fetchWeather } from './lib/weather'
import type {
  AppState,
  CatchRecord,
  Species,
  UserId,
  WeatherSnapshot,
} from './types'

const STORAGE_KEY = 'kasinmiehet-v1'

function emptyUndesired(): Record<UserId, string[]> {
  return { olli: [], matti: [], jussi: [] }
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as AppState
  } catch {
    /* ignore */
  }
  return {
    currentUserId: null,
    undesiredSpecies: emptyUndesired(),
    customSpecies: [],
    catches: DEMO_CATCHES,
    session: { active: false, startedAt: null, points: [] },
    fishingDays: DEMO_DAYS,
    waterPromptDismissedToday: 0,
  }
}

interface StoreApi {
  state: AppState
  users: typeof USERS
  species: Species[]
  weather: WeatherSnapshot
  trackingMode: 'native-background' | 'web' | 'none' | null
  lastFix: { lat: number; lng: number } | null
  login: (id: UserId) => void
  logout: () => void
  startSession: () => Promise<'native-background' | 'web' | 'none'>
  stopSession: () => Promise<void>
  addCatch: (input: {
    speciesId: string
    lengthCm?: number
    note?: string
    lat?: number
    lng?: number
  }) => Promise<void>
  toggleUndesired: (speciesId: string) => void
  addSpecies: (name: string) => void
  addFishingDay: (date: string, title: string) => void
  sendDeparture: () => Promise<string>
  shareCatch: (catchId: string) => Promise<boolean>
  recordWaterPrompt: (accepted: boolean) => Promise<void>
  refreshWeather: () => Promise<void>
  checkWaterPrompt: () => Promise<boolean>
  waterPromptsLeft: number
  isUndesired: (speciesId: string) => boolean
  areaHint: (lat: number, lng: number) => 'good' | 'avoid' | 'neutral'
}

const StoreContext = createContext<StoreApi | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadState)
  const [weather, setWeather] = useState<WeatherSnapshot>(DEMO_WEATHER)
  const [trackingMode, setTrackingMode] = useState<
    'native-background' | 'web' | 'none' | null
  >(null)
  const [lastFix, setLastFix] = useState<{ lat: number; lng: number } | null>(null)
  const startingRef = useRef(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const species = useMemo(
    () => [...SEED_SPECIES, ...state.customSpecies],
    [state.customSpecies],
  )

  const todayKey = new Date().toISOString().slice(0, 10)
  const promptsUsedKey = `water-prompts-${todayKey}`
  const [promptsUsed, setPromptsUsed] = useState(() => {
    const n = Number(localStorage.getItem(promptsUsedKey) || '0')
    return Number.isFinite(n) ? n : 0
  })

  useEffect(() => {
    localStorage.setItem(promptsUsedKey, String(promptsUsed))
  }, [promptsUsed, promptsUsedKey])

  const appendPoint = useCallback((lat: number, lng: number, t: string) => {
    setLastFix({ lat, lng })
    setState((s) => {
      if (!s.session.active) return s
      const last = s.session.points[s.session.points.length - 1]
      if (last && Math.hypot(last.lat - lat, last.lng - lng) < 0.00005) return s
      return {
        ...s,
        session: {
          ...s.session,
          points: [...s.session.points, { lat, lng, t }],
        },
      }
    })
  }, [])

  const refreshWeather = useCallback(async () => {
    const fix = lastFix ?? (await getCurrentPosition())
    const lat = fix?.lat ?? 60.17
    const lng = fix?.lng ?? 24.94
    if (fix && 'lat' in fix) setLastFix({ lat: fix.lat, lng: fix.lng })
    const w = await fetchWeather(lat, lng)
    setWeather(w)
  }, [lastFix])

  useEffect(() => {
    void (async () => {
      const fix = await getCurrentPosition()
      const lat = fix?.lat ?? 60.17
      const lng = fix?.lng ?? 24.94
      if (fix) setLastFix({ lat: fix.lat, lng: fix.lng })
      setWeather(await fetchWeather(lat, lng))
    })()
  }, [])

  const beginTracking = useCallback(async () => {
    if (startingRef.current) return 'none' as const
    startingRef.current = true
    try {
      const fix = await getCurrentPosition()
      const startPoint = fix ?? {
        lat: 60.214,
        lng: 25.032,
        t: new Date().toISOString(),
      }
      setLastFix({ lat: startPoint.lat, lng: startPoint.lng })
      setState((s) => ({
        ...s,
        session: {
          active: true,
          startedAt: new Date().toISOString(),
          points: [
            {
              lat: startPoint.lat,
              lng: startPoint.lng,
              t: startPoint.t ?? new Date().toISOString(),
            },
          ],
        },
      }))
      void fetchWeather(startPoint.lat, startPoint.lng).then(setWeather)

      const result = await startRouteTracking((p) => {
        appendPoint(p.lat, p.lng, p.t)
      })
      const mode = result.mode === 'none' ? 'none' : result.mode
      setTrackingMode(mode)
      return mode
    } finally {
      startingRef.current = false
    }
  }, [appendPoint])

  const stopSession = useCallback(async () => {
    await stopRouteTracking()
    setTrackingMode(null)
    setState((s) => ({
      ...s,
      session: { active: false, startedAt: null, points: s.session.points },
    }))
  }, [])

  const api: StoreApi = {
    state,
    users: USERS,
    species,
    weather,
    trackingMode,
    lastFix,
    login: (id) => setState((s) => ({ ...s, currentUserId: id })),
    logout: () => setState((s) => ({ ...s, currentUserId: null })),
    startSession: beginTracking,
    stopSession,
    addCatch: async (input) => {
      if (!state.currentUserId) return
      const fix = lastFix ?? (await getCurrentPosition())
      const w = await fetchWeather(
        fix?.lat ?? 60.214,
        fix?.lng ?? 25.032,
      )
      setWeather(w)
      const record: CatchRecord = {
        id: `c-${Date.now()}`,
        userId: state.currentUserId,
        speciesId: input.speciesId,
        lat: input.lat ?? fix?.lat ?? 60.214 + Math.random() * 0.01,
        lng: input.lng ?? fix?.lng ?? 25.032 + Math.random() * 0.01,
        createdAt: new Date().toISOString(),
        lengthCm: input.lengthCm,
        note: input.note,
        weather: w,
      }
      setState((s) => ({ ...s, catches: [record, ...s.catches] }))
    },
    toggleUndesired: (speciesId) => {
      const uid = state.currentUserId
      if (!uid) return
      setState((s) => {
        const list = s.undesiredSpecies[uid] ?? []
        const next = list.includes(speciesId)
          ? list.filter((id) => id !== speciesId)
          : [...list, speciesId]
        return {
          ...s,
          undesiredSpecies: { ...s.undesiredSpecies, [uid]: next },
        }
      })
    },
    addSpecies: (name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const id = trimmed
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-zäöå0-9-]/gi, '')
      setState((s) => ({
        ...s,
        customSpecies: [
          ...s.customSpecies,
          { id: `${id}-${Date.now()}`, name: trimmed },
        ],
      }))
    },
    addFishingDay: (date, title) => {
      setState((s) => ({
        ...s,
        fishingDays: [
          ...s.fishingDays,
          {
            id: `d-${Date.now()}`,
            date,
            title: title || 'Kalastuspäivä',
            participants: s.currentUserId ? [s.currentUserId] : [],
          },
        ],
      }))
    },
    sendDeparture: async () => {
      const name =
        USERS.find((u) => u.id === state.currentUserId)?.name ?? 'Kaikki'
      const text = `${name} lähtee kalastamaan — Kasinmiehet`
      await shareText('Lähtöilmoitus', text)
      return text
    },
    shareCatch: async (catchId) => {
      const c = state.catches.find((x) => x.id === catchId)
      if (!c) return false
      const name = species.find((s) => s.id === c.speciesId)?.name ?? c.speciesId
      const angler = USERS.find((u) => u.id === c.userId)?.name ?? ''
      const text = [
        `Saalis: ${name}`,
        c.lengthCm ? `Pituus: ${c.lengthCm} cm` : null,
        `Kalastaja: ${angler}`,
        `Sijainti: ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`,
        `Sää: ${c.weather.tempC}°, tuuli ${c.weather.windMs} m/s ${c.weather.windDir}`,
        '— Kasinmiehet',
      ]
        .filter(Boolean)
        .join('\n')
      return shareText('Saalis', text)
    },
    recordWaterPrompt: async (accepted) => {
      setPromptsUsed((n) => Math.min(2, n + 1))
      if (accepted) await beginTracking()
    },
    refreshWeather,
    checkWaterPrompt: async () => {
      if (promptsUsed >= 2 || state.session.active) return false
      const fix = await getCurrentPosition()
      if (!fix) return true // demo: still allow prompt without GPS
      setLastFix({ lat: fix.lat, lng: fix.lng })
      return looksNearWater(fix.lat, fix.lng)
    },
    waterPromptsLeft: Math.max(0, 2 - promptsUsed),
    isUndesired: (speciesId) => {
      const uid = state.currentUserId
      if (!uid) return false
      return (state.undesiredSpecies[uid] ?? []).includes(speciesId)
    },
    areaHint: (lat, lng) => {
      const uid = state.currentUserId
      if (!uid) return 'neutral'
      const undesired = new Set(state.undesiredSpecies[uid] ?? [])
      const nearby = state.catches.filter(
        (c) => Math.hypot(c.lat - lat, c.lng - lng) < 0.003,
      )
      if (!nearby.length) return 'neutral'
      let good = 0
      let bad = 0
      for (const c of nearby) {
        if (undesired.has(c.speciesId)) bad += 1
        else good += 1
      }
      if (bad > good) return 'avoid'
      if (good > 0) return 'good'
      return 'neutral'
    },
  }

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore outside provider')
  return ctx
}
