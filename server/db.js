import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Render: mount a persistent disk at /var/data (or set DATA_DIR)
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data')
fs.mkdirSync(dataDir, { recursive: true })

const db = new Database(path.join(dataDir, 'kasinmiehet.sqlite'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS species (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS preferences (
  user_id TEXT NOT NULL,
  species_id TEXT NOT NULL,
  undesired INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, species_id)
);

CREATE TABLE IF NOT EXISTS catches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  species_id TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  created_at TEXT NOT NULL,
  length_cm REAL,
  note TEXT,
  weather_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  points_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS fishing_days (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  participants_json TEXT NOT NULL
);
`)

const seedUsers = [
  ['olli', 'Olli'],
  ['matti', 'Matti'],
  ['jussi', 'Jussi'],
]
const insertUser = db.prepare(
  'INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)',
)
for (const u of seedUsers) insertUser.run(...u)

const seedSpecies = [
  ['jarvilohi', 'Järvilohi'],
  ['merilohi', 'Merilohi'],
  ['jarvitaimen', 'Järvitaimen'],
  ['kuha', 'Kuha'],
  ['hauki', 'Hauki'],
  ['ahven', 'Ahven'],
]
const insertSpecies = db.prepare(
  'INSERT OR IGNORE INTO species (id, name, created_by) VALUES (?, ?, NULL)',
)
for (const s of seedSpecies) insertSpecies.run(...s)

// Poista vanhat demosaaliit / testisaaliit jos niitä on vielä kannassa
db.prepare(
  `DELETE FROM catches WHERE id IN ('c1','c2','c3','c-test-1') OR note = 'UI-demo'`,
).run()

export default db
