# Qatar Off-Plan Dashboard

A static, bilingual (English and Arabic) website covering Qatar's property market and its off-plan projects. It's a Qatar take on the Dubai "deal checker" reel. It shows registered sales, prices, supply, rents, sun and shade, noise, livability, a residency and ownership checker, and side-by-side project comparison. An **Analyst** toggle shows every formula and source.

There is no build step. It's plain HTML, CSS and ES modules, with Leaflet, Chart.js and SunCalc loaded from cdnjs.

## Data sources

| File | Source | How it's built |
|---|---|---|
| `data/deals.json` | Ministry of Justice open data: weekly bulletin of residential-unit sales, one row per sale | `tools/fetch_moj.py` → `tools/build_deals.py` |
| `data/transactions.json` | MoJ weekly bulletins for all property types plus units, aggregated by week, area and category. Totals match MoJ's press releases (checked: 27 Sep–1 Oct 2026 = QAR 508,269,130) | `tools/build_market.py` |
| `data/projects.json` | Property Finder Qatar new-projects pages (developer listings) | `tools/fetch_propertyfinder.py --projects` |
| `data/rents.json` | Property Finder Qatar asking rents, about 25 listings per area and bedroom count | `tools/fetch_propertyfinder.py --rents` |
| `data/poi.json` | OpenStreetMap (ODbL): Doha Metro stations, schools, hospitals, malls, beaches | `tools/fetch_osm.py` |
| `data/noise.json` | OpenStreetMap: runways (HIA, old Doha airport, Al Udeid) and motorways | `tools/fetch_noise.py` |
| `data/areas.json` | Hand-curated. Ownership regimes follow Cabinet Resolution 21/2026 (freehold) and 28/2020 (usufruct) | edit by hand |
| `data/rules.json` | Hand-curated: Aqarat residency thresholds (QAR 730k and QAR 3.65m) | edit by hand |
| `data/district_aliases.json` | Maps MoJ district names (English and Arabic) to area ids | edit when the build reports UNMAPPED |
| `data/pipeline.json` | Optional supply figures from outside sources. Tracked projects are added automatically | edit by hand |

Raw MoJ CSVs are kept in `data/raw/` so every number can be traced back to its source.

## Run it locally

```bash
python -I tools/serve.py
```

Then open http://127.0.0.1:8765. Opening `index.html` straight from disk won't work, because the data has to be served over HTTP.

## Refresh the data

```bash
python -I tools/refresh.py
```

This one command:
1. Finds and downloads any new MoJ weekly CSVs.
2. Rebuilds the deals and transactions files.
3. Refreshes the Property Finder projects and rents.
4. Writes "What changed" to `data/changes.json`.
5. Runs `tools/validate.py`.

It exits with 1 if validation fails. In that case, **don't commit**.

Two options:
- Add `--full` once a month to also refresh the OpenStreetMap places and noise geometry.
- Add `--no-pf` to skip Property Finder.

**Certificates.** moj.gov.qa sends an incomplete certificate chain. `tools/certs/moj-chain.pem` contains DigiCert's *public* intermediate and root certificates, so verification still happens; it is never turned off.

## Add or correct a project by hand

Edit `data/projects.json`. Fields that the next Property Finder refresh doesn't provide are kept between runs: `name_ar`, `default_facade` (N, NE, E, SE, S, SW, W or NW), `views`, `note_en`/`note_ar`, `units_total`, `floors` and `area_id`. To add a project that isn't on Property Finder, give it a unique `id` and set `source` to your own reference. Then run `python -I tools/validate.py`.

## Methods (also shown in Analyst mode)

- **Price position.** The project's QAR/sqm, from apartment-type units only, is compared with every registered unit sale in the area over the last 12 months. The band is P25–P75. Areas with fewer than 20 deals of their own use their parent area's deals: Qetaifan uses Lusail, and Gewan uses The Pearl.
- **Gross yield.** Median asking rent × 12 ÷ price.
- **Sun.** SunCalc runs every 10 minutes on 21 June, 20 March and 21 December. The facade gets direct sun when the sun is within 90° of the facade's outward normal and above an obstruction angle. That angle is a heuristic: 8°, 20° or 32° by density, minus 1.2° per floor.
- **Noise.** The model uses distance to the extended runway centrelines (a 16 km corridor, weighted by airport) and to motorways. It is not a decibel measurement.
- **Livability.** Distances to the nearest metro station, school, hospital, mall and beach, each scored linearly and then weighted.

## Hosting and weekly refresh (GitHub Pages + Actions, no git needed)

The repo is `sampathtaameer/qatar-offplan-dashboard` (public). `.github/workflows/refresh.yml` does both jobs:
- **Every Sunday at 07:00 Doha time**, or on demand from Actions → "Refresh data and deploy" → Run workflow, it runs `tools/refresh.py` on GitHub's servers. If validation passes, it commits the new data and redeploys the site. It adds `--full` in the first week of each month.
- **On every push to `main`**, it only redeploys the site.

If a refresh fails validation, nothing is committed, the site keeps its last good data, and GitHub emails the repo owner.

Pages must be set to **Settings → Pages → Source: GitHub Actions**.

To edit files without git, use the GitHub web editor (pencil icon), or **Add file → Upload files** for several files. `tools/bridge.html` together with `tools/serve.py` can copy the whole project to the clipboard, ready to paste into the uploader.
