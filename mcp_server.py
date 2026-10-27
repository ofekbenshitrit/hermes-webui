#!/usr/bin/env python3
"""
Hermes WebUI MCP Server — exposes project and session management
as MCP tools for any MCP-compatible agent.

Option A rewrite (2026-05-08): imports api.models and api.profiles
directly from the webui codebase, using canonical helpers for
locking, profile scoping, index consistency, and validation.

    pip install "mcp>=1.28,<2"   # one-time setup
    python3 mcp_server.py # start via stdio

MCP config for Hermes Agent (add to config.yaml):
    mcp_servers:
      hermes-webui:
        command: /path/to/venv/bin/python3
        args: [/path/to/hermes-webui/mcp_server.py]
        env:
          HERMES_WEBUI_PASSWORD: your_password

Profile override (optional):
        args: [/path/to/hermes-webui/mcp_server.py, --profile, myprofile]

AI-authoring disclosure: this file was rewritten by MILO (Hermes Agent)
under human direction, per maintainer guidelines for #1616.
"""

import argparse
import json
import os
import re
import sys
import time
import uuid
from pathlib import Path

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

# ── Ensure the repo root is on sys.path so api.* imports work ─────────────
_REPO_ROOT = Path(__file__).parent.resolve()
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

# ── CLI: optional --profile override ──────────────────────────────────────
_profile_arg: str | None = None
_parser = argparse.ArgumentParser(add_help=False)
_parser.add_argument("--profile", type=str, default=None)
_args, _unknown = _parser.parse_known_args()
_profile_arg = _args.profile

# ── Import webui canonical modules (after path setup) ─────────────────────
import api.config as _cfg
from api.config import (
    STATE_DIR, SESSION_DIR, SESSION_INDEX_FILE, PROJECTS_FILE, HOME,
)
from api.models import load_projects, save_projects
from api.profiles import get_active_profile_name, _is_root_profile, _profiles_match

# ── Apply --profile override before any module uses get_active_profile_name
if _profile_arg is not None:
    import api.profiles as _profiles
    _profiles._active_profile = _profile_arg

# ── API auth state ─────────────────────────────────────────────────────────
# Mirror the env-var contract used by api/config.py:32-33 so a non-default
# WebUI port/host (e.g. when 8787 is held by another service on the host)
# Just Works without configuration drift between the WebUI process and MCP.
WEBUI_HOST = os.environ.get("HERMES_WEBUI_HOST", "127.0.0.1")
WEBUI_PORT = os.environ.get("HERMES_WEBUI_PORT", "8787")
WEBUI_URL = f"http://{WEBUI_HOST}:{WEBUI_PORT}"
_auth_cookie: str | None = None
_auth_expires: float = 0  # unix timestamp after which we re-auth

server = Server("hermes-webui")


# ═══════════════════════════════════════════════════════════════════════════
#  Helpers — filesystem (project CRUD via canonical api.models)
# ═══════════════════════════════════════════════════════════════════════════

def _active_profile() -> str:
    """Shorthand for the current profile name (--profile or auto-detected)."""
    return get_active_profile_name() or 'default'


def _validate_color(color: str | None) -> str | None:
    """Return an error string if color is invalid, else None."""
    if color is not None and not re.match(r"^#[0-9a-fA-F]{3,8}$", color):
        return "Invalid color format (use #RGB, #RRGGBB, or #RRGGBBAA)"
    return None


