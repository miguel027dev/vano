"""API metering is fail-open and never stores request URLs or credentials."""
from unittest.mock import Mock
import pytest
from flask import Flask
from vano.infrastructure import api_metering


def test_external_http_success_records_only_safe_metadata(monkeypatch):
    app = Flask(__name__)
    captured = []
    monkeypatch.setattr(api_metering, "inject", lambda ns: ns.update({
        "record_activity": lambda *a, **kw: captured.append((a, kw))
    }))
    with app.test_request_context("/api/route?destination=private"):
        response = Mock(status_code=200)
        sender = Mock(return_value=response)
        result = api_metering.metered_request(
            "mapbox", "directions", sender,
            "https://example.test/route?access_token=secret",
        )
    assert result is response
    assert sender.call_count == 1
    assert len(captured) == 1
    args, kwargs = captured[0]
    assert args[0] == "upstream-api"
    assert args[1]["provider"] == "mapbox"
    assert args[1]["operation"] == "directions"
    assert "secret" not in str(args) + str(kwargs)
    assert kwargs["status_code"] == 200
    assert kwargs["duration_ms"] >= 0


def test_external_http_error_is_not_swallowed(monkeypatch):
    app = Flask(__name__)
    captured = []
    monkeypatch.setattr(api_metering, "inject", lambda ns: ns.update({
        "record_activity": lambda *a, **kw: captured.append((a, kw))
    }))
    with app.test_request_context("/api/geocode"):
        with pytest.raises(TimeoutError):
            api_metering.metered_request("viacep", "cep", lambda: (_ for _ in ()).throw(TimeoutError()))
    assert captured[0][1]["status_code"] == 599


def test_partner_requires_request_context(monkeypatch):
    events = []
    monkeypatch.setattr(api_metering, "inject", lambda ns: ns.update({
        "record_activity": lambda *a, **kw: events.append((a, kw))
    }))
    api_metering.record_api_sample("partner", "partner-1", "GET /v1/route", 200, 4)
    assert events == []
