"""MCP OAuth sign-in can be opened from the WebUI and completed by its callback."""

from __future__ import annotations

import io
import json
import time
from contextlib import nullcontext
from urllib.parse import urlparse

import pytest

from api import auth, mcp_oauth_bridge as bridge
from api import routes


class _FakeHandler:
    def __init__(self):
        self.status = None
        self.headers = {}
        self.wfile = io.BytesIO()

    def send_response(self, status):
        self.status = status

    def send_header(self, key, value):
        pass

    def end_headers(self):
        pass


class _Flow:
    def __init__(self, flow_id, server_name, profile, hermes_home, redirect_uri, reconnect_live):
        self.flow_id = flow_id
        self.server_name = server_name
        self.profile = profile
        self.hermes_home = hermes_home
        self.redirect_uri = redirect_uri
        self.reconnect_live = reconnect_live
        self.created_at = time.time()
        self.status = "starting"
        self.authorization_url = None
        self.error = None
        self.callback = None

    def snapshot(self):
        return {
            "flow_id": self.flow_id,
            "status": self.status,
            "authorization_url": self.authorization_url,
            "error": self.error,
        }

    def mark_error(self, error, cancelled=False):
        self.status = "error"
        self.error = error
        self.cancelled = cancelled

    def deliver_callback(self, *, code, state, error, iss=None):
        if self.callback is not None:
            raise ValueError("OAuth callback already received")
        if state != "good-state":
            raise ValueError("OAuth callback state mismatch")
        self.callback = {"code": code, "state": state, "error": error, "iss": iss}
        self.status = "approved" if not error else "error"


@pytest.fixture(autouse=True)
def _clear_flows():
    bridge._FLOWS.clear()
    yield
    bridge._FLOWS.clear()


def test_authorization_url_must_be_http():
    assert bridge.safe_authorization_url("https://idp.example/authorize?state=abc")
    assert bridge.safe_authorization_url("javascript:alert(1)") is None
    assert bridge.safe_authorization_url("https://user:secret@idp.example/authorize") is None


def test_callback_accepts_the_code_without_showing_it():
    flow = _Flow("a" * 20, "trendtrack", None, "/tmp/hermes", "http://127.0.0.1/cb", False)
    bridge._register_flow(flow)
    status, page = bridge.render_oauth_callback(
        flow.flow_id, code="super-secret-code", state="good-state", error=None, iss=None,
    )
    assert status == 200
    assert "super-secret-code" not in page
    assert "Authorization received" in page
    assert flow.callback["code"] == "super-secret-code"

    again, _page = bridge.render_oauth_callback(
        flow.flow_id, code="super-secret-code", state="good-state", error=None, iss=None,
    )
    assert again == 409


def test_callback_route_is_public_and_does_not_echo_the_code(monkeypatch):
    monkeypatch.setattr(auth, "is_auth_enabled", lambda: True)
    flow_id = "b" * 24
    assert auth._mcp_oauth_callback_is_public(f"/api/mcp/oauth/callback/{flow_id}") is True
    assert auth._mcp_oauth_callback_is_public("/api/mcp/oauth/flows/" + flow_id) is False
    handler = _FakeHandler()
    assert auth.check_auth(handler, urlparse(f"/api/mcp/oauth/callback/{flow_id}")) is True
    assert handler.status is None

    flow = _Flow(flow_id, "trendtrack", None, "/tmp/hermes", "http://127.0.0.1/cb", False)
    bridge._register_flow(flow)
    page_handler = _FakeHandler()
    handled = routes.handle_get(
        page_handler,
        urlparse(f"/api/mcp/oauth/callback/{flow_id}?code=hidden-code&state=good-state"),
    )
    assert handled is not False
    body = page_handler.wfile.getvalue().decode("utf-8")
    assert page_handler.status == 200
    assert "hidden-code" not in body


def test_turn_bridge_publishes_an_openable_link(monkeypatch):
    monkeypatch.setattr(bridge, "_import_dashboard_oauth", lambda: (_Flow, lambda _flow: nullcontext()))
    seen = []

    with bridge.turn_oauth_bridge("session-1", lambda event, data: seen.append((event, data))):
        flow = next(iter(bridge._FLOWS.values()))
        flow.authorization_url = "https://idp.example/authorize?state=good-state"
        flow.status = "authorization_required"
        deadline = time.time() + 2
        while time.time() < deadline and not seen:
            time.sleep(0.05)

    assert seen
    event, payload = seen[0]
    assert event == "mcp_auth"
    assert payload["authorization_url"] == "https://idp.example/authorize?state=good-state"
    assert payload["session_id"] == "session-1"


def test_saved_stdio_server_is_not_a_browser_login(monkeypatch):
    monkeypatch.setattr(bridge, "_saved_servers", lambda: {"local": {"command": "echo"}})
    with pytest.raises(bridge.McpOAuthBridgeError) as raised:
        bridge.start_saved_server_oauth("local")
    assert raised.value.status == 400


def test_server_summary_marks_header_auth_separately_from_oauth():
    header = routes._server_summary("keyed", {"url": "https://mcp.example/mcp", "headers": {"Authorization": "Bearer secret"}})
    oauth = routes._server_summary("trendtrack", {"url": "https://api.trendtrack.io/v1/mcp", "auth": "oauth"})
    assert header["auth"] == "header"
    assert "secret" not in json.dumps(header)
    assert oauth["auth"] == "oauth"


def test_ui_exposes_a_real_authentication_link():
    root = __import__("pathlib").Path(__file__).resolve().parents[1]
    html = (root / "static" / "index.html").read_text(encoding="utf-8")
    messages = (root / "static" / "messages.js").read_text(encoding="utf-8")
    panels = (root / "static" / "panels.js").read_text(encoding="utf-8")
    streaming = (root / "api" / "streaming.py").read_text(encoding="utf-8")
    assert 'id="mcpAuthLink"' in html
    assert 'target="_blank"' in html
    assert "Open authentication link" in html
    assert "showMcpAuthCard" in messages
    assert "addEventListener('mcp_auth'" in messages
    assert "authorizeMcpServer" in panels
    assert streaming.count("_run_conversation_with_mcp_auth(") >= 4
