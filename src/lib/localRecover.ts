import type { AppState, CatchRecord, FishingDay, UserId } from '../types'

const STORAGE_KEYS = [
  'kasinmiehet-v5',
  'kasinmiehet-v4',
  'kasinmiehet-v3',
  'kasinmiehet-v2',
  'kasinmiehet-v1',
  'kasinmiehet',
]

function asCatchList(v: unknown): CatchRecord[] {
  return Array.isArray(v) ? (v as CatchRecord[]) : []
}

function asDayList(v: unknown): FishingDay[] {
  return Array.isArray(v) ? (v as FishingDay[]) : []
}

/** Lataa ja yhdistä vanhat localStorage-avaimet (ennen kuin synkka ylikirjoittaa). */
export function loadMergedLocalState(empty: AppState): AppState {
  let merged = { ...empty }
  let found = false

  for (const key of STORAGE_KEYS) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as Partial<AppState>
      found = true
      const catches = mergeCatches(merged.catches, asCatchList(parsed.catches))
      const fishingDays = mergeDays(
        merged.fishingDays,
        asDayList(parsed.fishingDays),
      )
      merged = {
        ...merged,
        currentUserId:
          merged.currentUserId ??
          (parsed.currentUserId as UserId | null) ??
          null,
        catches,
        fishingDays,
        customSpecies: Array.isArray(parsed.customSpecies)
          ? [...merged.customSpecies, ...parsed.customSpecies].filter(
              (s, i, arr) => arr.findIndex((x) => x.id === s.id) === i,
            )
          : merged.customSpecies,
        undesiredSpecies: {
          ...merged.undesiredSpecies,
          ...(parsed.undesiredSpecies || {}),
        },
      }
    } catch {
      /* ignore corrupt */
    }
  }

  if (found) {
    try {
      localStorage.setItem(STORAGE_KEYS[0], JSON.stringify(merged))
    } catch {
      /* ignore */
    }
  }

  return found ? merged : empty
}

export function mergeCatches(a: CatchRecord[], b: CatchRecord[]): CatchRecord[] {
  const map = new Map<string, CatchRecord>()
  for (const c of [...a, ...b]) {
    if (!c?.id) continue
    const prev = map.get(c.id)
    if (!prev) map.set(c.id, c)
    else {
      // pidä tuoreempi / täydellisempi
      const prevT = new Date(prev.createdAt || 0).getTime()
      const nextT = new Date(c.createdAt || 0).getTime()
      map.set(c.id, nextT >= prevT ? { ...prev, ...c } : { ...c, ...prev })
    }
  }
  return [...map.values()].sort((x, y) =>
    String(y.createdAt).localeCompare(String(x.createdAt)),
  )
}

export function mergeDays(a: FishingDay[], b: FishingDay[]): FishingDay[] {
  const map = new Map<string, FishingDay>()
  for (const d of [...a, ...b]) {
    if (!d?.id) continue
    const prev = map.get(d.id)
    if (!prev) {
      map.set(d.id, {
        ...d,
        routePoints: d.routePoints ?? [],
        routeTracks: d.routeTracks ?? [],
      })
      continue
    }
    const routePoints = [
      ...(prev.routePoints || []),
      ...(d.routePoints || []),
    ]
    const trackMap = new Map<string, NonNullable<FishingDay['routeTracks']>[number]>()
    for (const t of [...(prev.routeTracks || []), ...(d.routeTracks || [])]) {
      if (!t?.id) continue
      const old = trackMap.get(t.id)
      trackMap.set(
        t.id,
        old
          ? {
              ...old,
              ...t,
              points: [...(old.points || []), ...(t.points || [])].filter(
                (p, i, arr) =>
                  arr.findIndex(
                    (q) => q.lat === p.lat && q.lng === p.lng && q.t === p.t,
                  ) === i,
              ),
            }
          : t,
      )
    }
    map.set(d.id, {
      ...prev,
      ...d,
      mapVisible: Boolean(prev.mapVisible || d.mapVisible),
      participants: [
        ...new Set([...(prev.participants || []), ...(d.participants || [])]),
      ] as UserId[],
      routePoints,
      routeTracks: [...trackMap.values()],
    })
  }
  return [...map.values()].sort((x, y) => y.date.localeCompare(x.date))
}

export function catchesMissingFromServer(
  local: CatchRecord[],
  server: CatchRecord[],
): CatchRecord[] {
  const ids = new Set(server.map((c) => c.id))
  return local.filter((c) => c?.id && !ids.has(c.id))
}

export function daysMissingOrRicher(
  local: FishingDay[],
  server: FishingDay[],
): FishingDay[] {
  const serverById = new Map(server.map((d) => [d.id, d]))
  const out: FishingDay[] = []
  for (const d of local) {
    if (!d?.id) continue
    const s = serverById.get(d.id)
    if (!s) {
      out.push(d)
      continue
    }
    const localPts = d.routePoints?.length ?? 0
    const serverPts = s.routePoints?.length ?? 0
    const localTracks = d.routeTracks?.length ?? 0
    const serverTracks = s.routeTracks?.length ?? 0
    if (localPts > serverPts || localTracks > serverTracks) out.push(d)
  }
  return out
}
