import { apiUrl } from './api'

/**
 * Asks the shared API (Overpass/OSM proxy) whether GPS is within ~radius meters of water.
 * Falls back to null on network failure so the UI can decide (e.g. skip prompt).
 */
export async function isNearWater(
  lat: number,
  lng: number,
  radius = 150,
): Promise<boolean | null> {
  try {
    const url = apiUrl(
      `/api/near-water?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}&radius=${radius}`,
    )
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as { nearWater?: boolean | null }
    if (typeof data.nearWater === 'boolean') return data.nearWater
    return null
  } catch {
    return null
  }
}
