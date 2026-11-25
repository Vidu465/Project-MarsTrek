import {
  MapContainer, TileLayer, CircleMarker, Polyline, Polygon, Tooltip, ImageOverlay, GeoJSON, useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import type { GeoJsonObject } from 'geojson'
import 'leaflet/dist/leaflet.css'
import type { Target } from '../lib/targets'
import type { BoxworkRoverPoint } from '../lib/boxwork'
import { distanceFromAkm } from '../lib/boxwork'
import { LAYERS, tileUrl, CENTER } from '../lib/layers'

export type Hazard = { url: string; bounds: [[number, number], [number, number]] }
export type MapStop = { id: string; lat: number; lng: number; kind: 'target' | 'custom' }

// Schematic search footprint around the app's boxwork campaign candidate pin.
// NASA describes the boxwork belt by region but does not publish this polygon as
// a surveyed boundary; keep the visible label explicitly approximate.
const BOXWORK_ZONE: [number, number][] = [
  [-4.91, 137.30], [-4.88, 137.37], [-4.90, 137.45], [-4.95, 137.49],
  [-5.00, 137.45], [-5.02, 137.38], [-4.99, 137.31],
]

function Events({ onClick, onMove }: { onClick: (a: number, b: number) => void; onMove: (a: number, b: number) => void }) {
  useMapEvents({ click: e => onClick(e.latlng.lat, e.latlng.lng), mousemove: e => onMove(e.latlng.lat, e.latlng.lng) })
  return null
}

export default function MapView(props: {
  active: string; opacity: number; hazard: Hazard | null; traverse: GeoJsonObject | null
  routes: [number, number][][]; start: { lat: number; lng: number }; end: { lat: number; lng: number } | null
  targets: Target[]; boxworkPoints: BoxworkRoverPoint[]; astronautPoint: { lat: number; lng: number }; stops: MapStop[]; onTarget: (t: Target) => void
  onMapClick: (lat: number, lng: number) => void; onCursor: (lat: number, lng: number) => void
}) {
  const baseL = LAYERS.find(l => l.id === 'MOLA')!
  const l = LAYERS.find(x => x.id === props.active) ?? LAYERS[0]
  const tp = (x: typeof l, opacity = 1) => ({
    url: tileUrl(x), maxNativeZoom: x.maxZ, maxZoom: 15, bounds: x.bounds,
    noWrap: true, attribution: x.source, opacity,
  })
  const order = (id: string) => props.stops.findIndex(s => s.id === id)

  return (
    <MapContainer crs={L.CRS.EPSG4326} center={CENTER} zoom={10} minZoom={3} maxZoom={15} className="h-full w-full">
      <TileLayer key={'base-' + baseL.id} {...tp(baseL)} />
      {l.id !== baseL.id && <TileLayer key={l.id} {...tp(l, props.opacity)} />}
      {props.hazard && <ImageOverlay url={props.hazard.url} bounds={props.hazard.bounds} opacity={0.55} />}
      {props.traverse && <GeoJSON key="traverse" data={props.traverse} style={{ color: '#f59e0b', weight: 3, dashArray: '5 6' }} />}
      <Polygon positions={BOXWORK_ZONE} bubblingMouseEvents={false}
        pathOptions={{ color: '#ffb66e', weight: 2, dashArray: '7 6', fillColor: '#e87e42', fillOpacity: 0.16 }}>
        <Tooltip sticky>BOXWORK STUDY ZONE · APPROXIMATE</Tooltip>
      </Polygon>
      <Events onClick={props.onMapClick} onMove={props.onCursor} />
      {props.routes.map((route, i) => <Polyline key={i} positions={route} pathOptions={{ color: '#42e8db', weight: 4, opacity: 0.9 }} />)}

      <CircleMarker center={[props.start.lat, props.start.lng]} radius={12} bubblingMouseEvents={false}
        pathOptions={{ color: '#07130f', weight: 3, fillColor: '#7cffb2', fillOpacity: 1 }}>
        <Tooltip permanent direction="top">A · EVA START</Tooltip>
      </CircleMarker>
      {props.end && <CircleMarker center={[props.end.lat, props.end.lng]} radius={12} bubblingMouseEvents={false}
        pathOptions={{ color: '#170c06', weight: 3, fillColor: '#ff9d5c', fillOpacity: 1 }}>
        <Tooltip permanent direction="top">B · DESTINATION</Tooltip>
      </CircleMarker>}

      {props.boxworkPoints.map(point => {
        const km = distanceFromAkm(props.astronautPoint, point)
        return <CircleMarker key={point.id} center={[point.lat, point.lng]} radius={6} bubblingMouseEvents={false}
          pathOptions={{ color: '#2c160a', weight: 1.5, fillColor: '#ffb66e', fillOpacity: 1 }}>
          <Tooltip direction="top">Curiosity Sol {point.sol} · {km.toFixed(1)} km from A · {point.lat.toFixed(5)}°, {point.lng.toFixed(5)}°</Tooltip>
        </CircleMarker>
      })}

      {props.targets.map(t => {
        const o = order(t.id)
        return <CircleMarker key={t.id} center={[t.lat, t.lng]} radius={10} bubblingMouseEvents={false}
          pathOptions={{ color: '#f2f7f4', weight: 2, fillColor: o >= 0 ? '#41dce4' : '#a8b8a6', fillOpacity: 1 }}
          eventHandlers={{ click: () => props.onTarget(t) }}>
          <Tooltip permanent={o >= 0} direction="top">{o >= 0 ? `${o + 1}. ` : ''}{t.name}</Tooltip>
        </CircleMarker>
      })}
      {props.stops.filter(s => s.kind === 'custom').map(s => <CircleMarker key={s.id} center={[s.lat, s.lng]} radius={8}
        bubblingMouseEvents={false} pathOptions={{ color: '#fff', fillColor: '#ffc15d', fillOpacity: 1 }}>
        <Tooltip permanent direction="top">{order(s.id) + 1}. {s.id}</Tooltip>
      </CircleMarker>)}
    </MapContainer>
  )
}
