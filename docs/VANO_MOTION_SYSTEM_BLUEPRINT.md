# VANO Motion System — Android navigation experience plan
**Status:** DESIGN SPECIFICATION / NOT YET IMPLEMENTED
**Date:** 2026-10-08
**Primary target:** VANO Android WebView/TWA navigation, while preserving the currently working website.
**Quality reference:** clarity, continuity and polish comparable in experience to mainstream navigation apps. Do not copy proprietary designs.

## Audit: existing code, keep rather than rewrite
- `static/vano-map.js` already has 7 camera states (`NAV_CAMERA_STATES`), a `buildCameraTarget` decision layer, camera interpolation in `cameraMotionTick`, puck smoothing/prediction, GPS map-matching, route rerouting and traffic/radar handling.
- `cameraUrbanContext` uses `map.queryRenderedFeatures` roughly every 1–2 seconds, counts features that resemble buildings and adjusts density. This **does not** calculate physical distance to a building, footprint occlusion, height or whether guidance is hidden.
- `cameraVehicleTuning` motorcycle zoomMax 17.72 is constrained again to 17.48 by the final clamp in `buildCameraTarget`. Unify range constraints.
- The launch transition invokes `map.easeTo` while the ongoing camera controller uses `map.jumpTo`. Coordinate authority and timing so that two animation writers never conflict.
- Existing `vano-android-nav-layout.js` and the Android CSS must be treated as the source of safe-area / dock geometry. The map's viewport and HUD must not be recalculated independently with conflicting assumptions.
- There is an **isolated** WebView candidate `com.vano.maps.fluidez`, not the Play package `com.vano.maps`. Do not claim the user has that exact candidate installed, or that any tests establish physical-device parity.

## Fundamental architecture
One `NavigationMotionController` owns camera transitions; `PuckMotionController`, `RouteLayerMotionController`, `HUDMotionController`, and `BuildingVisibilityController` each own their own render targets.
- Data inputs: GPS lat/lon/speed/heading/accuracy/timestamp, snapped route progression, maneuver geometry and time, vehicle profile, alternatives, incident updates, screen orientation, visual viewport, Android safe areas, visible building features and device performance.
- Resolved state: `routeEpoch`, `motionIntent`, `cameraState`, `targetPose`, `uiOcclusionInsets`, `featureVisibility`, `performanceTier`.
- State/intent priority: user gesture and accessible modal > navigation safety / known maneuver > active recalc transition > follow positioning > decoration. Route epoch prevents late async responses from animating discarded geometry.
- One writer per camera parameter each frame; map motion must not run concurrently with a separate `easeTo` animation. Event-driven changes can use `easeTo` only when the animation controller yields to it and resumes from actual camera state.
- Use critically damped/inertial smoothing in actual elapsed time (not fixed frame counts); clamp overshoot, acceleration, angular velocity and zoom/pitch rate. Shortest-angle interpolation across 0/360°.
- Maintain `prefers-reduced-motion`, battery saver, and low-tier device path; disabled visual flourishes must not disable essential guidance.
- Keep render operations out of any server request loop. GPU/UI motion belongs in the installed client.

