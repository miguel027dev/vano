-- VANO V2 Traffic Memory SP, migration proposal. Apply manually in V2 database after backup.
-- No raw GPS, user IDs, origin/destination or proprietary API responses stored.
-- Run only after validating PostGIS availability and licenses.
CREATE SCHEMA IF NOT EXISTS vano_v2;
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS vano_v2.traffic_edges (
 id text PRIMARY KEY,
 geometry geometry(LineString,4326) NOT NULL,
 direction_label text NOT NULL DEFAULT 'provider',
 source text NOT NULL,
 license_reference text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT traffic_edges_local_bounds CHECK (
  ST_XMin(geometry)>=-46.84 AND ST_XMax(geometry)<=-46.36 AND
  ST_YMin(geometry)>=-23.84 AND ST_YMax(geometry)<=-23.34 AND
  ST_Length(geometry::geography) BETWEEN 20 AND 2200
 )
);
CREATE INDEX IF NOT EXISTS traffic_edges_geom_gist
 ON vano_v2.traffic_edges USING gist(geometry);

CREATE TABLE IF NOT EXISTS vano_v2.traffic_profiles (
 segment_id text NOT NULL REFERENCES vano_v2.traffic_edges(id) ON DELETE CASCADE,
 weekday smallint NOT NULL CHECK(weekday BETWEEN 0 AND 6),
 quarter smallint NOT NULL CHECK(quarter BETWEEN 0 AND 95),
 source text NOT NULL,
 speed_kmh numeric(6,2) NOT NULL CHECK(speed_kmh>1 AND speed_kmh<=130),
 free_flow_kmh numeric(6,2) NOT NULL CHECK(free_flow_kmh>=8 AND free_flow_kmh<=150),
 samples integer NOT NULL CHECK(samples BETWEEN 12 AND 1000000),
 last_observed_at timestamptz NOT NULL,
 license_verified boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(segment_id,weekday,quarter,source),
 CONSTRAINT traffic_profile_speed_range CHECK(speed_kmh<=free_flow_kmh*1.45)
);
CREATE INDEX IF NOT EXISTS traffic_profiles_lookup_idx
 ON vano_v2.traffic_profiles(weekday,quarter,last_observed_at DESC);
CREATE INDEX IF NOT EXISTS traffic_profiles_fresh_idx
 ON vano_v2.traffic_profiles(last_observed_at DESC) WHERE license_verified=true;

-- Operational snapshot materialization (read via a separate job, not 20-30 SQL calls
-- during navigation). The Node hot path uses a cached bounded in-memory grid.
-- Do not run until the licensing/ingestion pipeline has been approved.
-- SELECT jsonb_build_object('records',COALESCE(jsonb_agg(jsonb_build_object(
--   'id', p.segment_id, 'coordinates',(ST_AsGeoJSON(e.geometry)::jsonb->'coordinates'),
--   'weekday',p.weekday,'quarter',p.quarter,'speedKmh',p.speed_kmh,
--   'freeFlowKmh',p.free_flow_kmh,'samples',p.samples,
--   'lastObservedAt',p.last_observed_at,'source',p.source,
--   'licenseVerified',p.license_verified)), '[]'::jsonb))
-- FROM vano_v2.traffic_profiles p
-- JOIN vano_v2.traffic_edges e ON e.id=p.segment_id
-- WHERE p.license_verified=true AND p.last_observed_at>now()-interval '60 days'
-- LIMIT 20000;
