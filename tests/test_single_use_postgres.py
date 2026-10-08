"""Real concurrent token claims in isolated PostgreSQL schemas, never production."""
import concurrent.futures
import os
import secrets
import threading

import pytest


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="PostgreSQL integration runs in CI")
@pytest.mark.parametrize("kind", ["oauth", "password_reset"])
def test_only_one_concurrent_request_consumes_token(kind, monkeypatch):
    import psycopg2
    from db_backend import PostgresDB
    from vano.security import auth
    schema = "test_token_" + secrets.token_hex(8)
    url = os.environ["TEST_DATABASE_URL"]
    admin = psycopg2.connect(url);admin.autocommit = True
    with admin.cursor() as cur:
        cur.execute(f"CREATE SCHEMA {schema}")
        cur.execute(f"CREATE TABLE {schema}.oauth_states(state TEXT PRIMARY KEY,redirect_uri TEXT,next_url TEXT,expires_at TEXT)")
        cur.execute(f"CREATE TABLE {schema}.password_reset_tokens(id INTEGER PRIMARY KEY,user_id INTEGER,used_at TEXT,expires_at TEXT)")
        cur.execute(f"INSERT INTO {schema}.oauth_states VALUES('synthetic-state','https://localhost/callback','/map','2999-01-01T00:00:00+00:00')")
        cur.execute(f"INSERT INTO {schema}.password_reset_tokens VALUES(1,42,NULL,'2999-01-01T00:00:00+00:00')")
    local = threading.local()
    monkeypatch.setattr(auth, "get_db", lambda: local.db)
    barrier = threading.Barrier(8)
    def attempt(_):
        connection = psycopg2.connect(url)
        try:
            with connection.cursor() as cur:cur.execute(f"SET search_path TO {schema}")
            connection.commit();local.db = PostgresDB(connection)
            barrier.wait(timeout=20)
            if kind == "oauth":
                return auth.consume_google_oauth_state("synthetic-state") is not None
            result = auth.claim_password_reset(local.db, 1, "2026-10-08T00:00:00+00:00")
            local.db.commit()
            return result is not None
        finally:
            connection.close()
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(attempt, range(8)))
        assert results.count(True) == 1
        assert results.count(False) == 7
    finally:
        with admin.cursor() as cur:cur.execute(f"DROP SCHEMA {schema} CASCADE")
        admin.close()
