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
import { apiGet, apiSend, apiSendJson } from './lib/api'
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
  FishingSession,
  Species,
  UserId,
  WeatherSnapshot,
} from './types'

const STORAGE_KEY = 'kasinmiehet-v5'
const SYNC_POLL_MS = 2500

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

interface SyncPayload {
  revision: number
  unchanged?: boolean
  species: Species[]
  catches: CatchRecord[]
  fishingDays: AppState['fishingDays']
  undesired: string[]
  session: FishingSession
}

interface StoreApi {
  state: AppState
  users: typeof USERS
  species: Species[]
  weather: WeatherSnapshot
  trackingMode: 'native-background' | 'web' | 'none' | null
  lastFix: { lat: number; lng: number } | null
  apiOnline: boolean | null
  syncNotice: string | null
  clearSyncNotice: () => void
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

function applySharedPayload(
  s: AppState,
  data: SyncPayload,
  userId: UserId | null,
): AppState {
  return {
    ...s,
    catches: data.catches,
    fishingDays: data.fishingDays,
    customSpecies: data.species.filter(
      (sp) => !SEED_SPECIES.some((seed) => seed.id === sp.id),
    ),
    undesiredSpecies: userId
      ? { ...s.undesiredSpecies, [userId]: data.undesired }
      : s.undesiredSpecies,
    session: data.session?.active
      ? {
          id: data.session.id ?? undefined,
          active: true,
          startedAt: data.session.startedAt,
          points: data.session.points ?? [],
          startedBy: data.session.startedBy ?? null,
          participants: data.session.participants ?? [],
        }
      : {
          active: false,
          startedAt: null,
          points: data.session?.points?.length
            ? data.session.points
            : s.session.points,
          startedBy: null,
          participants: [],
          id: undefined,
        },
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadState)
  const [weather, setWeather] = useState<WeatherSnapshot>(DEMO_WEATHER)
  const [trackingMode, setTrackingMode] = useState<
    'native-background' | 'web' | 'none' | null
  >(null)
  const [lastFix, setLastFix] = useState<{ lat: number; lng: number } | null>(null)
  const [apiOnline, setApiOnline] = useState<boolean | null>(null)
  const [syncNotice, setSyncNotice] = useState<string | null>(null)
  const startingRef = useRef(false)
  const sessionIdRef = useRef<string | null>(null)
  const pointsSyncTimer = useRef<number | null>(null)
  const revisionRef = useRef(0)
  const trackingModeRef = useRef(trackingMode)
  const userIdRef = useRef(state.currentUserId)
  const applyingRemoteRef = useRef(false)
  const wasActiveRef = useRef(false)

  useEffect(() => {
    trackingModeRef.current = trackingMode
  }, [trackingMode])

  useEffect(() => {
    userIdRef.current = state.currentUserId
  }, [state.currentUserId])

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

  const ensureLocalTracking = useCallback(async () => {
    if (trackingModeRef.current) return trackingModeRef.current
    const result = await startRouteTracking((p) => {
      appendPointRef.current?.(p.lat, p.lng, p.t)
    })
    const mode = result.mode === 'none' ? 'none' : result.mode
    setTrackingMode(mode)
    return mode
  }, [])

  const appendPointRef = useRef<
    ((lat: number, lng: number, t: string) => void) | null
  >(null)

  const appendPoint = useCallback((lat: number, lng: number, t: string) => {
    setLastFix({ lat, lng })
    const uid = userIdRef.current
    setState((s) => {
      if (!s.session.active) return s
      const last = s.session.points[s.session.points.length - 1]
      if (last && Math.hypot(last.lat - lat, last.lng - lng) < 0.00005) return s
      const points = [
        ...s.session.points,
        { lat, lng, t, userId: uid ?? undefined },
      ]
      const sid = s.session.id || sessionIdRef.current
      if (sid) {
        if (pointsSyncTimer.current) window.clearTimeout(pointsSyncTimer.current)
        pointsSyncTimer.current = window.setTimeout(() => {
          void apiSend(`/api/sessions/${sid}/points`, 'POST', {
            points,
            userId: uid,
          }).catch(() => undefined)
        }, 4000)
      }
      return {
        ...s,
        session: { ...s.session, points },
      }
    })
  }, [])

  appendPointRef.current = appendPoint

  const applyRemoteSessionSideEffects = useCallback(
    async (next: FishingSession, prevActive: boolean) => {
      if (applyingRemoteRef.current) return
      applyingRemoteRef.current = true
      try {
        if (next.active) {
          if (next.id) sessionIdRef.current = next.id
          const me = userIdRef.current
          if (!prevActive) {
            const starter = USERS.find((u) => u.id === next.startedBy)?.name
            if (next.startedBy && next.startedBy !== me && starter) {
              setSyncNotice(`${starter} aloitti kalastuksen — liityit mukaan`)
            }
            // Liity ryhmäsessioon palvelimella, jotta osallistujalistalla näyt
            if (me && next.startedBy !== me) {
              try {
                const body = await apiSendJson<{
                  session?: FishingSession
                  revision?: number
                }>('/api/sessions/start', 'POST', {
                  id: `s-${me}-${Date.now()}`,
                  userId: me,
                  startedAt: next.startedAt || new Date().toISOString(),
                  points: [],
                })
                if (body.revision) revisionRef.current = body.revision
                if (body.session?.id) sessionIdRef.current = body.session.id
              } catch {
                /* ignore join failure */
              }
            }
          }
          await ensureLocalTracking()
        } else if (prevActive) {
          await stopRouteTracking()
          setTrackingMode(null)
          sessionIdRef.current = null
          setSyncNotice('Kalastus päättyi (ryhmä)')
        }
      } finally {
        applyingRemoteRef.current = false
      }
    },
    [ensureLocalTracking],
  )

  const pullSync = useCallback(
    async (userId: UserId | null, force = false) => {
      if (!userId) return
      try {
        const since = force ? 0 : revisionRef.current
        const data = await apiGet<SyncPayload>(
          `/api/sync?userId=${encodeURIComponent(userId)}&since=${since}`,
        )
        setApiOnline(true)
        if (data.unchanged) return

        revisionRef.current = data.revision || revisionRef.current
        const prevActive = wasActiveRef.current
        setState((s) => applySharedPayload(s, data, userId))
        wasActiveRef.current = Boolean(data.session?.active)
        if (data.session?.id) sessionIdRef.current = data.session.id
        else if (!data.session?.active) sessionIdRef.current = null

        await applyRemoteSessionSideEffects(
          data.session ?? { active: false, startedAt: null, points: [] },
          prevActive,
        )
      } catch {
        setApiOnline(false)
      }
    },
    [applyRemoteSessionSideEffects],
  )

  useEffect(() => {
    void pullSync(state.currentUserId, true)
  }, [state.currentUserId, pullSync])

  // Pollaus + SSE — kaikki laitteet pysyvät synkissä
  useEffect(() => {
    const userId = state.currentUserId
    if (!userId) return

    const poll = window.setInterval(() => {
      void pullSync(userId)
    }, SYNC_POLL_MS)

    let es: EventSource | null = null
    try {
      es = new EventSource('/api/events')
      es.addEventListener('revision', () => {
        void pullSync(userId)
      })
      es.onerror = () => {
        /* pollaus hoitaa fallbackin */
      }
    } catch {
      /* EventSource ei saatavilla */
    }

    const onFocus = () => void pullSync(userId)
    const onVis = () => {
      if (document.visibilityState === 'visible') void pullSync(userId)
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVis)

    return () => {
      window.clearInterval(poll)
      es?.close()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [state.currentUserId, pullSync])

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
      const uid = state.currentUserId
      const points = [
        {
          lat: startPoint.lat,
          lng: startPoint.lng,
          t: startPoint.t ?? startedAt,
          userId: uid ?? undefined,
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
          startedBy: uid,
          participants: uid ? [uid] : [],
        },
      }))
      wasActiveRef.current = true
      void fetchWeather(startPoint.lat, startPoint.lng).then(setWeather)

      try {
        const body = await apiSendJson<{
          session?: FishingSession
          revision?: number
        }>('/api/sessions/start', 'POST', {
          id: sessionId,
          userId: uid,
          startedAt,
          points,
        })
        if (body.revision) revisionRef.current = body.revision
        if (body.session?.active) {
          if (body.session.id) sessionIdRef.current = body.session.id
          setState((s) => ({
            ...s,
            session: {
              id: body.session!.id ?? sessionId,
              active: true,
              startedAt: body.session!.startedAt ?? startedAt,
              points: body.session!.points?.length
                ? body.session!.points
                : points,
              startedBy: body.session!.startedBy ?? uid,
              participants: body.session!.participants ?? (uid ? [uid] : []),
            },
          }))
        }
        setApiOnline(true)
      } catch {
        setApiOnline(false)
      }

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
        })
          .then(() => {
            revisionRef.current += 1
            void pullSync(userIdRef.current, true)
          })
          .catch(() => undefined)
      }
      wasActiveRef.current = false
      return {
        ...s,
        session: {
          active: false,
          startedAt: null,
          points: s.session.points,
          id: undefined,
          startedBy: null,
          participants: [],
        },
      }
    })
    sessionIdRef.current = null
  }, [pullSync])

  const persistPreferences = useCallback(
    (userId: UserId, undesired: string[]) => {
      void apiSend(`/api/preferences/${userId}`, 'PUT', { undesired })
        .then(() => {
          revisionRef.current += 1
        })
        .catch(() => setApiOnline(false))
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
    syncNotice,
    clearSyncNotice: () => setSyncNotice(null),
    login: (id) => setState((s) => ({ ...s, currentUserId: id })),
    logout: () => {
      void stopRouteTracking()
      setTrackingMode(null)
      sessionIdRef.current = null
      wasActiveRef.current = false
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
      void apiSend('/api/catches', 'POST', record)
        .then(() => {
          revisionRef.current += 1
          void pullSync(state.currentUserId, true)
        })
        .catch(() => setApiOnline(false))
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
      })
        .then(() => {
          revisionRef.current += 1
          void pullSync(state.currentUserId, true)
        })
        .catch(() => setApiOnline(false))
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
      void apiSend('/api/fishing-days', 'POST', day)
        .then(() => {
          revisionRef.current += 1
          void pullSync(state.currentUserId, true)
        })
        .catch(() => setApiOnline(false))
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
