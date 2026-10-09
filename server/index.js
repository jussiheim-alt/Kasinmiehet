import cors from 'cors'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import db from './db.js'
import { fetchFishingCalendar } from './kalakalenteri.js'
import {
  addSseClient,
  buildSyncPayload,
  bumpRevision,
  getActiveGroupSession,
  getRevision,
  mergePoints,
} from './sync.js'
import { fetchNearestWaterTemp } from './waterTemp.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = Number(process.env.PORT || 8787)
const distDir = path.join(__dirname, '..', 'dist')

app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'kasinmiehet', revision: getRevision() })
})

/** Jaettu tila kaikille käyttäjille (bootstrap + live-synk). */
app.get('/api/bootstrap', (req, res) => {
  const userId = String(req.query.userId || '')
  res.json(buildSyncPayload(userId))
})

app.get('/api/sync', (req, res) => {
  const userId = String(req.query.userId || '')
  const since = Number(req.query.since || 0)
  const revision = getRevision()
  if (Number.isFinite(since) && since > 0 && since >= revision) {
    return res.json({ revision, unchanged: true })
  }
  res.json({ unchanged: false, ...buildSyncPayload(userId) })
})

/** Live-ilmoitukset revision-muutoksista (SSE). */
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()
  const remove = addSseClient(res)
  const heartbeat = setInterval(() => {
    try {
      res.write(`: ping\n\n`)
    } catch {
      clearInterval(heartbeat)
      remove()
    }
  }, 25000)
  req.on('close', () => {
    clearInterval(heartbeat)
    remove()
  })
})

app.post('/api/species', (req, res) => {
  const { id, name, createdBy } = req.body || {}
  if (!id || !name) return res.status(400).json({ error: 'id and name required' })
  db.prepare(
    'INSERT OR IGNORE INTO species (id, name, created_by) VALUES (?, ?, ?)',
  ).run(id, name, createdBy ?? null)
  const revision = bumpRevision()
  res.json({ ok: true, revision })
})

app.put('/api/preferences/:userId', (req, res) => {
  const userId = req.params.userId
  const undesired = Array.isArray(req.body?.undesired) ? req.body.undesired : []
  const del = db.prepare('DELETE FROM preferences WHERE user_id = ?')
  const ins = db.prepare(
    'INSERT INTO preferences (user_id, species_id, undesired) VALUES (?, ?, 1)',
  )
  const tx = db.transaction(() => {
    del.run(userId)
    for (const speciesId of undesired) ins.run(userId, speciesId)
  })
  tx()
  const revision = bumpRevision()
  res.json({ ok: true, revision })
})

