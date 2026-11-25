import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Activity, ArrowDown, ArrowUp, BatteryCharging, Bot, Check, ChevronDown,
  CircleHelp, Crosshair, Database, HeartPulse, Layers3, MapPinned, MoveUpRight,
  Navigation, Orbit, Radio, RotateCcw, Search, Send, Shield, ShieldAlert,
  ShieldCheck, Sparkles, Thermometer, Wind, X,
} from 'lucide-react'
import type { GeoJsonObject } from 'geojson'
import MapView from './components/MapViewer'
import type { Hazard } from './components/MapViewer'
import { BASE, loadTargets } from './lib/targets'
import type { Target } from './lib/targets'
import { distanceFromAkm, loadBoxworkRoverPoints } from './lib/boxwork'
import type { BoxworkRoverPoint } from './lib/boxwork'
import { DEFAULT_LAYER, LAYERS, MISSIONS } from './lib/layers'
import { loadGrid, toCell, toLatLng, hazardDataUrl } from './lib/grid'
import type { Grid } from './lib/grid'
import { DEFAULTS, evaluate, recommend, shortestDistance } from './lib/route'
import type { Params, Plan, Stop } from './lib/route'
import { ENV, GRAVITY, RAD_MSV_PER_DAY, REFS } from './lib/mission'
import './App.css'

type Waypoint = { id: string; name: string; lat: number; lng: number; sampleMin: number; sci: number; kind: 'target' | 'custom' }
type MissionMode = 'A' | 'B' | 'WAYPOINT'
type Observation = { mission: string; instrument: string; product: string; dataset: string; count: number | null; url: string }
type ChatMessage = { from: 'crew' | 'copilot'; text: string }
type CrewKit = { oxygenPct: number; batteryPct: number; scrubberHours: number; coolantPct: number; heartRateBpm: number; coreTempC: number; suitPressurePsi: number; suitPressureSetpointPsi: number }
type KitProjection = { hours: number; oxygenLeft: number; oxygenUsedPct: number; batteryLeft: number; scrubberLeft: number; coolantLeft: number; healthOk: boolean; pressureOk: boolean; ready: boolean; reasons: string[] }
const ODE = 'https://oderest.rsl.wustl.edu/live2/'
const ODE_SETS = [
  { mission: 'MRO', instrument: 'CTX', product: 'EDR', dataset: 'MRO-M-CTX-2-EDR-L0-V1.0' },
  { mission: 'MRO', instrument: 'HiRISE', product: 'RDRV11', dataset: 'MRO-M-HIRISE-3-RDR-V1.1' },
  { mission: 'MRO', instrument: 'CRISM', product: 'TRDR', dataset: 'MRO-M-CRISM-3-RDR-TARGETED-V1.0' },
  { mission: 'MEX', instrument: 'HRSC', product: 'REFDR3', dataset: 'HRSC map-projected products' },
  { mission: 'ODY', instrument: 'THEMIS', product: 'IRBTR', dataset: 'ODY-M-THM-3-IRBTR-V1.0' },
  { mission: 'MGS', instrument: 'MOLA', product: 'PEDR', dataset: 'MGS-M-MOLA-3-PEDR-L1-V1.0' },
  { mission: 'EM16TGO', instrument: 'CaSSIS', product: 'PDS4 partially processed', dataset: 'urn:esa:psa:em16_tgo_cas:data_partially_processed', collectionLid: 'urn:esa:psa:em16_tgo_cas:data_partially_processed' },
  { mission: 'VO', instrument: 'Viking VISAB', product: 'EDR', dataset: 'VO1/VO2-M-VIS-2-EDR-V2.0' },
] as const
const TABS = ['PLAN', 'SCIENCE', 'CREW', 'DATA'] as const
type Tab = (typeof TABS)[number]
const fmtT = (s: number) => `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`
const fmtCoord = (p: { lat: number; lng: number }) => `${Math.abs(p.lat).toFixed(3)}Â°${p.lat < 0 ? 'S' : 'N'}  ${p.lng.toFixed(3)}Â°E`

// These are editable prototype assumptions, not certified Mars suit limits.
const KIT_LIMITS = { oxygenEnduranceH: 8, batteryEnduranceH: 8, coolantEnduranceH: 8, oxygenBufferPct: 25, batteryBufferPct: 20, coolantBufferPct: 20, scrubberBufferH: 1, maxHeartRateBpm: 140, minCoreTempC: 35.5, maxCoreTempC: 38, pressureTolerancePsi: 0.25 }

function projectKit(plan: Plan | null, kit: CrewKit, returnHome: boolean): KitProjection {
  const hours = plan ? plan.timeS / 3600 : 0
  const oxygenUsedPct = hours / KIT_LIMITS.oxygenEnduranceH * 100 * (plan?.oxygenFactor ?? 1)
  const oxygenLeft = kit.oxygenPct - oxygenUsedPct
  const batteryLeft = kit.batteryPct - hours / KIT_LIMITS.batteryEnduranceH * 100
  const coolantLeft = kit.coolantPct - hours / KIT_LIMITS.coolantEnduranceH * 100
  const scrubberLeft = kit.scrubberHours - hours
  const healthOk = kit.heartRateBpm <= KIT_LIMITS.maxHeartRateBpm && kit.coreTempC >= KIT_LIMITS.minCoreTempC && kit.coreTempC <= KIT_LIMITS.maxCoreTempC
  const pressureOk = Math.abs(kit.suitPressurePsi - kit.suitPressureSetpointPsi) <= KIT_LIMITS.pressureTolerancePsi
  const reasons: string[] = []
  if (!returnHome) reasons.push('return-to-A leg is not included')
  if (plan && !plan.ok) reasons.push('modeled mobility reserve is below its buffer')
  if (oxygenLeft < KIT_LIMITS.oxygenBufferPct) reasons.push('oxygen return reserve is below 25%')
  if (batteryLeft < KIT_LIMITS.batteryBufferPct) reasons.push('PLSS battery reserve is below 20%')
  if (coolantLeft < KIT_LIMITS.coolantBufferPct) reasons.push('cooling reserve is below 20%')
  if (scrubberLeft < KIT_LIMITS.scrubberBufferH) reasons.push('COâ‚‚ scrubber reserve is below 1 hour')
  if (!healthOk) reasons.push('crew vital is outside the demo limit')
  if (!pressureOk) reasons.push('suit pressure differs from its setpoint by over 0.25 psi')
  return { hours, oxygenLeft, oxygenUsedPct, batteryLeft, scrubberLeft, coolantLeft, healthOk, pressureOk, ready: !!plan && reasons.length === 0, reasons }
}

