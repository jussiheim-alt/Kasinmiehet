/**
 * Kalastuskalenteri: hakee päiväarviot kalakalenteri.fi:stä (sijaintikeksit).
 * Jos haku epäonnistuu, arvioidaan solunar-tyylisesti suncalcilla.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const SunCalc = require('suncalc')

const CACHE_TTL_MS = 60 * 60 * 1000
const cache = new Map()

function cacheKey(lat, lng) {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`
}

function labelFromRating(rating) {
  if (rating >= 3) return 'Hyvä kalastuspäivä'
  if (rating >= 2) return 'Keskiverto kalastuspäivä'
  if (rating >= 1) return 'Kohtalainen kalastuspäivä'
  return 'Huono kalastuspäivä'
}

function ratingLevel(rating) {
  if (rating >= 3) return 'hyva'
  if (rating >= 2) return 'keskiverto'
  if (rating >= 1) return 'kohtalainen'
  return 'huono'
}

function shortLabel(label) {
  return String(label || '')
    .replace(/\s*kalastuspäivä\s*/i, '')
    .trim() || '—'
}

function parseArticles(html) {
  const articles = html.match(/<article class="paiva"[^>]*>[\s\S]*?<\/article>/g) || []
  const days = []
  for (const article of articles) {
    const ratingMatch = article.match(/data-rating="([^"]+)"/)
    const moonMatch = article.match(/data-moon="([^"]+)"/)
    const dateMatch = article.match(/datetime="(\d{4}-\d{2}-\d{2})"/)
    const labelMatch = article.match(/class="sanaselite"[^>]*>([^<]+)/)
    if (!ratingMatch || !dateMatch) continue

    const rating = Number(ratingMatch[1])
    const label = (labelMatch?.[1] || labelFromRating(rating)).trim()

    const sunBlock = article.match(
      /aurinko\.png[\s\S]*?<div class="nousu-ja-lasku[^"]*">\s*<time>([^<]+)<\/time>\s*<br\s*\/?>\s*<time>([^<]+)<\/time>/i,
    )
    const moonBlock = article.match(
      /kuu\d+\.png[\s\S]*?<div class="nousu-ja-lasku[^"]*">\s*<time>([^<]+)<\/time>\s*<br\s*\/?>\s*<time>([^<]+)<\/time>/i,
    )

    const feedWindows = []
    const feedRe =
      /<div class="ottiaika ([^"]+)"[^>]*>\s*<time>([^<]+)<\/time>\s*<br\s*\/?>\s*-\s*<br\s*\/?>\s*<time>([^<]+)<\/time>/g
    let m
    while ((m = feedRe.exec(article))) {
      feedWindows.push({
        kind: m[1] === 'pimea' ? 'pimea' : 'valoisa',
        start: m[2].trim(),
        end: m[3].trim(),
      })
    }

    days.push({
      date: dateMatch[1],
      rating,
      level: ratingLevel(rating),
      label,
      shortLabel: shortLabel(label),
      moonIllumination: moonMatch ? Number(moonMatch[1]) : null,
      sun: sunBlock
        ? { rise: sunBlock[1].trim(), set: sunBlock[2].trim() }
        : null,
      moon: moonBlock
        ? { rise: moonBlock[1].trim(), set: moonBlock[2].trim() }
        : null,
      feedWindows,
    })
  }
  return days
}

async function fetchFromKalakalenteri(lat, lng) {
  const cookie = [
    `coordinate_lat=${lat.toFixed(6)}`,
    `coordinate_lon=${lng.toFixed(6)}`,
    'country_code=FI',
    'ip_location=0',
  ].join('; ')

  const response = await fetch('https://www.kalakalenteri.fi/', {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent':
        'Mozilla/5.0 (compatible; Kasinmiehet/0.1; +https://github.com/jussiheim-alt/Kasinmiehet) AppleWebKit/537.36 Chrome/120.0.0.0',
      Cookie: cookie,
      'Accept-Language': 'fi-FI,fi;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(45000),
  })
  if (!response.ok) throw new Error(`kalakalenteri ${response.status}`)
  const html = await response.text()
  const days = parseArticles(html)
  if (!days.length) throw new Error('kalakalenteri: no days parsed')
  return {
    source: 'kalakalenteri.fi',
    attribution: 'Tiedot: kalakalenteri.fi',
    days,
  }
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatHm(date) {
  if (!date || Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('fi-FI', {
    timeZone: 'Europe/Helsinki',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000)
}

/** Yksinkertainen solunar-arvio (varalla jos verkkolähde ei vastaa). */
function solunarFallback(lat, lng, dayCount = 14) {
  const days = []
  const now = new Date()
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12, 0, 0)
    const dateStr = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    const illum = SunCalc.getMoonIllumination(d)
    const times = SunCalc.getMoonTimes(d, lat, lng)
    const sun = SunCalc.getTimes(d, lat, lng)

    // Uusi / täysikuu parempia; 0.5 heikoin
    const phaseScore = 1 - Math.min(illum.phase, 1 - illum.phase) * 2 // 1 at new/full, 0 at quarters
    const rating = Math.round((0.6 + phaseScore * 3.2) * 10) / 10
    const label = labelFromRating(rating)

    const feedWindows = []
    const majorCenter = times.rise || times.set
    if (majorCenter) {
      feedWindows.push({
        kind: 'valoisa',
        start: formatHm(addMinutes(majorCenter, -45)),
        end: formatHm(addMinutes(majorCenter, 45)),
      })
    }
    // Kuun "ylikulku" arvio: puoliväli nousun ja laskun välillä
    if (times.rise && times.set) {
      const mid = new Date((times.rise.getTime() + times.set.getTime()) / 2)
      feedWindows.push({
        kind: 'pimea',
        start: formatHm(addMinutes(mid, -30)),
        end: formatHm(addMinutes(mid, 30)),
      })
    }

    days.push({
      date: dateStr,
      rating,
      level: ratingLevel(rating),
      label,
      shortLabel: shortLabel(label),
      moonIllumination: Math.round(illum.fraction * 10) / 10,
      sun: { rise: formatHm(sun.sunrise), set: formatHm(sun.sunset) },
      moon: { rise: formatHm(times.rise), set: formatHm(times.set) },
      feedWindows: feedWindows.filter((w) => w.start && w.end),
    })
  }
  return {
    source: 'solunar-approx',
    attribution: 'Arvio kuun vaiheesta (kalakalenteri.fi ei vastannut)',
    days,
  }
}

export async function fetchFishingCalendar(lat, lng) {
  const key = cacheKey(lat, lng)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { ...hit.data, cached: true }
  }

  try {
    const data = await fetchFromKalakalenteri(lat, lng)
    cache.set(key, { at: Date.now(), data })
    return { ...data, cached: false }
  } catch (primaryErr) {
    const data = solunarFallback(lat, lng)
    cache.set(key, { at: Date.now(), data })
    return {
      ...data,
      cached: false,
      warning:
        primaryErr instanceof Error ? primaryErr.message : 'kalakalenteri failed',
    }
  }
}
