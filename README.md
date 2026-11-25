

https://github.com/user-attachments/assets/ed5d37de-abc5-47ad-b974-4d87e598180b



# MarsTrek Surface Mission Planner

An interactive, browser-based EVA planning prototype for exploring the Gale Crater region of Mars. The app combines orbital imagery, candidate science targets, rover traverse context, route planning, illustrative crew and suit checks, and links to planetary science archives.

> **Prototype only:** MarsTrek is an educational and visualization project. It is not a certified navigation, engineering, medical, or crew-safety system. Route, terrain, energy, suit, and crew calculations use simplified assumptions and must not be used to plan a real mission.

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Run locally](#run-locally)
- [Using the planner](#using-the-planner)
- [Data and network access](#data-and-network-access)
- [Project structure](#project-structure)
- [Available commands](#available-commands)
- [Limitations](#limitations)
- [Credits and references](#credits-and-references)

## Features

- **Mars map:** Browse NASA/JPL Mars Trek imagery layers, including MRO CTX and HiRISE, MOLA/HRSC topography, and THEMIS/TES thermal products.
- **Route planning:** Set a start (A) and destination (B), add science targets or custom map waypoints, reorder stops, and inspect a modeled route and return-to-start reserve.
- **Science targets:** Explore candidate locations from the bundled GeoJSON data. The map also shows an approximate boxwork study zone and Curiosity rover waypoint context where available.
- **Terrain and hazard context:** View the prototype slope overlay and Curiosity traverse. The slope grid is synthetic and illustrative, not a measured Gale Crater elevation model.
- **Crew and EVA panel:** Adjust example suit and crew inputs and see modeled oxygen, battery, cooling, scrubber, and vital-sign checks.
- **Science and archive data:** Query NASA's PDS Geosciences Node Orbital Data Explorer (ODE) for product counts near the selected location and open mission/instrument archive searches.
- **Local mission copilot:** Ask rule-based questions about the current route, modeled reserves, hazards, layers, and data sources. It runs in the browser and is not an AI service.

## Requirements

- Node.js and npm installed. Use a current Node.js release supported by Vite.
- Internet access for NASA/JPL map tiles, rover data, and ODE archive queries. The app itself does not require an API key.

Check your installation:

```powershell
node --version
npm --version
```

## Run locally

From the repository root, change into the `frontend` directory (the directory containing this README and `package.json`):

```powershell
cd frontend
npm install
npm run dev
```

Open the local address printed by Vite, usually <http://localhost:5173>. Keep the terminal running while you use the development server. Stop it with **Ctrl+C**.

If your terminal is already in `D:\Project-MarsTrek\frontend`, skip the `cd frontend` command. On Windows, `npm.cmd` can be used instead of `npm` if PowerShell blocks the npm script:

```powershell
npm.cmd install
npm.cmd run dev
```

## Using the planner

1. Open the **PLAN** view and explore the map. Use the layer controls to change the imagery and adjust overlays.
2. Choose a start point A and destination B using the map controls. Click candidate science targets to add them as stops; map clicks can be used to place custom waypoints when that mode is selected.
3. Review the proposed route, distance, time, and modeled reserve. Add or reorder stops to compare plans. Enable the return-to-start option when you want the plan to include the return leg.
4. Use the **SCIENCE** view and **DATA** view to inspect target context and open archive searches. Archive counts depend on the live ODE service and network availability.
5. Use the **CREW** view to change the illustrative crew and suit inputs and inspect the prototype checks. These are demonstrations, not operational thresholds.

Controls and available details are shown in the app's PLAN, SCIENCE, CREW, and DATA panels. Some map overlays or remote data may be unavailable if their source service is offline or the browser cannot reach it.

## Data and network access

The app combines bundled local files and public remote services:

| Data | Source | Behavior |
| --- | --- | --- |
| Science target candidates | `public/data/science_targets.geojson` | Loaded locally by the app. Treat candidates and descriptions as prototype content. |
| Curiosity rover path | NASA/JPL Mars Trek ArcGIS service | Fetched at runtime and drawn as a map overlay when available. |
| Curiosity waypoint context | NASA Mars rover waypoint JSON | Fetched at runtime; the app filters points to the configured boxwork campaign sol range. |
| Orbital map tiles | NASA/JPL Mars Trek WMTS | Loaded as map tiles while browsing; requires internet access. |
| Orbital product counts | NASA PDS Geosciences Node ODE | Queried around the selected map location; requires internet access. |
| Elevation and slope grid | Generated in `src/lib/grid.ts` | Synthetic demo terrain generated in the browser; it is not observational data. |

No backend server is included. The Vite development server serves the frontend; browser requests to NASA/JPL and PDS endpoints go directly to those public services.

## Project structure

```text
frontend/
├── public/
│   └── data/                    # Bundled science target data
├── src/
│   ├── components/              # Map interface and map overlays
│   ├── lib/                     # Map layers, mission data, terrain, and route model
│   ├── App.tsx                  # Main application and planner panels
│   ├── App.css                  # Application styles
│   └── main.tsx                 # React entry point
├── index.html
├── package.json                 # Scripts and dependencies
└── vite.config.ts
```

## Available commands

Run these from `frontend/`:

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Type-check the project and create a production build in `dist/`. |
| `npm run preview` | Serve the production build locally for a preview. Run `npm run build` first. |
| `npm run lint` | Run ESLint over the project. |

To create and preview a production build:

```powershell
npm run build
npm run preview
```

## Docker

The Docker image builds the app with Node.js and serves the production files with Nginx. From the repository root, build and run it with Docker Desktop or Docker Engine:

```powershell
docker build -t marstrek .
docker run --rm -p 8080:8080 marstrek
```

Open <http://localhost:8080>. The image includes an HTTP health check. Rebuild the image after changing the app.

## AWS hosting with Terraform

The Terraform configuration in `infra/` creates a private S3 bucket and a CloudFront distribution. CloudFront serves the static Vite build over HTTPS; the bucket blocks public access and grants read access only to that distribution. The default CloudFront hostname is used, so a custom domain and certificate are not required.

### Prerequisites

- An AWS account and AWS CLI credentials configured locally (for example, with AWS IAM Identity Center / SSO).
- Terraform CLI installed.
- Node.js/npm installed, and Docker is optional for this static-site deployment.
- AWS permissions to create S3 buckets and bucket policies, CloudFront resources, and related resources.

### Create the infrastructure

Run from the repository root in PowerShell:

```powershell
terraform -chdir=infra init
terraform -chdir=infra fmt -check
terraform -chdir=infra validate
terraform -chdir=infra plan
terraform -chdir=infra apply
```

Review the plan before applying it. AWS resources can incur charges. Terraform state contains infrastructure details; keep it private, back it up, and do not commit it. For a team or CI deployment, configure a remote state backend with locking before sharing changes.

### Upload a release

Build the app and sync the generated `dist/` files to the private bucket. Then invalidate CloudFront so visitors see the latest app shell:

```powershell
npm ci
npm run build
$bucket = terraform -chdir=infra output -raw s3_bucket_name
$distribution = terraform -chdir=infra output -raw cloudfront_distribution_id
aws s3 sync .\dist "s3://$bucket" --delete
aws cloudfront create-invalidation --distribution-id $distribution --paths "/*"
terraform -chdir=infra output -raw site_url
```

The upload command uses `--delete` to remove files from the bucket that are no longer in `dist/`; use it only for this app's dedicated bucket. For automated releases, GitHub Actions can run the build and upload after CI passes, using AWS OIDC instead of long-lived AWS keys.

### GitHub Actions deployment setup

The workflows in `.github/workflows/` run lint, the production build, and a Docker image build for pushes and pull requests. Terraform changes also run formatting and validation checks. After CI passes on a push to `main`, the deploy job builds the app, syncs `dist/` to S3, and invalidates CloudFront.

To enable deployment:

1. Apply the Terraform configuration and note its `s3_bucket_name`, `cloudfront_distribution_id`, and `site_url` outputs.
2. In the AWS account, configure GitHub as an OpenID Connect identity provider (`token.actions.githubusercontent.com`, audience `sts.amazonaws.com`) and create an IAM role trusted only for this repository's `main` branch: `repo:Vidu465/Project-MarsTrek:ref:refs/heads/main`.
3. Give that role only the deployment permissions it needs: list the deployment bucket, put and delete objects in that bucket, and create invalidations for this CloudFront distribution. Scope the S3 and CloudFront resource ARNs to the values created for this site.
4. In GitHub, open **Settings → Secrets and variables → Actions → Variables** and add these repository variables:

   | Variable | Value |
   | --- | --- |
   | `AWS_ROLE_ARN` | ARN of the OIDC deployment role |
   | `AWS_REGION` | Region used for the S3 bucket (for example, `us-east-1`) |
   | `S3_BUCKET_NAME` | Terraform `s3_bucket_name` output |
   | `CLOUDFRONT_DISTRIBUTION_ID` | Terraform `cloudfront_distribution_id` output |

The deploy job stays skipped until all four variables are set. The validation and Docker build jobs still run. Do not store AWS access keys in GitHub; the workflow requests short-lived credentials through OIDC.

### Remove the AWS resources

When you no longer need the deployment, review and run:

```powershell
terraform -chdir=infra destroy
```

S3 bucket deletion can fail if objects remain. Empty the bucket first if Terraform reports that it is not empty. Keep any state file or remote backend until resource deletion has completed successfully.

## Limitations

- The terrain and slope grid is synthetic; the hazard overlay is only a visual demonstration.
- Route costs, walking energy, EVA duration, reserves, and crew checks are simplified calculations based on editable example assumptions. They are not validated against flight hardware or operational procedures.
- Orbital imagery and archive results provide context, not a guarantee of current or complete coverage. Remote services can change, be unavailable, or block browser requests.
- Candidate pins and the approximate boxwork zone are not verified landing or sampling recommendations.
- Radiation and environmental values, where shown, are contextual estimates and are not suit-specific exposure or weather forecasts.

## Credits and references

- Map imagery and rover traverse: [NASA/JPL Mars Trek](https://trek.nasa.gov/mars/).
- Orbital archive searches: [NASA PDS Geosciences Node Orbital Data Explorer](https://ode.rsl.wustl.edu/mars/).
- Rover waypoint context: [NASA Mars Exploration Program](https://mars.nasa.gov/).
- Radiation context references the Curiosity RAD surface measurements reported by Hassler et al. (2014). The app's simplified walking-energy approach references Minetti et al. (2002). Neither is a substitute for mission-specific analysis.

The app uses React, TypeScript, Vite, Leaflet/React Leaflet, Tailwind CSS, Recharts, and Lucide icons. See `package.json` for the complete dependency list.
