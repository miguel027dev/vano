# VANO Safe Routing — Cloudflare staging boundary

This directory is deliberately **not deployed**. It prepares a low-cost, least-privilege boundary for a future staging-only evidence service.

- R2 holds versioned, gzip-compressed GeoJSON tiles and a signed manifest. The Worker never writes R2.
- The Worker accepts only authenticated, São Paulo pilot-area POST queries that name at most nine precomputed tiles. It never accepts a route geometry, user ID, or an unbounded WFS request.
- D1 is optional and stores only a daily SHA-256 API-key digest plus a counter for quota enforcement. It is not a geospatial database and must be dedicated to this service.
- The response explicitly reports registered public fixtures only. It does not assert that lamps work, that a street is visible, or that a route is safer. `usedForRouting` remains false.
- Any absent binding, invalid signature, quota failure, timeout, or unavailable tile returns an unavailable result. The VANO caller must keep the original Mapbox route.

## Required manual provisioning (after explicit Cloudflare login and review)

1. Confirm the Cloudflare account and inventory existing resources. Do not delete unrelated resources.
2. Create the dedicated staging R2 bucket and, only if quotas are desired, the dedicated D1 database. Confirm current Free-plan allowances in the Cloudflare dashboard before creating or scheduling ingestion.
3. Replace the D1 placeholder in `wrangler.toml`; apply `quota.sql` to that dedicated database; set `SAFE_ROUTING_API_KEY_SHA256` and `SNAPSHOT_SIGNING_KEY` as Worker secrets, never as vars or repository files.
4. Upload only a license-reviewed, geometry-validated, versioned snapshot. Its manifest must list exact tiles, contain a SHA-256 payload digest, have `status: "approved"`, and have `usedForRouting: false`.
5. Keep `SAFE_ROUTING_ENABLED=false` until staging integration, real Mapbox alternatives, latency, rollback, privacy, license, and human route-review gates pass.

No Cloudflare account, bucket, database, secret, schedule, route, or deploy is created by these files.
