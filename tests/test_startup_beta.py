"""Beta intake privacy, real persistence and malformed-request regressions."""
import importlib
import os
import re
import sqlite3
from pathlib import Path

import pytest

os.environ.update(VANO_SKIP_DB_INIT='1', VANO_DB_INIT_ONLY='1', VANO_KEEPALIVE_ENABLED='0')
import app as runtime
public = importlib.import_module('vano.routes.public')

class FeedbackDB:
    def __init__(self):
        self.connection = sqlite3.connect(':memory:')
        self.connection.row_factory = sqlite3.Row
        ddl = re.search(r'CREATE TABLE IF NOT EXISTS beta_feedback \(.*?\);',
            (Path(__file__).parents[1]/'vano/infrastructure/database.py').read_text(), re.S)[0]
        self.connection.executescript(ddl.replace('SERIAL PRIMARY KEY', 'INTEGER PRIMARY KEY AUTOINCREMENT'))
    def execute(self, *args): return self.connection.execute(*args)
    def commit(self): self.connection.commit()
    def rollback(self): self.connection.rollback()

@pytest.fixture
def intake(monkeypatch):
    db = FeedbackDB()
    monkeypatch.setattr(public, 'get_db', lambda: db)
    monkeypatch.setattr(public, 'rate_limit', lambda *a, **kw: True)
    client = runtime.app.test_client()
    assert client.get('/testar', base_url='https://localhost').status_code == 200
    with client.session_transaction() as session:
        data = {'csrf_token': session['csrf_token'], 'submission_id': session['beta_submission_id'],
                'category': 'bug', 'message': 'O teclado cobre o botão após pesquisar um destino.',
                'email': 'qa@example.invalid', 'device': 'QA Android', 'version': '2.6.1'}
    yield client, db, data
    db.connection.close()

def post(client, data):
    return client.post('/testar', data=data, base_url='https://localhost')

def test_beta_persists_only_once_and_keeps_contact_private(intake):
    client, db, data = intake
    response = post(client, data)
    assert response.status_code == 302
    row = db.execute('SELECT * FROM beta_feedback').fetchone()
    assert row['message'] == data['message'] and row['email'] == data['email']
    assert row['status'] == 'pending'
    assert 'no-store' in response.headers['Cache-Control']
    assert post(client, data).status_code == 302
    assert db.execute('SELECT COUNT(*) FROM beta_feedback').fetchone()[0] == 1
    page = client.get('/testar', base_url='https://localhost').get_data(as_text=True)
    assert data['message'] not in page and data['email'] not in page

@pytest.mark.parametrize('change', [{'message': 'short'}, {'message': 'x'*2001}, {'category': 'bad'},
                                    {'email': 'bad'}, {'device': 'x'*121}, {'version': 'x'*41},
                                    {'submission_id': 'ç'*43}])
def test_invalid_feedback_never_persists(intake, change):
    client, db, data = intake
    response = post(client, {**data, **change})
    assert response.status_code == 302
    assert db.execute('SELECT COUNT(*) FROM beta_feedback').fetchone()[0] == 0

@pytest.mark.parametrize('token', ['', 'wrong', 'ç malformed'])
def test_csrf_rejection_is_not_server_error(intake, token):
    client, db, data = intake
    assert post(client, {**data, 'csrf_token': token}).status_code == 400
    assert db.execute('SELECT COUNT(*) FROM beta_feedback').fetchone()[0] == 0

def test_rate_limit_prevents_write(intake, monkeypatch):
    client, db, data = intake
    monkeypatch.setattr(public, 'rate_limit', lambda *a, **kw: False)
    response = post(client, data)
    assert response.status_code == 429 and response.headers['Retry-After'] == '60'
    assert db.execute('SELECT COUNT(*) FROM beta_feedback').fetchone()[0] == 0

