# VANO Maps — Navigation Refactor V300

## Structural changes
- Replaced the empty `vano-map-v230.js` runtime with a canonical `vano-map-v300.js` built from the actual implementation.
- Removed the ambiguous empty/decoded runtime pair so the page has one primary navigation implementation.
- Added explicit camera states: `FOLLOWING`, `OVERVIEW`, `FREE_LOOK`, `RECENTERING`, `MANEUVER_FOCUS`, `REROUTING` and `ARRIVAL`.
- Added priority/cooldown handling for navigation audio.
- Added first-class `smart` / **Spark** mode through UI, cache keys, requests, selection, prefetch, sharing and saved-trip restore.
- Kept existing backend/API/auth/admin endpoints intact.

## Navigation behavior
- New 42 px VANO user puck with a lightweight purple pointer and Black-mode-safe contrast.
- Heading smoothing freezes while effectively stopped and adapts to speed/GPS accuracy.
- GPS movement remains locally interpolated; moderate jumps are reconciled instead of immediately teleporting the puck.
- Camera declares state transitions, has landscape-aware framing and zoom hysteresis to reduce breathing.
- Reroute state is explicit; automatic reroute cooldown is 60 s and the existing ~500 m off-route travel gate is preserved.
- Speedometer zero threshold is stricter to suppress fake speed while stationary.
- Saved Spark trips now resume as Spark instead of silently becoming “Mais segura”.

## Map/UI design system
- Added `vano-navigation-v300.css` as the authoritative navigation layer instead of stacking more inline patches.
- User marker, navigation card, maneuver card, street chip, control stack and speedometer use one compact spacing/size system.
- Route geometry is thinner, cleaner and uses the VANO purple navigation palette instead of the legacy orange route treatment.
- Alert markers now use one SVG visual family, compact sizing and priority ordering; mixed raster report artwork was removed from the live map marker layer.
- Alert DOM marker cap was reduced to limit map clutter and unnecessary rendering.
- Added a true landscape layout with lateral navigation information and horizontal controls.
- Added reduced-motion and Black-mode rules.
- Removed obsolete 74–80 px V230 puck CSS and stale “Equilibrada” labels from visible route surfaces.

## Performance / lifecycle
- Map animation cadence is more conservative on normal/eco/low-power devices.
- Existing local marker interpolation, camera rendering and source updates remain client-side; network requests are not frame-driven.
- Existing navigation cleanup remains responsible for route/session state, GPS listeners, audio and camera reset at trip end.

## Validation performed
- `node --check static/vano-map-v300.js`.
- `node --check static/vano-sw-v262.js`.
- `python -m py_compile app.py db_backend.py mobile_routes.py vano_osint_bridge.py`.
- Runtime reference scan: no remaining reference to `vano-map-v230.js`, `vano-map-v230.decoded.js` or `vano-user-puck-v230`.
- Visible copy scan: no remaining “Equilibrada/Equilibrado” route label in templates/runtime.
- Final ZIP integrity check.

## Real-device validation still required
Static validation cannot prove physical GPS sensor behavior, Mapbox frame cadence, Android WebView audio timing or every screen density. Use the existing admin route simulation plus real-device tests for stopped/5/30/60/120 km/h, poor GPS, offline/recovery, portrait/landscape, reroute and long trips before Play Store production rollout.
