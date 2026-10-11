import type { RoutePoint } from '../types'

export type RouteTrack = {
  id: string
  label?: string
  userId?: string
  points: RoutePoint[]
}

const EARTH_M = 6371000

/** Etäisyys metreinä. */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Pilkoo reitin osiin kun pisteiden välillä on liian iso hyppy
 * (eri sessiot / GPS-katko) — estää "suoran viivan halki Suomen".
 */
export function splitTrackSegments(
  points: RoutePoint[],
  opts?: { maxGapMeters?: number; maxGapMs?: number },
): RoutePoint[][] {
  const maxGapMeters = opts?.maxGapMeters ?? 180
  const maxGapMs = opts?.maxGapMs ?? 8 * 60_000
  if (!points.length) return []
  const sorted = [...points].sort((a, b) => String(a.t).localeCompare(String(b.t)))
  const segments: RoutePoint[][] = [[sorted[0]]]
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const cur = sorted[i]
    const dist = distanceMeters(prev, cur)
    const dt = Math.abs(new Date(cur.t).getTime() - new Date(prev.t).getTime())
    if (dist > maxGapMeters || (Number.isFinite(dt) && dt > maxGapMs)) {
      segments.push([cur])
    } else {
      segments[segments.length - 1].push(cur)
    }
  }
  return segments.filter((s) => s.length >= 2)
}

/** Suuntakulma asteina (0 = pohjoinen) viimeisten pisteiden mukaan. */
export function headingDegrees(points: RoutePoint[]): number | null {
  if (points.length < 2) return null
  const a = points[points.length - 2]
  const b = points[points.length - 1]
  const toRad = (d: number) => (d * Math.PI) / 180
  const φ1 = toRad(a.lat)
  const φ2 = toRad(b.lat)
  const Δλ = toRad(b.lng - a.lng)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  const θ = (Math.atan2(y, x) * 180) / Math.PI
  return (θ + 360) % 360
}
