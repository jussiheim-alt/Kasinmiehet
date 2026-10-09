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
import { DEMO_WEATHER, SEED_SPECIES, USERS } from './data'
import {
  apiGet,
  apiPostJson,
  apiSend,
  getToken,
  setToken,
} from './lib/api'
import {
  getCurrentPosition,
  startRouteTracking,
  stopRouteTracking,
} from './lib/geo'
import { shareText } from './lib/share'
import { isNearWater } from './lib/water'
import { fetchWeather } from './lib/weather'
import type {
  AppState,
  CatchRecord,
  Species,
  UserId,
  WeatherSnapshot,
} from './types'

const STORAGE_KEY = 'kasinmiehet-v3'

function emptyUndesired(): Record<UserId, string[]> {
  return { olli: [], matti: [], jussi: [] }
}

function emptyState(): AppState {
  return {
    currentUserId: null,
    undesiredSpecies: emptyUndesired(),
    customSpecies: [],
    catches: [],
    session: { active: false, startedAt: null, points: [] },
    fishingDays: [],
    waterPromptDismissedToday: 0,
  }
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppState
      // Älä palauta vanhaa kirjautumista ilman tokenia
      if (!getToken()) parsed.currentUserId = null
      parsed.catches = Array.isArray(parsed.catches) ? parsed.catches : []
      parsed.fishingDays = Array.isArray(parsed.fishingDays)
        ? parsed.fishingDays
        : []
      return parsed
    }
  } catch {
    /* ignore */
  }
  return emptyState()
}

interface BootstrapPayload {
  species: Species[]
  catches: CatchRecord[]
  fishingDays: AppState['fishingDays']
  undesired: string[]
  session: AppState['session'] & { id?: string }
}

interface StoreApi {
  state: AppState
  users: typeof USERS
  species: Species[]
  weather: WeatherSnapshot
  trackingMode: 'native-background' | 'web' | 'none' | null
  lastFix: { lat: number; lng: number } | null
  apiOnline: boolean | null
  login: (id: UserId, pin: string) => Promise<void>
  logout: () => Promise<void>
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
  const [apiOnline, setApiOnline] = useState<boolean | null>(null)
  const startingRef = useRef(false)
  const sessionIdRef = useRef<string | null>(null)
  const pointsSyncTimer = useRef<number | null>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const species = useMemo(() => {
    const customIds = new Set(state.customSpecies.map((s) => s.id))
    const seed = SEED_SPECIES.filter((s) => !customIds.has(s.id))
    return [...seed, ...state.customSpecies]
  }, [state.customSpecies])

  const todayKey = new Date().toISOString().slice(0, 10)
  const promptsUsedKey = `water-prompts-${todayKey}`
  const [promptsUsed, setPromptsUsed] = useState(() => {
    const n = Number(localStorage.getItem(promptsUsedKey) || '0')
    return Number.isFinite(n) ? n : 0
  })

  useEffect(() => {
    localStorage.setItem(promptsUsedKey, String(promptsUsed))
  }, [promptsUsed, promptsUsedKey])