def test_failed_connection_keeps_form_retryable(intake, monkeypatch):
    client, db, data = intake
    def fail(): raise RuntimeError('SENSITIVE_CONNECTION_DETAILS')
    monkeypatch.setattr(public, 'get_db', fail)
    response = post(client, data)
    assert response.status_code == 302
    assert 'SENSITIVE_CONNECTION_DETAILS' not in response.get_data(as_text=True)
    with client.session_transaction() as session:
        assert session['beta_submission_id'] == data['submission_id']
    monkeypatch.setattr(public, 'get_db', lambda: db)
    assert post(client, data).status_code == 302
    assert db.execute('SELECT COUNT(*) FROM beta_feedback').fetchone()[0] == 1

def test_public_metadata_and_private_admin_boundary():
    client = runtime.app.test_client()
    for path in ['/testar','/contato','/imprensa','/sobre']:
        response = client.get(path, base_url='https://localhost')
        html = response.get_data(as_text=True)
        assert response.status_code == 200
        assert f'<link rel="canonical" href="https://localhost{path}"' in html
        assert 'index,follow' in html and '/static/vano.css' not in html
        assert 'og:image' in html
    for path in ['/admin/beta','/admin/beta/1']:
        response = client.get(path, base_url='https://localhost') if path.endswith('beta') else client.post(path, base_url='https://localhost')
        assert response.status_code in (302,401,403)
        assert 'no-store' in response.headers['Cache-Control']

def test_feedback_text_is_escaped_for_admin():
    with runtime.app.test_request_context('/admin/beta', base_url='https://localhost'):
        html = runtime.render_template('admin_beta.html',rows=[{'id':1,'category':'bug','created_at':'2026-10-10T00:00',
          'message':'<script>alert(1)</script>','device':'','app_version':'','email':'','status':'pending','resolution':'<svg onload=alert(1)>'}],
          status_labels=public.BETA_FEEDBACK_STATUSES,
          status_totals=dict.fromkeys(public.BETA_FEEDBACK_STATUSES, 0))
    assert '<script>alert(1)</script>' not in html
    assert '&lt;script&gt;alert(1)&lt;/script&gt;' in html


def test_beta_entry_aliases_point_to_the_single_protected_form():
    client = runtime.app.test_client()
    beta = client.get('/beta', base_url='https://localhost')
    feedback = client.get('/feedback', base_url='https://localhost')
    assert beta.status_code == 302 and beta.location.endswith('/testar')
    assert feedback.status_code == 302 and feedback.location.endswith('/testar#feedback')
    assert client.get('/testar', base_url='https://localhost').status_code == 200


def test_admin_beta_dashboard_counts_only_real_feedback(intake):
    client, db, data = intake
    assert post(client, data).status_code == 302
    db.execute("INSERT INTO beta_feedback(submission_id,category,message,email,device,app_version,status,resolution,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
               ('another-id', 'bug', 'GPS salta ao iniciar uma rota.', '', '', '', 'ready_for_retest',
                'Corrigido na versão QA; aguarda validação em aparelho.', runtime.utcnow_iso(), runtime.utcnow_iso()))
    db.commit()
    with runtime.app.test_request_context('/admin/beta', base_url='https://localhost'):
        html = public.admin_beta_feedback.__wrapped__()
    assert 'Progresso dos feedbacks' in html
    assert 'Pronto para reteste' in html
    assert 'Contagens calculadas dos relatos recebidos' in html
    assert html.count('class="page-title">1</p>') == 2


def test_admin_beta_retest_status_persists_without_marking_resolved(intake, monkeypatch):
    client, db, data = intake
    post(client, data)
    public_db = lambda: db
    monkeypatch.setattr(public, 'get_db', public_db)
    monkeypatch.setattr(public, 'validate_csrf', lambda: True)
    monkeypatch.setattr(public, 'rate_limit', lambda *args, **kwargs: True)
    monkeypatch.setattr(public, 'audit', lambda *args, **kwargs: None)
    with runtime.app.test_request_context('/admin/beta/1', method='POST',
            data={'status': 'ready_for_retest', 'resolution': 'Ajuste aplicado em RC-1, aguardando reteste.'},
            base_url='https://localhost'):
        response = public.admin_beta_update.__wrapped__(1)
    row = db.execute('SELECT status,resolution FROM beta_feedback WHERE id=1').fetchone()
    assert response.status_code == 302
    assert row['status'] == 'ready_for_retest'
    assert 'aguardando reteste' in row['resolution']
