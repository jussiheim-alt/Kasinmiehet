/** Empty base = same origin (Vite proxy /api → backend). Override with VITE_API_URL. */
const DEFAULT_API = ''

export function getApiBase(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined
  if (env) return env
  return DEFAULT_API
}

export function apiUrl(path: string): string {
  return `${getApiBase().replace(/\/$/, '')}${path}`
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), {
    headers: { 'Content-Type': 'application/json' },
  })
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`)
}