  const syncBootstrap = useCallback(async (userId: UserId | null) => {
    try {
      const q = userId ? `?userId=${userId}` : ''
      const data = await apiGet<BootstrapPayload>(`/api/bootstrap${q}`)
      setApiOnline(true)
      setState((s) => ({
        ...s,
        catches: data.catches,
        fishingDays: data.fishingDays,
        customSpecies: data.species.filter(
          (sp) => !SEED_SPECIES.some((seed) => seed.id === sp.id),
        ),
        undesiredSpecies: userId
          ? { ...s.undesiredSpecies, [userId]: data.undesired }
          : s.undesiredSpecies,
        session:
          data.session?.active && userId
            ? { ...data.session, id: data.session.id }
            : { active: false, startedAt: null, points: [] },
      }))
      if (data.session?.active && data.session.id) {
        sessionIdRef.current = data.session.id
      }
    } catch {
      setApiOnline(false)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      const token = getToken()
      if (!token) return
      try {
        const me = await apiGet<{ userId: UserId; name: string }>('/api/me')
        setState((s) => ({ ...s, currentUserId: me.userId }))
        setApiOnline(true)
      } catch {
        setToken(null)
        setState((s) => ({ ...s, currentUserId: null }))
      }
    })()
  }, [])

  useEffect(() => {
    if (!state.currentUserId) return
    void syncBootstrap(state.currentUserId)
  }, [state.currentUserId, syncBootstrap])

  const appendPoint = useCallback((lat: number, lng: number, t: string) => {
    setLastFix({ lat, lng })
    setState((s) => {
      if (!s.session.active) return s
      const last = s.session.points[s.session.points.length - 1]
      if (last && Math.hypot(last.lat - lat, last.lng - lng) < 0.00005) return s
      const points = [...s.session.points, { lat, lng, t }]
      const sid = s.session.id || sessionIdRef.current
      if (sid) {
        if (pointsSyncTimer.current) window.clearTimeout(pointsSyncTimer.current)
        pointsSyncTimer.current = window.setTimeout(() => {
          void apiSend(`/api/sessions/${sid}/points`, 'POST', { points }).catch(
            () => undefined,
          )
        }, 4000)
      }
      return {
        ...s,
        session: { ...s.session, points },
      }
    })
  }, [])

  const refreshWeather = useCallback(async () => {
    const fix = lastFix ?? (await getCurrentPosition())
    const lat = fix?.lat ?? 60.17
    const lng = fix?.lng ?? 24.94
    if (fix && 'lat' in fix) setLastFix({ lat: fix.lat, lng: fix.lng })
    setWeather(await fetchWeather(lat, lng))
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
      const startedAt = new Date().toISOString()
      const sessionId = `s-${Date.now()}`
      sessionIdRef.current = sessionId
      const points = [
        {
          lat: startPoint.lat,
          lng: startPoint.lng,
          t: startPoint.t ?? startedAt,
        },
      ]
      setLastFix({ lat: startPoint.lat, lng: startPoint.lng })
      setState((s) => ({
        ...s,
        session: {
          id: sessionId,
          active: true,
          startedAt,
          points,
        },
      }))
      void fetchWeather(startPoint.lat, startPoint.lng).then(setWeather)
      void apiSend('/api/sessions/start', 'POST', {
        id: sessionId,
        userId: state.currentUserId,
        startedAt,
        points,
      }).catch(() => setApiOnline(false))

      const result = await startRouteTracking((p) => {
        appendPoint(p.lat, p.lng, p.t)
      })
      const mode = result.mode === 'none' ? 'none' : result.mode
      setTrackingMode(mode)
      return mode
    } finally {
      startingRef.current = false
    }
  }, [appendPoint, state.currentUserId])

  const stopSession = useCallback(async () => {
    await stopRouteTracking()
    setTrackingMode(null)
    const sid = sessionIdRef.current
    setState((s) => {
      if (sid) {
        void apiSend(`/api/sessions/${sid}/stop`, 'POST', {
          endedAt: new Date().toISOString(),
          points: s.session.points,
        }).catch(() => undefined)
      }
      return {
        ...s,
        session: {
          active: false,
          startedAt: null,
          points: s.session.points,
          id: undefined,
        },
      }
    })
    sessionIdRef.current = null
  }, [])

  const persistPreferences = useCallback(
    (userId: UserId, undesired: string[]) => {
      void apiSend(`/api/preferences/${userId}`, 'PUT', { undesired }).catch(
        () => setApiOnline(false),
      )
    },
    [],
  )

  const api: StoreApi = {
    state,
    users: USERS,
    species,
    weather,
    trackingMode,
    lastFix,
    apiOnline,
    login: async (id, pin) => {
      const result = await apiPostJson<{
        token: string
        userId: UserId
        name: string
      }>('/api/login', { userId: id, pin })
      setToken(result.token)
      setState((s) => ({
        ...s,
        currentUserId: result.userId,
        catches: [],
        fishingDays: [],
        session: { active: false, startedAt: null, points: [] },
      }))
      setApiOnline(true)
      await syncBootstrap(result.userId)
    },
    logout: async () => {
      try {
        await apiSend('/api/logout', 'POST', {})
      } catch {
        /* ignore */
      }
      setToken(null)
      setState(emptyState())
    },
    startSession: beginTracking,
    stopSession,
    addCatch: async (input) => {
      if (!state.currentUserId) return
      const fix = lastFix ?? (await getCurrentPosition())
      const w = await fetchWeather(fix?.lat ?? 60.214, fix?.lng ?? 25.032)
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
      void apiSend('/api/catches', 'POST', record).catch(() => setApiOnline(false))
    },
    toggleUndesired: (speciesId) => {
      const uid = state.currentUserId
      if (!uid) return
      setState((s) => {
        const list = s.undesiredSpecies[uid] ?? []
        const next = list.includes(speciesId)
          ? list.filter((id) => id !== speciesId)
          : [...list, speciesId]
        persistPreferences(uid, next)
        return {
          ...s,
          undesiredSpecies: { ...s.undesiredSpecies, [uid]: next },
        }
      })
    },
    addSpecies: (name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const id = `${trimmed
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-zäöå0-9-]/gi, '')}-${Date.now()}`
      const created = { id, name: trimmed }
      setState((s) => ({
        ...s,
        customSpecies: [...s.customSpecies, created],
      }))
      void apiSend('/api/species', 'POST', {
        ...created,
        createdBy: state.currentUserId,
      }).catch(() => setApiOnline(false))
    },
    addFishingDay: (date, title) => {
      const day = {
        id: `d-${Date.now()}`,
        date,
        title: title || 'Kalastuspäivä',
        participants: state.currentUserId ? [state.currentUserId] : [],
      }
      setState((s) => ({
        ...s,
        fishingDays: [...s.fishingDays, day],
      }))
      void apiSend('/api/fishing-days', 'POST', day).catch(() =>
        setApiOnline(false),
      )
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
      if (!fix) return false
      setLastFix({ lat: fix.lat, lng: fix.lng })
      const near = await isNearWater(fix.lat, fix.lng, 150)
      // Only prompt when Overpass confirms water nearby
      return near === true
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
