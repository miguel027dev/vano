# Analytics candidate — not deployed

This branch is based on the observed live web commit `d1e7b2a7ad7da707fa5117bad9afe04bd392102a`.
The matching Android candidate is maintained separately on `feat/android-firebase-20261116`, based on
`1b8d7344535eee2db55bda412dc0ef0eaa12c3d3` (`fix/android-system-bars-3.1.7`).
Do not replace the Android folder in this web branch: it is older than the published Android source.

## Implemented infrastructure

- `POST /api/observability/events`: existing guest/user session, exact-origin/CSRF guards, 20 events and 32 KiB per batch,
  30 batches/minute per client, 600 batches/minute globally, 30,000 attempted events/day.
- Acknowledgement follows a committed PostgreSQL INSERT. Unique event UUIDs deduplicate retries.
- Independent pool (maximum 2 connections); separate `vano_observability` schema. Never writes `vano_v2.app_state`.
- Async worker, 100 events per transaction, nominal 2-second interval; transactional UTC aggregates.
  Failure backoff is capped at 60 seconds. Latency depends on load, database availability and client connectivity.
- Raw events expire after 7 days; anonymous daily counts after 90 days. Cleanup runs with the worker.
- `GET /api/admin/observability`: authenticated administrator only, no-store; daily counts, version,
  duration totals, recent sanitized events, activity observed in the last 5 minutes and worker status.
- No new admin UI, new service, Render deployment, paid plan or credentials.
- Routes receive observational hooks only; no route payload, GPS, map rendering or camera mutation.

## Activation gates

1. Review and update privacy disclosure and Play Data safety; current policy does not describe these SDKs.
2. An explicit user choice must call `setObservabilityConsent(true/false)`. No new consent interface was authorized;
   no existing login/terms acceptance is treated as analytics consent. Collection is OFF until that choice exists.
3. Deploy only after staging validation. Then set `VANO_OBSERVABILITY_ENABLED=1` in the intended service.
   `DATABASE_URL` and `VANO_SECURITY_SECRET` reuse existing server secrets; they never enter client code.
4. Ensure the database role can create the separate schema. Review database usage before activation.
5. API startup continues when optional observability cannot initialize, and event submissions return 503.

## Data and interpretation

Only allowlisted event names, UUIDs, UTC times, bounded numeric duration/status, enumerated kind and approved versions.
No coordinates, destinations, geometry, addresses, search text, names, emails, URLs, raw errors or account IDs.
Random client installation token rotates after 30 days; the server stores keyed HMACs, not raw tokens.
The in-memory client queue holds at most 100 events, batches 20, retries at most 3 times and then drops a batch.
It is deliberately best-effort before server acknowledgement; page termination can lose unsent events.
Revocation clears the unsent client queue and tells the native SDK to stop; erasure of previously sent records
still needs a privacy workflow before activation. Never describe these pseudonyms as irreversibly anonymous.

Firebase automatically supplies first_open, session_start, user_engagement and technical attributes when collection is enabled.
These reserved events are rejected by the custom bridge. First open is not installation time.
Native GA4 and first-party VANO metrics are different sources; do not sum them.
Official installations, D1/D7/D30 cohorts, first opens and crash rates remain null in the new endpoint until
verified official importers exist. Do not replace unavailable values with zero.
`route_complete` is schema-supported but has no emitter: the current navigation does not expose a verified completion action.
Navigation cancel means an explicit end/reset, not a proved failure to arrive. No abandonment percentage is inferred yet.

## Validation recorded on 2026-11-16

- Full web suite: 1,194 passing tests; web build and SEO audit passed.
- New tests: consent, native/server destination separation, automatic-event rejection, parameter minimization,
  UTC timestamps and retry UUID stability.
- PostgreSQL engine test using PGlite in temporary tooling (not a production dependency): schema, durable acknowledgement,
  duplicate delivery, async exactly-once aggregation, sanitization and daily-budget rollback passed.
- Production database/Render activation, real device, DebugView, Crashlytics crash delivery, memory/startup measurement,
  visual comparison and release Android build remain unverified.

## Rollout and recovery

Do not merge or deploy while release-critical tests are pending. Keep Android upload in draft until explicit publication approval.
Start with an internal test signed by the original upload key, verify DebugView and a deliberate debug-only crash,
then use a small staged production rollout if Google Play permits it for the app.
Pause rollout for confirmed startup regression, increased crash/ANR rates or failed navigation regression checks.
For web observability faults, disable `VANO_OBSERVABILITY_ENABLED` and redeploy the reviewed web baseline.
Keep inbox data for replay instead of dropping schemas. An Android recovery update must use a higher versionCode;
Google Play cannot downgrade installed versionCodes.