function ODEQueryURL(item: typeof ODE_SETS[number], point: { lat: number; lng: number }) {
  const values: Record<string, string> = {
    target: 'mars', query: 'product', results: 'c', output: 'JSON',
    minlat: (point.lat - 0.35).toFixed(3), maxlat: (point.lat + 0.35).toFixed(3),
    westernlon: (point.lng - 0.35).toFixed(3), easternlon: (point.lng + 0.35).toFixed(3), loc: 'b',
  }
  if ('collectionLid' in item) values.collectionLid = item.collectionLid
  else { values.ihid = item.mission; values.iid = item.instrument; values.pt = item.product }
  const q = new URLSearchParams(values)
  return `${ODE}?${q}`
}

async function loadObservationIndex(point: { lat: number; lng: number }): Promise<Observation[]> {
  return Promise.all(ODE_SETS.map(async item => {
    const url = ODEQueryURL(item, point)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) })
      if (!response.ok) throw new Error(`ODE ${response.status}`)
      const body: unknown = await response.json()
      const findCount = (node: unknown): number | null => {
        if (!node || typeof node !== 'object') return null
        for (const [key, value] of Object.entries(node)) {
          if (key.toLowerCase() === 'count') {
            const n = Number(Array.isArray(value) ? value[0] : value)
            if (Number.isFinite(n)) return n
          }
        }
        for (const value of Object.values(node)) {
          const n = findCount(value)
          if (n !== null) return n
        }
        return null
      }
      return { ...item, count: findCount(body), url }
    } catch {
      return { ...item, count: null, url }
    }
  }))
}

