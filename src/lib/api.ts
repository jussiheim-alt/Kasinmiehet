/** Empty base = same origin (Vite proxy /api → backend). Override with VITE_API_URL. */
const DEFAULT_API = ''
const TOKEN_KEY = 'kasinmiehet-token'

export function getApiBase(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined
  if (env) return env
  return DEFAULT_API
}

export function apiUrl(path: string): string {
  return `${getApiBase().replace(/\/$/, '')}${path}`
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

function authHeaders(): HeadersInit {
  const token = getToken()
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { headers: authHeaders() })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`)
  return res.json() as Promise<T>
}

export async function apiSend(
  path: string,
  method: 'POST' | 'PUT',
  body: unknown,
): Promise<void> {
  const res = await fetch(apiUrl(path), {
    method,
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`)
}

export async function apiPostJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let message = `${res.status}`
    try {
      const err = (await res.json()) as { error?: string }
      if (err.error) message = err.error
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}