app.post('/api/catches', (req, res) => {
  const c = req.body || {}
  if (!c.id || !c.userId || !c.speciesId) {
    return res.status(400).json({ error: 'missing fields' })
  }
  db.prepare(
    `INSERT OR REPLACE INTO catches
      (id, user_id, species_id, lat, lng, created_at, length_cm, note, weather_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    c.id,
    c.userId,
    c.speciesId,
    c.lat,
    c.lng,
    c.createdAt,
    c.lengthCm ?? null,
    c.note ?? null,
    JSON.stringify(c.weather ?? {}),
  )
  const revision = bumpRevision()
  res.json({ ok: true, revision })
})

app.post('/api/sessions/start', (req, res) => {
  const { id, userId, startedAt, points } = req.body || {}
  if (!userId || !startedAt) {
    return res.status(400).json({ error: 'missing fields' })
  }

  const existing = getActiveGroupSession()
  if (existing.active && existing.id) {
    // Liity olemassa olevaan ryhmäsessioon
    const tagged = (points ?? []).map((p) => ({ ...p, userId }))
    const merged = mergePoints(existing.points, tagged)
    db.prepare('UPDATE sessions SET points_json = ? WHERE id = ?').run(
      JSON.stringify(merged),
      existing.id,
    )
    // Merkitse myös tämä käyttäjä osallistujaksi omalla rivillä (jos ei jo auki)
    const mine = db
      .prepare(
        `SELECT id FROM sessions WHERE user_id = ? AND ended_at IS NULL LIMIT 1`,
      )
      .get(userId)
    if (!mine) {
      db.prepare(
        `INSERT INTO sessions (id, user_id, started_at, ended_at, points_json)
         VALUES (?, ?, ?, NULL, ?)`,
      ).run(
        id || `s-${userId}-${Date.now()}`,
        userId,
        existing.startedAt || startedAt,
        JSON.stringify(tagged),
      )
    }
    const revision = bumpRevision()
    return res.json({
      ok: true,
      joined: true,
      session: getActiveGroupSession(),
      revision,
    })
  }

  const sessionId = id || `s-${Date.now()}`
  const tagged = (points ?? []).map((p) => ({ ...p, userId }))
  db.prepare(
    `INSERT INTO sessions (id, user_id, started_at, ended_at, points_json)
     VALUES (?, ?, ?, NULL, ?)`,
  ).run(sessionId, userId, startedAt, JSON.stringify(tagged))
  const revision = bumpRevision()
  res.json({
    ok: true,
    joined: false,
    session: getActiveGroupSession(),
    revision,
  })
})

app.post('/api/sessions/:id/points', (req, res) => {
  const points = Array.isArray(req.body?.points) ? req.body.points : []
  const userId = req.body?.userId
  const group = getActiveGroupSession()
  if (!group.active || !group.id) {
    return res.status(404).json({ error: 'no active session' })
  }

  const tagged = points.map((p) => ({
    ...p,
    userId: p.userId || userId || undefined,
  }))
  const merged = mergePoints(group.points, tagged)
  db.prepare(
    `UPDATE sessions SET points_json = ? WHERE ended_at IS NULL`,
  ).run(JSON.stringify(merged))
  const revision = bumpRevision()
  res.json({ ok: true, points: merged, revision })
})

app.post('/api/sessions/:id/stop', (req, res) => {
  const endedAt = req.body?.endedAt || new Date().toISOString()
  const points = Array.isArray(req.body?.points) ? req.body.points : null
  const group = getActiveGroupSession()
  const merged = points
    ? mergePoints(group.points || [], points)
    : group.points || []

  // Lopeta KAIKKI auki olevat sessiot — kalastus päättyy koko ryhmältä
  db.prepare(
    `UPDATE sessions SET ended_at = ?, points_json = ? WHERE ended_at IS NULL`,
  ).run(endedAt, JSON.stringify(merged))
  const revision = bumpRevision()
  res.json({ ok: true, revision })
})

app.post('/api/fishing-days', (req, res) => {
  const d = req.body || {}
  if (!d.id || !d.date || !d.title) {
    return res.status(400).json({ error: 'missing fields' })
  }
  db.prepare(
    `INSERT OR REPLACE INTO fishing_days (id, date, title, participants_json)
     VALUES (?, ?, ?, ?)`,
  ).run(d.id, d.date, d.title, JSON.stringify(d.participants ?? []))
  const revision = bumpRevision()
  res.json({ ok: true, revision })
})

const WATER_OSM_KEYS = new Set([
  'water',
  'waterway',
  'coastline',
  'bay',
  'wetland',
  'reservoir',
  'harbour',
  'harbor',
  'marina',
  'islet',
  'island',
  'beach',
  'ferry_terminal',
])

async function overpassNearWater(lat, lng, radius) {
  const query = `
[out:json][timeout:20];
(
  way["natural"="water"](around:${radius},${lat},${lng});
  relation["natural"="water"](around:${radius},${lat},${lng});
  way["waterway"~"river|stream|canal|drain|ditch"](around:${radius},${lat},${lng});
  way["natural"="coastline"](around:${radius},${lat},${lng});
  nwr["landuse"="reservoir"](around:${radius},${lat},${lng});
  nwr["natural"="bay"](around:${radius},${lat},${lng});
  nwr["natural"="wetland"](around:${radius},${lat},${lng});
  nwr["place"~"islet|island"](around:${radius},${lat},${lng});
  nwr["harbour"](around:${radius},${lat},${lng});
  nwr["leisure"="marina"](around:${radius},${lat},${lng});
);
out ids 20;
`
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Kasinmiehet/0.1 (private fishing app)',
    },
    body: `data=${encodeURIComponent(query)}`,
  })
  if (!response.ok) throw new Error(`overpass ${response.status}`)
  const data = await response.json()
  const count = Array.isArray(data.elements) ? data.elements.length : 0
  return { nearWater: count > 0, count, source: 'overpass' }
}

async function photonNearWater(lat, lng) {
  const response = await fetch(
    `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en`,
    { headers: { 'User-Agent': 'Kasinmiehet/0.1 (private fishing app)' } },
  )
  if (!response.ok) throw new Error(`photon ${response.status}`)
  const data = await response.json()
  const props = data?.features?.[0]?.properties || {}
  const key = String(props.osm_key || '').toLowerCase()
  const value = String(props.osm_value || '').toLowerCase()
  const name = String(props.name || '').toLowerCase()
  const nearWater =
    WATER_OSM_KEYS.has(key) ||
    WATER_OSM_KEYS.has(value) ||
    key === 'natural' && WATER_OSM_KEYS.has(value) ||
    key === 'place' && (value === 'islet' || value === 'island') ||
    /satama|meri|järvi|lahti|ranta|harbour|marina|bay/.test(name)
  return { nearWater, count: nearWater ? 1 : 0, source: 'photon', detail: { key, value, name: props.name } }
}

/** Kalastuskalenteri: päiväarviot kalakalenteri.fi (tai solunar-varalla). */
app.get('/api/kalakalenteri', async (req, res) => {
  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat/lng required' })
  }
  try {
    const result = await fetchFishingCalendar(lat, lng)
    res.json({ lat, lng, ...result })
  } catch (e) {
    res.status(502).json({
      error: e instanceof Error ? e.message : 'kalakalenteri failed',
    })
  }
})

/** OSM water proximity (Overpass + Photon fallback). */
/** Pintaveden lämpötila: SYKE Hydrologiarajapinta (ympäristö.fi). */
app.get('/api/water-temp', async (req, res) => {
  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat/lng required' })
  }
  try {
    const result = await fetchNearestWaterTemp(lat, lng)
    if (!result) {
      return res.json({
        waterTempC: null,
        message: 'Ei tuoretta SYKE-vedenlämpöä lähialueella',
      })
    }
    res.json(result)
  } catch (e) {
    res.status(502).json({
      waterTempC: null,
      error: e instanceof Error ? e.message : 'SYKE water temp failed',
    })
  }
})

app.get('/api/near-water', async (req, res) => {
  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  const radius = Math.min(Number(req.query.radius) || 150, 500)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat/lng required' })
  }

  try {
    const result = await overpassNearWater(lat, lng, radius)
    return res.json({ ...result, radius })
  } catch (overpassErr) {
    try {
      const result = await photonNearWater(lat, lng)
      return res.json({
        ...result,
        radius,
        warning: overpassErr instanceof Error ? overpassErr.message : 'overpass failed',
      })
    } catch (photonErr) {
      return res.status(502).json({
        nearWater: null,
        error:
          photonErr instanceof Error ? photonErr.message : 'water lookup failed',
      })
    }
  }
})

// Production: serve Vite build from the same service (Render-friendly)
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: false, maxAge: '1h' }))
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Kasinmiehet http://0.0.0.0:${PORT}`)
  if (fs.existsSync(distDir)) console.log(`Serving UI from ${distDir}`)
})
