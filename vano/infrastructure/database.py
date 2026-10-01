"""VANO database schema and initialization.

Extracted from the historical monolithic app.py without changing route bodies or
business rules. Runtime dependencies are injected once during application startup.
"""
from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject

def get_db():
    if "db" not in g:
        g.db = connect_db()
    return g.db


@app.teardown_appcontext
def close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def utcnow_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def validate_password_strength(password):
    password = str(password or "")
    if len(password) < 10:
        return False, "A senha precisa ter pelo menos 10 caracteres."
    if len(password) > 256:
        return False, "A senha é longa demais."
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        return False, "A senha precisa ter pelo menos uma letra e um número."
    return True, ""


def hash_password(password):
    iterations = 600_000
    salt = secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${derived.hex()}"


def verify_password(stored, password):
    try:
        algorithm, iterations, salt_hex, digest_hex = stored.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        ).hex()
        return secrets.compare_digest(candidate, digest_hex)
    except Exception:
        return False


def init_db():
    """Create/upgrade the PostgreSQL schema without destructive migrations."""
    db = connect_db()
    try:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
                locale TEXT NOT NULL DEFAULT 'pt-BR',
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                last_login_at TEXT,
                google_sub TEXT,
                avatar_url TEXT NOT NULL DEFAULT '',
                auth_provider TEXT NOT NULL DEFAULT 'password',
                age INTEGER,
                sex TEXT NOT NULL DEFAULT '',
                is_app_driver INTEGER,
                night_safety_mode INTEGER NOT NULL DEFAULT 1,
                route_preference TEXT NOT NULL DEFAULT 'balanced',
                onboarding_completed_at TEXT,
                distance_unit TEXT NOT NULL DEFAULT 'km',
                vehicle_make TEXT NOT NULL DEFAULT '',
                vehicle_model TEXT NOT NULL DEFAULT '',
                vehicle_plate TEXT NOT NULL DEFAULT '',
                vehicle_year TEXT NOT NULL DEFAULT '',
                preferred_fuel_networks TEXT NOT NULL DEFAULT '[]',
                home_label TEXT NOT NULL DEFAULT '',
                work_label TEXT NOT NULL DEFAULT '',
                presence_visible INTEGER NOT NULL DEFAULT 0,
                presence_terms_accepted_at TEXT,
                emergency_name TEXT NOT NULL DEFAULT '',
                emergency_phone TEXT NOT NULL DEFAULT '',
                map_style TEXT NOT NULL DEFAULT 'auto',
                map_accent TEXT NOT NULL DEFAULT 'violet',
                avoid_ferries INTEGER NOT NULL DEFAULT 0,
                avoid_tolls INTEGER NOT NULL DEFAULT 0,
                avoid_unpaved INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS auth_sessions (
                id SERIAL PRIMARY KEY,
                token_hash TEXT NOT NULL UNIQUE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                last_used_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                revoked_at TEXT
            );

            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id BIGSERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used_at TEXT
            );

            CREATE TABLE IF NOT EXISTS user_access_log (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                ip_address TEXT NOT NULL,
                user_agent TEXT NOT NULL DEFAULT '',
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                request_count INTEGER NOT NULL DEFAULT 1,
                UNIQUE(user_id, ip_address)
            );

            CREATE TABLE IF NOT EXISTS request_activity_logs (
                id BIGSERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                event_type TEXT NOT NULL DEFAULT 'request',
                method TEXT NOT NULL DEFAULT '',
                path TEXT NOT NULL DEFAULT '',
                endpoint TEXT NOT NULL DEFAULT '',
                status_code INTEGER,
                ip_address TEXT NOT NULL DEFAULT 'unknown',
                user_agent TEXT NOT NULL DEFAULT '',
                referrer TEXT NOT NULL DEFAULT '',
                metadata TEXT NOT NULL DEFAULT '{}',
                duration_ms INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reports (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                category TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                severity INTEGER NOT NULL DEFAULT 3 CHECK(severity BETWEEN 1 AND 5),
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                address TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','resolved','rejected')),
                created_at TEXT NOT NULL,
                expires_at TEXT,
                confirmations INTEGER NOT NULL DEFAULT 0,
                road_snapped INTEGER NOT NULL DEFAULT 0,
                snap_distance_m REAL,
                road_name TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS report_confirmations (
                id SERIAL PRIMARY KEY,
                report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                UNIQUE(report_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS report_absence_votes (
                id SERIAL PRIMARY KEY,
                report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                UNIQUE(report_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS saved_places (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL DEFAULT '',
                label TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_saved_places_user ON saved_places(user_id, updated_at);

            CREATE TABLE IF NOT EXISTS weekly_routines (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
                label TEXT NOT NULL DEFAULT '',
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                departure_time TEXT NOT NULL DEFAULT '',
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(user_id, weekday)
            );
            CREATE INDEX IF NOT EXISTS idx_weekly_routines_user ON weekly_routines(user_id, weekday);

            CREATE TABLE IF NOT EXISTS privacy_requests (
                id SERIAL PRIMARY KEY,
                protocol TEXT NOT NULL UNIQUE,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                email TEXT NOT NULL DEFAULT '',
                request_type TEXT NOT NULL,
                message TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','rejected')),
                admin_note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS route_history (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                origin_label TEXT NOT NULL DEFAULT '',
                destination_label TEXT NOT NULL DEFAULT '',
                origin_lat REAL NOT NULL,
                origin_lon REAL NOT NULL,
                destination_lat REAL NOT NULL,
                destination_lon REAL NOT NULL,
                mode TEXT NOT NULL,
                distance_m REAL NOT NULL,
                duration_s REAL NOT NULL,
                safety_score REAL NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS route_feedback (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                route_signature TEXT NOT NULL DEFAULT '',
                rating TEXT NOT NULL CHECK(rating IN ('good','improve')),
                mode TEXT NOT NULL DEFAULT 'safest',
                profile TEXT NOT NULL DEFAULT 'walking',
                progress REAL NOT NULL DEFAULT 0,
                duration_s REAL NOT NULL DEFAULT 0,
                distance_m REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS vano_osint_devices (
                id BIGSERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                remote_user_id TEXT NOT NULL DEFAULT '',
                remote_device_id TEXT NOT NULL DEFAULT '',
                device_token_enc TEXT NOT NULL DEFAULT '',
                device_name TEXT NOT NULL DEFAULT '',
                app_version TEXT NOT NULL DEFAULT '',
                consent_active INTEGER NOT NULL DEFAULT 0,
                consent_version TEXT NOT NULL DEFAULT '',
                consent_at TEXT,
                consent_revoked_at TEXT,
                last_sync_at TEXT,
                last_error TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_vano_osint_devices_consent ON vano_osint_devices(consent_active, updated_at);

            CREATE TABLE IF NOT EXISTS geocode_cache (
                cache_key TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS audit_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                action TEXT NOT NULL,
                metadata TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS risk_zones (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                risk_type TEXT NOT NULL DEFAULT 'verified_incident_area',
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                radius_m REAL NOT NULL DEFAULT 350,
                level_cap INTEGER NOT NULL DEFAULT 3 CHECK(level_cap BETWEEN 0 AND 5),
                confidence REAL NOT NULL DEFAULT 0.75 CHECK(confidence BETWEEN 0 AND 1),
                source TEXT NOT NULL DEFAULT 'admin',
                source_url TEXT NOT NULL DEFAULT '',
                start_hour INTEGER,
                end_hour INTEGER,
                neighborhood TEXT NOT NULL DEFAULT '',
                city TEXT NOT NULL DEFAULT '',
                state TEXT NOT NULL DEFAULT '',
                danger_level INTEGER NOT NULL DEFAULT 2 CHECK(danger_level BETWEEN 1 AND 5),
                block_routes INTEGER NOT NULL DEFAULT 0,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS radar_points (
                id BIGSERIAL PRIMARY KEY,
                geo_key TEXT NOT NULL UNIQUE,
                radar_type TEXT NOT NULL DEFAULT 'fixed_speed',
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                speed_limit INTEGER,
                direction TEXT NOT NULL DEFAULT '',
                road_name TEXT NOT NULL DEFAULT '',
                city TEXT NOT NULL DEFAULT '',
                state TEXT NOT NULL DEFAULT '',
                country TEXT NOT NULL DEFAULT '',
                source TEXT NOT NULL DEFAULT 'openstreetmap',
                source_id TEXT NOT NULL DEFAULT '',
                source_url TEXT NOT NULL DEFAULT '',
                official INTEGER NOT NULL DEFAULT 0,
                confidence REAL NOT NULL DEFAULT 0.75 CHECK(confidence BETWEEN 0 AND 1),
                active INTEGER NOT NULL DEFAULT 1,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                last_verified_at TEXT NOT NULL DEFAULT '',
                seen_count INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS radar_scan_cells (
                cell_key TEXT NOT NULL,
                source TEXT NOT NULL,
                last_attempt_at TEXT NOT NULL DEFAULT '',
                last_success_at TEXT NOT NULL DEFAULT '',
                last_error TEXT NOT NULL DEFAULT '',
                item_count INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(cell_key, source)
            );

            CREATE TABLE IF NOT EXISTS shared_routes (
                id SERIAL PRIMARY KEY,
                token TEXT NOT NULL UNIQUE,
                creator_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                origin_label TEXT NOT NULL DEFAULT '',
                destination_label TEXT NOT NULL DEFAULT '',
                origin_lat REAL NOT NULL,
                origin_lon REAL NOT NULL,
                destination_lat REAL NOT NULL,
                destination_lon REAL NOT NULL,
                profile TEXT NOT NULL DEFAULT 'walking',
                mode TEXT NOT NULL DEFAULT 'safest',
                route_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                uses_count INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS live_trips (
                id SERIAL PRIMARY KEY,
                token TEXT NOT NULL UNIQUE,
                creator_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                destination_label TEXT NOT NULL DEFAULT '',
                last_lat REAL,
                last_lon REAL,
                last_accuracy REAL,
                last_speed REAL,
                last_heading REAL,
                route_progress REAL NOT NULL DEFAULT 0,
                safety_level INTEGER NOT NULL DEFAULT 3,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS flow_samples (
                id SERIAL PRIMARY KEY,
                cell_lat REAL NOT NULL,
                cell_lon REAL NOT NULL,
                direction_bucket INTEGER NOT NULL DEFAULT 0,
                speed_kmh REAL NOT NULL,
                source_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS nearby_presence (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                cell_lat REAL NOT NULL,
                cell_lon REAL NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS trusted_links (
                id SERIAL PRIMARY KEY,
                owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                trusted_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                relation TEXT NOT NULL DEFAULT 'responsavel',
                created_at TEXT NOT NULL,
                UNIQUE(owner_user_id, trusted_user_id)
            );

            CREATE TABLE IF NOT EXISTS family_invites (
                id SERIAL PRIMARY KEY,
                token TEXT NOT NULL UNIQUE,
                inviter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                relation TEXT NOT NULL DEFAULT 'responsavel',
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                accepted_at TEXT,
                accepted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS app_notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                source_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                kind TEXT NOT NULL DEFAULT 'info',
                title TEXT NOT NULL,
                body TEXT NOT NULL DEFAULT '',
                payload_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                read_at TEXT
            );

            CREATE TABLE IF NOT EXISTS finance_accounts (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                institution TEXT NOT NULL DEFAULT '',
                account_type TEXT NOT NULL DEFAULT 'cash' CHECK(account_type IN ('cash','checking','savings','wallet','reserve')),
                currency TEXT NOT NULL DEFAULT 'BRL',
                opening_balance_cents BIGINT NOT NULL DEFAULT 0,
                active INTEGER NOT NULL DEFAULT 1,
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS finance_entries (
                id SERIAL PRIMARY KEY,
                account_id INTEGER NOT NULL REFERENCES finance_accounts(id) ON DELETE RESTRICT,
                kind TEXT NOT NULL CHECK(kind IN ('income','expense')),
                status TEXT NOT NULL DEFAULT 'posted' CHECK(status IN ('pending','posted','voided')),
                amount_cents BIGINT NOT NULL CHECK(amount_cents > 0),
                category TEXT NOT NULL DEFAULT 'Geral',
                description TEXT NOT NULL,
                counterparty TEXT NOT NULL DEFAULT '',
                cost_center TEXT NOT NULL DEFAULT 'Operação',
                payment_method TEXT NOT NULL DEFAULT '',
                document_ref TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                occurred_on TEXT NOT NULL,
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TEXT NOT NULL,
                posted_at TEXT,
                posted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                voided_at TEXT,
                voided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                void_reason TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS finance_commitments (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'Infraestrutura',
                supplier TEXT NOT NULL DEFAULT '',
                amount_cents BIGINT NOT NULL CHECK(amount_cents > 0),
                cadence TEXT NOT NULL DEFAULT 'monthly' CHECK(cadence IN ('weekly','monthly','annual','one_off')),
                next_due_on TEXT,
                active INTEGER NOT NULL DEFAULT 1,
                notes TEXT NOT NULL DEFAULT '',
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS finance_audit_logs (
                id SERIAL PRIMARY KEY,
                actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                action TEXT NOT NULL,
                object_type TEXT NOT NULL,
                object_id INTEGER,
                snapshot_json TEXT NOT NULL DEFAULT '{}',
                snapshot_sha256 TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS rairo_node_configs (
                node_index INTEGER PRIMARY KEY,
                name TEXT NOT NULL DEFAULT '',
                url TEXT NOT NULL DEFAULT '',
                region TEXT NOT NULL DEFAULT 'Render',
                provider TEXT NOT NULL DEFAULT 'Render',
                environment TEXT NOT NULL DEFAULT 'production',
                capacity INTEGER NOT NULL DEFAULT 4,
                enabled INTEGER NOT NULL DEFAULT 1,
                drain_mode INTEGER NOT NULL DEFAULT 0,
                priority INTEGER NOT NULL DEFAULT 100,
                health_path TEXT NOT NULL DEFAULT '/healthz',
                route_path TEXT NOT NULL DEFAULT '/v1/route/calculate',
                precalc_path TEXT NOT NULL DEFAULT '/v1/route/precalculate',
                connect_timeout_s REAL NOT NULL DEFAULT 2.2,
                route_timeout_s REAL NOT NULL DEFAULT 10.0,
                cooldown_s INTEGER NOT NULL DEFAULT 20,
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS rairo_node_dispatch_logs (
                id SERIAL PRIMARY KEY,
                node_index INTEGER NOT NULL DEFAULT 0,
                node_name TEXT NOT NULL DEFAULT '',
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                request_id TEXT NOT NULL DEFAULT '',
                mode TEXT NOT NULL DEFAULT '',
                profile TEXT NOT NULL DEFAULT '',
                prefetch INTEGER NOT NULL DEFAULT 0,
                http_status INTEGER,
                success INTEGER NOT NULL DEFAULT 0,
                latency_ms INTEGER NOT NULL DEFAULT 0,
                error TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS oauth_states (
                state TEXT PRIMARY KEY,
                redirect_uri TEXT NOT NULL,
                next_url TEXT,
                fingerprint TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, expires_at);
            CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at, revoked_at);
            CREATE INDEX IF NOT EXISTS idx_user_access_user_last ON user_access_log(user_id, last_seen_at DESC);
            CREATE INDEX IF NOT EXISTS idx_user_access_ip ON user_access_log(ip_address);
            CREATE INDEX IF NOT EXISTS idx_activity_created ON request_activity_logs(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_activity_user_created ON request_activity_logs(user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_activity_ip_created ON request_activity_logs(ip_address, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_activity_type_created ON request_activity_logs(event_type, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports(status, created_at);
            CREATE INDEX IF NOT EXISTS idx_reports_geo ON reports(latitude, longitude);
            CREATE INDEX IF NOT EXISTS idx_privacy_requests_status_created ON privacy_requests(status, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_routes_user_created ON route_history(user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_route_feedback_created ON route_feedback(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_route_feedback_user ON route_feedback(user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_risk_zones_geo ON risk_zones(active, latitude, longitude);
            CREATE INDEX IF NOT EXISTS idx_radar_points_geo ON radar_points(active, latitude, longitude);
            CREATE INDEX IF NOT EXISTS idx_radar_points_source ON radar_points(source, last_seen_at DESC);
            CREATE INDEX IF NOT EXISTS idx_radar_points_country ON radar_points(country, active);
            CREATE INDEX IF NOT EXISTS idx_radar_scan_cells_success ON radar_scan_cells(source, last_success_at);
            CREATE INDEX IF NOT EXISTS idx_shared_routes_token ON shared_routes(token);
            CREATE INDEX IF NOT EXISTS idx_shared_routes_expiry ON shared_routes(expires_at);
            CREATE INDEX IF NOT EXISTS idx_live_trips_token ON live_trips(token);
            CREATE INDEX IF NOT EXISTS idx_live_trips_expiry ON live_trips(expires_at, active);
            CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry ON oauth_states(expires_at);
            CREATE INDEX IF NOT EXISTS idx_flow_samples_geo_time ON flow_samples(cell_lat, cell_lon, created_at);
            CREATE INDEX IF NOT EXISTS idx_flow_samples_time ON flow_samples(created_at);
            CREATE INDEX IF NOT EXISTS idx_nearby_presence_time ON nearby_presence(updated_at);
            CREATE INDEX IF NOT EXISTS idx_trusted_links_owner ON trusted_links(owner_user_id);
            CREATE INDEX IF NOT EXISTS idx_trusted_links_trusted ON trusted_links(trusted_user_id);
            CREATE INDEX IF NOT EXISTS idx_family_invites_expiry ON family_invites(expires_at);
            CREATE INDEX IF NOT EXISTS idx_app_notifications_user ON app_notifications(user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_finance_entries_account_date ON finance_entries(account_id, occurred_on DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_finance_entries_status_date ON finance_entries(status, occurred_on DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_finance_entries_kind_date ON finance_entries(kind, occurred_on DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_finance_commitments_active_due ON finance_commitments(active, next_due_on);
            CREATE INDEX IF NOT EXISTS idx_finance_audit_object ON finance_audit_logs(object_type, object_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_rairo_node_configs_enabled ON rairo_node_configs(enabled, priority, node_index);
            CREATE INDEX IF NOT EXISTS idx_node_dispatch_node_time ON rairo_node_dispatch_logs(node_index, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_node_dispatch_user_time ON rairo_node_dispatch_logs(user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_node_dispatch_success_time ON rairo_node_dispatch_logs(success, created_at DESC);
            """
        )

        # Additive migrations for existing PostgreSQL databases.
        user_columns = table_columns(db, "users")
        user_migrations = {
            "google_sub": "ALTER TABLE users ADD COLUMN google_sub TEXT",
            "avatar_url": "ALTER TABLE users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''",
            "auth_provider": "ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'password'",
            "age": "ALTER TABLE users ADD COLUMN age INTEGER",
            "sex": "ALTER TABLE users ADD COLUMN sex TEXT NOT NULL DEFAULT ''",
            "is_app_driver": "ALTER TABLE users ADD COLUMN is_app_driver INTEGER",
            "night_safety_mode": "ALTER TABLE users ADD COLUMN night_safety_mode INTEGER NOT NULL DEFAULT 1",
            "route_preference": "ALTER TABLE users ADD COLUMN route_preference TEXT NOT NULL DEFAULT 'balanced'",
            "onboarding_completed_at": "ALTER TABLE users ADD COLUMN onboarding_completed_at TEXT",
            "distance_unit": "ALTER TABLE users ADD COLUMN distance_unit TEXT NOT NULL DEFAULT 'km'",
            "vehicle_make": "ALTER TABLE users ADD COLUMN vehicle_make TEXT NOT NULL DEFAULT ''",
            "vehicle_model": "ALTER TABLE users ADD COLUMN vehicle_model TEXT NOT NULL DEFAULT ''",
            "vehicle_plate": "ALTER TABLE users ADD COLUMN vehicle_plate TEXT NOT NULL DEFAULT ''",
            "vehicle_year": "ALTER TABLE users ADD COLUMN vehicle_year TEXT NOT NULL DEFAULT ''",
            "preferred_fuel_networks": "ALTER TABLE users ADD COLUMN preferred_fuel_networks TEXT NOT NULL DEFAULT '[]'",
            "home_label": "ALTER TABLE users ADD COLUMN home_label TEXT NOT NULL DEFAULT ''",
            "work_label": "ALTER TABLE users ADD COLUMN work_label TEXT NOT NULL DEFAULT ''",
            "presence_visible": "ALTER TABLE users ADD COLUMN presence_visible INTEGER NOT NULL DEFAULT 0",
            "presence_terms_accepted_at": "ALTER TABLE users ADD COLUMN presence_terms_accepted_at TEXT",
            "emergency_name": "ALTER TABLE users ADD COLUMN emergency_name TEXT NOT NULL DEFAULT ''",
            "emergency_phone": "ALTER TABLE users ADD COLUMN emergency_phone TEXT NOT NULL DEFAULT ''",
            "map_style": "ALTER TABLE users ADD COLUMN map_style TEXT NOT NULL DEFAULT 'auto'",
            "map_accent": "ALTER TABLE users ADD COLUMN map_accent TEXT NOT NULL DEFAULT 'violet'",
            "avoid_ferries": "ALTER TABLE users ADD COLUMN avoid_ferries INTEGER NOT NULL DEFAULT 0",
            "avoid_tolls": "ALTER TABLE users ADD COLUMN avoid_tolls INTEGER NOT NULL DEFAULT 0",
            "avoid_unpaved": "ALTER TABLE users ADD COLUMN avoid_unpaved INTEGER NOT NULL DEFAULT 0",
        }
        for column, ddl in user_migrations.items():
            if column not in user_columns:
                db.execute(ddl)
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL")

        node_columns = table_columns(db, "rairo_node_configs")
        node_migrations = {
            "provider": "ALTER TABLE rairo_node_configs ADD COLUMN provider TEXT NOT NULL DEFAULT 'Render'",
            "environment": "ALTER TABLE rairo_node_configs ADD COLUMN environment TEXT NOT NULL DEFAULT 'production'",
            "drain_mode": "ALTER TABLE rairo_node_configs ADD COLUMN drain_mode INTEGER NOT NULL DEFAULT 0",
            "route_path": "ALTER TABLE rairo_node_configs ADD COLUMN route_path TEXT NOT NULL DEFAULT '/v1/route/calculate'",
            "precalc_path": "ALTER TABLE rairo_node_configs ADD COLUMN precalc_path TEXT NOT NULL DEFAULT '/v1/route/precalculate'",
            "connect_timeout_s": "ALTER TABLE rairo_node_configs ADD COLUMN connect_timeout_s REAL NOT NULL DEFAULT 2.2",
            "route_timeout_s": "ALTER TABLE rairo_node_configs ADD COLUMN route_timeout_s REAL NOT NULL DEFAULT 10.0",
            "cooldown_s": "ALTER TABLE rairo_node_configs ADD COLUMN cooldown_s INTEGER NOT NULL DEFAULT 20",
            "notes": "ALTER TABLE rairo_node_configs ADD COLUMN notes TEXT NOT NULL DEFAULT ''",
        }
        for column, ddl in node_migrations.items():
            if column not in node_columns:
                db.execute(ddl)

        risk_columns = table_columns(db, "risk_zones")
        risk_migrations = {
            "neighborhood": "ALTER TABLE risk_zones ADD COLUMN neighborhood TEXT NOT NULL DEFAULT ''",
            "city": "ALTER TABLE risk_zones ADD COLUMN city TEXT NOT NULL DEFAULT ''",
            "state": "ALTER TABLE risk_zones ADD COLUMN state TEXT NOT NULL DEFAULT ''",
            "danger_level": "ALTER TABLE risk_zones ADD COLUMN danger_level INTEGER NOT NULL DEFAULT 2",
            "block_routes": "ALTER TABLE risk_zones ADD COLUMN block_routes INTEGER NOT NULL DEFAULT 0",
        }
        danger_was_missing = "danger_level" not in risk_columns
        for column, ddl in risk_migrations.items():
            if column not in risk_columns:
                db.execute(ddl)
        if danger_was_missing:
            db.execute("UPDATE risk_zones SET danger_level=GREATEST(1, LEAST(5, 5-level_cap))")
        db.execute("CREATE INDEX IF NOT EXISTS idx_risk_zones_block ON risk_zones(active, block_routes, latitude, longitude)")

        report_columns = table_columns(db, "reports")
        report_migrations = {
            "road_snapped": "ALTER TABLE reports ADD COLUMN road_snapped INTEGER NOT NULL DEFAULT 0",
            "snap_distance_m": "ALTER TABLE reports ADD COLUMN snap_distance_m REAL",
            "road_name": "ALTER TABLE reports ADD COLUMN road_name TEXT NOT NULL DEFAULT ''",
        }
        for column, ddl in report_migrations.items():
            if column not in report_columns:
                db.execute(ddl)

        oauth_columns = table_columns(db, "oauth_states")
        if "fingerprint" not in oauth_columns:
            db.execute("ALTER TABLE oauth_states ADD COLUMN fingerprint TEXT NOT NULL DEFAULT ''")

        # Security migration: old builds created admin@rairo.local with the
        # published password Vano Maps@2026!. Disable only that exact legacy hash.
        legacy_admin = db.execute("SELECT id,password_hash FROM users WHERE email=?", ("admin@rairo.local",)).fetchone()
        if legacy_admin and verify_password(legacy_admin["password_hash"], "Vano Maps@2026!"):
            db.execute("UPDATE users SET password_hash=?,is_active=0 WHERE id=?", (hash_password(secrets.token_urlsafe(48)), legacy_admin["id"]))

        # Single-owner security migration: any historical administrator other than
        # the designated VANO owner is demoted. Environment variables can no longer
        # promote a second admin account.
        db.execute("UPDATE users SET role='user' WHERE role='admin' AND LOWER(email) <> ?", (PRIMARY_ADMIN_EMAIL,))
        owner = db.execute("SELECT id FROM users WHERE LOWER(email)=?", (PRIMARY_ADMIN_EMAIL,)).fetchone()
        if owner:
            db.execute("UPDATE users SET role='admin', is_active=1 WHERE id=?", (owner["id"],))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db_with_retry():
    """Initialize PostgreSQL with a short retry window during platform startup."""
    attempts = max(1, min(10, int(os.environ.get("DATABASE_INIT_RETRIES", "6") or 6)))
    delay = max(1, min(10, int(os.environ.get("DATABASE_INIT_RETRY_DELAY", "2") or 2)))
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            init_db()
            return
        except RuntimeError:
            # Erro de configuração (URL ausente/placeholder) não melhora com retry.
            raise
        except Exception as exc:
            last_error = exc
            if attempt >= attempts:
                break
            print(f"[VANO MAPS] PostgreSQL ainda não disponível (tentativa {attempt}/{attempts}); nova tentativa em {delay}s: {exc}", flush=True)
            time.sleep(delay)
    raise last_error


if os.environ.get("VANO_SKIP_DB_INIT", "0").strip().lower() not in {"1", "true", "yes", "on"}:
    init_db_with_retry()

# -----------------------------
# Security / session helpers
# -----------------------------

RATE_BUCKETS = {}
RATE_LOCK = threading.Lock()
ROAD_AWARENESS_CACHE = {}
