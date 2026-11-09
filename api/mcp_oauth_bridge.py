"""Browser handoff for MCP OAuth.

Hermes Agent refuses to start a browser login when the process is not a
terminal. A chat turn and the MCP panel both register a dashboard OAuth flow
whose redirect lands back on this WebUI. The page shows the authorization URL
as a link the user opens; the provider's redirect completes the flow.
"""

from __future__ import annotations

import copy
import logging
import os
import secrets
import threading
import time
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Callable, Iterator
from urllib.parse import urlsplit

logger = logging.getLogger(__name__)

_REQUEST_PUBLIC_BASE: ContextVar[str] = ContextVar("webui_mcp_oauth_public_base", default="")
_LOCK = threading.Lock()
_FLOWS: dict[str, object] = {}
_FLOW_TTL_SECONDS = 15 * 60
_MAX_LIVE_FLOWS = 8
_FLOW_ID_RE_TEXT = r"[A-Za-z0-9_-]{16,128}"
_CALLBACK_PREFIX = "/api/mcp/oauth/callback/"
_TURN_SERVER_NAME = "webui"
_QUERY_VALUE_LIMIT = 2048

Emit = Callable[[str, dict], None]


class McpOAuthBridgeError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def push_request_public_base(handler):
    """Remember the browser origin for worker threads started by this request."""
    return _REQUEST_PUBLIC_BASE.set(origin_from_handler(handler))


def pop_request_public_base(token) -> None:
    _REQUEST_PUBLIC_BASE.reset(token)


def origin_from_handler(handler) -> str:
    try:
        from api.passkeys import rp_context

        _host, origin = rp_context(handler)
    except Exception:
        return ""
    return _normalize_origin(origin)


def resolve_public_base() -> str:
    current = _normalize_origin(_REQUEST_PUBLIC_BASE.get())
    if current:
        return current
    configured = _normalize_origin(os.environ.get("HERMES_WEBUI_PUBLIC_URL", ""))
    if configured:
        return configured
    port = str(os.environ.get("HERMES_WEBUI_PORT", "8787") or "8787").strip()
    if not port.isdigit():
        port = "8787"
    return f"http://127.0.0.1:{port}"


def safe_authorization_url(value) -> str | None:
    """Return an http(s) authorization URL, or None when it is not safe to open."""
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text or len(text) > 4096:
        return None
    parts = urlsplit(text)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        return None
    if parts.username or parts.password:
        return None
    return text


def callback_path_is_public(path: str) -> bool:
    flow_id = str(path or "")[len(_CALLBACK_PREFIX):] if str(path or "").startswith(_CALLBACK_PREFIX) else ""
    return bool(flow_id) and _valid_flow_id(flow_id) and "/" not in flow_id


def turn_oauth_bridge(session_id: str, emit: Emit):
    """Install a dashboard OAuth flow around one agent turn.

    The flow is a no-op when this Hermes Agent build has no dashboard OAuth
    bridge, or when too many sign-ins are already open. The chat itself still
    runs.
    """
    started = None
    try:
        started = _start_turn_flow(str(session_id or ""), emit)
    except Exception:
        logger.debug("MCP OAuth bridge was not installed for this turn", exc_info=True)
        started = None
    if started is None:
        return _nullcontext()
    flow, dashboard_cm, stop, thread = started
    return _bridge_context(flow, dashboard_cm, stop, thread, emit, str(session_id or ""))


def start_saved_server_oauth(name: str) -> dict:
    """Start sign-in for one saved HTTP MCP server and return its authorization URL."""
    server_name = str(name or "").strip()
    if not server_name or "/" in server_name or "\\" in server_name:
        raise McpOAuthBridgeError("Server name is required", 400)
    servers = _saved_servers()
    cfg = servers.get(server_name)
    if not isinstance(cfg, dict):
        raise McpOAuthBridgeError(f"MCP server '{server_name}' not found", 404)
    if not str(cfg.get("url") or "").strip():
        raise McpOAuthBridgeError("stdio servers authenticate with environment keys, not a browser", 400)
    headers = cfg.get("headers") if isinstance(cfg.get("headers"), dict) else {}
    auth_mode = str(cfg.get("auth") or "").strip().lower()
    if auth_mode == "header" or any(str(key).lower() == "authorization" for key in headers):
        raise McpOAuthBridgeError("This server uses a header credential, not browser sign-in", 400)

    DashboardOAuthFlow, _dashboard = _import_dashboard_oauth()
    flow = _new_flow(DashboardOAuthFlow, server_name)
    saved = copy.deepcopy(cfg)
    saved["auth"] = "oauth"
    _register_flow(flow)
    try:
        _spawn_saved_server_worker(flow, saved)
        return _wait_for_start(flow, timeout=30.0)
    except Exception:
        _discard_flow(flow)
        raise


