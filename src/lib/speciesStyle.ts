/** Vakaat värit kalalajeille — samat kaikilla käyttäjillä. */

const SPECIES_COLORS: Record<string, string> = {
  jarvilohi: '#38bdf8',
  merilohi: '#818cf8',
  jarvitaimen: '#2dd4bf',
  kuha: '#fbbf24',
  hauki: '#4ade80',
  ahven: '#fb7185',
}

const FALLBACK_PALETTE = [
  '#f472b6',
  '#a78bfa',
  '#34d399',
  '#facc15',
  '#60a5fa',
  '#fb923c',
  '#e879f9',
  '#22d3ee',
]

function hashHue(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}

export function speciesColor(speciesId: string): string {
  if (SPECIES_COLORS[speciesId]) return SPECIES_COLORS[speciesId]
  return FALLBACK_PALETTE[hashHue(speciesId) % FALLBACK_PALETTE.length]
}

/** Yksinkertainen kalasymboli SVG-merkkijonona. */
export function fishMarkerSvg(color: string, size = 28): string {
  const s = size
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 32 32" aria-hidden="true">
  <ellipse cx="15" cy="16" rx="11" ry="6.5" fill="${color}" stroke="#0b1720" stroke-width="1.4"/>
  <path d="M24.5 16 L30 11.5 V20.5 Z" fill="${color}" stroke="#0b1720" stroke-width="1.2" stroke-linejoin="round"/>
  <circle cx="10" cy="14.5" r="1.35" fill="#0b1720"/>
  <path d="M8 16 Q15 12.5 22 16" fill="none" stroke="#0b1720" stroke-width="1" opacity="0.35"/>
</svg>`
}
