export type Layer = {
  id: string; mission: string; label: string; resolution: string; kind: string
  trekId: string; ext: 'jpg' | 'png'; maxZ: number
  bounds?: [[number, number], [number, number]]
  source: string; description: string
}

const TREK = 'https://trek.nasa.gov/tiles/Mars/EQ'

export const LAYERS: Layer[] = [
  { id: 'CTX', mission: 'MRO · CTX', label: 'Curiosity CTX mosaic', resolution: '6 m/px', kind: 'OPTICAL', trekId: 'curiosity_ctx_mosaic', ext: 'png', maxZ: 12, bounds: [[-7.2137, 136.2768], [-3.5805, 139.3864]], source: 'NASA/JPL Mars Trek · MRO Context Camera', description: 'High-resolution grayscale orbital context around the Curiosity landing site.' },
  { id: 'HIRISE', mission: 'MRO · HiRISE', label: 'Curiosity HiRISE mosaic', resolution: '25 cm/px', kind: 'OPTICAL', trekId: 'curiosity_hirise_mosaic', ext: 'png', maxZ: 15, bounds: [[-5.8, 136.5], [-4.4, 138.4]], source: 'NASA/JPL Mars Trek · MRO HiRISE', description: 'Very high-resolution image mosaic for local surface context where coverage exists.' },
  { id: 'HRSC', mission: 'MEX · HRSC', label: 'HRSC + MOLA color hillshade', resolution: '200 m/px', kind: 'TOPOGRAPHY', trekId: 'Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw', ext: 'jpg', maxZ: 8, source: 'NASA/JPL Mars Trek · MGS MOLA + Mars Express HRSC', description: 'Color relief map combining altimetry and stereo imagery.' },
  { id: 'MOLA', mission: 'MGS · MOLA', label: 'MOLA color hillshade', resolution: '463 m/px', kind: 'TOPOGRAPHY', trekId: 'Mars_MGS_MOLA_ClrShade_merge_global_463m', ext: 'jpg', maxZ: 7, source: 'NASA/JPL Mars Trek · Mars Global Surveyor MOLA', description: 'Global color-shaded relief for regional terrain context.' },
  { id: 'MOLA_DEM', mission: 'MGS · MOLA', label: 'MOLA grayscale elevation', resolution: '463 m/px', kind: 'TOPOGRAPHY', trekId: 'Mars_MGS_MOLA_DEM_mosaic_global_463m_8', ext: 'png', maxZ: 7, source: 'NASA/JPL Mars Trek · Mars Global Surveyor MOLA DEM', description: 'Global grayscale MOLA elevation mosaic; visual reference only in this prototype.' },
  { id: 'THEMIS_DAY', mission: 'ODY · THEMIS', label: 'Thermal infrared · day', resolution: '100 m/px', kind: 'THERMAL', trekId: 'THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018', ext: 'png', maxZ: 8, bounds: [[-65, -180], [65, 180]], source: 'NASA/JPL Mars Trek · 2001 Mars Odyssey THEMIS', description: 'Daytime thermal infrared mosaic; surface materials and thermal inertia affect the signal.' },
  { id: 'THEMIS_NIGHT', mission: 'ODY · THEMIS', label: 'Thermal infrared · night', resolution: '100 m/px', kind: 'THERMAL', trekId: 'THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018', ext: 'png', maxZ: 8, bounds: [[-65, -180], [65, 180]], source: 'NASA/JPL Mars Trek · 2001 Mars Odyssey THEMIS', description: 'Nighttime thermal infrared mosaic for comparing thermal properties.' },
  { id: 'TES', mission: 'MGS · TES', label: 'TES thermal inertia', resolution: 'regional', kind: 'THERMAL', trekId: 'TES_Thermal_Inertia', ext: 'png', maxZ: 4, source: 'NASA/JPL Mars Trek · Mars Global Surveyor TES', description: 'Thermal inertia product for broad surface-material context.' },
  { id: 'MOLA_COLOR', mission: 'MEX · HRSC', label: 'HRSC + MOLA color', resolution: '200 m/px', kind: 'TOPOGRAPHY', trekId: 'Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw', ext: 'jpg', maxZ: 8, source: 'NASA/JPL Mars Trek · MGS MOLA + Mars Express HRSC', description: 'Regional color hillshade.' },
]

export const DEFAULT_LAYER = 'CTX'
export const tileUrl = (l: Layer) => `${TREK}/${l.trekId}/1.0.0/default/default028mm/{z}/{y}/{x}.${l.ext}`
export const CENTER: [number, number] = [-4.8, 137.4]

export type Mission = { id: string; name: string; instruments: string; url: string }
export const MISSIONS: Mission[] = [
  { id: 'MRO', name: 'Mars Reconnaissance Orbiter', instruments: 'CTX · HiRISE · CRISM · SHARAD · MCS', url: 'https://ode.rsl.wustl.edu/mars/DataSetExplorer.aspx?target=mars&instrumenthost=MRO' },
  { id: 'MEX', name: 'Mars Express', instruments: 'HRSC · OMEGA · MARSIS', url: 'https://ode.rsl.wustl.edu/mars/DataSetExplorer.aspx?target=mars&instrumenthost=MEX' },
  { id: 'EM16TGO', name: 'ExoMars Trace Gas Orbiter', instruments: 'ACS · CaSSIS · NOMAD', url: 'https://ode.rsl.wustl.edu/mars/DataSetExplorer.aspx?target=mars&instrumenthost=EM16TGO' },
  { id: 'ODY', name: '2001 Mars Odyssey', instruments: 'THEMIS · GRS', url: 'https://ode.rsl.wustl.edu/mars/DataSetExplorer.aspx?target=mars&instrumenthost=ODY' },
  { id: 'MGS', name: 'Mars Global Surveyor', instruments: 'MOLA · TES · MOC', url: 'https://ode.rsl.wustl.edu/mars/DataSetExplorer.aspx?target=mars&instrumenthost=MGS' },
  { id: 'VO', name: 'Viking Orbiter', instruments: 'Imaging · Radio Science', url: 'https://ode.rsl.wustl.edu/mars/DataSetExplorer.aspx?target=mars&instrumenthost=VO' },
]
