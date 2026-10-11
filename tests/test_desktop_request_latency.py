"""Resource loads must never compete with authenticated pages for DB access."""
import importlib
import time

from test_launch_audit_security import db, runtime, signin


def test_authenticated_static_assets_and_health_do_not_query_database(db, monkeypatch):
    client = runtime.app.test_client()
    signin(client, db)
    monkeypatch.setattr(importlib.import_module('vano.services.search'), 'get_db', lambda: db)
    queries = []
    execute = db.execute

    def traced(sql, *args):
        queries.append(sql)
        return execute(sql, *args)

    monkeypatch.setattr(db, 'execute', traced)
    for path in ('/static/vano-runtime.css', '/static/vano-foundation.css',
                 '/static/vano-runtime.js', '/static/vano-map.js',
                 '/manifest.webmanifest', '/vano-sw.js'):
        start = time.perf_counter()
        response = client.get(path, base_url='https://localhost')
        print(path, 'queries=', len(queries), 'ms=', round((time.perf_counter()-start)*1000, 2))
        assert response.status_code == 200
        assert 'Cookie' not in response.headers.get('Vary', '')
        assert 'Set-Cookie' not in response.headers
    assert not queries, queries


def test_map_link_renders_without_redirect(db):
    client = runtime.app.test_client()
    response = client.get('/map', base_url='https://localhost')
    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert 'id="destinationInput"' in html
    assert 'vano-maps-banner.png' not in html
    assert 'vano-maps-banner-dark.png' not in html


def test_revoked_session_cannot_read_protected_account(db):
    client = runtime.app.test_client()
    signin(client, db)
    db.execute('UPDATE auth_sessions SET revoked_at=?', (runtime.utcnow_iso(),))
    db.commit()
    assert client.get('/api/saved-places', base_url='https://localhost').status_code == 401
