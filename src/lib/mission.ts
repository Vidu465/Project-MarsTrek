export const SOL_HOURS = 24.66
export const GRAVITY = 3.71

// Approximate Curiosity RAD surface dose rate from Hassler et al. (2014).
// It is an environmental context estimate, not astronaut suit dosimetry.
export const RAD_MSV_PER_DAY = 0.64

export const ENV = {
  ambient: 'Approx. -90 to 0 C over a sol at Gale (Curiosity REMS context)',
  pressure: 'Approx. 700 to 900 Pa (Curiosity REMS context)',
}

export const REFS = [
  'Map imagery: NASA/JPL Mars Trek WMTS, including MRO CTX/HiRISE, MGS MOLA/TES, Mars Express HRSC, Mars Odyssey THEMIS.',
  'Archive records: NASA PDS Geosciences Node Orbital Data Explorer (ODE), queried by area and instrument.',
  'Rover trace: NASA/JPL Mars Trek Curiosity path ArcGIS service.',
  'Synthetic planning grid: UI demo only; it is not a measured Gale DEM and is not suitable for navigation.',
  'Walking energy: Minetti et al. 2002 gradient cost of walking; simplified model assumptions.',
  'Radiation: Hassler et al. 2014 Curiosity RAD surface dose context; not suit-specific dosimetry.',
  'Suit capacity, mass, pace, and metabolism: configurable illustrative assumptions, not crew-certified limits.',
]
