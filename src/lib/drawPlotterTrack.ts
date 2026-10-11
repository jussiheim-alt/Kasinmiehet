import L from 'leaflet'
import {
  headingDegrees,
  splitTrackSegments,
  type RouteTrack,
} from './routeTrack'
import type { RoutePoint } from '../types'

/** Karttaplotteri-tyylinen reitti: hehku + track + leipämurut + keula. */
export function drawPlotterTrack(
  overlays: L.LayerGroup,
  route: {
    id: string
    label: string
    points: RoutePoint[]
    color: string
    live?: boolean
    tracks?: RouteTrack[]
  },
  bounds: L.LatLngExpression[],
) {
  const tracks =
    route.tracks && route.tracks.length
      ? route.tracks
      : [{ id: route.id, points: route.points }]

  for (const track of tracks) {
    const segments = splitTrackSegments(track.points)
    segments.forEach((seg, segIdx) => {
      const latlngs = seg.map((p) => [p.lat, p.lng] as L.LatLngExpression)
      bounds.push(...latlngs)

      // Tumma "plotteri"-pohja
      L.polyline(latlngs, {
        color: '#041018',
        weight: route.live ? 9 : 7,
        opacity: 0.55,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(overlays)

      // Varsinainen track
      L.polyline(latlngs, {
        color: route.color,
        weight: route.live ? 5 : 4,
        opacity: route.live ? 0.98 : 0.9,
        lineJoin: 'round',
        lineCap: 'round',
      })
        .bindPopup(
          `<strong>${route.label}</strong><br/>${seg.length} GPS-pistettä`,
        )
        .addTo(overlays)

      // Leipämurut (harvennetaan tiheillä reiteillä)
      const step = seg.length > 80 ? 4 : seg.length > 40 ? 2 : 1
      for (let i = 0; i < seg.length; i += step) {
        const p = seg[i]
        L.circleMarker([p.lat, p.lng], {
          radius: i === 0 ? 5 : 2.2,
          color: '#041018',
          weight: 1,
          fillColor: i === 0 ? '#4ade80' : route.color,
          fillOpacity: 0.95,
        }).addTo(overlays)
      }

      const end = seg[seg.length - 1]
      const heading = headingDegrees(seg) ?? 0
      const isLastSeg = segIdx === segments.length - 1
      if (isLastSeg) {
        const boat = L.divIcon({
          className: 'plotter-boat',
          html: `<div class="plotter-boat-inner ${route.live ? 'live' : ''}" style="--boat:${route.color};transform:rotate(${heading}deg)"></div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        })
        L.marker([end.lat, end.lng], { icon: boat, interactive: false }).addTo(
          overlays,
        )
      } else {
        L.circleMarker([end.lat, end.lng], {
          radius: 4,
          color: '#041018',
          weight: 1,
          fillColor: '#f0b429',
          fillOpacity: 1,
        }).addTo(overlays)
      }
    })
  }
}