def _load_index() -> list:
    """Read the session index. Falls back to empty list on failure."""
    if not SESSION_INDEX_FILE.exists():
        return []
    try:
        return json.loads(SESSION_INDEX_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _session_compact(row: dict) -> dict:
    """Lightweight compact representation of a session index entry."""
    return {
        "session_id": row.get("session_id"),
        "title": row.get("title"),
        "project_id": row.get("project_id"),
        "workspace": row.get("workspace"),
        "model": row.get("model"),
        "message_count": row.get("message_count", 0),
        "source_tag": row.get("source_tag"),
        "is_cli_session": row.get("is_cli_session", False),
        "profile": row.get("profile"),
    }


# ═══════════════════════════════════════════════════════════════════════════
#  Helpers — HTTP API (for mutations that need cache sync)
# ═══════════════════════════════════════════════════════════════════════════

def _api_password() -> str | None:
    """Return the plaintext webui password from HERMES_WEBUI_PASSWORD, or None.

    settings.json stores only the bcrypt hash, which the login endpoint cannot
    accept — it calls verify_password(plaintext) against the stored hash. So
    there's no usable fallback when the env var is unset; the MCP simply runs
    in unauthenticated mode and any auth-protected mutation will fail clearly
    with the server's 401 instead of silently sending an unusable hash.
    """
    pw = os.environ.get("HERMES_WEBUI_PASSWORD", "").strip()
    return pw or None


def _api_auth() -> str | None:
    """Authenticate and return cookie value, or None if auth disabled/fails."""
    global _auth_cookie, _auth_expires

    pw = _api_password()
    if not pw:
        return None  # auth not enabled — API calls will fail anyway

    # Reuse cookie if still valid (25 days — server issues 30-day cookies)
    if _auth_cookie and time.time() < _auth_expires:
        return _auth_cookie

    import urllib.request

    try:
        req = urllib.request.Request(
            f"{WEBUI_URL}/api/auth/login",
            data=json.dumps({"password": pw}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        resp = urllib.request.urlopen(req, timeout=5)
        cookie = resp.headers.get("Set-Cookie", "")
        if cookie:
            _auth_cookie = cookie.split(";")[0]  # "hermes_session=VALUE; ..."
            _auth_expires = time.time() + 25 * 86400  # 25 days
            return _auth_cookie
    except Exception:
        _auth_cookie = None
    return None


def _request_cookie_header() -> tuple[str | None, str | None]:
    """Return (Cookie header, error). Creative writes refuse a missing profile.

    The header carries the MCP process profile. With auth enabled the profile
    cookie is signed for the login session. A failure here must not fall through
    to an unsigned request, which would write the WebUI's default profile.
    """
    auth = _api_auth()
    profile = _active_profile()
    if not profile:
        return (auth, "profile unbound")
    try:
        from api.auth import is_auth_enabled
        if is_auth_enabled() and not auth:
            return (None, "profile unbound")
    except Exception as exc:
        return (None, f"profile unbound: {exc}")
    try:
        from api.helpers import get_profile_cookie_name
        cookie_name = get_profile_cookie_name()
        value = profile
        if auth:
            from api.auth import is_auth_enabled, sign_profile_cookie_value
            if is_auth_enabled():
                session_value = auth.split("=", 1)[1]
                value = sign_profile_cookie_value(profile, session_value)
        profile_cookie = f"{cookie_name}={value}"
    except Exception as exc:
        return (None, f"profile unbound: {exc}")
    if auth:
        return (f"{auth}; {profile_cookie}", None)
    return (profile_cookie, None)


def _api_post(endpoint: str, body: dict) -> dict:
    """POST to webui API with auth cookie. Returns parsed JSON response."""
    import urllib.request
    import urllib.error

    cookie, unbound = _request_cookie_header()
    if unbound and str(endpoint).startswith("/api/creative-studio/"):
        return {"error": unbound}
    headers = {"Content-Type": "application/json"}
    if cookie:
        headers["Cookie"] = cookie

    try:
        req = urllib.request.Request(
            f"{WEBUI_URL}{endpoint}",
            data=json.dumps(body).encode(),
            headers=headers,
            method="POST",
        )
        resp = urllib.request.urlopen(req, timeout=5)
        return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err_body = json.loads(e.read())
        return {"error": f"API {e.code}: {err_body.get('error', 'unknown')}"}
    except Exception as e:
        return {"error": f"API unreachable: {e}"}


# ═══════════════════════════════════════════════════════════════════════════
#  Tool handlers — read-only (filesystem, profile-aware)
# ═══════════════════════════════════════════════════════════════════════════

async def handle_list_projects(_arguments: dict) -> list[TextContent]:
    """List all projects with session counts, scoped to active profile."""
    projects = load_projects()
    active = _active_profile()
    index = _load_index()

    # Session counts per project (from index)
    counts: dict[str, int] = {}
    for s in index:
        pid = s.get("project_id")
        if pid:
            counts[pid] = counts.get(pid, 0) + 1

    result = []
    for p in projects:
        # Profile filter: legacy untagged rows are treated as 'default' by
        # _profiles_match, so non-root profiles correctly hide them.
        if not _profiles_match(p.get("profile"), active):
            continue
        entry = dict(p)
        entry["session_count"] = counts.get(p["project_id"], 0)
        result.append(entry)

    return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]


async def handle_list_sessions(arguments: dict) -> list[TextContent]:
    """List sessions, optionally filtered by project or unassigned status."""
    project_id = arguments.get("project_id")
    unassigned = arguments.get("unassigned", False)
    limit = max(1, min(500, arguments.get("limit", 50)))
    active = _active_profile()

    index = _load_index()
    sessions = [_session_compact(s) for s in index if s.get("session_id")]

    # Filter by profile: legacy untagged rows are treated as 'default' by
    # _profiles_match (canonical convention), so non-root profiles hide them.
    sessions = [s for s in sessions if _profiles_match(s.get("profile"), active)]

    if unassigned:
        sessions = [s for s in sessions if not s["project_id"]]
    elif project_id:
        sessions = [s for s in sessions if s["project_id"] == project_id]

    sessions = sessions[:limit]
    return [TextContent(type="text", text=json.dumps(sessions, ensure_ascii=False, indent=2))]


# ═══════════════════════════════════════════════════════════════════════════
#  Tool handlers — project CRUD (canonical helpers, profile-scoped)
# ═══════════════════════════════════════════════════════════════════════════

async def handle_create_project(arguments: dict) -> list[TextContent]:
    """Create a new project (profile-scoped, exact-match title collision)."""
    name = arguments.get("name", "").strip()[:128]
    if not name:
        return [TextContent(type="text", text=json.dumps(
            {"error": "name is required"}, ensure_ascii=False))]

    color = arguments.get("color")
    color_err = _validate_color(color)
    if color_err:
        return [TextContent(type="text", text=json.dumps(
            {"error": color_err}, ensure_ascii=False))]

    active = _active_profile()
    projects = load_projects()

    # Title collision: exact match (consistent with ensure_cron_project)
    if any(p.get("name") == name and _profiles_match(p.get("profile"), active)
           for p in projects):
        return [TextContent(type="text", text=json.dumps(
            {"error": f"Project '{name}' already exists"}, ensure_ascii=False))]

    proj = {
        "project_id": uuid.uuid4().hex[:12],
        "name": name,
        "color": color,
        "profile": active,
        "created_at": time.time(),
    }
    projects.append(proj)
    save_projects(projects)

    proj["session_count"] = 0
    return [TextContent(type="text", text=json.dumps(proj, ensure_ascii=False, indent=2))]


async def handle_rename_project(arguments: dict) -> list[TextContent]:
    """Rename a project and optionally change its color (profile-checked)."""
    project_id = arguments.get("project_id")
    name = arguments.get("name", "").strip()[:128]
    if not project_id or not name:
        return [TextContent(type="text", text=json.dumps(
            {"error": "project_id and name are required"}, ensure_ascii=False))]

    color = arguments.get("color")
    color_err = _validate_color(color)
    if color_err:
        return [TextContent(type="text", text=json.dumps(
            {"error": color_err}, ensure_ascii=False))]

    active = _active_profile()
    projects = load_projects()
    proj = next((p for p in projects if p["project_id"] == project_id), None)
    if not proj:
        return [TextContent(type="text", text=json.dumps(
            {"error": "Project not found"}, ensure_ascii=False))]

    # #1614: profile ownership check
    if not _profiles_match(proj.get("profile"), active):
        return [TextContent(type="text", text=json.dumps(
            {"error": "Project not found"}, ensure_ascii=False))]

    proj["name"] = name
    if color is not None:
        proj["color"] = color
    save_projects(projects)
    return [TextContent(type="text", text=json.dumps(proj, ensure_ascii=False, indent=2))]


async def handle_delete_project(arguments: dict) -> list[TextContent]:
    """Delete a project and unassign all its sessions (profile-checked)."""
    project_id = arguments.get("project_id")
    if not project_id:
        return [TextContent(type="text", text=json.dumps(
            {"error": "project_id is required"}, ensure_ascii=False))]

    active = _active_profile()
    projects = load_projects()
    proj = next((p for p in projects if p["project_id"] == project_id), None)
    if not proj:
        return [TextContent(type="text", text=json.dumps(
            {"error": "Project not found"}, ensure_ascii=False))]

    # #1614: profile ownership check
    if not _profiles_match(proj.get("profile"), active):
        return [TextContent(type="text", text=json.dumps(
            {"error": "Project not found"}, ensure_ascii=False))]

    projects = [p for p in projects if p["project_id"] != project_id]
    save_projects(projects)

    # Unassign sessions only when we can do it cache-safely via the HTTP API.
    # The previous filesystem fallback wrote session_data directly with
    # os.replace(), which bypassed _write_session_index() in api/models.py
    # and left _index.json holding the stale project_id — a running WebUI
    # would still group those sessions under the deleted project until a
    # subsequent re-compact. Even calling Session.save() in-process would
    # not help because the WebUI's SESSIONS dict cache (a separate process)
    # still has the old project_id and overwrites our update on its next
    # save. The HTTP API is the only cache-safe path; without auth we
    # refuse and surface the limitation so the operator can act.
    has_auth = bool(_api_password())
    if not has_auth:
        return [TextContent(type="text", text=json.dumps({
            "ok": True,
            "deleted": proj["name"],
            "unassigned_sessions": 0,
            "warning": "Set HERMES_WEBUI_PASSWORD to unassign sessions; "
                       "without auth the session index cannot be safely "
                       "updated and direct filesystem writes would cause "
                       "index drift in a running WebUI.",
        }, ensure_ascii=False))]

    unassigned = 0
    if SESSION_DIR.exists():
        for p in SESSION_DIR.glob("*.json"):
            if p.name.startswith("_"):
                continue
            try:
                session_data = json.loads(p.read_text(encoding="utf-8"))
                if session_data.get("project_id") == project_id:
                    sid = p.stem
                    result = _api_post("/api/session/move",
                                       {"session_id": sid, "project_id": None})
                    if "ok" in result or "session" in result:
                        unassigned += 1
            except Exception:
                pass

    return [TextContent(type="text", text=json.dumps({
        "ok": True,
        "deleted": proj["name"],
        "unassigned_sessions": unassigned,
    }, ensure_ascii=False))]


# ═══════════════════════════════════════════════════════════════════════════
#  Tool handlers — mutations (HTTP API with auth, cache-safe)
# ═══════════════════════════════════════════════════════════════════════════

async def handle_rename_session(arguments: dict) -> list[TextContent]:
    """Rename a session via the authenticated webui API (cache-safe)."""
    session_id = arguments.get("session_id")
    title = arguments.get("title", "").strip()[:80]
    if not session_id or not title:
        return [TextContent(type="text", text=json.dumps(
            {"error": "session_id and title are required"}, ensure_ascii=False))]

    result = _api_post("/api/session/rename",
                       {"session_id": session_id, "title": title})
    if "error" in result:
        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False))]

    session = result.get("session", {})
    return [TextContent(type="text", text=json.dumps({
        "ok": True,
        "session_id": session_id,
        "title": session.get("title", title),
        "method": "api",
    }, ensure_ascii=False, indent=2))]


