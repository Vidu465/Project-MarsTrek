export type Target = {
  id: string; name: string; sci: number; sampleMin: number
  unit: string; desc: string; verified: boolean; pov?: string; credit?: string
  lat: number; lng: number
}

export async function loadTargets(): Promise<Target[]> {
  const r = await fetch('/data/science_targets.geojson')
  if (!r.ok) throw new Error(`Could not load science targets (${r.status})`)
  const collection = await r.json() as {
    features?: { properties?: Omit<Target, 'lat' | 'lng'>; geometry?: { coordinates?: number[] } }[]
  }
  return (collection.features ?? []).flatMap(feature => {
    const [lng, lat] = feature.geometry?.coordinates ?? []
    if (typeof lat !== 'number' || typeof lng !== 'number' || !feature.properties) return []
    return [{ ...feature.properties, lat, lng }]
  })
}

// Start point (Bradbury Landing area), placeholder base
export const BASE = { lat: -4.59, lng: 137.44 }
