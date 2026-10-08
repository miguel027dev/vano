"""Real PostgreSQL concurrency check, run in CI against an isolated schema."""
import concurrent.futures
import os
import secrets
import threading

import pytest


def test_shared_limiter_fails_closed_when_database_unavailable(monkeypatch):
    from vano.security import auth
    def unavailable():
        raise RuntimeError('synthetic database outage')
    monkeypatch.setattr(auth, 'get_db', unavailable)
    assert auth._shared_rate_limit('a' * 64, 5, 60) is False


@pytest.mark.skipif(not os.environ.get('TEST_DATABASE_URL'), reason='PostgreSQL integration runs in CI')
def test_shared_limiter_serializes_concurrent_workers(monkeypatch):
    import psycopg2
    from db_backend import PostgresDB
    from vano.security import auth
    url = os.environ['TEST_DATABASE_URL']
    schema = 'test_limit_' + secrets.token_hex(8)
    admin = psycopg2.connect(url)
    admin.autocommit = True
    with admin.cursor() as cur:
        cur.execute(f'CREATE SCHEMA {schema}')
        cur.execute(f'CREATE TABLE {schema}.security_rate_events(bucket_key TEXT,created_at DOUBLE PRECISION,expires_at DOUBLE PRECISION)')
    local = threading.local()
    monkeypatch.setattr(auth, 'get_db', lambda: local.db)
    bucket = secrets.token_hex(32)
    def attempt(_):
        connection = psycopg2.connect(url)
        with connection.cursor() as cur:
            cur.execute(f'SET search_path TO {schema}')
        connection.commit()
        local.db = PostgresDB(connection)
        try:
            return auth._shared_rate_limit(bucket, 5, 60)
        finally:
            connection.close()
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
            decisions = list(pool.map(attempt, range(20)))
        assert sum(decisions) == 5
        with admin.cursor() as cur:
            cur.execute(f'SELECT COUNT(*) FROM {schema}.security_rate_events')
            assert cur.fetchone()[0] == 5
    finally:
        with admin.cursor() as cur:
            cur.execute(f'DROP SCHEMA {schema} CASCADE')
        admin.close()
