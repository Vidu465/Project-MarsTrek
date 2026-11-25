import type { Grid } from './grid'

export type Params = {
  massKg: number; paceMs: number; basalW: number; sampleW: number
  capJ: number; startPct: number; bufferPct: number
  maxSlopeDeg: number; weightFactor: number; dustDragPct: number; strideM: number
}
export const DEFAULTS: Params = {
  massKg: 160, paceMs: 0.9, basalW: 120, sampleW: 250,
  capJ: 9 * 3600 * 293, startPct: 92, bufferPct: 25,
  maxSlopeDeg: 20, weightFactor: 3.71 / 9.81, dustDragPct: 0, strideM: 0.75,
}

const minetti = (i: number) => {
  i = Math.max(-0.45, Math.min(0.45, i))
  return 280.5 * i ** 5 - 58.7 * i ** 4 - 76.8 * i ** 3 + 51.9 * i ** 2 + 19.6 * i + 2.5
}

class Heap {
  a: [number, number][] = []
  get size() { return this.a.length }
  push(c: number, n: number) {
    const a = this.a; a.push([c, n]); let i = a.length - 1
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop()!
    if (a.length) {
      a[0] = last; let i = 0
      for (;;) {
        let m = i; const l = 2 * i + 1, r = l + 1
        if (l < a.length && a[l][0] < a[m][0]) m = l
        if (r < a.length && a[r][0] < a[m][0]) m = r
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m
      }
    }
    return top
  }
}

type Field = { dist: Float64Array; prev: Int32Array }
const caches = new WeakMap<Grid, Map<string, Field>>()
const sig = (p: Params) => [p.massKg, p.paceMs, p.basalW, p.weightFactor, p.maxSlopeDeg, p.dustDragPct].join('|')

function effectivePace(p: Params) {
  return p.paceMs * (1 - Math.max(0, Math.min(40, p.dustDragPct)) / 100 * 0.5)
}

function edgeEnergy(distanceM: number, grade: number, p: Params) {
  const roughnessMultiplier = 1 + Math.max(0, Math.min(40, p.dustDragPct)) / 100
  return (minetti(grade) * p.massKg * p.weightFactor * distanceM + p.basalW * distanceM / effectivePace(p)) * roughnessMultiplier
}

function field(g: Grid, src: number, p: Params): Field {
  let m = caches.get(g)
  if (!m) { m = new Map(); caches.set(g, m) }
  const key = sig(p) + '#' + src
  const hit = m.get(key)
  if (hit) return hit
  if (m.size > 24) m.clear()
  const N = g.cols * g.rows
  const dist = new Float64Array(N).fill(Infinity)
  const prev = new Int32Array(N).fill(-1)
  const h = new Heap()
  dist[src] = 0; h.push(0, src)
  while (h.size) {
    const [c, u] = h.pop()
    if (c > dist[u]) continue
    const ux = u % g.cols, uy = (u / g.cols) | 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const x = ux + dx, y = uy + dy
      if (x < 0 || y < 0 || x >= g.cols || y >= g.rows) continue
      const v = y * g.cols + x
      if (g.elev[v] < -9000 || g.slope[v] > p.maxSlopeDeg) continue
      const d = g.cellM * Math.hypot(dx, dy)
      const grade = (g.elev[v] - g.elev[u]) / d
      if (Math.atan(Math.abs(grade)) * 57.2958 > p.maxSlopeDeg) continue
      const e = edgeEnergy(d, grade, p)
      if (c + e < dist[v]) { dist[v] = c + e; prev[v] = u; h.push(c + e, v) }
    }
  }
  const f = { dist, prev }
  m.set(key, f)
  return f
}

export type Leg = { cells: number[]; energyJ: number; distM: number; timeS: number; maxSlope: number; meanSlope: number; steps: number }

export function leg(g: Grid, a: number, b: number, p: Params): Leg | null {
  const f = field(g, a, p)
  if (!isFinite(f.dist[b])) return null
  const cells: number[] = []
  for (let c = b; c !== -1; c = f.prev[c]) cells.push(c)
  cells.reverse()
  let distM = 0, timeS = 0, maxSlope = 0, slopeDistance = 0, steps = 0
  for (let i = 1; i < cells.length; i++) {
    const u = cells[i - 1], v = cells[i]
    const d = g.cellM * Math.hypot((v % g.cols) - (u % g.cols), ((v / g.cols) | 0) - ((u / g.cols) | 0))
    const grade = (g.elev[v] - g.elev[u]) / d
    distM += d
    timeS += d / effectivePace(p)
    steps += d / p.strideM
    const slopeDeg = Math.atan(Math.abs(grade)) * 57.2958
    maxSlope = Math.max(maxSlope, slopeDeg)
    slopeDistance += slopeDeg * d
  }
  return { cells, energyJ: f.dist[b], distM, timeS, maxSlope, meanSlope: distM > 0 ? slopeDistance / distM : 0, steps }
}