## Camera by situation
Numbers below are **starting tuning candidates**, not measured optimal values.
| State | Camera behavior | Safeguard |
|---|---|---|
| Map startup | Calm location reveal, no spin, no unneeded zoom | Skip stale/faulty GPS, respect preferred motion |
| Route calculation | Maintain current map pose, subtle route line reveal | Do not jerk to temporary alternatives |
| Route preview | One fitBounds to show route, then minimal tilt | Leave user control available |
| Navigation start | Single 550–850ms transition into route heading | Avoid conflict between launch easeTo and tracking jumpTo |
| Urban driving | Zoom near ~17.2–17.8, pitch ~35–50° | Guard building occlusion; hold user in legible part of viewport |
| Highway | Wider framing, distance ahead scales with velocity | No major yaw/zoom at each GPS update |
| Motorcycle | Relatively close vehicle with more short-range context | Separate profile, test real-world stability |
| Walking | Gentler tilt, north-up or heading-up by preference | Do not use motorcycle values |
| Stopped/red light | Freeze unreliable orientation, slowly settle pose | GPS drift should not rotate map |
| Acceleration/braking | Smoothly widen/tighten visible route | Rate-limit zoom; no pulsating zoom |
| Gentle corner | Anticipate turn based on geometry | Never turn after GPS lags if route stable |
| Sharp turn/U-turn | Brief view lift/zoom out, then recover | Display correct next road and avoid sudden 180° flip |
| Roundabout/multilevel junction | Slight pitch reduction and branch visibility | No overcommitted branch until route geometry confirms |
| Dense buildings | Decrease tilt or increase selected building translucency if supported | Do not hide essential route; guard absent data |
| Tunnel/underpass | Freeze heading briefly; retain valid progress | No artificial teleportation |
| GPS weak/lost | Stabilize last reliable bearing, modestly zoom out | Announce GPS issue, avoid confidently false placement |
| Rerouting | Hold last valid camera pose; route crossfade after new route validated | Ignore stale async route epoch |
| Auto alternative | Replace corridor with restrained morph/crossfade | No route switch during safety-critical maneuvers |
| Manual map pan/zoom | Suspend auto-follow immediately | Always provide clear re-center action |
| Back to following | Smoothly return to user in the safe visible area | Cancel on renewed gesture |
| Reporting modal | Pause decorative animation, don't change route center | Preserve navigation state and GPS |
| Screen rotate/insets | Recalculate safe viewport, interpolate padding once | No repeated root/WebView double inset |
| Night/day change | Gradual contrast/ambient transition if new style already ready | Do not flash unloaded map or re-create map |
| Near destination | Gradually lower pitch and zoom to nearby streets | Avoid arriving animation before destination matched |
| Arrival | Clear route glow, short acknowledgement | Preserve visibility / no obstructive modal |
| App background/return | Pause animations when hidden; resume from fresh location | Avoid replay of old animation or infinite catch-up |

## Mapbox 3D building / obstruction proposal
1. Detect style mode and source support on style load. Mapbox Standard can render 3D buildings; older custom styles may require a separate `fill-extrusion` layer and supported `building` tile data.
2. Scan rendered building polygon candidates **only in a narrow corridor ahead**, not all viewport features every frame. Prefer layers/source feature queries with known geometry when possible. Throttle to ~0.8–2 seconds based on motion/performance tier; cache tile/route epoch.
3. Use meters (projected feature geometry / route proximity), height/min_height **only if supplied** by tiles, and screen projection. Compute an *occlusion score* (does a visible building obscure puck, selected route, or next turn instructions?).
4. Hysteresis prevents flicker. Trigger `URBAN_OCCLUDED` only after consecutive detections and release once safe. Response order: adjust pitch gently (~5–12°) -> shift framing/zoom slightly -> reduce obstructing building opacity using style-supported API when safe. Do not hide all structures or overexpose nearby private points.
5. No building data, unsupported style or weak GPU: revert to 2D-friendly stable camera; do not infer building height or proximity from count alone.
6. Test under dense urban, tall-building corridors, flyovers, tunnels, multilayer roads and low density; ensure map symbols/instructions remain readable.