async def handle_move_session(arguments: dict) -> list[TextContent]:
    """Assign a session to a project via the authenticated webui API (cache-safe)."""
    session_id = arguments.get("session_id")
    project_id = arguments.get("project_id")  # None/null = unassign
    if not session_id:
        return [TextContent(type="text", text=json.dumps(
            {"error": "session_id is required"}, ensure_ascii=False))]

    # If project_id is provided, verify it exists and is profile-accessible
    if project_id is not None:
        projects = load_projects()
        active = _active_profile()
        target = next((p for p in projects if p["project_id"] == project_id), None)
        if not target:
            return [TextContent(type="text", text=json.dumps(
                {"error": "Project not found"}, ensure_ascii=False))]
        # #1614: refuse moves into projects owned by another profile
        if not _profiles_match(target.get("profile"), active):
            return [TextContent(type="text", text=json.dumps(
                {"error": "Project not found"}, ensure_ascii=False))]

    result = _api_post("/api/session/move",
                       {"session_id": session_id, "project_id": project_id})
    if "error" in result:
        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False))]

    session = result.get("session", {})
    return [TextContent(type="text", text=json.dumps({
        "ok": True,
        "session_id": session_id,
        "project_id": project_id,
        "title": session.get("title"),
        "method": "api",
    }, ensure_ascii=False, indent=2))]


