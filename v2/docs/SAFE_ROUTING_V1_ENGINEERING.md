# VANO Safe Routing V1 — Engineering gate (São Paulo)

## Production freeze
Branch `feature/vano-safe-routing-v1-20261015` is NOT deployed to the VANO Render
service. Do not merge into `preview/vano-react-v2-7` or touch `main` before
separate testing, explicit approval and a database backup.

- Production commit captured: `61f0ce523e6a31f5b324ec2b96a903928e1e26e5`.
- Code recovery branch: `backup/vanu-pre-safe-routing-20261015-61f0ce5`.
- Production routing: `v2/server/index.mjs` -> original V1 bridge with
  Mapbox V1-compatible candidate fallback and circuit breaker. The route ID
  `safe` currently indicates an alternative, **NOT verified personal safety**.
- No Postgres instance tied to VANO was listed in the connected Render
  workspaces. Storage may be external via DATABASE_URL or JSON; this must
  be established through non-secret configuration inspection before any DB action.
- Never expose any Render credentials, location histories or session data.

## Phase A — source assessment
Official GeoSampa downloads: https://download.geosampa.prefeitura.sp.gov.br/PaginasPublicas/_SBC.aspx .
Formats include GeoJSON, GPKG, SHP and KML. Confirm each layer's schema, usable
license, source date and authoritative download URL separately. Do not imply a
post is functioning from its presence in an inventory.

Import cadence: offline only (never in a route request). Download into private,
versioned object storage using HTTPS + size limit, log source URL/version,
record checksum, quarantine invalid or unexpectedly changed datasets.
If the dataset uses EPSG:31983, reproject in staging with spatial tooling
(for example ogr2ogr -t_srs EPSG:4326) after independently confirming the
source CRS. The GeoJSON import validator REQUIRES EPSG:4326.

## Phase B — spatial QA
Use PostGIS segments split at junctions. Map-match points only after comparing
crossings, carriageways, bridges and road direction. Never assume that the
nearest mapped road is necessarily the correct road. Attach coverage
and source freshness to each approved segment, with explicit unknown values.

## Phase C — ranking (implemented as pure experiment)
`v2/server/safe-routing.mjs` accepts already map-matched segment evidence
and Mapbox/V1 candidate routes. Solar elevation distinguishes day, civil twilight
and night for São Paulo at the departure time. Source age reduces CONFIDENCE,
not a guessed assessment of neighborhood danger.
At night, lighting inventory coverage may influence the preference; by
day, only validated road surface evidence contributes. The alternate route
may be preferred only if evidence is comparable and the detour is bounded.
Missing evidence -> fastest existing route. This is not live safety prediction.
Demographic, income, racial, favela and personal-age fields are not inputs.

## Phase D — integration contract (NOT YET WIRED)
1. Keep original `/api/route` completely unchanged.
2. Mapbox provides geometries/ETAs; never invent roads, streets or durations.
3. New opt-in, authenticated staging-only endpoint `/api/safe/preview` behind
   explicit off-by-default flag and independent timeout/circuit breaker.
4. Join the route geometry to offline PostGIS segment evidence in a
   separate service; do NOT receive arbitrary segment evidence from clients.
5. Return route ID, observed evidence fraction, confidence, data vintage,
   estimated extra time and explicit caveat; preserve original alternatives.
6. Never ask users to validate potentially risky streets in person.
7. Protect precise coordinates: minimal retention, no raw route logging,
   per-user rate limits, explicit permissions, LGPD review.
8. DDL in `v2/sql/safe_routing_v1.sql` is proposal only. It has NOT run.

## Release gates
- Node test: `node --test v2/server/safe-routing.test.mjs v2/server/geo-data-quality.test.mjs`.
- Existing `cd v2 && npm test && npm run build && npm audit --omit=dev --audit-level=high`.
- Add spatial fixtures for bridges, frontage roads and mismatched CRS.
- Stage with synthetic locations. Fallback on *any* database or external API
  failure; strict timeout and a kill-switch.
- Benchmark cold/warm latency, false spatial joins, data coverage and privacy.
- Test Web and APK regression. Only then approve any production integration.
