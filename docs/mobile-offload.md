# Mobile offload contract

The Android client owns deterministic high-frequency navigation work: GPS smoothing, camera animation, route progress, local maneuver distance, voice scheduling, local alert filtering, off-route detection, UI state cache and telemetry batching.

The server owns route generation, global traffic intelligence, safety scoring, micro-routing, reroute calculation, route history and account state.

Endpoints:
- `GET /api/mobile/bootstrap`
- `GET /api/mobile/navigation/config`
- `POST /api/mobile/navigation/batch`

`GET /api/route` remains the canonical route endpoint.
