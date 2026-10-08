from __future__ import annotations
import os
os.environ.setdefault('VANO_SKIP_DB_INIT','1')
os.environ.setdefault('VANO_DB_INIT_ONLY','1')
os.environ.setdefault('VANO_KEEPALIVE_ENABLED','0')
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import sqlite3
from unittest.mock import Mock
from urllib.parse import urlparse, parse_qs
from flask import Flask
from itsdangerous import URLSafeTimedSerializer
import pytest
from mobile_routes import register_mobile_routes, _b64url_sha256

@pytest.fixture
def mobile(monkeypatch):
    import app as production
    from vano.security import auth as security
    db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row
    db.executescript('''CREATE TABLE users(id INTEGER PRIMARY KEY,is_active INTEGER);
    INSERT INTO users VALUES(7,1);
    CREATE TABLE oauth_states(state TEXT PRIMARY KEY,redirect_uri TEXT,next_url TEXT,fingerprint TEXT,created_at TEXT,expires_at TEXT);''')
    monkeypatch.setattr(security,'get_db',lambda:db)
    app=Flask(__name__);app.secret_key='isolated-mobile-test-secret'
    app.add_url_rule('/login','login',lambda:'login')
    app.add_url_rule('/auth/google','google_login',lambda:'google')
    app.add_url_rule('/','index',lambda:'map')
    issue=Mock(return_value='synthetic.login.token')
    core=dict(google_ready=lambda:True,current_user=lambda:{'id':7,'is_active':1},onboarding_needed=lambda u:False,issue_persistent_login=issue,get_db=lambda:db,rate_limit=lambda *a,**k:True,REMEMBER_COOKIE_NAME='remember',REMEMBER_LOGIN_DAYS=30,persist_google_oauth_state=security.persist_google_oauth_state,consume_google_oauth_state=security.consume_google_oauth_state)
    register_mobile_routes(app,core)
    yield app,app.test_client(),issue,db
    db.close()


def make_code(app,client,state,verifier):
    ticket=URLSafeTimedSerializer(app.secret_key,salt='vano-mobile-start-v1').dumps({'state':state,'challenge':_b64url_sha256(verifier),'return_uri':'vano://auth/callback','nonce':'start-nonce'})
    response=client.get('/mobile/auth/google/finish',query_string={'ticket':ticket})
    assert response.status_code==302
    return parse_qs(urlparse(response.location).query)['code'][0]


def test_mobile_code_consumed_once(mobile):
    app,client,issue,db=mobile;state='s'*43;verifier='v'*43
    code=make_code(app,client,state,verifier)
    body={'code':code,'state':state,'verifier':verifier}
    response=client.post('/mobile/auth/exchange',json=body)
    assert response.status_code==200
    assert response.get_json()['remember_token']=='synthetic.login.token'
    replay=client.post('/mobile/auth/exchange',json=body)
    assert replay.status_code==400 and replay.get_json()['error']=='mobile_code_reused'
    issue.assert_called_once_with(7)


def test_bad_pkce_does_not_consume_mobile_code(mobile):
    app,client,issue,db=mobile;state='s'*43;verifier='v'*43
    code=make_code(app,client,state,verifier)
    assert client.post('/mobile/auth/exchange',json={'code':code,'state':state,'verifier':'x'*43}).status_code==400
    issue.assert_not_called()
    assert client.post('/mobile/auth/exchange',json={'code':code,'state':state,'verifier':verifier}).status_code==200