## UI motion tokens (candidates; based on usability, not existing measurement)
| Component/action | Intended response |
|---|---|
| Primary button press | Immediate <=100ms visual acknowledgement, no extra network dependency |
| Destination/result selection | ~150–250ms understated selection transition |
| Route alternatives change | ~180–320ms crossfade route emphasis; old route remains until new valid |
| Navigation dock expand | ~180–260ms transform/opacity only, height and safe-area driven |
| Traffic radar appears | ~160–240ms motion, no jump in map center |
| Traffic data updates | Brief text replacement, no unreadable rolling counters |
| Incident report modal | ~200–280ms slide/opacity, scrollable, navigation unaffected |
| Report submitted | Subtle confirmation feedback, then close via deliberate action |
| Reroute started | Stable map + unobtrusive status; no spinning camera |
| Reroute finished | Crossfade geometry with stable puck and bearing |
| GPS degraded | Gentle warning, no repeated shaking |
| Arrival acknowledgement | <=450ms, non-blocking and reduced-motion compatible |
| Theme switch | One consistent 180–320ms fade only when style/tiles ready |

## Concrete work order (each phase gated)
### P0 — Instrument and unify authority
- Add deterministic `camera-trace` recorder (sanitized, opt-in, no exact location upload) for `targetPose`, actual pose, state changes, timestamps and frame gaps.
- Audit camera field writers (`jumpTo`, `easeTo`, `flyTo`, `fitBounds`) and centralize precedence. Fix camera zoom max/min contradictions. Connect actual Android safe viewport from DOM/HUD to camera padding.
- Establish baseline on 3 device classes; profile main thread, map/render sources, CPU/battery.
### P1 — Motion engine / route transitions
- Move camera targeting/steering into testable functions without rewriting routing/GPS business logic.
- Apply state priority and route epoch guards; bound zoom/pitch/rotation velocities.
- Smooth launch, turn, roundabout, missed turn, auto/manual reroute, pan/recenter, arrival. Keep puck and camera related but independently smoothed.
### P2 — 3D urban and collision avoidance
- Style-aware building detection, 3D visibility/occlusion score, hysteresis, visual downgrade on eco devices.
- Verify pitch/zoom in close urban corridors, towers, multi-level roads, night map.
### P3 — HUD choreography
- Use design tokens for timing/damping; route dock/traffic/report/alerts sharing layout geometry and motion intent.
- Reduce layout thrashing, text reflow and expensive CSS effects on WebView.
### P4 — Validation and Android candidate rollout
- Simulate scripted route traces for stationary, stop/start, left/right, U-turn, roundabout, GPS loss/jumps, deviation and reconnection, reroute response order, traffic, 3D urban occlusion, app background/rotation/keyboard, report sheet, route end.
- Cross devices: budget Android/WebView, mid-range Android, high-end Android; portrait/landscape; driving/moto/walk; light/dark, reduced-motion.
- Regression suite must compare camera pose continuity, unobstructed maneuver visibility, max HUD overlap, no route teleport on GPS noise, and no network request per animation frame.
- Build isolated signed APK candidate; CI validates packaging. Confirm real on-device navigation and download artifacts before calling ready. Production Play AAB needs correct official package ID, upload key, approved versionCode.

## Initial release acceptance targets (engineering goals, not observed performance)
- Smooth perceived navigation: aim for consistent 60fps on healthy mid/high-end devices; degrade gracefully to stable 30fps on limited devices rather than janky 60fps.
- At least 95% of app-owned animation frames below 25ms on test midrange and minimal >50ms stalls; record frame times per device rather than promise universal FPS.
- Never obscure key next maneuver or ETA in approved test viewports; route/report card contents fully readable and tappable.
- No abrupt >45° camera bearing jump except necessary user recenter or actual verified U-turn; use controlled progressive rotation.
- No camera snap or route line teleport across automatic reroute; a discontinuity must be explicitly attributable to new validated location/route.
- No measurable performance regression to the website, no battery/CPU issue from building detection in eco mode.
- All tests pass in CI; physical device testing and Play signing remain separate release gates.

## Documentation reference
- https://docs.mapbox.com/mapbox-gl-js/example/3d-buildings/
- https://docs.mapbox.com/mapbox-gl-js/api/properties/
- https://docs.mapbox.com/help/troubleshooting/mapbox-gl-js-performance/
- https://docs.mapbox.com/mapbox-gl-js/guides/styles/set-a-style/
