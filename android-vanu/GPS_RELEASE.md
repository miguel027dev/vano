# Android GPS candidate 3.1.9
Status: implementation candidate, not approved for Play release.
Base: feat/android-analytics-3.1.8-20261116 @ 0e4e0ede20b4957e90492379108cd2077c746b34.

## Changes
- Native single-GPS capability advertises the contract already implemented in the current web MapPage.
- Trusted mapTracking requests start Android GPS before route navigation.
- One permission prompt per Activity and explicit denied status. Foreground only; no new permissions.
- Idempotent subscriptions avoid resetting acquisition on map/navigation/recenter messages.
- Independent satellite/network registration and recent cached bootstrap (monotonic age at most 8 seconds).
- Sensor arbitration rejects invalid, stale, future and out-of-order samples. A noisier network fix cannot displace a recent precise satellite fix.
- Missing/stationary/unreliable bearing is null rather than turning the car on sensor noise.
- Silent subscriptions recover after 15 seconds once a fix exists; initial satellite acquisition gets 45 seconds before restart, with 5-second checks.
- Provider-change broadcasts recover when GPS is re-enabled, including when both providers were initially off. Pending permission prompts do not report premature denial.
- Pause, document navigation and destroy remove native subscriptions/watchdog.
- Sensor positions and speed are not interpolated; existing web visual filters, road matching and camera retain responsibility for rendering.

## Integration and release limits
This branch retains the 3.1.8 telemetry candidate and its release guards. It does not merge either observability candidate into production.
Version code 20270010 is provisional until checking every Play track.
The web deployment must include hasNativeSingleGps plus mapTracking effects. Confirm its deployed commit before release; source inspected in preview/vano-react-v2-7 is compatible.
No runtime, connected Android device, original signing material or Play Console interaction is available in this session.
CI compilation intentionally skips only debug Google Services configuration; it cannot validate Firebase initialization, release packaging or signing.
No signed AAB has been created. No Play upload, review submission, web deploy or rollout has occurred.

## Required device checks before publishing
Compare installed production with this candidate on the same devices and route:
1. Fresh install, permission grant/deny/approximate location, GPS disabled and re-enabled.
2. Record map-visible to first approximate fix and first <=35 m fix; compare p50/p95, never count cached data as a fresh measurement.
3. Verify no WebView watch overlaps the native stream and repeated recenter does not restart satellite acquisition.
4. Stationary 60 seconds, walking, real driving, stops/turns/parallel roads; verify no artificial movement or road locking across unrelated streets.
5. Tunnel/signal loss, 30 seconds offline, app pause/resume, screen rotation, WebView recreation.
6. Check camera continuity, manual pan/recenter, maneuver framing, frame times, battery, speed, route guidance and crashes.
7. Complete original Firebase release configuration, original upload signature, merged manifest and bundle validation; check all used versionCodes.
8. Publish to internal testing first; promote only after the device checks pass.

Do not claim parity with Waze without comparable device measurements.

## Validation evidence
The javac-only job successfully compiled the actual GpsFixPolicy source and passed all 5 scenario groups on commit f02e8506fc53bc05f6783fd714090922aa4e813c (run 43974573359, job 133675115785). This policy source is unchanged in the follow-up commit.
Initial Android Gradle validation failed during dependency resolution, before app compilation, with missing Maven artifacts including Kotlin stdlib and Apache HttpMime. Full Android build, JUnit integration and real device validation are not yet established. This document does not claim camera improvements were measured or that the AAB is ready.
