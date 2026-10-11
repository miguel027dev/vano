from types import SimpleNamespace
from unittest.mock import MagicMock
import time

import db_backend as backend


def pool_fixture(monkeypatch):
    conn=MagicMock()
    conn.closed=False
    pool=MagicMock()
    pool.getconn.return_value=conn
    monkeypatch.setattr(backend,'_get_pool',lambda:pool)
    monkeypatch.setattr(backend,'_POOL_LAST_RETURNED',{})
    return conn,pool


def test_new_and_recent_connections_do_not_add_probe_round_trips(monkeypatch):
    conn,pool=pool_fixture(monkeypatch)
    database=backend.connect_db()
    assert database._connection is conn
    conn.cursor.assert_not_called()
    database.close()
    assert id(conn) in backend._POOL_LAST_RETURNED
    database=backend.connect_db()
    conn.cursor.assert_not_called()
    database.close()
    assert pool.putconn.call_count==2


def test_idle_connection_is_checked_before_reuse(monkeypatch):
    conn,pool=pool_fixture(monkeypatch)
    backend._POOL_LAST_RETURNED[id(conn)]=time.monotonic()-120
    database=backend.connect_db()
    conn.cursor.return_value.__enter__.return_value.execute.assert_called_once_with('SELECT 1')
    conn.rollback.assert_called_once()
    database.close()


def test_dropped_idle_connection_is_replaced_without_replaying_queries(monkeypatch):
    conn,pool=pool_fixture(monkeypatch)
    replacement=MagicMock(closed=False)
    pool.getconn.side_effect=[conn,replacement]
    backend._POOL_LAST_RETURNED[id(conn)]=time.monotonic()-120
    conn.cursor.return_value.__enter__.return_value.execute.side_effect=backend.psycopg2.OperationalError('synthetic disconnect')
    database=backend.connect_db()
    assert database._connection is replacement
    pool.putconn.assert_called_once_with(conn,close=True)
    replacement.cursor.assert_not_called()


def test_other_probe_errors_release_connection_and_propagate(monkeypatch):
    conn,pool=pool_fixture(monkeypatch)
    backend._POOL_LAST_RETURNED[id(conn)]=time.monotonic()-120
    conn.cursor.return_value.__enter__.return_value.execute.side_effect=RuntimeError('synthetic error')
    import pytest
    with pytest.raises(RuntimeError):backend.connect_db()
    pool.putconn.assert_called_once_with(conn,close=True)
