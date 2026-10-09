import L from 'leaflet'
import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import type { CatchRecord } from '../types'

type Hint = 'good' | 'avoid' | 'neutral'

const COLORS: Record<Hint, string> = {
  good: '#4ade80',
  avoid: '#fb7185',
  neutral: '#94a3b8',
}

export function CatchMap({
  catches,
  areaHint,
  center,
  routePoints,
}: {
  catches: CatchRecord[]
  areaHint: (lat: number, lng: number) => Hint
  center?: { lat: number; lng: number } | null
  routePoints?: { lat: number; lng: number }[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const start = center ?? catches[0] ?? { lat: 61.5, lng: 24.5 }
    const map = L.map(ref.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([start.lat, start.lng], catches.length ? 11 : 6)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map)

    L.control.zoom({ position: 'topright' }).addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
    // intentionally once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const layer = L.layerGroup().addTo(map)
    const bounds: L.LatLngExpression[] = []

    for (const c of catches) {
      const hint = areaHint(c.lat, c.lng)
      const marker = L.circleMarker([c.lat, c.lng], {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: COLORS[hint],
        fillOpacity: 0.9,
      }).addTo(layer)
      marker.bindPopup(`${c.speciesId}<br/>${c.lat.toFixed(3)}, ${c.lng.toFixed(3)}`)
      bounds.push([c.lat, c.lng])
    }

    if (routePoints && routePoints.length > 1) {
      const latlngs = routePoints.map((p) => [p.lat, p.lng] as L.LatLngExpression)
      L.polyline(latlngs, { color: '#3ec6b0', weight: 3, opacity: 0.85 }).addTo(layer)
      bounds.push(...latlngs)
    }

    if (center) {
      L.circleMarker([center.lat, center.lng], {
        radius: 6,
        color: '#f0b429',
        fillColor: '#f0b429',
        fillOpacity: 1,
      })
        .bindPopup('Sijaintisi')
        .addTo(layer)
      bounds.push([center.lat, center.lng])
    }

    if (bounds.length) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [28, 28], maxZoom: 13 })
    }

    return () => {
      layer.remove()
    }
  }, [catches, areaHint, center, routePoints])

  return <div ref={ref} className="leaflet-map" />
}
