# Project MarsTrek Surface Mission Planner

An interactive Gale Crater EVA-planning prototype built with React, TypeScript, Leaflet, and Vite.

## Run locally

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). To create a production build, run `npm run build`.

## What is in the prototype

- A planetary map with NASA Mars Trek optical, thermal, and topographic imagery layers.
- A/B start and destination pins, science pins, custom waypoints, route ordering, and a return-to-start reserve check.
- A live NASA PDS Geosciences ODE query for orbital archive product counts around the selected area, with direct query links for MRO, Mars Express, ExoMars TGO, Odyssey, MGS, and Viking.
- The NASA/JPL Curiosity traverse service as a map overlay.
- A local rule-based mission copilot, EVA controls, and an event log.

## Data limitations

The orbital mosaics, PDS links, and Curiosity traverse are sourced from NASA/JPL or NASA's PDS Geosciences Node. Map tile and ODE access require an internet connection. The local elevation/slope grid and route-energy model are illustrative synthetic data and assumptions. Target pins are proposed planning candidates, not verified geological observations. Do not use this prototype for real crew navigation or safety decisions.