# ═══════════════════════════════════════════════════════════════════════════
#  MCP SDK version guard
# ═════════════════════════════════════════════════════════════════════════==
#
# mcp>=2.0.0 removed the Server.list_tools / Server.call_tool decorator API
# used by this server. Fail fast instead of producing secondary errors.

if not hasattr(Server, "list_tools"):  # pragma: no cover
    import sys
    print(
        "ERROR: mcp SDK incompatible. This server requires mcp>=1.28,<2 "
        "(the 1.x Python SDK with the decorator API). "
        "Run: pip install 'mcp>=1.28,<2'",
        file=sys.stderr,
    )
    sys.exit(1)

# ═══════════════════════════════════════════════════════════════════════════
#  MCP Server wiring
# ═══════════════════════════════════════════════════════════════════════════

_CREATIVE_CONTRACT = (
    " Read the project with get_creative_project before proposing or updating a value. "
    "Pass project_id. If the name matches more than one project, do not write; ask which id. "
    "Discussion and critique do not change the selected field. "
    "Only update_creative_field, accept_creative_proposal, or select via the user's explicit accept. "
    "Suggest at most three options. Clarify asks questions and does not rewrite. "
    "Critique notes gaps and unsupported claims and revises only when asked. "
    "Never invent proof, numbers, testimonials, features, outcomes, or usage conditions. "
    "Framework examples are copywriting examples, not evidence. "
    "After a write, the result includes project, field, and saved text. If a write fails, say so."
)


