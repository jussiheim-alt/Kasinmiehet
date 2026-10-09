import L from 'leaflet'
import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import { fishMarkerSvg, speciesColor } from '../lib/speciesStyle'
import type { CatchRecord } from '../types'

type Hint = 'good' | 'avoid' | 'neutral'

const SYKE_WMS =
  'https://paikkatiedot.ymparisto.fi/geoserver/inspire_el/wms'

function fishIcon(speciesId: string) {
  const color = speciesColor(speciesId)
  return L.divIcon({
    className: 'fish-marker',
    html: `<div class="fish-marker-inner">${fishMarkerSvg(color, 30)}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -12],
  })
}

export function CatchMap({
  catches,
  areaHint,
  center,
  routePoints,
  speciesName,
}: {
  catches: CatchRecord[]
  areaHint: (lat: number, lng: number) => Hint
  center?: { lat: number; lng: number } | null
  routePoints?: { lat: number; lng: number }[]
  speciesName: (id: string) => string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const overlaysRef = useRef<L.LayerGroup | null>(null)
  const lastFitKeyRef = useRef('')

  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const start = center ?? catches[0] ?? { lat: 61.5, lng: 24.5 }
    const map = L.map(ref.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([start.lat, start.lng], catches.length ? 11 : 6)

    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap',
    })

    const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution:
        '&copy; OpenStreetMap, &copy; OpenTopoMap (CC-BY-SA)',
    })

    // SYKE järvien/jokien syvyysalueet + syvyyskäyrät (CC BY 4.0)
    const depthAreas = L.tileLayer.wms(SYKE_WMS, {
      layers: 'EL.Syvyysalue',
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      attribution: 'Syvyys: © SYKE',
      opacity: 0.55,
      maxZoom: 18,
    })

    const depthContours = L.tileLayer.wms(SYKE_WMS, {
      layers: 'EL.ContourLine',
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      attribution: 'Syvyyskäyrät: © SYKE',
      opacity: 0.85,
      maxZoom: 18,
    })

    osm.addTo(map)
    depthAreas.addTo(map)
    depthContours.addTo(map)

    L.control
      .layers(
        {
          OpenStreetMap: osm,
          Maasto: topo,
        },
        {
          'Syvyysalueet (SYKE)': depthAreas,
          'Syvyyskäyrät (SYKE)': depthContours,
        },
        { position: 'topleft', collapsed: true },
      )
      .addTo(map)

    L.control.zoom({ position: 'topright' }).addTo(map)

    const overlays = L.layerGroup().addTo(map)
    overlaysRef.current = overlays
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      overlaysRef.current = null
      lastFitKeyRef.current = ''
    }
    // intentionally once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const overlays = overlaysRef.current
    if (!map || !overlays) return

    overlays.clearLayers()
    const bounds: L.LatLngExpression[] = []

    for (const c of catches) {
      const hint = areaHint(c.lat, c.lng)
      const name = speciesName(c.speciesId)
      const color = speciesColor(c.speciesId)
      const marker = L.marker([c.lat, c.lng], {
        icon: fishIcon(c.speciesId),
        title: name,
      }).addTo(overlays)

      const hintLabel =
        hint === 'good' ? 'Haluttu (omat asetukset)' : hint === 'avoid' ? 'Ei-haluttu (omat asetukset)' : '—'

      marker.bindPopup(
        `<strong style="color:${color}">${name}</strong><br/>
         ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}<br/>
         <span style="opacity:.8">${hintLabel}</span>`,
      )
      bounds.push([c.lat, c.lng])
    }

    if (routePoints && routePoints.length > 1) {
      const latlngs = routePoints.map((p) => [p.lat, p.lng] as L.LatLngExpression)
      L.polyline(latlngs, { color: '#3ec6b0', weight: 3, opacity: 0.85 }).addTo(overlays)
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
        .addTo(overlays)
      bounds.push([center.lat, center.lng])
    }

    if (bounds.length) {
      const fitKey = `${catches.length}:${routePoints?.length ?? 0}:${center ? 1 : 0}`
      // Sovitetaan uudelleen kun aineisto muuttuu merkittävästi (ei joka syncissä).
      if (fitKey !== lastFitKeyRef.current) {
        map.fitBounds(L.latLngBounds(bounds), {
          padding: [28, 28],
          maxZoom: catches.length <= 3 ? 13 : 12,
        })
        lastFitKeyRef.current = fitKey
      }
    }
  }, [catches, areaHint, center, routePoints, speciesName])

  return <div ref={ref} className="leaflet-map" />
}
