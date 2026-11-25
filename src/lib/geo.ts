const R = 3389500 // Mars mean radius, metres
const rad = (d: number) => (d * Math.PI) / 180

export function distM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}