def _creative_text(payload: dict) -> list[TextContent]:
    return [TextContent(type="text", text=json.dumps(payload, ensure_ascii=False))]


def _creative_store_call(fn):
    from api.creative_studio import StudioError

    try:
        return fn()
    except StudioError as exc:
        return exc.payload


def _creative_write(endpoint: str, body: dict, fallback):
    remote = _api_post(endpoint, body)
    err = str(remote.get("error") or "")
    if (
        err.startswith("API unreachable")
        or err.startswith("API 404")
        or err.startswith("profile unbound")
    ):
        return _creative_store_call(fallback)
    return remote


async def handle_list_creative_projects(_arguments: dict) -> list[TextContent]:
    from api.creative_studio import list_projects

    return _creative_text(_creative_store_call(list_projects))


async def handle_get_creative_project(arguments: dict) -> list[TextContent]:
    from api.creative_studio import get_project

    return _creative_text(_creative_store_call(lambda: get_project(
        arguments.get("project_id") or None,
        name=arguments.get("name") or None,
        stage=arguments.get("stage") or None,
        field=arguments.get("field") or None,
        for_suggestion=bool(arguments.get("for_suggestion")),
    )))


async def handle_get_active_creative_project(_arguments: dict) -> list[TextContent]:
    from api.creative_studio import get_active_project_id, get_project

    def _read():
        project_id = get_active_project_id()
        if not project_id:
            return {"project_id": ""}
        return get_project(project_id)

    return _creative_text(_creative_store_call(_read))


async def handle_set_active_creative_project(arguments: dict) -> list[TextContent]:
    from api.creative_studio import set_active_project

    project_id = str(arguments.get("project_id") or "")
    payload = _creative_write(
        "/api/creative-studio/active",
        {"project_id": project_id},
        lambda: set_active_project(project_id),
    )
    return _creative_text(payload)


async def handle_create_creative_project(arguments: dict) -> list[TextContent]:
    from api.creative_studio import create_project

    name = arguments.get("name") or ""
    product = arguments.get("product") or ""
    product_source = arguments.get("product_source") or ""
    payload = _creative_write(
        "/api/creative-studio/projects",
        {"name": name, "product": product, "product_source": product_source},
        lambda: create_project(name, product, product_source),
    )
    return _creative_text(payload)


async def handle_update_creative_field(arguments: dict) -> list[TextContent]:
    from api.creative_studio import update_field

    project_id = str(arguments.get("project_id") or "")
    stage = str(arguments.get("stage") or "")
    field = str(arguments.get("field") or "")
    text = arguments.get("text") if arguments.get("text") is not None else ""
    body = {
        "stage": stage,
        "field": field,
        "text": text,
        "author": "user" if arguments.get("author") != "agent" else "agent",
    }
    if arguments.get("claim"):
        body["claim"] = arguments["claim"]
    if arguments.get("source_ref"):
        body["source_ref"] = arguments["source_ref"]
    payload = _creative_write(
        f"/api/creative-studio/projects/{project_id}/fields",
        body,
        lambda: update_field(project_id, stage, field, text, claim=body.get("claim"), source_ref=body.get("source_ref"), author=body["author"]),
    )
    return _creative_text(payload)


async def handle_save_creative_proposal(arguments: dict) -> list[TextContent]:
    from api.creative_studio import save_proposal

    project_id = str(arguments.get("project_id") or "")
    stage = str(arguments.get("stage") or "")
    field = str(arguments.get("field") or "")
    text = arguments.get("text") or ""
    body = {
        "stage": stage,
        "field": field,
        "text": text,
        "exploratory": bool(arguments.get("exploratory")),
        "missing": arguments.get("missing") or [],
        "discussion": arguments.get("discussion") or "",
    }
    payload = _creative_write(
        f"/api/creative-studio/projects/{project_id}/proposals",
        body,
        lambda: save_proposal(project_id, stage, field, text, exploratory=body["exploratory"], missing=body["missing"], discussion=body["discussion"]),
    )
    return _creative_text(payload)


