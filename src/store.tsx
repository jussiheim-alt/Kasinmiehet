import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { DEMO_CATCHES, DEMO_DAYS, DEMO_WEATHER, SEED_SPECIES, USERS } from './data'
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
  login: (id: UserId) => void
  logout: () => void
  startSession: () => void
  stopSession: () => void
  addCatch: (input: {
    speciesId: string
    lengthCm?: number
    note?: string
    lat?: number
    lng?: number
  }) => void
  toggleUndesired: (speciesId: string) => void
  addSpecies: (name: string) => void
  addFishingDay: (date: string, title: string) => void
  sendDeparture: () => string
  recordWaterPrompt: (accepted: boolean) => void
  waterPromptsLeft: number
  isUndesired: (speciesId: string) => boolean
  areaHint: (lat: number, lng: number) => 'good' | 'avoid' | 'neutral'
}

const StoreContext = createContext<StoreApi | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadState)

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

  const api: StoreApi = {
    state,
    users: USERS,
    species,
    weather: DEMO_WEATHER,
    login: (id) => setState((s) => ({ ...s, currentUserId: id })),
    logout: () => setState((s) => ({ ...s, currentUserId: null })),
    startSession: () =>
      setState((s) => ({
        ...s,
        session: {
          active: true,
          startedAt: new Date().toISOString(),
          points: [
            {
              lat: 60.214,
              lng: 25.032,
              t: new Date().toISOString(),
            },
          ],
        },
      })),
    stopSession: () =>
      setState((s) => ({
        ...s,
        session: { active: false, startedAt: null, points: s.session.points },
      })),
    addCatch: (input) => {
      if (!state.currentUserId) return
      const record: CatchRecord = {
        id: `c-${Date.now()}`,
        userId: state.currentUserId,
        speciesId: input.speciesId,
        lat: input.lat ?? 60.214 + Math.random() * 0.01,
        lng: input.lng ?? 25.032 + Math.random() * 0.01,
        createdAt: new Date().toISOString(),
        lengthCm: input.lengthCm,
        note: input.note,
        weather: { ...DEMO_WEATHER },
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
        customSpecies: [...s.customSpecies, { id: `${id}-${Date.now()}`, name: trimmed }],
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
    sendDeparture: () => {
      const name = USERS.find((u) => u.id === state.currentUserId)?.name ?? 'Kaikki'
      return `${name} lähtee kalastamaan`
    },
    recordWaterPrompt: (accepted) => {
      setPromptsUsed((n) => Math.min(2, n + 1))
      if (accepted) {
        setState((s) => ({
          ...s,
          session: {
            active: true,
            startedAt: new Date().toISOString(),
            points: [{ lat: 60.214, lng: 25.032, t: new Date().toISOString() }],
          },
        }))
      }
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
