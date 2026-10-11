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

function readTracks(row) {
  try {
    const tracks = JSON.parse(row.route_tracks_json || '[]')
    if (Array.isArray(tracks) && tracks.length) return tracks
  } catch {
    /* ignore */
  }
  // Vanha flat-lista → yksi track
  try {
    const points = JSON.parse(row.route_points_json || '[]')
    if (points.length) {
      return [{ id: `legacy-${row.id}`, points }]
    }
  } catch {
    /* ignore */
  }
  return []
}

function flattenTracks(tracks) {
  const all = []
  for (const t of tracks || []) {
    for (const p of t.points || []) all.push(p)
  }
  return mergePoints([], all)
}

/** Tallentaa päättyneen session reitin omana trackina (ei sekoita eri reittejä). */
export function saveRouteToFishingDay({
  date,
  points,
  participants = [],
  title,
  mapVisible = true,
  trackId,
  userId,
}) {
  const existing = db
    .prepare(`SELECT * FROM fishing_days WHERE date = ? ORDER BY id LIMIT 1`)
    .get(date)

  const cleanPoints = mergePoints([], points || [])
  if (!cleanPoints.length) {
    return existing?.id ?? null
  }

  const newTrack = {
    id: trackId || `tr-${Date.now()}`,
    userId: userId || cleanPoints[0]?.userId || null,
    points: cleanPoints,
  }

  const mergedParticipants = [
    ...new Set([
      ...(existing ? JSON.parse(existing.participants_json || '[]') : []),
      ...participants,
    ]),
  ]

  if (existing) {
    const tracks = readTracks(existing)
    const idx = tracks.findIndex((t) => t.id === newTrack.id)
    if (idx >= 0) {
      tracks[idx] = {
        ...tracks[idx],
        points: mergePoints(tracks[idx].points || [], newTrack.points),
        userId: newTrack.userId || tracks[idx].userId,
      }
    } else {
      tracks.push(newTrack)
    }
    const flat = flattenTracks(tracks)
    db.prepare(
      `UPDATE fishing_days
       SET route_tracks_json = ?,
           route_points_json = ?,
           participants_json = ?,
           map_visible = CASE WHEN ? = 1 THEN 1 ELSE map_visible END
       WHERE id = ?`,
    ).run(
      JSON.stringify(tracks),
      JSON.stringify(flat),
      JSON.stringify(mergedParticipants),
      mapVisible ? 1 : 0,
      existing.id,
    )
    return existing.id
  }

  const id = `d-${date}-${Date.now()}`
  db.prepare(
    `INSERT INTO fishing_days
      (id, date, title, participants_json, map_visible, route_points_json, route_tracks_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    date,
    title || 'Kalastuspäivä',
    JSON.stringify(mergedParticipants),
    mapVisible ? 1 : 0,
    JSON.stringify(cleanPoints),
    JSON.stringify([newTrack]),
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
      trackId: `session-${row.id}`,
      userId: row.userId,
    })
  }
}

/** Muunna vanhat flat-reitit trackeiksi + pilko isot hypyt. */
export function migrateFlatRoutesToTracks() {
  const rows = db.prepare(`SELECT * FROM fishing_days`).all()
  for (const row of rows) {
    let tracks = []
    try {
      tracks = JSON.parse(row.route_tracks_json || '[]')
    } catch {
      tracks = []
    }
    if (tracks.length) continue
    let points = []
    try {
      points = JSON.parse(row.route_points_json || '[]')
    } catch {
      points = []
    }
    if (!points.length) continue

    // Pilko hyppyjen mukaan erillisiksi trackeiksi
    const sorted = [...points].sort((a, b) => String(a.t).localeCompare(String(b.t)))
    const segments = []
    let cur = [sorted[0]]
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const p = sorted[i]
      const dist =
        Math.hypot(
          (p.lat - prev.lat) * 111_320,
          (p.lng - prev.lng) * 111_320 * Math.cos((prev.lat * Math.PI) / 180),
        )
      const dt = Math.abs(new Date(p.t).getTime() - new Date(prev.t).getTime())
      if (dist > 180 || dt > 8 * 60_000) {
        if (cur.length >= 2) segments.push(cur)
        cur = [p]
      } else {
        cur.push(p)
      }
    }
    if (cur.length >= 2) segments.push(cur)

    tracks = segments.map((seg, i) => ({
      id: `migrated-${row.id}-${i}`,
      userId: seg[0]?.userId || null,
      points: seg,
    }))
    db.prepare(
      `UPDATE fishing_days SET route_tracks_json = ?, route_points_json = ? WHERE id = ?`,
    ).run(JSON.stringify(tracks), JSON.stringify(flattenTracks(tracks)), row.id)
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
              map_visible AS mapVisible, route_points_json AS routePointsJson,
              route_tracks_json AS routeTracksJson
       FROM fishing_days ORDER BY date DESC`,
    )
    .all()
    .map((d) => {
      const tracks = readTracks({
        id: d.id,
        route_tracks_json: d.routeTracksJson,
        route_points_json: d.routePointsJson,
      })
      return {
        id: d.id,
        date: d.date,
        title: d.title,
        participants: JSON.parse(d.participantsJson || '[]'),
        mapVisible: Boolean(d.mapVisible),
        routeTracks: tracks,
        routePoints: flattenTracks(tracks),
      }
    })
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
  migrateFlatRoutesToTracks()
  backfillRoutesFromSessions()
} catch {
  /* ignore backfill errors on boot */
}
