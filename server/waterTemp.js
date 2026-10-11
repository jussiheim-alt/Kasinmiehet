/**
 * Pintaveden lämpötila SYKE Hydrologiarajapinnasta (ympäristö.fi / rajapinnat.ymparisto.fi).
 * Suure_Id 11 = Pintaveden lämpötila.
 */

const BASE =
  'https://rajapinnat.ymparisto.fi/api/Hydrologiarajapinta/1.2/odata'
const UA = 'Kasinmiehet/0.1 (private fishing app; SYKE OData)'

/** @type {{ id: number, name: string, lat: number, lng: number }[] | null} */
let stationCache = null
let stationCacheAt = 0
const CACHE_MS = 24 * 60 * 60 * 1000

function parseDms(raw) {
  const s = String(raw ?? '').trim()
  if (!/^\d+$/.test(s)) return null
  let deg
  let mi
  let se
  if (s.length === 6) {
    deg = Number(s.slice(0, 2))
    mi = Number(s.slice(2, 4))
    se = Number(s.slice(4, 6))
  } else if (s.length === 7) {
    deg = Number(s.slice(0, 3))
    mi = Number(s.slice(3, 5))
    se = Number(s.slice(5, 7))
  } else {
    return null
  }
  return deg + mi / 60 + se / 3600
}

function haversineKm(a, b) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const la1 = toRad(a.lat)
  const la2 = toRad(b.lat)
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

async function odataJson(pathAndQuery) {
  const res = await fetch(`${BASE}${pathAndQuery}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  })
  if (!res.ok) throw new Error(`SYKE ${res.status}`)
  return res.json()
}

async function loadStations() {
  const now = Date.now()
  if (stationCache && now - stationCacheAt < CACHE_MS) return stationCache

  const data = await odataJson('/Paikka?$filter=Suure_Id%20eq%2011&$top=500')
  const stations = []
  for (const row of data.value || []) {
    const lat = parseDms(row.KoordLat)
    const lng = parseDms(row.KoordLong)
    if (lat == null || lng == null) continue
    stations.push({
      id: row.Paikka_Id,
      name: String(row.Nimi || '').trim(),
      lat,
      lng,
    })
  }
  stationCache = stations
  stationCacheAt = now
  return stations
}

async function latestReading(stationId, sinceIsoDate) {
  const filter = encodeURIComponent(
    `Paikka_Id eq ${stationId} and Aika gt datetime'${sinceIsoDate}'`,
  )
  const data = await odataJson(
    `/LampoPintavesi?$filter=${filter}&$orderby=Aika%20desc&$top=1`,
  )
  const row = data.value?.[0]
  if (!row || row.Arvo == null) return null
  const value = Number(row.Arvo)
  if (!Number.isFinite(value)) return null
  return { value, time: row.Aika }
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {{ maxKm?: number, lookbackDays?: number }} [opts]
 */
export async function fetchNearestWaterTemp(lat, lng, opts = {}) {
  const maxKm = opts.maxKm ?? 100
  const lookbackDays = opts.lookbackDays ?? 45
  const since = new Date(Date.now() - lookbackDays * 86400000)
    .toISOString()
    .slice(0, 10)

  const stations = await loadStations()
  const ranked = stations
    .map((s) => ({ ...s, distanceKm: haversineKm({ lat, lng }, s) }))
    .filter((s) => s.distanceKm <= maxKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)

  for (const station of ranked.slice(0, 12)) {
    try {
      const reading = await latestReading(station.id, since)
      if (!reading) continue
      return {
        waterTempC: Math.round(reading.value * 10) / 10,
        observedAt: reading.time,
        stationId: station.id,
        stationName: station.name,
        distanceKm: Math.round(station.distanceKm * 10) / 10,
        source: 'ymparisto.fi / SYKE Hydrologiarajapinta',
      }
    } catch {
      /* try next station */
    }
  }

  return null
}