async def handle_update_creative_proposal(arguments: dict) -> list[TextContent]:
    from api.creative_studio import update_proposal

    project_id = str(arguments.get("project_id") or "")
    proposal_id = str(arguments.get("proposal_id") or "")
    body = {}
    if arguments.get("status"):
        body["status"] = arguments["status"]
    if "revised_text" in arguments:
        body["revised_text"] = arguments.get("revised_text") or ""
    if "discussion" in arguments:
        body["discussion"] = arguments.get("discussion") or ""
    payload = _creative_write(
        f"/api/creative-studio/projects/{project_id}/proposals/{proposal_id}",
        body,
        lambda: update_proposal(
            project_id,
            proposal_id,
            status=body.get("status"),
            revised_text=body.get("revised_text") if "revised_text" in body else None,
            discussion=body.get("discussion") if "discussion" in body else None,
        ),
    )
    return _creative_text(payload)


async def handle_accept_creative_proposal(arguments: dict) -> list[TextContent]:
    from api.creative_studio import accept_proposal, edit_accept_proposal

    project_id = str(arguments.get("project_id") or "")
    proposal_id = str(arguments.get("proposal_id") or "")
    edited = arguments.get("text")
    action = "edit_accept" if edited is not None else "accept"
    body = {"action": action}
    if edited is not None:
        body["text"] = edited
    payload = _creative_write(
        f"/api/creative-studio/projects/{project_id}/proposals/{proposal_id}",
        body,
        lambda: edit_accept_proposal(project_id, proposal_id, edited) if edited is not None else accept_proposal(project_id, proposal_id),
    )
    return _creative_text(payload)


async def handle_dismiss_creative_proposal(arguments: dict) -> list[TextContent]:
    from api.creative_studio import dismiss_proposal

    project_id = str(arguments.get("project_id") or "")
    proposal_id = str(arguments.get("proposal_id") or "")
    payload = _creative_write(
        f"/api/creative-studio/projects/{project_id}/proposals/{proposal_id}",
        {"action": "dismiss"},
        lambda: dismiss_proposal(project_id, proposal_id),
    )
    return _creative_text(payload)


async def handle_save_creative_alternative(arguments: dict) -> list[TextContent]:
    from api.creative_studio import save_alternative, select_alternative

    project_id = str(arguments.get("project_id") or "")
    proposal_id = str(arguments.get("proposal_id") or "")
    select = bool(arguments.get("select"))
    action = "select" if select else "alternative"
    payload = _creative_write(
        f"/api/creative-studio/projects/{project_id}/proposals/{proposal_id}",
        {"action": action},
        lambda: select_alternative(project_id, proposal_id) if select else save_alternative(project_id, proposal_id),
    )
    return _creative_text(payload)


async def handle_record_creative_decision(arguments: dict) -> list[TextContent]:
    from api.creative_studio import record_decision

    project_id = str(arguments.get("project_id") or "")
    stage = str(arguments.get("stage") or "")
    field = str(arguments.get("field") or "")
    text = arguments.get("text") or ""
    payload = _creative_write(
        f"/api/creative-studio/projects/{project_id}/decision",
        {"stage": stage, "field": field, "text": text},
        lambda: record_decision(project_id, stage, field, text),
    )
    return _creative_text(payload)


async def handle_set_creative_stage_status(arguments: dict) -> list[TextContent]:
    from api.creative_studio import set_stage_status

    project_id = str(arguments.get("project_id") or "")
    stage = str(arguments.get("stage") or "")
    status = str(arguments.get("status") or "")
    reason = arguments.get("reason") or ""
    payload = _creative_write(
        f"/api/creative-studio/projects/{project_id}/stage",
        {"stage": stage, "status": status, "reason": reason},
        lambda: set_stage_status(project_id, stage, status, reason),
    )
    return _creative_text(payload)


async def handle_export_creative_project(arguments: dict) -> list[TextContent]:
    from api.creative_studio import export_markdown

    project_id = str(arguments.get("project_id") or "")
    include = arguments.get("include_alternatives")
    return _creative_text(_creative_store_call(lambda: export_markdown(
        project_id,
        include_alternatives=None if include is None else bool(include),
    )))


