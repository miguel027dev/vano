-- Safe Routing V1 DRAFT ONLY. DO NOT execute against VANO production.
-- Schema-isolated, idempotent DDL requires PostGIS pre-installed.
CREATE SCHEMA IF NOT EXISTS safe_raw;
CREATE SCHEMA IF NOT EXISTS safe_staging;
CREATE SCHEMA IF NOT EXISTS safe_approved;

CREATE TABLE IF NOT EXISTS safe_raw.imports (
 id BIGSERIAL PRIMARY KEY,
 source_id TEXT NOT NULL,
 version TEXT NOT NULL,
 publisher TEXT NOT NULL,
 source_url TEXT NOT NULL,
 license_text TEXT NOT NULL,
 source_updated_at TIMESTAMPTZ NOT NULL,
 imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 checksum_sha256 CHAR(64) NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'quarantined'
    CHECK (status IN ('quarantined','validated','rejected')),
 notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS safe_staging.light_points (
 import_id BIGINT NOT NULL REFERENCES safe_raw.imports(id),
 external_id TEXT NOT NULL,
 geom geometry(Point,4326) NOT NULL,
 PRIMARY KEY(import_id,external_id)
);
CREATE INDEX IF NOT EXISTS safe_staging_light_gix ON safe_staging.light_points USING GIST(geom);
CREATE TABLE IF NOT EXISTS safe_approved.road_segments (
 segment_id TEXT PRIMARY KEY,
 geom geometry(LineString,4326) NOT NULL,
 length_m DOUBLE PRECISION NOT NULL CHECK(length_m>0),
 map_version TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS safe_approved_roads_gix ON safe_approved.road_segments USING GIST(geom);
CREATE TABLE IF NOT EXISTS safe_approved.segment_evidence (
 segment_id TEXT NOT NULL REFERENCES safe_approved.road_segments(segment_id),
 source_import_id BIGINT NOT NULL REFERENCES safe_raw.imports(id),
 lighting_fraction DOUBLE PRECISION CHECK(lighting_fraction BETWEEN 0 AND 1),
 road_condition_fraction DOUBLE PRECISION CHECK(road_condition_fraction BETWEEN 0 AND 1),
 evidence_confidence DOUBLE PRECISION NOT NULL CHECK(evidence_confidence BETWEEN 0 AND 1),
 valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(segment_id,source_import_id)
);
-- Promotion from staging must be atomic and only after independent QA.
-- This schema intentionally stores no user location, accounts or route history.
