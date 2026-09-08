# VANO MAPS v275 — Mobile Offload Contract

This server build prepares the next Android AAB to move deterministic high-frequency navigation work to the device without changing the current VANO UI.

## Device-side in the next AAB
- GPS smoothing, speed and bearing filters
- camera animation and look-ahead
- route progress and trimming of travelled geometry
- distance to next maneuver and local voice scheduling
- local visibility filtering for alerts / road controls
- off-route detection; server is called only when reroute is actually required
- UI/navigation state cache and route-package cache
- telemetry batching instead of one network request per event

## Server-side
- route generation and selected route
- live/global traffic intelligence
- safety scoring and micro-routing
- reroute calculation
- route history and account state

## New endpoints
- `GET /api/mobile/bootstrap`
- `GET /api/mobile/navigation/config`
- `POST /api/mobile/navigation/batch`

The existing `GET /api/route` stays compatible and continues to return GeoJSON geometry plus compact steps/road-control data that the Android client can process locally.