def oauth_flow_status(flow_id: str) -> dict:
    flow = _lookup_flow(flow_id)
    if flow is None:
        raise McpOAuthBridgeError("OAuth flow not found or expired", 404)
    return _public_snapshot(flow)


def render_oauth_callback(flow_id: str, *, code, state, error, iss) -> tuple[int, str]:
    """Hand the provider redirect to the waiting flow. The page never echoes the code."""
    if not _valid_flow_id(flow_id):
        return 404, _page("Sign-in expired", "Return to Hermes and start the connection again.")
    flow = _lookup_flow(flow_id)
    if flow is None:
        return 404, _page("Sign-in expired", "Return to Hermes and start the connection again.")
    try:
        flow.deliver_callback(
            code=_bounded_query(code),
            state=_bounded_query(state),
            error=_bounded_query(error),
            iss=_bounded_query(iss),
        )
    except ValueError as exc:
        text = str(exc).lower()
        if "already" in text:
            return 409, _page("Sign-in already finished", "Return to Hermes. If the connection is still waiting, start it again.")
        return 400, _page("Sign-in was rejected", "Return to Hermes and start the connection again.")
    if _bounded_query(error):
        return 400, _page("Authorization was declined", "Return to Hermes for the details.")
    return 200, _page("Authorization received", "You can close this tab and return to Hermes.")


def _nullcontext():
    @contextmanager
    def _empty() -> Iterator[None]:
        yield None
    return _empty()


@contextmanager
def _bridge_context(flow, dashboard_cm, stop, thread, emit, session_id) -> Iterator[None]:
    try:
        with dashboard_cm:
            yield
    finally:
        stop.set()
        thread.join(timeout=1.0)
        _finish_turn_flow(flow, emit, session_id)


def _start_turn_flow(session_id: str, emit: Emit):
    DashboardOAuthFlow, dashboard_oauth_flow = _import_dashboard_oauth()
    flow = _new_flow(DashboardOAuthFlow, _TURN_SERVER_NAME)
    _register_flow(flow)
    stop = threading.Event()
    thread = threading.Thread(
        target=_watch_flow,
        args=(flow, emit, session_id, stop),
        daemon=True,
        name=f"mcp-oauth-watch-{flow.flow_id[:8]}",
    )
    thread.start()
    return flow, dashboard_oauth_flow(flow), stop, thread


def _watch_flow(flow, emit: Emit, session_id: str, stop: threading.Event) -> None:
    seen = None
    while not stop.is_set():
        try:
            snap = flow.snapshot()
        except Exception:
            return
        url = safe_authorization_url(snap.get("authorization_url"))
        status = str(snap.get("status") or "")
        if url and url != seen and status == "authorization_required":
            seen = url
            _emit_auth(emit, session_id, flow, status="authorization_required", authorization_url=url)
        elif seen and status in {"approved", "error"}:
            _emit_auth(
                emit, session_id, flow, status=status,
                authorization_url=url, error=_public_error(snap.get("error")),
            )
            return
        stop.wait(0.25)


def _finish_turn_flow(flow, emit: Emit, session_id: str) -> None:
    try:
        snap = flow.snapshot()
    except Exception:
        _discard_flow(flow)
        return
    status = str(snap.get("status") or "")
    logger.debug("MCP OAuth turn flow finished for %s status=%s", session_id, status)
    if status == "starting":
        try:
            flow.mark_error("unused")
        except Exception:
            pass
        _discard_flow(flow)
        return
    # A published link can still be completed after the model returns, when the
    # MCP login is waiting on the callback. Leave that flow registered.


def _emit_auth(emit: Emit, session_id: str, flow, **fields) -> None:
    payload = {
        "session_id": session_id,
        "flow_id": getattr(flow, "flow_id", ""),
        "server_name": "" if getattr(flow, "server_name", "") == _TURN_SERVER_NAME else getattr(flow, "server_name", ""),
    }
    payload.update(fields)
    try:
        emit("mcp_auth", payload)
    except Exception:
        logger.debug("Failed to publish MCP sign-in event", exc_info=True)


def _spawn_saved_server_worker(flow, cfg: dict) -> None:
    from hermes_cli.web_server_mcp import _run_dashboard_mcp_oauth

    threading.Thread(
        target=_run_dashboard_mcp_oauth,
        args=(flow, cfg),
        daemon=True,
        name=f"mcp-oauth-{getattr(flow, 'server_name', 'server')}",
    ).start()


def _wait_for_start(flow, timeout: float) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        snap = flow.snapshot()
        status = str(snap.get("status") or "")
        url = safe_authorization_url(snap.get("authorization_url"))
        if url or status in {"approved", "error"}:
            if status == "error":
                _discard_flow(flow)
                raise McpOAuthBridgeError(_public_error(snap.get("error")) or "Sign-in failed before a link was ready", 400)
            return _public_snapshot(flow)
        time.sleep(0.05)
    try:
        flow.mark_error("Timed out waiting for the authorization link")
    except Exception:
        pass
    _discard_flow(flow)
    raise McpOAuthBridgeError("Timed out waiting for the authorization link", 504)


