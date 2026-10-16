/*
 * Read-only Safe Routing evidence worker.
 * It never chooses a route: it can only return a bounded, explicitly caveated
 * infrastructure observation to a server-side shadow-mode caller.
 */
const MAX_TILES_HARD = 9;
const MAX_METERS_HARD = 3500;
const MAX_BODY_BYTES = 24_000;
const CACHE_SECONDS = 300;

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `private, max-age=${CACHE_SECONDS}`, ...headers } });
}
export function finiteNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error('invalid-number');
  return number;
}
export function parseRequest(input, limits = {}) {
  if (!input || typeof input !== 'object') throw new Error('invalid-body');
  const bbox = input.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4) throw new Error('invalid-bbox');
  const [west, south, east, north] = bbox.map((n) => finiteNumber(n, -180, 180));
  if (!(west < east && south < north) || west < -46.98 || east > -46.20 || south < -24.11 || north > -23.23) throw new Error('bbox-outside-pilot');
  const meters = finiteNumber(input.maxDistanceMeters ?? 35, 1, Math.min(Number(limits.maxMeters) || MAX_METERS_HARD, MAX_METERS_HARD));
  const tiles = Array.isArray(input.tiles) ? [...new Set(input.tiles)] : [];
  const maxTiles = Math.min(Number(limits.maxTiles) || MAX_TILES_HARD, MAX_TILES_HARD);
  if (!tiles.length || tiles.length > maxTiles || tiles.some((tile) => !/^sp\/z12\/[0-9]{1,4}\/[0-9]{1,4}$/.test(tile))) throw new Error('invalid-tiles');
  return { bbox: [west, south, east, north], tiles, maxDistanceMeters: meters, snapshot: typeof input.snapshot === 'string' && /^[a-z0-9][a-z0-9._-]{5,80}$/i.test(input.snapshot) ? input.snapshot : 'current' };
}
export async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function requireAuthorization(request, env) {
  const supplied = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9._~-]{24,200})$/)?.[1];
  if (!supplied || !env.SAFE_ROUTING_API_KEY_SHA256) throw new Error('unauthorized');
  const expected = env.SAFE_ROUTING_API_KEY_SHA256.toLowerCase();
  const actual = await sha256(supplied);
  if (actual.length !== expected.length || !crypto.timingSafeEqual?.(new TextEncoder().encode(actual), new TextEncoder().encode(expected))) {
    // Workers do not expose a timingSafeEqual helper on every compatibility date.
    let mismatch = actual.length ^ expected.length;
    for (let i = 0; i < Math.max(actual.length, expected.length); i++) mismatch |= (actual.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
    if (mismatch !== 0) throw new Error('unauthorized');
  }
  return actual;
}
export function snapshotKey(snapshot) { return `snapshots/${snapshot}/manifest.json`; }
export function tileKey(snapshot, tile) { return `snapshots/${snapshot}/tiles/${tile}.geojson.gz`; }
export async function readVerifiedManifest(bucket, snapshot, signingKey) {
  const object = await bucket.get(snapshotKey(snapshot));
  if (!object) throw new Error('snapshot-unavailable');
  const manifest = await object.json();
  if (!manifest || manifest.version !== 1 || manifest.status !== 'approved' || manifest.usedForRouting !== false || !Array.isArray(manifest.tiles) || !/^[a-f0-9]{64}$/i.test(manifest.payloadSha256) || typeof manifest.signature !== 'string') throw new Error('snapshot-invalid');
  const canonical = JSON.stringify({ version: manifest.version, snapshotId: manifest.snapshotId, status: manifest.status, usedForRouting: manifest.usedForRouting, payloadSha256: manifest.payloadSha256, tiles: manifest.tiles.slice().sort() });
  if (!signingKey || manifest.signature !== await sha256(`${signingKey}:${canonical}`)) throw new Error('snapshot-signature-invalid');
  return manifest;
}
export async function enforceQuota(env, clientHash, limit) {
  if (!env.SAFE_ROUTING_QUOTAS) return true; // Binding is optional only for local tests; production must bind it.
  const day = new Date().toISOString().slice(0, 10);
  await env.SAFE_ROUTING_QUOTAS.prepare('INSERT INTO safe_routing_quota(day, client_hash, count) VALUES(?1, ?2, 1) ON CONFLICT(day, client_hash) DO UPDATE SET count = count + 1').bind(day, clientHash).run();
  const row = await env.SAFE_ROUTING_QUOTAS.prepare('SELECT count FROM safe_routing_quota WHERE day=?1 AND client_hash=?2').bind(day, clientHash).first();
  return Number(row?.count) <= limit;
}
async function readTile(bucket, snapshot, tile) {
  const object = await bucket.get(tileKey(snapshot, tile));
  if (!object) return null;
  const stream = object.body.pipeThrough(new DecompressionStream('gzip'));
  const text = await new Response(stream).text();
  if (text.length > 1_500_000) throw new Error('tile-too-large');
  const data = JSON.parse(text);
  if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length > 20_000) throw new Error('tile-invalid');
  return data.features;
}
export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/v1/lighting-evidence') return json({ error: 'not-found' }, 404);
    if (env.ENVIRONMENT !== 'staging' || env.SAFE_ROUTING_ENABLED !== 'true') return json({ available: false, reason: 'feature-disabled', usedForRouting: false }, 503);
    try {
      const contentLength = Number(request.headers.get('content-length') || 0);
      if (contentLength > MAX_BODY_BYTES) throw new Error('body-too-large');
      const keyHash = await requireAuthorization(request, env);
      const query = parseRequest(await request.json(), { maxTiles: env.MAX_QUERY_TILES, maxMeters: env.MAX_QUERY_METERS });
      const allowed = await enforceQuota(env, keyHash, Math.min(Number(env.DAILY_QUERY_LIMIT) || 120, 1000));
      if (!allowed) return json({ available: false, reason: 'quota-exceeded', usedForRouting: false }, 429);
      const manifest = await readVerifiedManifest(env.SAFE_ROUTING_DATA, query.snapshot, env.SNAPSHOT_SIGNING_KEY);
      if (query.tiles.some((tile) => !manifest.tiles.includes(tile))) throw new Error('tile-not-in-snapshot');
      const lists = await Promise.all(query.tiles.map((tile) => readTile(env.SAFE_ROUTING_DATA, manifest.snapshotId, tile)));
      const fixtures = lists.flat().filter(Boolean);
      return json({ available: true, sourceSnapshot: manifest.snapshotId, sourceVersion: manifest.payloadSha256, evidenceType: 'registered-public-light-fixtures', functioningLightsConfirmed: false, visibilityConfirmed: false, suitableForAutomaticRanking: false, usedForRouting: false, bbox: query.bbox, maxDistanceMeters: query.maxDistanceMeters, fixtures });
    } catch (error) {
      const reason = ['unauthorized', 'invalid-number', 'invalid-body', 'invalid-bbox', 'bbox-outside-pilot', 'invalid-tiles', 'body-too-large'].includes(error?.message) ? error.message : 'evidence-unavailable';
      return json({ available: false, reason, usedForRouting: false }, reason === 'unauthorized' ? 401 : reason.startsWith('invalid') || reason === 'bbox-outside-pilot' ? 400 : 503);
    }
  }
};