TOOLS = [
    Tool(
        name="list_projects",
        description="List all session projects with their IDs, names, colors, and session counts (scoped to active profile).",
        inputSchema={"type": "object", "properties": {}, "required": []},
    ),
    Tool(
        name="create_project",
        description="Create a new project for organizing sessions (profile-scoped).",
        inputSchema={
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Project name (max 128 chars)"},
                "color": {"type": "string", "description": "Optional hex color (#RGB, #RRGGBB, or #RRGGBBAA)"},
            },
            "required": ["name"],
        },
    ),
    Tool(
        name="rename_project",
        description="Rename a project and optionally change its color (profile-checked).",
        inputSchema={
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "12-char project ID"},
                "name": {"type": "string", "description": "New name (max 128 chars)"},
                "color": {"type": "string", "description": "Optional new hex color"},
            },
            "required": ["project_id", "name"],
        },
    ),
    Tool(
        name="delete_project",
        description="Delete a project and unassign all its sessions (profile-checked).",
        inputSchema={
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "12-char project ID to delete"},
            },
            "required": ["project_id"],
        },
    ),
    Tool(
        name="rename_session",
        description="Rename a session (updates sidebar via authenticated API, cache-safe).",
        inputSchema={
            "type": "object",
            "properties": {
                "session_id": {"type": "string", "description": "Session ID"},
                "title": {"type": "string", "description": "New title (max 80 chars)"},
            },
            "required": ["session_id", "title"],
        },
    ),
    Tool(
        name="move_session",
        description="Assign a session to a project. Pass project_id=null to unassign. Uses authenticated API for cache safety (profile-checked).",
        inputSchema={
            "type": "object",
            "properties": {
                "session_id": {"type": "string", "description": "Session ID"},
                "project_id": {"type": ["string", "null"], "description": "Project ID (or null to unassign)"},
            },
            "required": ["session_id", "project_id"],
        },
    ),
    Tool(
        name="list_sessions",
        description="List sessions, optionally filtered by project or unassigned status (profile-scoped).",
        inputSchema={
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "Filter sessions by project ID"},
                "unassigned": {"type": "boolean", "description": "Show only sessions with no project"},
                "limit": {"type": "integer", "description": "Max results (default: 50, max: 500)"},
            },
            "required": [],
        },
    ),
    Tool(
        name="list_creative_projects",
        description="List Creative Studio projects (name, product, progress). These are ad-creative projects, not session projects." + _CREATIVE_CONTRACT,
        inputSchema={"type": "object", "properties": {}, "required": []},
    ),
    Tool(
        name="get_creative_project",
        description="Read a Creative Studio project, stage, or field. Set for_suggestion=true with field to receive the brief, dependency context, and missing dependencies. Does not generate copy." + _CREATIVE_CONTRACT,
        inputSchema={
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "name": {"type": "string", "description": "Used only when project_id is omitted. Ambiguous names return candidates and do not guess."},
                "stage": {"type": "string"},
                "field": {"type": "string"},
                "for_suggestion": {"type": "boolean"},
            },
            "required": [],
        },
    ),
    Tool(
        name="get_active_creative_project",
        description="Return the Creative Studio project currently open in the WebUI, if one is set." + _CREATIVE_CONTRACT,
        inputSchema={"type": "object", "properties": {}, "required": []},
    ),
    Tool(
        name="set_active_creative_project",
        description="Set the shared active Creative Studio project so later chat turns can omit the name." + _CREATIVE_CONTRACT,
        inputSchema={
            "type": "object",
            "properties": {"project_id": {"type": "string"}},
            "required": ["project_id"],
        },
    ),
    Tool(
        name="create_creative_project",
        description="Create a Creative Studio project from a name and optional product/offer. Does not generate the rest of the brief." + _CREATIVE_CONTRACT,
        inputSchema={
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "product": {"type": "string"},
            },
            "required": ["name"],
        },
    ),
    Tool(
        name="update_creative_field",
        description="Write user-provided content onto a selected Creative Studio field. Use only when the user explicitly asks to change that field. Confirm project, field, and the saved value." + _CREATIVE_CONTRACT,
        inputSchema={
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "stage": {"type": "string"},
                "field": {"type": "string"},
                "text": {"type": "string"},
                "claim": {"type": "string", "description": "user_approved, needs_verification, or supported_by_source"},
                "source_ref": {"type": "string"},
                "author": {"type": "string", "description": "user or agent. User-authored edits use user."},
            },
            "required": ["project_id", "stage", "field", "text"],
        },
    ),
    Tool(
        name="save_creative_proposal",
        description="Save an agent suggestion as a pending proposal. Does not change the selected field value. At most three pending proposals per field." + _CREATIVE_CONTRACT,
        inputSchema={
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "stage": {"type": "string"},
                "field": {"type": "string"},
                "text": {"type": "string"},
                "exploratory": {"type": "boolean"},
                "missing": {"type": "array", "items": {"type": "string"}},
                "discussion": {"type": "string"},
            },
            "required": ["project_id", "stage", "field", "text"],
        },
    ),
    Tool(
        name="update_creative_proposal",
        description="Update a proposal's discussion or revised wording and optionally set status to proposed or in_discussion. Does not change the selected field." + _CREATIVE_CONTRACT,
        inputSchema={
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "proposal_id": {"type": "string"},
                "status": {"type": "string"},
                "revised_text": {"type": "string"},
                "discussion": {"type": "string"},
            },
            "required": ["project_id", "proposal_id"],
        },
    ),
    Tool(
        name="accept_creative_proposal",
        description="Accept a proposal into the selected field. Pass text to edit-and-accept. This is the explicit adopt action." + _CREATIVE_CONTRACT,
        inputSchema={
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "proposal_id": {"type": "string"},
                "text": {"type": "string", "description": "When present, the field stores this edited wording."},
            },
            "required": ["project_id", "proposal_id"],
        },
    ),
    Tool(
        name="dismiss_creative_proposal",
        description="Dismiss a proposal. Leaves the selected field unchanged." + _CREATIVE_CONTRACT,
        inputSchema={
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "proposal_id": {"type": "string"},
            },
            "required": ["project_id", "proposal_id"],
        },
    ),
    Tool(
        name="save_creative_alternative",
        description="Keep a proposal as a saved alternative without changing the selected field. Pass select=true only when the user asks to make that alternative the current answer." + _CREATIVE_CONTRACT,
        inputSchema={
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "proposal_id": {"type": "string"},
                "select": {"type": "boolean"},
            },
            "required": ["project_id", "proposal_id"],
        },
    ),
    Tool(
        name="record_creative_decision",
        description="Store a discussion outcome or decision note. Does not change the selected field." + _CREATIVE_CONTRACT,
        inputSchema={
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "stage": {"type": "string"},
                "field": {"type": "string"},
                "text": {"type": "string"},
            },
            "required": ["project_id", "stage", "text"],
        },
    ),
    Tool(
        name="set_creative_stage_status",
        description="Set a stage to not_started, draft, approved, review_recommended, or not_applicable. not_applicable requires reason." + _CREATIVE_CONTRACT,
        inputSchema={
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "stage": {"type": "string"},
                "status": {"type": "string"},
                "reason": {"type": "string"},
            },
            "required": ["project_id", "stage", "status"],
        },
    ),
    Tool(
        name="export_creative_project",
        description="Export the selected Creative Studio answers as Markdown, including claim labels. Alternatives are included only when include_alternatives is true. Does not write a finished ad script." + _CREATIVE_CONTRACT,
        inputSchema={
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "include_alternatives": {"type": "boolean"},
            },
            "required": ["project_id"],
        },
    ),
]

