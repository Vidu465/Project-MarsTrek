export type BoxworkRoverPoint = {
  id: string
  sol: number
  site: number | null
  drive: number | null
  lat: number
  lng: number
}

const WAYPOINTS_URL = 'https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json'
const FIRST_BOXWORK_SOL = 4534
const LAST_BOXWORK_SOL = 4865

export async function loadBoxworkRoverPoints(): Promise<BoxworkRoverPoint[]> {
  const response = await fetch(WAYPOINTS_URL, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`NASA rover waypoints unavailable (${response.status})`)
  const data: unknown = await response.json()
  if (!data || typeof data !== 'object' || !('features' in data) || !Array.isArray(data.features))
    throw new Error('NASA rover waypoint data has an unexpected format')

  const points = data.features.flatMap((raw: unknown) => {
    if (!raw || typeof raw !== 'object') return []
    const feature = raw as { properties?: Record<string, unknown>; geometry?: { coordinates?: unknown[] } }
    const p = feature.properties ?? {}
    const number = (...values: unknown[]) => {
      for (const value of values) {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
      }
      return null
    }
    const sol = number(p.sol, p.SOL, p.Sol, p.msol, p.MSOL)
    const lng = number(p.lon, p.longitude, feature.geometry?.coordinates?.[0])
    const lat = number(p.lat, p.latitude, feature.geometry?.coordinates?.[1])
    if (sol === null || sol < FIRST_BOXWORK_SOL || sol > LAST_BOXWORK_SOL || lat === null || lng === null) return []
    const site = number(p.site, p.Site)
    const drive = number(p.drive, p.Drive)
    return [{ id: `MSL-S${sol}-SITE${site ?? 'X'}-D${drive ?? 'X'}`, sol, site, drive, lat, lng }]
  })

  return [...new Map(points.map(point => [point.id, point])).values()].sort((a, b) => a.sol - b.sol)
}

export function distanceFromAkm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (deg: number) => deg * Math.PI / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 3389.5 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q))
}
