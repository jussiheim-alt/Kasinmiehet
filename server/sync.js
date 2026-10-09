import db from './db.js'

db.exec(`
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`)
db.prepare(
  `INSERT OR IGNORE INTO meta (key, value) VALUES ('revision', '1')`,
).run()

/** @type {Set<import('node:http').ServerResponse>} */
const sseClients = new Set()

export function getRevision() {
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'revision'`).get()
  return Number(row?.value || 1)
}

export function bumpRevision() {
  const next = getRevision() + 1
  db.prepare(`UPDATE meta SET value = ? WHERE key = 'revision'`).run(String(next))
  for (const res of sseClients) {
    try {
      res.write(`event: revision\ndata: ${JSON.stringify({ revision: next })}\n\n`)
    } catch {
      sseClients.delete(res)
    }
  }
  return next
}

export function addSseClient(res) {
  sseClients.add(res)
  res.write(`event: revision\ndata: ${JSON.stringify({ revision: getRevision() })}\n\n`)
  return () => sseClients.delete(res)
}

function mergePoints(existing, incoming) {
  const map = new Map()
  for (const p of [...(existing || []), ...(incoming || [])]) {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue
    const t = p.t || ''
    const key = `${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)},${t}`
    map.set(key, {
      lat: p.lat,
      lng: p.lng,
      t,
      userId: p.userId || undefined,
    })
  }
  return [...map.values()].sort((a, b) => String(a.t).localeCompare(String(b.t)))
}

export function getActiveGroupSession() {
  const rows = db
    .prepare(
      `SELECT id, user_id AS userId, started_at AS startedAt, points_json AS pointsJson
       FROM sessions WHERE ended_at IS NULL ORDER BY started_at ASC`,
    )
    .all()
  if (!rows.length) {
    return {
      active: false,
      startedAt: null,
      points: [],
      id: null,
      startedBy: null,
      participants: [],
    }
  }

  // Yksi yhteinen sessio: vanhin auki oleva on "ryhmäsessio";
  // yhdistetään kaikkien auki olevien pisteet.
  const primary = rows[0]
  let points = []
  const participants = []
  for (const row of rows) {
    participants.push(row.userId)
    const pts = JSON.parse(row.pointsJson || '[]').map((p) => ({
      ...p,
      userId: p.userId || row.userId,
    }))
    points = mergePoints(points, pts)
  }

  return {
    active: true,
    id: primary.id,
    startedAt: primary.startedAt,
    startedBy: primary.userId,
    participants: [...new Set(participants)],
    points,
  }
}

export function dateKeyHelsinki(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Tallentaa päättyneen session reitin kalastuspäivälle (luo päivän tarvittaessa). */
export function saveRouteToFishingDay({
  date,
  points,
  participants = [],
  title,
  mapVisible = true,
}) {
  const existing = db
    .prepare(`SELECT * FROM fishing_days WHERE date = ? ORDER BY id LIMIT 1`)
    .get(date)

  const mergedPoints = mergePoints(
    existing ? JSON.parse(existing.route_points_json || '[]') : [],
    points || [],
  )
  const mergedParticipants = [
    ...new Set([
      ...(existing ? JSON.parse(existing.participants_json || '[]') : []),
      ...participants,
    ]),
  ]

  if (existing) {
    db.prepare(
      `UPDATE fishing_days
       SET route_points_json = ?,
           participants_json = ?,
           map_visible = CASE WHEN ? = 1 THEN 1 ELSE map_visible END
       WHERE id = ?`,
    ).run(
      JSON.stringify(mergedPoints),
      JSON.stringify(mergedParticipants),
      mapVisible ? 1 : 0,
      existing.id,
    )
    return existing.id
  }

  const id = `d-${date}-${Date.now()}`
  db.prepare(
    `INSERT INTO fishing_days
      (id, date, title, participants_json, map_visible, route_points_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    date,
    title || 'Kalastuspäivä',
    JSON.stringify(mergedParticipants),
    mapVisible ? 1 : 0,
    JSON.stringify(mergedPoints),
  )
  return id
}

/** Kerää päättyneiden sessioiden reitit kalastuspäiville (kertaluonteinen backfill). */
export function backfillRoutesFromSessions() {
  const rows = db
    .prepare(
      `SELECT id, user_id AS userId, started_at AS startedAt, points_json AS pointsJson
       FROM sessions WHERE ended_at IS NOT NULL`,
    )
    .all()
  for (const row of rows) {
    const points = JSON.parse(row.pointsJson || '[]')
    if (!points.length) continue
    saveRouteToFishingDay({
      date: dateKeyHelsinki(row.startedAt),
      points: points.map((p) => ({ ...p, userId: p.userId || row.userId })),
      participants: [row.userId],
      mapVisible: false,
    })
  }
}

export function buildSyncPayload(userId) {
  const species = db
    .prepare('SELECT id, name, created_by AS createdBy FROM species ORDER BY name')
    .all()
  const catches = db
    .prepare(
      `SELECT id, user_id AS userId, species_id AS speciesId, lat, lng, created_at AS createdAt,
              length_cm AS lengthCm, note, weather_json AS weatherJson
       FROM catches ORDER BY created_at DESC LIMIT 200`,
    )
    .all()
    .map((c) => ({
      id: c.id,
      userId: c.userId,
      speciesId: c.speciesId,
      lat: c.lat,
      lng: c.lng,
      createdAt: c.createdAt,
      lengthCm: c.lengthCm ?? undefined,
      note: c.note ?? undefined,
      weather: JSON.parse(c.weatherJson),
    }))
  const fishingDays = db
    .prepare(
      `SELECT id, date, title, participants_json AS participantsJson,
              map_visible AS mapVisible, route_points_json AS routePointsJson
       FROM fishing_days ORDER BY date DESC`,
    )
    .all()
    .map((d) => ({
      id: d.id,
      date: d.date,
      title: d.title,
      participants: JSON.parse(d.participantsJson || '[]'),
      mapVisible: Boolean(d.mapVisible),
      routePoints: JSON.parse(d.routePointsJson || '[]'),
    }))
  const undesired = userId
    ? db
        .prepare(
          'SELECT species_id AS speciesId FROM preferences WHERE user_id = ? AND undesired = 1',
        )
        .all(userId)
        .map((r) => r.speciesId)
    : []

  return {
    revision: getRevision(),
    species,
    catches,
    fishingDays,
    undesired,
    session: getActiveGroupSession(),
  }
}

export { mergePoints }

// Varmista että vanhat sessioreitit löytyvät kalastuspäiviltä
try {
  backfillRoutesFromSessions()
} catch {
  /* ignore backfill errors on boot */
}