HANDLERS = {
    "list_projects": handle_list_projects,
    "create_project": handle_create_project,
    "rename_project": handle_rename_project,
    "delete_project": handle_delete_project,
    "rename_session": handle_rename_session,
    "move_session": handle_move_session,
    "list_sessions": handle_list_sessions,
    "list_creative_projects": handle_list_creative_projects,
    "get_creative_project": handle_get_creative_project,
    "get_active_creative_project": handle_get_active_creative_project,
    "set_active_creative_project": handle_set_active_creative_project,
    "create_creative_project": handle_create_creative_project,
    "update_creative_field": handle_update_creative_field,
    "save_creative_proposal": handle_save_creative_proposal,
    "update_creative_proposal": handle_update_creative_proposal,
    "accept_creative_proposal": handle_accept_creative_proposal,
    "dismiss_creative_proposal": handle_dismiss_creative_proposal,
    "save_creative_alternative": handle_save_creative_alternative,
    "record_creative_decision": handle_record_creative_decision,
    "set_creative_stage_status": handle_set_creative_stage_status,
    "export_creative_project": handle_export_creative_project,
}


@server.list_tools()
async def list_tools() -> list[Tool]:
    return TOOLS


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    handler = HANDLERS.get(name)
    if not handler:
        return [TextContent(type="text", text=json.dumps(
            {"error": f"Unknown tool: {name}"}, ensure_ascii=False))]
    return await handler(arguments)


async def main():
    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