def _new_flow(flow_cls, server_name: str):
    flow_id = secrets.token_urlsafe(24)
    return flow_cls(
        flow_id=flow_id,
        server_name=server_name,
        profile=None,
        hermes_home=_hermes_home(),
        redirect_uri=f"{resolve_public_base()}{_CALLBACK_PREFIX}{flow_id}",
        reconnect_live=server_name != _TURN_SERVER_NAME,
    )


def _register_flow(flow) -> None:
    _gc_flows()
    with _LOCK:
        live = [item for item in _FLOWS.values() if not _flow_done(item)]
        if len(live) >= _MAX_LIVE_FLOWS:
            raise McpOAuthBridgeError("Too many MCP sign-ins are already in progress", 429)
        same = [
            item for item in live
            if getattr(item, "server_name", "") == getattr(flow, "server_name", "")
            and getattr(flow, "server_name", "") != _TURN_SERVER_NAME
        ]
        if same:
            raise McpOAuthBridgeError(
                f"Sign-in for '{flow.server_name}' is already in progress", 409,
            )
        _FLOWS[flow.flow_id] = flow


def _discard_flow(flow) -> None:
    with _LOCK:
        current = _FLOWS.get(getattr(flow, "flow_id", ""))
        if current is flow:
            _FLOWS.pop(flow.flow_id, None)


def _lookup_flow(flow_id: str):
    if not _valid_flow_id(flow_id):
        return None
    _gc_flows()
    with _LOCK:
        return _FLOWS.get(flow_id)


def _gc_flows() -> None:
    cutoff = time.time() - _FLOW_TTL_SECONDS
    with _LOCK:
        stale = [
            flow_id for flow_id, flow in _FLOWS.items()
            if float(getattr(flow, "created_at", 0) or 0) < cutoff
        ]
        for flow_id in stale:
            _FLOWS.pop(flow_id, None)


def _flow_done(flow) -> bool:
    try:
        status = str(flow.snapshot().get("status") or "")
    except Exception:
        return True
    if status in {"approved", "error"}:
        return True
    done = getattr(flow, "worker_done", None)
    return bool(done) if isinstance(done, bool) else False


def _public_snapshot(flow) -> dict:
    snap = flow.snapshot()
    status = str(snap.get("status") or "")
    url = safe_authorization_url(snap.get("authorization_url")) if status == "authorization_required" else None
    server_name = getattr(flow, "server_name", "") or snap.get("server_name") or ""
    if server_name == _TURN_SERVER_NAME:
        server_name = ""
    return {
        "ok": status != "error",
        "flow_id": getattr(flow, "flow_id", "") or snap.get("flow_id") or "",
        "server_name": server_name,
        "status": status,
        "authorization_url": url,
        "error": _public_error(snap.get("error")) if status == "error" else "",
    }


def _public_error(value) -> str:
    text = str(value or "").strip()
    if not text or text == "unused":
        return ""
    try:
        from api.helpers import _redact_text

        text = _redact_text(text)
    except Exception:
        pass
    text = text.replace("\n", " ").strip()
    if len(text) > 300:
        text = text[:299].rstrip() + "…"
    return text


def _saved_servers() -> dict:
    from api.config import get_config_for_profile_home
    from api.profiles import get_active_hermes_home

    cfg = get_config_for_profile_home(get_active_hermes_home())
    servers = cfg.get("mcp_servers") if isinstance(cfg, dict) else None
    return servers if isinstance(servers, dict) else {}


def _hermes_home() -> str:
    try:
        from api.profiles import get_active_hermes_home

        return str(get_active_hermes_home())
    except Exception:
        return ""


def _import_dashboard_oauth():
    from tools.mcp_dashboard_oauth import DashboardOAuthFlow, dashboard_oauth_flow

    return DashboardOAuthFlow, dashboard_oauth_flow


def _valid_flow_id(flow_id: str) -> bool:
    import re

    return bool(re.fullmatch(_FLOW_ID_RE_TEXT, str(flow_id or "")))


def _bounded_query(value) -> str | None:
    if value is None:
        return None
    text = str(value)
    if len(text) > _QUERY_VALUE_LIMIT:
        return None
    return text


def _normalize_origin(value) -> str:
    text = str(value or "").strip().rstrip("/")
    if not text:
        return ""
    parts = urlsplit(text)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        return ""
    if parts.username or parts.password or parts.query or parts.fragment or parts.path not in {"", "/"}:
        return ""
    return text


def _page(title: str, message: str) -> str:
    from html import escape

    return (
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\">"
        f"<title>{escape(title)}</title></head>"
        "<body style=\"font-family:sans-serif;padding:2rem;line-height:1.45\">"
        f"<h1>{escape(title)}</h1><p>{escape(message)}</p></body></html>"
    )
