/** Local demo terrain model. This synthetic grid is for UI demonstrations only. */
export type Grid = {
  cols: number; rows: number; west: number; east: number; south: number; north: number
  cellM: number; elev: Float32Array; slope: Float32Array
}

const COLS = 140
const ROWS = 140
const WEST = 137.16
const EAST = 137.70
const SOUTH = -5.08
const NORTH = -4.40

export async function loadGrid(): Promise<Grid> {
  await Promise.resolve()
  const elev = new Float32Array(COLS * ROWS)
  const slope = new Float32Array(COLS * ROWS)
  const radius = 3389500
  const latStep = radius * Math.PI / 180 * (NORTH - SOUTH) / ROWS
  const lonStep = radius * Math.PI / 180 * Math.cos(Math.abs((NORTH + SOUTH) / 2) * Math.PI / 180) * (EAST - WEST) / COLS
  const cellM = (latStep + lonStep) / 2

  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const nx = x / (COLS - 1), ny = y / (ROWS - 1), i = y * COLS + x
    const ridges = Math.sin(nx * 17 + Math.cos(ny * 9)) * 5 + Math.cos(ny * 21 - nx * 4) * 4
    const craterA = Math.max(0, 1 - Math.hypot(nx - 0.42, ny - 0.55) / 0.16)
    const craterB = Math.max(0, 1 - Math.hypot(nx - 0.72, ny - 0.34) / 0.11)
    elev[i] = -4400 + ny * 20 + ridges + craterA * 8 + craterB * 6
  }
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const i = y * COLS + x
    const dx = (elev[y * COLS + Math.min(COLS - 1, x + 1)] - elev[y * COLS + Math.max(0, x - 1)]) / (2 * cellM)
    const dy = (elev[Math.min(ROWS - 1, y + 1) * COLS + x] - elev[Math.max(0, y - 1) * COLS + x]) / (2 * cellM)
    slope[i] = Math.atan(Math.hypot(dx, dy)) * 180 / Math.PI
  }
  return { cols: COLS, rows: ROWS, west: WEST, east: EAST, south: SOUTH, north: NORTH, cellM, elev, slope }
}

export function toCell(g: Grid, lat: number, lng: number): number | null {
  if (lat < g.south || lat > g.north || lng < g.west || lng > g.east) return null
  const x = Math.round((lng - g.west) / (g.east - g.west) * (g.cols - 1))
  const y = Math.round((g.north - lat) / (g.north - g.south) * (g.rows - 1))
  return y * g.cols + x
}

export function toLatLng(g: Grid, cell: number): [number, number] {
  const x = cell % g.cols, y = Math.floor(cell / g.cols)
  return [g.north - y / (g.rows - 1) * (g.north - g.south), g.west + x / (g.cols - 1) * (g.east - g.west)]
}

export function hazardDataUrl(g: Grid, limitDeg: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = g.cols
  canvas.height = g.rows
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const image = ctx.createImageData(g.cols, g.rows)
  for (let i = 0; i < g.slope.length; i++) if (g.slope[i] > limitDeg) {
    image.data[i * 4] = 239; image.data[i * 4 + 1] = 68
    image.data[i * 4 + 2] = 68; image.data[i * 4 + 3] = 136
  }
  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL()
}
