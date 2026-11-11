# Experimental time-saving complement

This module supplements candidate exploration; it does not replace the V1 Python policy or the published Mapbox fallback. It is not imported by the production route handler. Keep the current preview behavior until measured evidence supports activation.

## Integration contract

Use raw provider routes before presentation rounding: `duration` is seconds and `distance` metres. Do not use React card values (`duration` minutes, `distance` kilometres) or combine a remaining-trip candidate with the original full-trip baseline. During rerouting obtain both routes for the same current origin and remaining destination.

`exploreTimeSavings` receives:

- `routes`: complete valid baseline candidate pool; the fastest is the baseline.
- `context`: vehicle, provider, profile, exact requested origin/destination, departure key, canonical restriction key and snapshot timestamp.
- `fetchCandidate(spec, {signal, context})`: provider callback returning `[{route, context}]`. Every returned envelope must carry the actual query context, including query time.
- `existingSpecs`: exclusion specifications already attempted by the original engine, avoiding duplicate probes.
- `state`: reroute status, GPS reliability, distance to next maneuver, and last route switch timestamp.
- `policy`: adjustable experimental thresholds.

Use `createMapboxTimeSavingProbe` for the existing Mapbox backend. Ensure its options and context match the BASE request; do not construct fresh context around old route data. The adapter carries normal vehicle restrictions, departure and heading constraints and passes the AbortSignal through. Never log tokens or provider URLs containing them.

```js
const adapter = createMapboxTimeSavingProbe({
  origin, destination, vehicle, telemetry, language, options, token
});
// Obtain raw BASE routes with the same adapter context, BEFORE presentation.
// Preserve capturedAt from that actual request, not the later probe creation.
const report = await exploreTimeSavings({
  routes: rawCandidatePool,
  context: baseRequestContext,
  fetchCandidate: adapter.fetchCandidate,
  existingSpecs: originalProbeSpecs,
  state: {reroute: false}
});
// Shadow mode: record only aggregate report fields. Return the original route.
// Activation later must explicitly handle recommendation, original safety
// metadata, route revision, signed trip proof and presentation normalisation.
```

The full-polyline signature is geometric identity, not proof of identical road-edge topology. Different encodings of the same road remain distinct; impose the existing candidate cap at integration. Unknown traffic never counts as a measured delay. `duration - duration_typical` is excess relative to typical conditions, not free-flow delay or statistical variance. Congestion-weighted time is only a search priority; no penalty is added to provider ETA.

Defaults: four probes, concurrency two, 2.5-second additional deadline, snapshots up to two minutes old, minimum gain max(90 seconds, 4%), extra distance allowance max(500 metres, min(5 km, 25% of baseline distance)). During an ordinary voluntary reroute require reliable GPS, 250 metres until the maneuver and a 90-second switch cooldown. These thresholds are engineering starting points, not fitted driver statistics. Closures, missed turns and invalidated routes require the original emergency/deviation flow rather than waiting for voluntary-switch cooldown.

Results distinguish `fastestObserved` from `recommended`: the lowest observed ETA can fail distance, gain or reroute gates. Failure or deadline preserves the original route. The baseline retains authority. Additional provider queries have latency and quota costs even when no faster candidate is found.

## Original Python integration

An integration into V1 must operate on its raw pool in `vano/services/routing.py` before `fast_route_payload`, not re-score the rounded bridge response. Implement/validate the same contract there or use an internal raw-pool adapter. This experiment does not modify the Python files claimed as faithful copies. Safety mode and pedestrian routing are outside its selection objective.

## Validation

Run `npm test` in `v2`. Tests exercise sampled-signature collisions, time-priority targeting, strategy coverage, distance/gain thresholds, incompatible/stale queries, access-point anchors, restrictions/closures, reroute guardrails, bounded concurrency and hanging requests.

Live research used four São Paulo OD pairs in one short observation window, comparing provider ETAs. No routes were physically driven. No meaningful recommendation gain was found. This is neither a representative fleet sample nor proof that the algorithm improves actual arrival times. See the user-facing research report and snapshot evidence.
