import crypto from 'node:crypto'
import db from './db.js'

function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(pin), salt, 32).toString('hex')
  return { salt, hash }
}

function verifyPin(pin, salt, hash) {
  const next = crypto.scryptSync(String(pin), salt, 32).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(next, 'hex'), Buffer.from(hash, 'hex'))
}

// Ensure auth columns + sessions table
const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name)
if (!cols.includes('pin_salt')) {
  db.exec('ALTER TABLE users ADD COLUMN pin_salt TEXT')
}
if (!cols.includes('pin_hash')) {
  db.exec('ALTER TABLE users ADD COLUMN pin_hash TEXT')
}

db.exec(`
CREATE TABLE IF NOT EXISTS auth_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`)

/** Default PINs — vaihdettavissa myöhemmin. Älä jaa julkisesti. */
const DEFAULT_PINS = {
  olli: process.env.PIN_OLLI || '4821',
  matti: process.env.PIN_MATTI || '5739',
  jussi: process.env.PIN_JUSSI || '6942',
}

const getUser = db.prepare('SELECT id, name, pin_salt AS pinSalt, pin_hash AS pinHash FROM users WHERE id = ?')
const setPin = db.prepare('UPDATE users SET pin_salt = ?, pin_hash = ? WHERE id = ?')

for (const [id, pin] of Object.entries(DEFAULT_PINS)) {
  const row = getUser.get(id)
  if (row && !row.pinHash) {
    const { salt, hash } = hashPin(pin)
    setPin.run(salt, hash, id)
  }
}

export function loginWithPin(userId, pin) {
  const row = getUser.get(userId)
  if (!row?.pinHash || !row.pinSalt) return null
  if (!verifyPin(pin, row.pinSalt, row.pinHash)) return null
  const token = crypto.randomBytes(24).toString('hex')
  db.prepare(
    'INSERT INTO auth_tokens (token, user_id, created_at) VALUES (?, ?, ?)',
  ).run(token, userId, new Date().toISOString())
  return { token, userId: row.id, name: row.name }
}

export function userFromToken(token) {
  if (!token) return null
  const row = db
    .prepare(
      `SELECT t.user_id AS userId, u.name
       FROM auth_tokens t JOIN users u ON u.id = t.user_id
       WHERE t.token = ?`,
    )
    .get(token)
  return row || null
}

export function logoutToken(token) {
  if (!token) return
  db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(token)
}

export function authMiddleware(req, _res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  req.auth = token ? userFromToken(token) : null
  req.authToken = token
  next()
}