function Bar({ pct, buffer, ok }: { pct: number; buffer: number; ok: boolean }) {
  return <div className="reserve-track"><div className={`reserve-fill ${ok ? 'safe' : 'unsafe'}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /><span className="reserve-threshold" style={{ left: `${buffer}%` }} /><b>{pct.toFixed(1)}%</b></div>
}

function SectionTitle({ icon: Icon, children }: { icon: typeof Activity; children: React.ReactNode }) {
  return <div className="section-title"><Icon size={14} /><span>{children}</span></div>
}

function AstroCompanion({ plan, layer, crew, crewCheck, massKg, dustDragPct, shortestRoundTripM, hasScienceStops, onQuery }: { plan: Plan | null; layer: string; crew: CrewKit; crewCheck: KitProjection; massKg: number; dustDragPct: number; shortestRoundTripM: number | null; hasScienceStops: boolean; onQuery: (text: string) => void }) {
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([
    { from: 'copilot', text: 'Iâ€™m your EVA mission copilot. I can check your route, PLSS oxygen and consumables, crew vitals, or map layers.' },
  ])
  const send = (value: string) => {
    const question = value.trim()
    if (!question) return
    setMessages(current => [...current.slice(-5), { from: 'crew', text: question }])
    onQuery(question)
    const words = question.toLowerCase()
    let answer = `Current map layer: ${layer}. Open the data panel for the instrument and archive record.`
    if (/oxygen|health|heart|temperature|battery|scrubber|coolant|kit|plss|crew|pressure|mass|step|dust|pace/.test(words)) answer = plan ? `${crewCheck.ready ? 'GO' : 'NO-GO'} for the modeled ${fmtT(plan.timeS)} EVA. Step estimate: ${Math.round(plan.steps)} steps, ${plan.avgStepEnergyJ.toFixed(0)} J/step, mean slope ${plan.meanSlope.toFixed(1)} deg, dust drag ${dustDragPct}%. Projected return: Oâ‚‚ ${crewCheck.oxygenLeft.toFixed(0)}%, battery ${crewCheck.batteryLeft.toFixed(0)}%, COâ‚‚ scrubber ${crewCheck.scrubberLeft.toFixed(1)} h, cooling ${crewCheck.coolantLeft.toFixed(0)}%. Crew input: ${crew.heartRateBpm} bpm, ${crew.coreTempC.toFixed(1)} C. Suit pressure ${crew.suitPressurePsi.toFixed(1)} psi / setpoint ${crew.suitPressureSetpointPsi.toFixed(1)} psi; suited mass ${massKg.toFixed(0)} kg (${(massKg * GRAVITY).toFixed(0)} N Mars weight).${crewCheck.reasons.length ? ` Checks: ${crewCheck.reasons.join('; ')}.` : ''}` : `Current kit inputs: Oâ‚‚ ${crew.oxygenPct}%, battery ${crew.batteryPct}%, scrubber ${crew.scrubberHours} h, cooling ${crew.coolantPct}%; crew ${crew.heartRateBpm} bpm / ${crew.coreTempC.toFixed(1)} C. Suit pressure ${crew.suitPressurePsi.toFixed(1)} psi / setpoint ${crew.suitPressureSetpointPsi.toFixed(1)} psi; suited mass ${massKg.toFixed(0)} kg (${(massKg * GRAVITY).toFixed(0)} N Mars weight). Set A and B to project return reserves.`
    else if (/route|distance|time|waypoint|plan/.test(words)) answer = plan ? `Modeled route: ${(plan.distM / 1000).toFixed(2)} km round trip in ${fmtT(plan.timeS)}${shortestRoundTripM == null ? '' : `; shortest traversable A-B-A estimate is ${(shortestRoundTripM / 1000).toFixed(2)} km`}${hasScienceStops ? ' (shortest comparison excludes science stops)' : ''}. Return margin estimate: O₂ ${crewCheck.oxygenLeft.toFixed(0)}%, PLSS battery ${crewCheck.batteryLeft.toFixed(0)}%, cooling ${crewCheck.coolantLeft.toFixed(0)}%, scrubber ${crewCheck.scrubberLeft.toFixed(1)} h. ${crewCheck.ready ? 'Current modeled plan passes the prototype kit thresholds.' : `NO-GO: ${crewCheck.reasons.join('; ')}.`} Estimated ${Math.round(plan.steps)} steps at ${massKg.toFixed(0)} kg; ${plan.avgStepEnergyJ.toFixed(0)} J/step, mean absolute slope ${plan.meanSlope.toFixed(1)}°, dust scenario ${dustDragPct}%. This model cannot calculate a defensible survival probability.` : 'Choose A and B on the map, or add a science pin, to calculate an EVA route.'
    else if (/hazard|slope|safe|risk/.test(words)) answer = 'The red slope overlay is a synthetic demo model in this build. Use the MOLA and HiRISE layers for real orbital context; this overlay is not a flight safety product.'
    else if (/thermal|heat|cold|temperature/.test(words)) answer = 'Select THEMIS day or night to compare real orbital thermal infrared mosaics. Those mosaics provide regional material context, not a forecast of suit-level conditions.'
    else if (/data|source|dataset|archive/.test(words)) answer = 'The Data panel links ODE observation searches for CTX, HiRISE, CRISM, HRSC, THEMIS and MOLA around the selected site.'
    setMessages(current => [...current, { from: 'copilot', text: answer }])
    setDraft('')
  }
  const submit = (event: FormEvent) => { event.preventDefault(); send(draft) }
  return <section className="copilot-card">
    <div className="copilot-head"><div className="astro-avatar"><span>âœ¦</span><div className="helmet"><i /></div></div><div><div className="copilot-title">ORBIT <span className="online-dot" /></div><div className="copilot-sub">MISSION COPILOT Â· LOCAL</div></div><Bot size={18} className="copilot-icon" /></div>
    <div className="copilot-chat" aria-live="polite">{messages.map((message, i) => <div key={i} className={`chat-line ${message.from}`}><span className="chat-avatar">{message.from === 'copilot' ? 'O' : 'YOU'}</span><p>{message.text}</p></div>)}</div>
    <div className="prompt-row">{['Check my route', 'Explain hazards', 'Show data sources'].map(prompt => <button key={prompt} onClick={() => send(prompt)}>{prompt}</button>)}</div>
    <form className="copilot-input" onSubmit={submit}><input aria-label="Ask the mission copilot" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Ask your mission copilotâ€¦" /><button aria-label="Send message" type="submit"><Send size={15} /></button></form>
  </section>
}

export default function App() {
  const [layer, setLayer] = useState(DEFAULT_LAYER)
  const [opacity, setOpacity] = useState(0.95)
  const [showHaz, setShowHaz] = useState(true)
  const [showTrav, setShowTrav] = useState(true)
  const [targets, setTargets] = useState<Target[]>([])
  const [boxworkPoints, setBoxworkPoints] = useState<BoxworkRoverPoint[]>([])
  const [boxworkError, setBoxworkError] = useState('')
  const [grid, setGrid] = useState<Grid | null>(null)
  const [traverse, setTraverse] = useState<GeoJsonObject | null>(null)
  const [start, setStart] = useState(BASE)
  const [end, setEnd] = useState<{ lat: number; lng: number } | null>(null)
  const [mode, setMode] = useState<MissionMode>('B')
  const [stops, setStops] = useState<Waypoint[]>([])
  const [cursor, setCursor] = useState<{ lat: number; lng: number } | null>(null)
  const [tab, setTab] = useState<Tab>('PLAN')
  const [log, setLog] = useState<string[]>([])
  const [pace, setPace] = useState(0.9)
  const [load, setLoad] = useState(20)
  const [crewMassKg, setCrewMassKg] = useState(140)
  const [fill, setFill] = useState(92)
  const [dustDragPct, setDustDragPct] = useState(0)
  const [crew, setCrew] = useState<CrewKit>({ oxygenPct: 92, batteryPct: 96, scrubberHours: 8, coolantPct: 95, heartRateBpm: 84, coreTempC: 37, suitPressurePsi: 4.3, suitPressureSetpointPsi: 4.3 })
  const [returnHome, setReturnHome] = useState(true)
  const [custom, setCustom] = useState(1)
  const [querying, setQuerying] = useState(false)
  const [observations, setObservations] = useState<Observation[] | null>(null)
  const [queryError, setQueryError] = useState('')

  const say = (message: string) => setLog(current => [`${new Date().toLocaleTimeString()}  ${message}`, ...current].slice(0, 40))
  useEffect(() => { loadTargets().then(setTargets).catch(() => say('Science target file is unavailable')) }, [])
  useEffect(() => { loadBoxworkRoverPoints().then(points => { setBoxworkPoints(points); if (!points.length) setBoxworkError('No rover waypoints for the boxwork campaign were returned.') }).catch(error => { const message = error instanceof Error ? error.message : 'NASA boxwork waypoints unavailable'; setBoxworkError(message); say(message) }) }, [])
  useEffect(() => { loadGrid().then(setGrid).catch(error => say(error instanceof Error ? error.message : 'Terrain model unavailable')) }, [])
  useEffect(() => {
    const query = new URLSearchParams({ where: '1=1', outFields: '*', returnGeometry: 'true', outSR: '4326', f: 'geojson' })
    fetch(`https://trek.nasa.gov/mars/trekarcgis/rest/services/curiosity_path/MapServer/0/query?${query}`)
      .then(response => response.ok ? response.json() : null)
      .then(data => setTraverse(data?.type === 'FeatureCollection' ? data as GeoJsonObject : null))
      .catch(() => setTraverse(null))
  }, [])

  const params: Params = useMemo(() => ({ ...DEFAULTS, paceMs: pace, massKg: crewMassKg + load, startPct: fill, weightFactor: GRAVITY / 9.81, dustDragPct }), [pace, load, crewMassKg, fill, dustDragPct])
  const toggleTarget = (target: Target) => setStops(current => {
    if (current.some(item => item.id === target.id)) { say(`Removed ${target.name}`); return current.filter(item => item.id !== target.id) }
    say(`Added science waypoint ${target.name}`)
    return [...current, { id: target.id, name: target.name, lat: target.lat, lng: target.lng, sampleMin: target.sampleMin, sci: target.sci, kind: 'target' }]
  })
  const addCustom = (lat: number, lng: number) => {
    const id = `WP-${String(custom).padStart(2, '0')}`
    setCustom(value => value + 1)
    setStops(current => [...current, { id, name: id, lat, lng, sampleMin: 0, sci: 0, kind: 'custom' }])
    say(`Added waypoint ${id}`)
  }
  const mapClick = (lat: number, lng: number) => {
    if (mode === 'A') { setStart({ lat, lng }); say(`Moved EVA start A to ${fmtCoord({ lat, lng })}`) }
    else if (mode === 'B') { setEnd({ lat, lng }); say(`Set destination B to ${fmtCoord({ lat, lng })}`) }
    else addCustom(lat, lng)
  }
  const move = (index: number, direction: number) => setStops(current => {
    const next = index + direction
    if (next < 0 || next >= current.length) return current
    const copy = [...current]; [copy[index], copy[next]] = [copy[next], copy[index]]; return copy
  })

  const startCell = grid ? toCell(grid, start.lat, start.lng) : null
  const endCell = grid && end ? toCell(grid, end.lat, end.lng) : startCell
  const resolved = useMemo(() => grid ? stops.map(stop => ({ ...stop, cell: toCell(grid, stop.lat, stop.lng) })) : [], [grid, stops])
  const outside = startCell == null || endCell == null || resolved.some(stop => stop.cell == null)
  const stopCells: Stop[] = useMemo(() => resolved.flatMap(stop => stop.cell == null ? [] : [{ id: stop.id, name: stop.name, cell: stop.cell, sampleMin: stop.sampleMin, sci: stop.sci }]), [resolved])
  const hasPlan = stops.length > 0 || end !== null
  const plan = useMemo(() => grid && startCell != null && endCell != null && hasPlan && !outside
    ? evaluate(grid, startCell, stopCells, params, endCell, returnHome) : null,
  [grid, startCell, endCell, hasPlan, outside, stopCells, params, returnHome])
  const shortestRoundTripM = useMemo(() => {
    if (!grid || startCell == null || endCell == null || end === null) return null
    const out = shortestDistance(grid, startCell, endCell, params)
    const back = shortestDistance(grid, endCell, startCell, params)
    return out == null || back == null ? null : out + back
  }, [grid, startCell, endCell, end, params])
  const crewCheck = useMemo(() => projectKit(plan, crew, returnHome), [plan, crew, returnHome])
  const safePace = useMemo(() => {
    if (!grid || startCell == null || endCell == null || !plan || crewCheck.ready) return null
    const choices = Array.from({ length: 10 }, (_, i) => Number((0.5 + i * 0.1).toFixed(1)))
      .map(candidatePace => {
        const candidateParams = { ...params, paceMs: candidatePace }
        const candidatePlan = evaluate(grid, startCell, stopCells, candidateParams, endCell, true)
        return { pace: candidatePace, check: projectKit(candidatePlan, crew, true) }
      }).filter(candidate => candidate.check.ready)
    return choices.sort((a, b) => Math.abs(a.pace - pace) - Math.abs(b.pace - pace))[0] ?? null
  }, [grid, startCell, endCell, plan, crewCheck.ready, stopCells, params, crew, pace])
  const dropSuggestion = useMemo(() => {
    if (!grid || startCell == null || endCell == null || !plan || crewCheck.ready) return null
    const targets = stops.filter(stop => stop.kind === 'target')
    const trials = targets.map(target => {
      const remainingStops = stopCells.filter(stop => stop.id !== target.id)
      const candidate = evaluate(grid, startCell, remainingStops, params, endCell, true)
      const check = projectKit(candidate, crew, true)
      return { target, candidate, check }
    })
    return trials.sort((a, b) => Number(b.check.ready) - Number(a.check.ready)
      || (b.check.oxygenLeft - a.check.oxygenLeft))[0] ?? null
  }, [grid, startCell, endCell, plan, crewCheck.ready, stops, stopCells, params, crew])
  const blocked = !!grid && hasPlan && !outside && !plan
  const recommendation = useMemo(() => {
    if (!grid || startCell == null || !plan || plan.ok || end) return null
    const candidates = stopCells.filter(stop => stops.some(wp => wp.id === stop.id && wp.kind === 'target'))
    return candidates.length ? recommend(grid, startCell, candidates, params) : null
  }, [grid, startCell, plan, params, stopCells, stops, end])
  const routes: [number, number][][] = grid && plan ? plan.legs.map(leg => leg.cells.map(cell => toLatLng(grid, cell))) : []
  const hazard: Hazard | null = useMemo(() => grid && showHaz
    ? { url: hazardDataUrl(grid, params.maxSlopeDeg), bounds: [[grid.south, grid.west], [grid.north, grid.east]] } : null,
  [grid, showHaz, params.maxSlopeDeg])
  const hazardPct = useMemo(() => grid ? grid.slope.filter(value => value > params.maxSlopeDeg).length / grid.slope.length * 100 : 0, [grid, params.maxSlopeDeg])
  const cell = grid && cursor ? toCell(grid, cursor.lat, cursor.lng) : null
  const status = !grid ? 'LOADING TERRAIN' : outside && hasPlan ? 'OUT OF DEMO AREA' : blocked ? 'NO PATH' : !plan ? 'READY' : crewCheck.ready ? 'GO Â· DEMO' : 'NO-GO Â· REVIEW'
  const activeLayer = LAYERS.find(item => item.id === layer) ?? LAYERS[0]

  const searchObservations = async () => {
    setQuerying(true); setQueryError(''); setObservations(null)
    const found = await loadObservationIndex(end ?? start)
    setObservations(found)
    setQuerying(false)
    if (found.every(item => item.count === null)) setQueryError('ODE did not return counts in this browser session. Use the linked live searches below; results open at the selected coordinates.')
    else say('Loaded orbital observation counts from NASA PDS Geosciences ODE')
  }

  return <div className="mission-app">
    <header className="topbar">
      <div className="brand-lockup"><div className="brand-mark"><Orbit size={20} /></div><div><div className="brand-name">Project MarsTrek</div><div className="brand-tag">HUMAN EXPLORATION Â· MISSION PLANNER</div></div></div>
      <div className="mission-location"><span className="live-indicator" /> GALE CRATER <span className="topbar-divider">/</span> MOUNT SHARP <span className="topbar-coord">04.8Â°S Â· 137.4Â°E</span></div>
      <div className="topbar-right"><div className="crew-chip"><span className="crew-avatar">02</span><span>CREW EVA <b>01</b></span></div><button className="icon-button" title="Mission reference" onClick={() => setTab('DATA')}><CircleHelp size={17} /></button></div>
    </header>

    <div className="telemetry-strip">
      <div><span>MISSION ELAPSED</span><b>00 : 00 : 00</b></div><i />
      <div><span>SURFACE CONDITIONS</span><b><Activity size={13} /> {ENV.ambient.replace('Roughly ', '')}</b></div><i />
      <div><span>DATA LINK</span><b className="link-good"><Radio size={13} /> ORBITAL MAPS CONNECTED</b></div><i />
      <div className="telemetry-status"><span>ROUTE STATE</span><b className={crewCheck.ready ? 'green' : hasPlan ? 'orange' : ''}>{status}</b></div>
    </div>

    <main className="workspace">
      <aside className="left-rail">
        <section className="site-card"><div className="site-kicker"><MapPinned size={13} /> ACTIVE EXPLORATION ZONE</div><h1>Gale Crater</h1><p>Mount Sharp Â· Aeolis Mons</p><div className="site-coordinates">{fmtCoord(start)} <span>Â· PLANETOCENTRIC</span></div><div className="site-bottom"><span><i /> ROVER-EXPLORED REGION</span><span>MSL / SOL 1+</span></div></section>

        <section className="rail-section"><SectionTitle icon={Layers3}>MAP LAYERS</SectionTitle><p className="rail-caption">NASA MARS TREK Â· SELECT A SCIENCE VIEW</p>
          <div className="layer-list">{LAYERS.filter((item, index, all) => all.findIndex(other => other.trekId === item.trekId) === index).map(item => <button key={item.id} onClick={() => { setLayer(item.id); say(`Map layer changed to ${item.label}`) }} className={`layer-option ${layer === item.id ? 'selected' : ''}`}><span className={`layer-symbol ${item.kind.toLowerCase()}`}>{item.kind === 'THERMAL' ? <Thermometer size={14} /> : item.kind === 'TOPOGRAPHY' ? <Activity size={14} /> : <Layers3 size={14} />}</span><span className="layer-copy"><b>{item.label}</b><small>{item.mission} <i>Â·</i> {item.resolution}</small></span>{layer === item.id && <Check size={14} className="layer-check" />}</button>)}</div>
          <label className="opacity-control">SCIENCE OVERLAY OPACITY <b>{Math.round(opacity * 100)}%</b><input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={event => setOpacity(Number(event.target.value))} /></label>
        </section>

        <section className="rail-section mission-sources"><SectionTitle icon={Database}>PDS DATA SET BROWSER</SectionTitle><p className="rail-caption">SEARCH ARCHIVED PRODUCTS BY MISSION</p>{MISSIONS.map(mission => <a key={mission.id} className="mission-link" href={mission.url} target="_blank" rel="noreferrer"><span>{mission.id}</span><small>{mission.instruments}</small><MoveUpRight size={12} /></a>)}<a className="all-data-link" href="https://ode.rsl.wustl.edu/mars/" target="_blank" rel="noreferrer">Open Mars Orbital Data Explorer <MoveUpRight size={13} /></a></section>

        <div className="data-quality"><Shield size={15} /><p><b>PLANNING PROTOTYPE</b>Orbital maps are real mission products. Red hazards and route energy use a synthetic local terrain grid for interaction only.</p></div>
      </aside>

      <section className="map-column">
        <div className="map-toolbar"><div className="map-heading"><span>TACTICAL SURFACE MAP</span><small>{activeLayer.kind} <i>Â·</i> {activeLayer.resolution}</small></div><div className="map-tools"><button className={showHaz ? 'active' : ''} onClick={() => setShowHaz(value => !value)}><Activity size={14} /> SLOPE MODEL</button><button className={showTrav ? 'active' : ''} onClick={() => setShowTrav(value => !value)}><Navigation size={14} /> ROVER TRACE</button><a href={activeLayer.source.includes('NASA') ? 'https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars' : '#'} target="_blank" rel="noreferrer" title="Layer source"><MoveUpRight size={14} /></a></div></div>
        <div className="map-frame"><MapView active={layer} opacity={opacity} hazard={hazard} traverse={showTrav ? traverse : null} routes={routes} start={start} end={end} targets={targets} boxworkPoints={boxworkPoints} astronautPoint={start} stops={stops.map(stop => ({ id: stop.id, lat: stop.lat, lng: stop.lng, kind: stop.kind }))} onTarget={toggleTarget} onMapClick={mapClick} onCursor={(lat, lng) => setCursor({ lat, lng })} />
          <div className="map-action-panel"><div className="map-action-title"><Crosshair size={14} /> MAP INPUT MODE</div><div className="mode-buttons"><button className={mode === 'A' ? 'mode-a' : ''} onClick={() => setMode('A')}><span>A</span> SET START</button><button className={mode === 'B' ? 'mode-b' : ''} onClick={() => setMode('B')}><span>B</span> SET DESTINATION</button><button className={mode === 'WAYPOINT' ? 'mode-waypoint' : ''} onClick={() => setMode('WAYPOINT')}><MapPinned size={13} /> ADD WAYPOINT</button></div><p>{mode === 'A' ? 'Click the map to place the EVA start point.' : mode === 'B' ? 'Click the map to place destination B.' : 'Click the map to add a route waypoint.'}</p></div>
          <div className="map-legend"><span><i className="legend-a" /> START A</span><span><i className="legend-b" /> DEST B</span><span><i className="legend-target" /> SCIENCE</span><span><i className="legend-boxwork" /> BOXWORK (APPROX.)</span><span><i className="legend-route" /> ROUTE</span>{showHaz && <span><i className="legend-hazard" /> DEMO SLOPE</span>}</div>
          {cursor && <div className="coordinate-readout"><Crosshair size={12} /> {fmtCoord(cursor)} <span>{cell != null && grid ? `Â· DEMO ${grid.elev[cell].toFixed(0)} M Â· ${grid.slope[cell].toFixed(1)}Â°` : ''}</span></div>}
          <div className="map-credit">{activeLayer.source}</div>
        </div>
        <div className="map-footer"><span><i className="link-good" /> {activeLayer.description}</span><span>MAP DATA Â© {activeLayer.source.split('Â·')[0].trim()}</span></div>
      </section>

      <aside className="right-rail">
        <div className="mission-metrics"><div><span>ROUTE LENGTH</span><b>{plan ? `${(plan.distM / 1000).toFixed(2)} <small>KM</small>` : 'â€”'}</b></div><div><span>EVA DURATION</span><b>{plan ? fmtT(plan.timeS) : 'â€”'}</b></div><div><span>Oâ‚‚ AT RETURN</span><b className={crewCheck.oxygenLeft >= KIT_LIMITS.oxygenBufferPct ? 'green' : plan ? 'orange' : ''}>{plan ? `${crewCheck.oxygenLeft.toFixed(0)}%` : 'â€”'}</b></div></div>

        <AstroCompanion plan={plan} layer={activeLayer.label} crew={crew} crewCheck={crewCheck} massKg={params.massKg} dustDragPct={dustDragPct} shortestRoundTripM={shortestRoundTripM} hasScienceStops={stops.length > 0} onQuery={question => say(`Copilot request: ${question}`)} />
        <button className={`crew-mini ${crewCheck.healthOk && crewCheck.pressureOk ? '' : 'crew-mini-alert'}`} onClick={() => setTab('CREW')} aria-label="Open astronaut kit and health controls">
          <span className="crew-mini-avatar">ASTRO</span><span className="crew-mini-main"><b>ASTRONAUT KIT <i>DEMO TELEMETRY</i></b><small>O2 <strong>{crew.oxygenPct}%</strong><em style={{ width: `${Math.max(0, Math.min(100, crew.oxygenPct))}%` }} /></small><small>SUIT {crew.suitPressurePsi.toFixed(1)} PSI / {params.massKg.toFixed(0)} KG / {crew.heartRateBpm} BPM</small></span><span className="crew-mini-projection">{plan ? `${crewCheck.oxygenLeft.toFixed(0)}%` : "--"}<small>O2 AT RETURN</small></span>
        </button>

        {plan && <section className={`route-decision ${crewCheck.ready ? 'decision-go' : 'decision-stop'}`}><div className="decision-heading">{crewCheck.ready ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}<b>{crewCheck.ready ? 'GO - MODEL CHECKS PASS' : end ? 'NO-GO - REVIEW RETURN' : 'NO-GO - REVIEW EVA PLAN'}</b></div><p>{crewCheck.ready ? 'A-to-B-to-A route is within the current demo kit buffers.' : crewCheck.reasons.join(' / ')}</p>{!crewCheck.ready && safePace && <button className="pace-apply" onClick={() => { setPace(safePace.pace); setReturnHome(true); say(`Applied modeled return-safe pace: ${safePace.pace.toFixed(1)} m/s`) }}>TRY MODELED PACE {safePace.pace.toFixed(1)} m/s</button>}{!crewCheck.ready && end && <div className="drop-target"><span>DROP DESTINATION B AND RETURN TO A</span><button onClick={() => { setEnd(null); setReturnHome(true); say('NO-GO action: dropped destination B; return to A') }}>DROP TARGET B</button></div>}{!crewCheck.ready && !end && dropSuggestion && <div className="drop-target"><span>DROP SCIENCE STOP: {dropSuggestion.target.name}</span><button onClick={() => { setStops(current => current.filter(stop => stop.id !== dropSuggestion.target.id)); say(`Dropped ${dropSuggestion.target.name} and recalculated`) }}>DROP STOP</button></div>}{!crewCheck.ready && !safePace && <small>NO tested pace passes. Do not depart from A; if already outside, follow the mission's validated abort plan.</small>}</section>}

        <div className="panel-tabs">{TABS.map(name => <button key={name} onClick={() => setTab(name)} className={tab === name ? 'current' : ''}>{name === 'DATA' ? 'DATA & SAFETY' : name}</button>)}</div>
        <div className="panel-scroll">
          {tab === 'PLAN' && <>
            <SectionTitle icon={MapPinned}>EVA ROUTE SEQUENCE</SectionTitle>
            <div className="route-endpoints"><button onClick={() => setMode('A')} className="endpoint"><i className="endpoint-a">A</i><span><small>START POINT</small><b>{fmtCoord(start)}</b></span><Crosshair size={14} /></button><button onClick={() => setMode('B')} className="endpoint"><i className="endpoint-b">B</i><span><small>DESTINATION</small><b>{end ? fmtCoord(end) : 'Tap map to set point B'}</b></span><Crosshair size={14} /></button></div>
            <div className="sequence-header"><span>SCIENCE / CUSTOM STOPS</span><span>{stops.length} WAYPOINT{stops.length === 1 ? '' : 'S'}</span></div>
            {stops.length === 0 ? <div className="empty-stops">Add a science pin or choose â€œAdd waypointâ€, then click the map.</div> : stops.map((stop, index) => <div className="stop-row" key={stop.id}><span className="stop-number">{String(index + 1).padStart(2, '0')}</span><div><b>{stop.name}</b><small>{fmtCoord(stop)}{stop.sampleMin ? ` Â· ${stop.sampleMin} MIN` : ''}</small></div><div className="stop-actions"><button aria-label="Move waypoint up" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={13} /></button><button aria-label="Move waypoint down" disabled={index === stops.length - 1} onClick={() => move(index, 1)}><ArrowDown size={13} /></button><button aria-label="Remove waypoint" onClick={() => setStops(current => current.filter(item => item.id !== stop.id))}><X size={13} /></button></div></div>)}
            {stops.length > 0 && <button className="text-action" onClick={() => { setStops([]); say('Cleared route stops') }}>CLEAR ALL WAYPOINTS</button>}
            <div className="form-rule" />
            <SectionTitle icon={Activity}>EVA CONFIGURATION</SectionTitle>
            <label className="planner-slider"><span>Walking pace <b>{pace.toFixed(2)} m/s</b></span><input type="range" min={0.5} max={1.4} step={0.05} value={pace} onChange={event => setPace(Number(event.target.value))} /></label>
            <label className="planner-slider"><span>Equipment load <b>{load} kg</b></span><input type="range" min={0} max={40} step={5} value={load} onChange={event => setLoad(Number(event.target.value))} /></label>
            <label className="planner-slider"><span>Mobility work budget <b>{fill}%</b></span><input type="range" min={60} max={100} value={fill} onChange={event => setFill(Number(event.target.value))} /></label>
            <label className="toggle-row"><span><RotateCcw size={14} /> Return to A for reserve check</span><input type="checkbox" checked={returnHome} onChange={event => setReturnHome(event.target.checked)} /></label>
            {plan && <div className="leg-breakdown"><div className="sequence-header"><span>LEG BREAKDOWN</span><span>{plan.rows.length} LEGS</span></div>{plan.rows.map((row, i) => <div className="leg-row" key={`${row.name}-${i}`}><span>{String(i + 1).padStart(2, '0')}</span><b>{row.name}</b><span>{row.legKm.toFixed(2)} km</span></div>)}</div>}
          </>}

          {tab === 'SCIENCE' && <><SectionTitle icon={Sparkles}>GEOLOGY & SCIENCE TARGETS</SectionTitle><p className="panel-description">Candidate investigation points for a Mount Sharp traverse. Verify exact features against orbital imagery and PDS products before treating them as confirmed outcrops.</p><section className="rover-boxwork-list"><div className="rover-boxwork-heading"><b>ACTUAL CURIOSITY BOXWORK WAYPOINTS</b><span>{boxworkPoints.length} PINS</span></div><p>NASA rover waypoint coordinates during the boxwork-unit traverse (Sols 4534-4865). Each pin shows its sol; distance is measured from astronaut point A.</p><p className="boxwork-science-note"><b>Science:</b> the Altadena member boxwork has erosion-resistant ridges and hollows; the pattern may record groundwater along fractures. <a href="https://www.hou.usra.edu/meetings/lpsc2026/pdf/1716.pdf" target="_blank" rel="noreferrer">Curiosity boxwork study</a> | <a href="https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json" target="_blank" rel="noreferrer">NASA waypoint file</a></p>{boxworkPoints.length ? boxworkPoints.map(point => <div className="rover-boxwork-row" key={point.id}><span className="rover-boxwork-pin">S{point.sol}</span><span>{point.site !== null ? `SITE ${point.site}` : 'ROVER WAYPOINT'}{point.drive !== null ? ` / DRIVE ${point.drive}` : ''}<small>LAT {Math.abs(point.lat).toFixed(5)} {point.lat < 0 ? 'S' : 'N'} / LON {point.lng.toFixed(5)} E</small></span><b>{distanceFromAkm(start, point).toFixed(1)}<small>KM FROM A</small></b></div>) : <div className="boxwork-load-note">{boxworkError || 'Loading NASA waypoint data...'}</div>}</section>{targets.map(target => <article key={target.id} className={`science-card ${stops.some(stop => stop.id === target.id) ? 'chosen' : ''}`}><div className="science-card-top"><div><span className="pin-id">{target.id}</span><h3>{target.name}</h3></div><b className="science-score">{target.sci}<small>/10</small></b></div><p>{target.desc}</p><div className="science-tags"><span>{target.unit}</span><span>{target.sampleMin} MIN SAMPLE</span></div><div className="science-coord">{fmtCoord(target)} <span>Â· CANDIDATE PIN</span></div><button onClick={() => toggleTarget(target)}>{stops.some(stop => stop.id === target.id) ? 'REMOVE FROM ROUTE' : 'ADD TO ROUTE'} <MoveUpRight size={13} /></button></article>)}</>}

          {tab === 'CREW' && <><SectionTitle icon={HeartPulse}>ASTRONAUT KIT & EVA RETURN CHECK</SectionTitle><div className={`crew-verdict ${crewCheck.ready ? 'decision-go' : plan ? 'decision-stop' : ''}`}>{crewCheck.ready ? 'GO - MODELED RESERVES PASS' : plan ? 'NO-GO - RETURN CHECK FAILED' : 'SET A AND B TO CHECK'}</div><p className="panel-description">A-to-B-to-A estimate from the current route, crew inputs, Mars gravity, local route grade, and dust-drag scenario.</p>
            <SectionTitle icon={Wind}>LIFE SUPPORT & PRESSURE</SectionTitle><div className="crew-controls"><label><span><Wind size={13}/> PLSS OXYGEN <b>{crew.oxygenPct}%</b></span><input type="range" min="0" max="100" value={crew.oxygenPct} onChange={event => setCrew(value => ({ ...value, oxygenPct: Number(event.target.value) }))}/></label><label><span><BatteryCharging size={13}/> BATTERY <b>{crew.batteryPct}%</b></span><input type="range" min="0" max="100" value={crew.batteryPct} onChange={event => setCrew(value => ({ ...value, batteryPct: Number(event.target.value) }))}/></label><label><span><Activity size={13}/> CO2 SCRUBBER <b>{crew.scrubberHours} h</b></span><input type="range" min="0" max="10" step="0.5" value={crew.scrubberHours} onChange={event => setCrew(value => ({ ...value, scrubberHours: Number(event.target.value) }))}/></label><label><span><Thermometer size={13}/> COOLANT <b>{crew.coolantPct}%</b></span><input type="range" min="0" max="100" value={crew.coolantPct} onChange={event => setCrew(value => ({ ...value, coolantPct: Number(event.target.value) }))}/></label></div>
            <div className="vitals-grid"><label><span>SUIT PRESSURE (PSI)</span><input type="number" min="0" max="15" step="0.1" value={crew.suitPressurePsi} onChange={event => setCrew(value => ({ ...value, suitPressurePsi: Number(event.target.value) }))}/></label><label><span>PRESSURE SETPOINT (PSI)</span><input type="number" min="0" max="15" step="0.1" value={crew.suitPressureSetpointPsi} onChange={event => setCrew(value => ({ ...value, suitPressureSetpointPsi: Number(event.target.value) }))}/></label></div><small className="model-inline-note">The demo flags more than 0.25 psi from your setpoint; choose the real suit setpoint.</small>
            <div className="pressure-context"><b>EXTERNAL MARS PRESSURE</b><span>{ENV.pressure}</span><small>Curiosity REMS regional context; separate from suit pressure.</small></div>
            <div className="form-rule"/><SectionTitle icon={Activity}>MOBILITY LOAD & TERRAIN</SectionTitle><label className="planner-slider crew-mass-slider"><span>Crew + suit mass <b>{crewMassKg} kg</b></span><input type="range" min="100" max="180" step="5" value={crewMassKg} onChange={event => setCrewMassKg(Number(event.target.value))}/></label><div className="mass-readout"><span>TOTAL SUITED MASS <b>{params.massKg.toFixed(0)} kg</b></span><span>WEIGHT AT {GRAVITY.toFixed(2)} m/s2 <b>{(params.massKg * GRAVITY).toFixed(0)} N</b></span><small>Includes {crewMassKg} kg crew/suit + {load} kg equipment; change equipment load in PLAN.</small></div>
            <label className="planner-slider dust-slider"><span>Dust / soft-regolith drag <b>{dustDragPct}%</b></span><input type="range" min="0" max="40" step="5" value={dustDragPct} onChange={event => setDustDragPct(Number(event.target.value))}/></label><small className="model-inline-note">Scenario input only: no point-by-point dust-depth measurement is available here.</small>
            <div className="vitals-grid crew-vitals"><label><span><HeartPulse size={13}/> HEART RATE (BPM)</span><input type="number" min="30" max="220" value={crew.heartRateBpm} onChange={event => setCrew(value => ({ ...value, heartRateBpm: Number(event.target.value) }))}/></label><label><span><Thermometer size={13}/> CORE TEMP (C)</span><input type="number" min="30" max="43" step="0.1" value={crew.coreTempC} onChange={event => setCrew(value => ({ ...value, coreTempC: Number(event.target.value) }))}/></label></div>
            <div className="projection-card"><b>AT RETURN TO A</b><span>O2 remaining <strong>{plan ? `${crewCheck.oxygenLeft.toFixed(0)}%` : '--'}</strong></span><span>Battery <strong>{plan ? `${crewCheck.batteryLeft.toFixed(0)}%` : '--'}</strong></span><span>Scrubber <strong>{plan ? `${crewCheck.scrubberLeft.toFixed(1)} h` : '--'}</strong></span><span>Cooling <strong>{plan ? `${crewCheck.coolantLeft.toFixed(0)}%` : '--'}</strong></span></div>
            {plan && <div className="step-cost-card"><b>ROUTE STEP-COST ESTIMATE</b><span>Estimated steps <strong>{Math.round(plan.steps).toLocaleString()}</strong></span><span>Mean work / 0.75 m step <strong>{plan.avgStepEnergyJ.toFixed(0)} J</strong></span><span>Mean absolute slope <strong>{plan.meanSlope.toFixed(1)} deg</strong></span><span>Maximum route slope <strong>{plan.maxSlope.toFixed(1)} deg</strong></span><span>O2 use factor <strong>{plan.oxygenFactor.toFixed(2)}x</strong></span></div>}
            {plan && !crewCheck.ready && <div className="pace-guidance">{safePace ? <><b>PACE OPTION THAT PASSES THIS MODEL</b><span>{safePace.pace.toFixed(1)} m/s for the full A-B-A route</span><button onClick={() => { setPace(safePace.pace); setReturnHome(true); say(`Applied modeled return-safe pace: ${safePace.pace.toFixed(1)} m/s`) }}>APPLY PACE</button></> : <><b>NO MODELED PACE PASSES</b><span>Do not start from A. This prototype cannot certify a Mars shelter. If already outside, use the mission's validated abort plan; this map cannot certify a shelter.</span></>}</div>}
            <p className="kit-disclaimer">Model method: each route segment estimates grade from elevation change / distance, scales walking work by total mass and Mars gravity, then applies the editable dust-drag factor. Oxygen is an 8-hour reference endurance scaled by route effort. NASA pressure/rover data provide context, but this build's route elevation grid is synthetic, dust drag is user-set, and suit/medical limits are demo assumptions. Not flight safety guidance.</p>
          </>}

          {tab === 'DATA' && <><SectionTitle icon={Database}>LIVE ORBITAL DATA CATALOG</SectionTitle><p className="panel-description">Query NASA PDS Geosciences ODE for archived observations intersecting a ~0.7Â° area around {fmtCoord(end ?? start)}. ODE coverage counts are not map pixels; open records to inspect products and downloads.</p><button className="query-button" onClick={searchObservations} disabled={querying}>{querying ? <Activity size={15} className="spin" /> : <Search size={15} />}{querying ? 'QUERYING PDS ODEâ€¦' : 'QUERY SELECTED AREA'}</button>{queryError && <div className="query-note"><CircleHelp size={14} />{queryError}</div>}{observations && <div className="observation-list">{observations.map(item => <a key={`${item.mission}-${item.instrument}`} href={item.url} target="_blank" rel="noreferrer"><span className="obs-mission">{item.mission}</span><span className="obs-info"><b>{item.instrument} Â· {item.product}</b><small>{item.dataset}</small></span><strong>{item.count === null ? 'OPEN' : item.count.toLocaleString()}</strong><MoveUpRight size={12} /></a>)}</div>}<div className="panel-separator" /><SectionTitle icon={Shield}>SAFETY MODEL</SectionTitle>{plan ? <><div className="safety-title"><span>ESTIMATED RETURN RESERVE</span><b className={plan.ok ? 'green' : 'orange'}>{plan.reservePct.toFixed(1)}%</b></div><Bar pct={plan.reservePct} buffer={params.bufferPct} ok={plan.ok} /><p className="panel-description">Configured emergency buffer: {params.bufferPct}%. Terrain slope overlay flags {hazardPct.toFixed(1)}% of the synthetic planning grid above {params.maxSlopeDeg}Â°.</p>{!plan.ok && recommendation && <button className="query-button" onClick={() => { setStops(current => recommendation.ids.map(id => current.find(item => item.id === id)!).filter(Boolean)); say('Applied science-preserving safe-route suggestion') }}>APPLY SAFE SCIENCE ROUTE</button>}</> : <p className="panel-description">Set point B or add waypoints to calculate reserve. Red slope areas are generated from the demo terrain grid, not measured DEM data.</p>}<div className="safety-facts"><div><span>RADIATION CONTEXT</span><b>{RAD_MSV_PER_DAY} mSv / sol</b><small>Surface RAD literature estimate, not suit dosimetry.</small></div><div><span>ATMOSPHERE</span><b>{ENV.pressure}</b><small>Curiosity REMS regional context.</small></div></div><div className="reference-list"><b>DATA & MODEL NOTES</b>{REFS.map(ref => <p key={ref}>{ref}</p>)}</div></>}
        </div>
        <footer className="right-footer"><span>{grid ? `${grid.cols} Ã— ${grid.rows} DEMO GRID Â· ${grid.cellM.toFixed(0)} M/CELL` : 'LOADING LOCAL GRID'}</span><span>PLSS & MOBILITY VALUES ARE ASSUMPTIONS</span></footer>
      </aside>
    </main>
    <div className="event-strip"><span><Activity size={13} /> EVENT LOG</span>{log.length ? log[0] : 'MISSION PLANNER INITIALIZED Â· SELECT A MAP LAYER OR SET WAYPOINT B'}<span className="event-index">{log.length ? `${log.length} EVENTS` : 'NOMINAL'} <ChevronDown size={12} /></span></div>
  </div>
}