// Geometric shortest path across the same traversability mask used by the
// route planner. This is for comparison only; it does not replace the
// energy-weighted route or certify terrain as safe.
export function shortestDistance(g: Grid, src: number, dst: number, p: Params): number | null {
  const n = g.cols * g.rows
  const dist = new Float64Array(n).fill(Infinity)
  const heap = new Heap()
  dist[src] = 0
  heap.push(0, src)
  while (heap.size) {
    const [cost, u] = heap.pop()
    if (cost > dist[u]) continue
    if (u === dst) return cost
    const x0 = u % g.cols, y0 = (u / g.cols) | 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const x = x0 + dx, y = y0 + dy
      if (x < 0 || y < 0 || x >= g.cols || y >= g.rows) continue
      const v = y * g.cols + x
      if (g.elev[v] < -9000 || g.slope[v] > p.maxSlopeDeg) continue
      const d = g.cellM * Math.hypot(dx, dy)
      const grade = (g.elev[v] - g.elev[u]) / d
      if (Math.atan(Math.abs(grade)) * 57.2958 > p.maxSlopeDeg) continue
      if (cost + d < dist[v]) { dist[v] = cost + d; heap.push(cost + d, v) }
    }
  }
  return null
}

export type Stop = { id: string; name: string; cell: number; sampleMin: number; sci: number }
export type Plan = {
  legs: Leg[]
  rows: { name: string; legKm: number; legKJ: number; reservePct: number }[]
  distM: number; timeS: number; energyJ: number; maxSlope: number; meanSlope: number; steps: number; avgStepEnergyJ: number; oxygenFactor: number
  reservePct: number; ok: boolean; walkBackS: number; walkBackM: number
}

export function evaluate(g: Grid, home: number, stops: Stop[], p: Params, destination = home, returnToHome = true): Plan | null {
  const pts = [home, ...stops.map(s => s.cell), destination, ...(returnToHome && destination !== home ? [home] : [])]
  const legs: Leg[] = []
  const rows: Plan['rows'] = []
  let E = 0, time = 0, dist = 0, maxSlope = 0, slopeDistance = 0, steps = 0, walkEnergy = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const l = leg(g, pts[i], pts[i + 1], p)
    if (!l) return null
    legs.push(l)
    E += l.energyJ; time += l.timeS; dist += l.distM; maxSlope = Math.max(maxSlope, l.maxSlope); slopeDistance += l.meanSlope * l.distM
    steps += l.steps; walkEnergy += l.energyJ
    const s = stops[i]
    if (s) { E += p.sampleW * s.sampleMin * 60; time += s.sampleMin * 60 }
    rows.push({
      name: i < stops.length ? 'To ' + stops[i].name
        : destination !== home && i === stops.length ? 'To destination B'
          : returnToHome ? 'Return to start A' : 'Final leg',
      legKm: l.distM / 1000, legKJ: l.energyJ / 1000,
      reservePct: p.startPct - (E / p.capJ) * 100,
    })
  }
  let wbS = 0, wbM = 0
  const returnPoints = [...stops.map(s => s.cell), ...(destination !== home ? [destination] : [])]
  for (const point of returnPoints) {
    const b = leg(g, point, home, p)
    if (b) { wbS = Math.max(wbS, b.timeS); wbM = Math.max(wbM, b.distM) }
  }
  const reservePct = p.startPct - (E / p.capJ) * 100
  const avgStepEnergyJ = steps > 0 ? walkEnergy / steps : 0
  const flatStepJ = (2.5 * p.massKg * p.weightFactor * p.strideM + p.basalW * p.strideM / effectivePace(p)) * (1 + Math.max(0, Math.min(40, p.dustDragPct)) / 100)
  const oxygenFactor = flatStepJ > 0 && avgStepEnergyJ > 0 ? Math.min(2.5, Math.max(0.5, avgStepEnergyJ / flatStepJ)) : 1
  return { legs, rows, distM: dist, timeS: time, energyJ: E, maxSlope, meanSlope: dist > 0 ? slopeDistance / dist : 0, steps,
           avgStepEnergyJ, oxygenFactor,
           reservePct, ok: reservePct >= p.bufferPct, walkBackS: wbS, walkBackM: wbM }
}

const perms = <T,>(a: T[]): T[][] =>
  a.length < 2 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(r => [x, ...r]))

export function recommend(g: Grid, home: number, cands: Stop[], p: Params) {
  let best: { ids: string[]; sci: number; res: number } | null = null
  for (let m = 1; m < 1 << cands.length; m++) {
    const set = cands.filter((_, i) => (m >> i) & 1)
    const sci = set.reduce((a, s) => a + s.sci, 0)
    for (const order of perms(set)) {
      const pts = [home, ...order.map(s => s.cell), home]
      let E = order.reduce((a, s) => a + p.sampleW * s.sampleMin * 60, 0), ok = true
      for (let i = 0; i < pts.length - 1; i++) {
        const d = field(g, pts[i], p).dist[pts[i + 1]]
        if (!isFinite(d)) { ok = false; break }
        E += d
      }
      const res = p.startPct - (E / p.capJ) * 100
      if (ok && res >= p.bufferPct && (!best || sci > best.sci || (sci === best.sci && res > best.res)))
        best = { ids: order.map(s => s.id), sci, res }
    }
  }
  return best
}
