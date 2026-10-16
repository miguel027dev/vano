-- Isolated PostGIS migration DRAFT. Manual review only; never auto-run on production.
CREATE SCHEMA IF NOT EXISTS vano_safe;
CREATE TABLE IF NOT EXISTS vano_safe.source_snapshots (
 snapshot_id text PRIMARY KEY,
 source_name text NOT NULL,
 source_url text NOT NULL,
 sha256 char(64) NOT NULL,
 collected_at timestamptz NOT NULL DEFAULT now(),
 source_updated_at timestamptz,
 license_reviewed boolean NOT NULL DEFAULT false,
 approved_at timestamptz,
 status text NOT NULL DEFAULT 'raw' CHECK (status IN ('raw','staging','rejected','approved'))
);
CREATE TABLE IF NOT EXISTS vano_safe.public_lights_staging (
 snapshot_id text NOT NULL REFERENCES vano_safe.source_snapshots(snapshot_id),
 source_feature_id text NOT NULL,
 geom geometry(Point,4326) NOT NULL,
 PRIMARY KEY(snapshot_id,source_feature_id)
);
CREATE INDEX IF NOT EXISTS public_lights_staging_geom_idx ON vano_safe.public_lights_staging USING GIST(geom);
CREATE TABLE IF NOT EXISTS vano_safe.road_segments (
 segment_id text PRIMARY KEY,
 network_version text NOT NULL,
 geom geometry(LineString,4326) NOT NULL,
 vehicle_access text NOT NULL CHECK(vehicle_access IN ('car','moto','both','unknown'))
);
CREATE INDEX IF NOT EXISTS road_segments_geom_idx ON vano_safe.road_segments USING GIST(geom);
CREATE TABLE IF NOT EXISTS vano_safe.segment_lighting (
 segment_id text NOT NULL REFERENCES vano_safe.road_segments(segment_id),
 snapshot_id text NOT NULL REFERENCES vano_safe.source_snapshots(snapshot_id),
 lighting text NOT NULL CHECK(lighting IN ('registered','no_record','unknown')),
 association_confidence numeric(4,3) NOT NULL CHECK(association_confidence BETWEEN 0 AND 1),
 inventory_complete boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL,
 PRIMARY KEY(segment_id,snapshot_id)
);
-- No personal routes, origins or destinations are stored.
-- Only approved, licensing-reviewed snapshots may be published.

CREATE TABLE IF NOT EXISTS vano_safe.source_pages (
 snapshot_id text NOT NULL REFERENCES vano_safe.source_snapshots(snapshot_id) ON DELETE CASCADE,
 page_offset integer NOT NULL CHECK (page_offset>=0),
 feature_count integer NOT NULL CHECK (feature_count>=0),
 raw_data bytea NOT NULL,
 sha256 char(64) NOT NULL,
 PRIMARY KEY(snapshot_id,page_offset)
);
-- Approval is a separate privileged operation after CRS, quality and license checks.
CREATE TABLE IF NOT EXISTS vano_safe.approved_dataset (
 dataset_name text PRIMARY KEY,
 snapshot_id text NOT NULL REFERENCES vano_safe.source_snapshots(snapshot_id),
 approved_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by text NOT NULL
);
