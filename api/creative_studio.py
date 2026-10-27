"""Creative Studio project store.

Profile-scoped JSON documents under HERMES_WEBUI_STATE_DIR. HTTP routes and
the WebUI MCP server both call this module. Selected field text changes only
on a user edit, an explicit accept, or selecting an alternative.
"""

from __future__ import annotations

import copy
import json
import logging
import os
import re
import sys
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

STAGES = ("brief", "who", "what", "hook", "casts", "copy", "review")
STAGE_STATUSES = frozenset({
    "not_started",
    "draft",
    "approved",
    "review_recommended",
    "not_applicable",
})
PROPOSAL_STATUSES = frozenset({
    "proposed",
    "in_discussion",
    "accepted",
    "edited_accepted",
    "dismissed",
    "alternative",
})
CLAIM_LABELS = frozenset({
    "user_approved",
    "needs_verification",
    "supported_by_source",
})

FIELDS: dict[str, tuple[str, ...]] = {
    "brief": (
        "product_offer",
        "product_facts",
        "audience_notes",
        "objective",
        "channel",
        "format_length",
        "assets",
        "sources",
        "summary_provided",
        "summary_assumptions",
        "summary_missing",
    ),
    "who": ("outcome", "demographic", "facet", "segment"),
    "what": ("concept", "angle", "ump", "ums", "mechanism"),
    "hook": (
        "hook_type",
        "visual_hook",
        "verbal_hook",
        "core_trigger",
        "caveman_simple",
        "deep_fry",
        "walk_it_back",
        "make_it_bang",
        "final_hook",
        "format",
    ),
    "casts": ("conceit", "actors", "style", "terrain", "setup"),
    "copy": ("pain", "promise", "proof", "curiosity", "constraints", "conditions"),
    "review": (),
}

# Changing a field marks these later stages review_recommended when they
# already hold work. Empty not_started stages stay untouched.
DOWNSTREAM: dict[str, tuple[str, ...]] = {
    "brief": ("who", "what", "hook", "casts", "copy"),
    "who": ("what", "hook", "casts", "copy"),
    "what": ("hook", "casts", "copy"),
    "hook": ("casts", "copy"),
    "casts": (),
    "copy": (),
    "review": (),
}

# Context a suggestion for this field must include. Missing non-empty checks
# are reported; the store does not invent values.
SUGGESTION_CONTEXT: dict[str, tuple[tuple[str, str], ...]] = {
    "segment": (
        ("brief", "product_facts"),
        ("brief", "audience_notes"),
        ("brief", "objective"),
        ("who", "outcome"),
        ("who", "demographic"),
        ("who", "facet"),
    ),
    "concept": (("who", "segment"), ("brief", "product_facts")),
    "angle": (("who", "segment"), ("brief", "product_facts"), ("what", "concept")),
    "ump": (("who", "segment"), ("brief", "product_facts"), ("what", "concept")),
    "ums": (("who", "segment"), ("brief", "product_facts"), ("what", "concept"), ("what", "ump")),
    "mechanism": (("who", "segment"), ("brief", "product_facts"), ("what", "ump"), ("what", "ums")),
    "hook_type": (("what", "concept"), ("what", "angle"), ("what", "mechanism"), ("who", "segment"), ("brief", "format_length")),
    "visual_hook": (("what", "concept"), ("what", "angle"), ("what", "mechanism"), ("who", "segment"), ("hook", "format")),
    "verbal_hook": (("what", "concept"), ("what", "angle"), ("what", "mechanism"), ("who", "segment"), ("hook", "format")),
    "core_trigger": (("what", "concept"), ("hook", "hook_type"), ("who", "segment")),
    "caveman_simple": (("hook", "verbal_hook"), ("what", "concept")),
    "deep_fry": (("hook", "verbal_hook"), ("what", "concept")),
    "walk_it_back": (("hook", "verbal_hook"), ("what", "mechanism")),
    "make_it_bang": (("hook", "verbal_hook"), ("what", "concept")),
    "final_hook": (("hook", "verbal_hook"), ("hook", "visual_hook"), ("what", "concept"), ("what", "mechanism")),
    "format": (("brief", "format_length"), ("brief", "channel")),
    "conceit": (("hook", "final_hook"), ("hook", "format"), ("what", "concept")),
    "actors": (("hook", "final_hook"), ("casts", "conceit")),
    "style": (("hook", "final_hook"), ("casts", "conceit")),
    "terrain": (("hook", "final_hook"), ("casts", "conceit")),
    "setup": (("hook", "final_hook"), ("hook", "format"), ("casts", "conceit")),
    "pain": (("who", "segment"), ("what", "concept"), ("what", "mechanism"), ("hook", "final_hook")),
    "promise": (("who", "segment"), ("what", "concept"), ("what", "mechanism"), ("hook", "final_hook")),
    "proof": (("who", "segment"), ("what", "concept"), ("what", "mechanism"), ("brief", "sources")),
    "curiosity": (("who", "segment"), ("what", "concept"), ("hook", "final_hook")),
    "constraints": (("brief", "product_facts"), ("what", "mechanism")),
    "conditions": (("brief", "product_facts"), ("what", "mechanism")),
}

COPY_FIELDS = set(FIELDS["copy"])
SUMMARY_FIELDS = ("summary_provided", "summary_assumptions", "summary_missing")
MAX_PENDING_PROPOSALS = 3
_REGULATED = re.compile(
    r"\b(cure|cures|diagnose|diagnosis|fda|clinical|dosage|prescription|"
    r"side effect|cholesterol|investment|guaranteed profit|apy|interest rate|"
    r"testimonial|patients?|disease|supplement)\b",
    re.IGNORECASE,
)
_LOCKS: dict[str, threading.Lock] = {}
_LOCKS_GUARD = threading.Lock()

# Luke Iha field purposes. The chat uses these so a question about a field
# is answered from the job of that field, not from a blank prompt.
FIELD_HELP = {
    "product_offer": "The product this creative is about. Every later field stays about this product.",
    "product_facts": "Verified facts about the product. Do not invent capabilities beyond these.",
    "audience_notes": "What is already known about who buys, before the Who stage is written.",
    "objective": "The job of this creative: what it should make the viewer do or believe.",
    "channel": "Where the creative will run.",
    "format_length": "Length and placement the hook and format have to fit.",
    "outcome": "The result the audience wants. Not a feature list.",
    "demographic": "Observable traits of the audience.",
    "facet": "The specific circumstance that makes the message land.",
    "segment": "One audience: outcome × demographic × facet.",
    "concept": "One idea, 8–10 words, no 'and'. It is the collision between the market's false belief and the real mechanism (UMP), not the product's features. It must be immediately plausible, showable, and point at a villain that is not the customer. Archetypes: the trap, the missing mechanism, the category killer.",
    "angle": "The point of view on the concept: villain/false solution, root-cause mechanism, us vs them, a daily micro-moment, a counter-intuitive warning, or a functional before/after.",
    "ump": "Unique mechanism of the problem: why the problem actually happens.",
    "ums": "Unique mechanism of the solution: how this product physically fixes that fault.",
    "mechanism": "UMP plus UMS in plain language: how the product produces the outcome.",
    "hook_type": "Which hook pattern to build: pattern interrupt, counter-intuitive why, visceral micro-moment, visual us-vs-them, or insider confession.",
    "visual_hook": "What is seen in the first three seconds: motion, a pattern break, or a physical demo. Not a talking head.",
    "verbal_hook": "The first spoken or written line, about 7–10 words. It opens a curiosity gap or attacks a false belief.",
    "core_trigger": "The psychological engine holding the viewer: dissonance, specificity, or an information gap.",
    "caveman_simple": "The central idea stripped to one primitive sentence. A hook does not also carry the problem, the solution, and the mechanism.",
    "deep_fry": "Sharpen the line: a good thing that harms, reversed causation, a sticky rename, or a tightrope claim.",
    "walk_it_back": "The next line that proves the extreme hook and returns it to the real mechanism without lying.",
    "make_it_bang": "Pass the line through the five filters: interesting words in the first five, dramatic verbs, a specific time and scene, a statement not a lazy question, one sentence.",
    "final_hook": "The shippable hook. It creates a prediction error, survives 'so what?', still reads as news with the logo removed, and the first five words stand alone.",
    "format": "The content format the hook has to fit.",
    "conceit": "The central execution idea for the creative.",
    "actors": "Who or what is on camera.",
    "style": "The visual style.",
    "terrain": "The environment or set.",
    "setup": "What is already true in the first frame.",
    "pain": "The concrete daily scene of the pain, not a generic ache.",
    "promise": "The specific end state the product delivers.",
    "proof": "Why it is believable: mechanism, demo, a sourced number, or real reviews. Do not invent proof.",
    "curiosity": "An open information gap that stops the scroll.",
    "constraints": "Why previous solutions failed, so the failure is the method and not the customer.",
    "conditions": "Who it is for, who it is not for, and when to use it.",
}


class StudioError(Exception):
    def __init__(self, message: str, status: int = 400, extra: dict | None = None):
        super().__init__(message)
        self.status = status
        self.payload = {"error": message}
        if extra:
            self.payload.update(extra)


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _profile_slug(name: str | None) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", str(name or "default")).strip("._") or "default"
    return cleaned[:80]


def _profile_name() -> str:
    from api.profiles import get_active_profile_name

    return _profile_slug(get_active_profile_name() or "default")


def _state_dir() -> Path:
    import api.config as config

    return Path(config.STATE_DIR)


def _profile_slug_for(profile: str | None = None) -> str:
    """None uses the request profile. Chat workers must pass the session profile."""
    if profile is None:
        return _profile_name()
    return _profile_slug(profile)


def _store_path(profile: str | None = None) -> Path:
    """One JSON document for every creative in this profile."""
    return _state_dir() / "creative_studio" / f"{_profile_slug_for(profile)}.json"


def _legacy_dir(profile: str | None = None) -> Path:
    return _state_dir() / "creative_studio" / _profile_slug_for(profile)


def _studio_lock(profile: str | None = None) -> threading.Lock:
    return _lock_for(_store_path(profile))


def _lock_for(path: Path) -> threading.Lock:
    key = str(path)
    with _LOCKS_GUARD:
        lock = _LOCKS.get(key)
        if lock is None:
            lock = threading.Lock()
            _LOCKS[key] = lock
        return lock


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


def _empty_field(order: int = 0) -> dict:
    return {
        "text": "",
        "author": "user",
        "claim": "user_approved",
        "source_ref": "",
        "regulated": False,
        "updated_at": "",
        "include": True,
        "order": order,
        "proposals": [],
    }


def _blank_project(name: str, product: str = "") -> dict:
    stages = {}
    for stage in STAGES:
        fields = {}
        for index, field in enumerate(FIELDS[stage]):
            fields[field] = _empty_field(index)
        stages[stage] = {
            "status": "not_started",
            "reason": "",
            "fields": fields,
        }
    if product:
        stages["brief"]["fields"]["product_offer"]["text"] = product
        stages["brief"]["fields"]["product_offer"]["updated_at"] = _now()
        stages["brief"]["status"] = "draft"
    now = _now()
    return {
        "id": _new_id(),
        "name": name.strip(),
        "created_at": now,
        "updated_at": now,
        "stages": stages,
        "decisions": [],
        "concept_checks": {
            "single_idea": False,
            "plausibility": False,
            "visualizability": False,
            "villain": False,
        },
        "export_options": {
            "include_alternatives": False,
            "excluded_blocks": [],
        },
        "chat": [],
        "threads": [],
        "active_thread": "",
        "chat_session_id": "",
        "chat_stage": "",
        "chat_field": "",
    }


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def _empty_store() -> dict:
    return {"active_project_id": "", "projects": {}}


def _normalize_store(payload: dict) -> dict:
    projects = payload.get("projects") if isinstance(payload, dict) else None
    rows: dict[str, dict] = {}
    if isinstance(projects, dict):
        items = projects.items()
    elif isinstance(projects, list):
        items = ((row.get("id") if isinstance(row, dict) else "", row) for row in projects)
    else:
        items = ()
    for key, row in items:
        if not isinstance(row, dict):
            continue
        project_id = str(row.get("id") or key or "")
        if not re.fullmatch(r"[a-f0-9]{12}", project_id):
            continue
        row["id"] = project_id
        rows[project_id] = row
    active = ""
    if isinstance(payload, dict):
        active = str(payload.get("active_project_id") or "")
    if active not in rows:
        active = ""
    return {"active_project_id": active, "projects": rows}


def _import_legacy(directory: Path, store: dict) -> bool:
    """Fold the old per-project files into the one store. Returns whether any were present."""
    if not directory.is_dir():
        return False
    found = False
    for path in sorted(directory.glob("*.json")):
        if path.name in {"active.json", "session-index.json"}:
            found = True
            continue
        if not re.fullmatch(r"[a-f0-9]{12}\.json", path.name):
            continue
        found = True
        try:
            project = _read_json(path)
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(project, dict):
            continue
        project_id = str(project.get("id") or path.stem)
        if not re.fullmatch(r"[a-f0-9]{12}", project_id) or project_id in store["projects"]:
            continue
        project["id"] = project_id
        store["projects"][project_id] = project
    active_path = directory / "active.json"
    if active_path.is_file() and not store["active_project_id"]:
        try:
            active_id = str(_read_json(active_path).get("project_id") or "")
        except (OSError, json.JSONDecodeError):
            active_id = ""
        if active_id in store["projects"]:
            store["active_project_id"] = active_id
    return found


def _remove_legacy(directory: Path) -> None:
    if not directory.is_dir():
        return
    for path in directory.glob("*.json"):
        if path.name in {"active.json", "session-index.json"} or re.fullmatch(r"[a-f0-9]{12}\.json", path.name):
            try:
                path.unlink()
            except OSError:
                return
    try:
        directory.rmdir()
    except OSError:
        return


def _read_store(profile: str | None = None) -> dict:
    path = _store_path(profile)
    store = _empty_store()
    if path.is_file():
        try:
            payload = _read_json(path)
        except (OSError, json.JSONDecodeError):
            payload = {}
        store = _normalize_store(payload if isinstance(payload, dict) else {})
    legacy = _legacy_dir(profile)
    if _import_legacy(legacy, store):
        _write_store(store, path)
        _remove_legacy(legacy)
    return store


def _write_store(store: dict, path: Path | None = None) -> None:
    _write_json(path or _store_path(), {
        "active_project_id": store.get("active_project_id") or "",
        "projects": store.get("projects") or {},
    })


def _prepare_project(project: dict) -> bool:
    if not isinstance(project.get("chat"), list):
        project["chat"] = []
    changed = _ensure_threads(project)
    changed = _migrate_chat_session(project) or changed
    return _ensure_tab_for_bound_session(project) or changed


def _load(project_id: str) -> dict:
    if not re.fullmatch(r"[a-f0-9]{12}", project_id or ""):
        raise StudioError("invalid project id")
    store = _read_store()
    project = store["projects"].get(project_id)
    if not isinstance(project, dict):
        raise StudioError("project not found", status=404)
    if _prepare_project(project):
        _write_store(store)
    return project


def _thread_title(messages: list) -> str:
    for message in messages:
        if not isinstance(message, dict) or message.get("role") != "user":
            continue
        text = " ".join(str(message.get("text") or "").split())
        if text:
            return text[:32] + ("…" if len(text) > 32 else "")
    return "New chat"


def _sync_active_chat(project: dict) -> None:
    threads = project.get("threads") or []
    active_id = project.get("active_thread")
    active = next((row for row in threads if row.get("id") == active_id), None)
    if active is None and threads:
        active = threads[-1]
        project["active_thread"] = active["id"]
    project["chat"] = list(active.get("messages") or []) if active else []


def _ensure_threads(project: dict) -> bool:
    """Keep one or more chat tabs. `chat` stays the active tab for older callers."""
    raw = project.get("threads")
    threads = []
    changed = not isinstance(raw, list)
    if isinstance(raw, list):
        for row in raw:
            if not isinstance(row, dict):
                changed = True
                continue
            thread_id = str(row.get("id") or "")
            if not re.fullmatch(r"[a-f0-9]{12}", thread_id):
                thread_id = _new_id()
                changed = True
            messages = row.get("messages") if isinstance(row.get("messages"), list) else []
            if messages is not row.get("messages"):
                changed = True
            title = str(row.get("title") or "").strip() or _thread_title(messages)
            session_id = str(row.get("session_id") or "").strip()
            if session_id and not re.fullmatch(r"[A-Za-z0-9_-]{8,80}", session_id):
                session_id = ""
                changed = True
            if title != row.get("title") or len(messages) > 200 or session_id != (row.get("session_id") or ""):
                changed = True
            threads.append({
                "id": thread_id,
                "title": title[:80],
                "messages": messages[-200:],
                "session_id": session_id,
            })
        if len(threads) != len(raw):
            changed = True
    if not threads:
        chat = project.get("chat") if isinstance(project.get("chat"), list) else []
        if not chat:
            project["threads"] = []
            project["active_thread"] = ""
            project["chat"] = []
            return changed
        threads = [{"id": _new_id(), "title": _thread_title(chat), "messages": list(chat)[-200:], "session_id": ""}]
        changed = True
    if len(threads) > 12:
        threads = threads[-12:]
        changed = True
    project["threads"] = threads
    active = str(project.get("active_thread") or "")
    if active not in {row["id"] for row in project["threads"]}:
        project["active_thread"] = project["threads"][-1]["id"]
        changed = True
    _sync_active_chat(project)
    return changed


def _thread_view(project: dict) -> dict:
    return {
        "threads": [
            {
                "id": row["id"],
                "title": row["title"],
                "messages": row.get("messages") or [],
                "session_id": row.get("session_id") or "",
            }
            for row in project.get("threads") or []
        ],
        "active_thread": project.get("active_thread") or "",
        "chat": project.get("chat") or [],
    }


def create_chat_thread(project_id: str) -> dict:
    with _studio_lock():
        project = _load(project_id)
        if len(project["threads"]) >= 12:
            raise StudioError("too many chats")
        thread = {"id": _new_id(), "title": "New chat", "messages": [], "session_id": ""}
        project["threads"].append(thread)
        project["active_thread"] = thread["id"]
        _sync_active_chat(project)
        _save(project)
        return _thread_view(project)


def activate_chat_thread(project_id: str, thread_id: str) -> dict:
    thread_id = (thread_id or "").strip()
    with _studio_lock():
        project = _load(project_id)
        if thread_id not in {row["id"] for row in project["threads"]}:
            raise StudioError("unknown chat")
        project["active_thread"] = thread_id
        _sync_active_chat(project)
        active = next((row for row in project["threads"] if row["id"] == thread_id), None)
        session_id = _valid_session_id((active or {}).get("session_id") or "")
        if session_id:
            project["chat_session_id"] = session_id
        _save(project)
        return _thread_view(project)


def bind_chat_session(project_id: str, thread_id: str, session_id: str) -> dict:
    """Attach a Hermes agent session to one studio chat tab."""
    thread_id = (thread_id or "").strip()
    session_id = (session_id or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,80}", session_id):
        raise StudioError("invalid session id")
    with _studio_lock():
        project = _load(project_id)
        thread = next((row for row in project["threads"] if row["id"] == thread_id), None)
        if thread is None:
            raise StudioError("unknown chat")
        existing = thread.get("session_id") or ""
        if existing and existing != session_id:
            raise StudioError("chat already has a session")
        thread["session_id"] = session_id
        if project.get("active_thread") == thread_id or not _valid_session_id(project.get("chat_session_id") or ""):
            project["active_thread"] = thread_id
            project["chat_session_id"] = session_id
        _save(project)
        return _thread_view(project)


def close_chat_thread(project_id: str, thread_id: str) -> dict:
    thread_id = (thread_id or "").strip()
    with _studio_lock():
        project = _load(project_id)
        remaining = [row for row in project["threads"] if row["id"] != thread_id]
        if len(remaining) == len(project["threads"]):
            raise StudioError("unknown chat")
        if not remaining:
            remaining = [{"id": _new_id(), "title": "New chat", "messages": [], "session_id": ""}]
        project["threads"] = remaining
        if project.get("active_thread") == thread_id:
            project["active_thread"] = remaining[-1]["id"]
        _sync_active_chat(project)
        active = next((row for row in remaining if row["id"] == project.get("active_thread")), None)
        project["chat_session_id"] = _valid_session_id((active or {}).get("session_id") or "")
        _save(project)
        return _thread_view(project)


def _save(project: dict) -> dict:
    _ensure_threads(project)
    _migrate_chat_session(project)
    _ensure_tab_for_bound_session(project)
    project["updated_at"] = _now()
    store = _read_store()
    store["projects"][project["id"]] = project
    _write_store(store)
    return project


def _iter_projects() -> list[dict]:
    projects = [
        row for row in _read_store()["projects"].values()
        if isinstance(row, dict)
    ]
    projects.sort(key=lambda row: row.get("updated_at") or "", reverse=True)
    return projects


def _field(project: dict, stage: str, field: str) -> dict:
    _require_field(stage, field)
    return project["stages"][stage]["fields"][field]


def _require_field(stage: str, field: str) -> None:
    if stage not in FIELDS or field not in FIELDS[stage]:
        raise StudioError("unknown stage or field")


def _stage_has_work(stage_row: dict) -> bool:
    if stage_row.get("status") in {"draft", "approved", "review_recommended"}:
        return True
    return any((slot.get("text") or "").strip() for slot in stage_row.get("fields", {}).values())


def _mark_downstream(project: dict, stage: str) -> list[str]:
    marked = []
    for name in DOWNSTREAM.get(stage, ()):
        row = project["stages"][name]
        if row.get("status") == "not_applicable":
            continue
        if not _stage_has_work(row):
            continue
        if row.get("status") != "review_recommended":
            row["status"] = "review_recommended"
            marked.append(name)
        elif name not in marked:
            marked.append(name)
    return marked


def _apply_claim(text: str, claim: str | None, source_ref: str | None) -> tuple[str, str, bool]:
    regulated = bool(_REGULATED.search(text or ""))
    chosen = claim or "user_approved"
    if chosen not in CLAIM_LABELS:
        raise StudioError("invalid claim label")
    ref = (source_ref or "").strip()
    if chosen == "supported_by_source" and not ref:
        raise StudioError("supported_by_source requires source_ref pointing at provided source text")
    if regulated and chosen != "supported_by_source":
        chosen = "needs_verification"
    return chosen, ref, regulated


def _summary(project: dict) -> dict:
    stages = project["stages"]
    done = sum(
        1 for name in STAGES
        if stages[name]["status"] in {"approved", "not_applicable"}
    )
    offer = stages["brief"]["fields"]["product_offer"]["text"]
    return {
        "id": project["id"],
        "name": project["name"],
        "product": offer,
        "updated_at": project["updated_at"],
        "progress": {"done": done, "total": len(STAGES)},
        "stage_status": {name: stages[name]["status"] for name in STAGES},
    }


def _resolve(project_id: str | None = None, name: str | None = None) -> dict:
    if project_id:
        return _load(project_id)
    needle = (name or "").strip().casefold()
    if not needle:
        active = _read_store()["active_project_id"]
        if not active:
            raise StudioError("project_id is required")
        return _load(active)
    matches = [row for row in _iter_projects() if (row.get("name") or "").strip().casefold() == needle]
    if not matches:
        raise StudioError("project not found", status=404)
    if len(matches) > 1:
        raise StudioError(
            "ambiguous project name",
            status=409,
            extra={"candidates": [_summary(row) for row in matches]},
        )
    return matches[0]


def list_projects() -> dict:
    with _studio_lock():
        return {"projects": [_summary(row) for row in _iter_projects()]}


def _env_assignment(home: Path, key: str) -> str:
    env_file = home / ".env"
    if not env_file.is_file():
        return ""
    prefix = key + "="
    try:
        lines = env_file.read_text(encoding="utf-8").splitlines()
    except OSError:
        return ""
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(prefix):
            return stripped[len(prefix):].strip().strip('"').strip("'")
    return ""


def _catalog_roots(home: Path) -> list[tuple[str, Path]]:
    vault = _env_assignment(home, "OBSIDIAN_VAULT_PATH") or os.environ.get("OBSIDIAN_VAULT_PATH") or ""
    wiki = _env_assignment(home, "WIKI_PATH") or os.environ.get("WIKI_PATH") or ""
    vault_path = Path(vault).expanduser() if vault else Path.home() / "Documents" / "Obsidian Vault"
    wiki_path = Path(wiki).expanduser() if wiki else Path.home() / "wiki"
    return [
        ("obsidian", vault_path),
        ("wiki", wiki_path),
        ("skills", home / "skills"),
    ]


def product_catalog_roots() -> list[tuple[str, Path]]:
    """Places Hermes already keeps product knowledge: Obsidian, the wiki, and skills."""
    from api.profiles import get_active_hermes_home

    return _catalog_roots(get_active_hermes_home())


def list_known_products(roots: list[tuple[str, Path]] | None = None) -> dict:
    """Product names only. Note bodies stay in the vault, wiki, or skill."""
    found: list[dict] = []
    seen: set[str] = set()

    def add(name: str, source: str, kind: str) -> None:
        cleaned = (name or "").strip()
        key = cleaned.casefold()
        if not cleaned or key in seen or cleaned.casefold() in {"index", "readme", "skill"}:
            return
        seen.add(key)
        found.append({"name": cleaned, "source": source, "kind": kind})

    for kind, root in (product_catalog_roots() if roots is None else roots):
        if not root.is_dir():
            continue
        folders = [root / "products", root / "Products", root / "Product"]
        if kind == "skills":
            folders = list(root.glob("**/products")) + list(root.glob("**/Products"))
        for folder in folders:
            if not folder.is_dir():
                continue
            for note in sorted(folder.glob("*.md")):
                if note.name.lower() == "skill.md":
                    continue
                add(note.stem.replace("-", " ").replace("_", " "), str(note), kind)
    found.sort(key=lambda item: item["name"].casefold())
    return {"products": found}


def create_project(name: str, product: str = "", product_source: str = "") -> dict:
    cleaned = (name or "").strip()
    if not cleaned:
        raise StudioError("name is required")
    if len(cleaned) > 160:
        raise StudioError("name is too long")
    with _studio_lock():
        project = _blank_project(cleaned, product=(product or "").strip())
        project["product_source"] = (product_source or "").strip()
        _save(project)
        _set_active_id(project["id"])
        return project


def get_project(project_id: str | None = None, name: str | None = None, stage: str | None = None,
                field: str | None = None, for_suggestion: bool = False) -> dict:
    with _studio_lock():
        project = _resolve(project_id, name)
        if stage and stage not in FIELDS:
            raise StudioError("unknown stage")
        if field:
            _require_field(stage or _stage_for_field(field), field)
        view = project
        if stage and not field:
            view = {"id": project["id"], "name": project["name"], "stage": stage, "data": project["stages"][stage]}
        elif field:
            owner = stage or _stage_for_field(field)
            view = {
                "id": project["id"],
                "name": project["name"],
                "stage": owner,
                "field": field,
                "data": project["stages"][owner]["fields"][field],
            }
        if for_suggestion and field:
            owner = stage or _stage_for_field(field)
            context, missing = _suggestion_bundle(project, field)
            view = {
                "id": project["id"],
                "name": project["name"],
                "stage": owner,
                "field": field,
                "selected": project["stages"][owner]["fields"][field],
                "context": context,
                "missing": missing,
                "guidance": (
                    "Use this context. If missing is non-empty, ask a focused question "
                    "or label the proposal exploratory. Do not present context-free text "
                    "as a project-consistent recommendation. Save at most three proposals. "
                    "Do not change the selected value."
                ),
            }
        return view


def _stage_for_field(field: str) -> str:
    for stage, names in FIELDS.items():
        if field in names:
            return stage
    raise StudioError("unknown field")


def _suggestion_bundle(project: dict, field: str) -> tuple[dict, list[str]]:
    keys = SUGGESTION_CONTEXT.get(field, (("brief", "product_facts"), ("brief", "audience_notes")))
    context = {}
    missing = []
    brief_bits = []
    for stage, name in (("brief", "product_offer"), ("brief", "objective"), ("brief", "channel")):
        text = project["stages"][stage]["fields"][name]["text"].strip()
        if text:
            brief_bits.append({"stage": stage, "field": name, "text": text})
    context["brief"] = brief_bits
    for stage, name in keys:
        slot = project["stages"][stage]["fields"][name]
        text = (slot.get("text") or "").strip()
        context[f"{stage}.{name}"] = {
            "text": text,
            "claim": slot.get("claim"),
            "author": slot.get("author"),
        }
        if not text:
            missing.append(f"{stage}.{name}")
    return context, missing


def rename_project(project_id: str, name: str) -> dict:
    cleaned = (name or "").strip()
    if not cleaned:
        raise StudioError("name is required")
    with _studio_lock():
        project = _load(project_id)
        project["name"] = cleaned[:160]
        return _save(project)


def delete_project(project_id: str) -> dict:
    with _studio_lock():
        store = _read_store()
        if project_id not in store["projects"]:
            raise StudioError("project not found", status=404)
        del store["projects"][project_id]
        if store["active_project_id"] == project_id:
            store["active_project_id"] = ""
        _write_store(store)
        return {"ok": True, "id": project_id}


def duplicate_project(project_id: str, name: str | None = None) -> dict:
    with _studio_lock():
        source = _load(project_id)
        project = copy.deepcopy(source)
        project["id"] = _new_id()
        project["name"] = (name or f"Copy of {source['name']}").strip()[:160]
        project["created_at"] = _now()
        for stage in project["stages"].values():
            for slot in stage["fields"].values():
                for proposal in slot.get("proposals") or []:
                    proposal["id"] = "p_" + _new_id()
        for thread in project.get("threads") or []:
            thread["session_id"] = ""
        project["chat_session_id"] = ""
        project["chat_stage"] = ""
        project["chat_field"] = ""
        for stage in project.get("stages", {}).values():
            for slot in (stage.get("fields") or {}).values():
                slot.pop("chat_session_id", None)
        _save(project)
        return project


def update_field(project_id: str, stage: str, field: str, text: str, *,
                 claim: str | None = None, source_ref: str | None = None,
                 author: str = "user", include: bool | None = None, order: int | None = None) -> dict:
    if author not in {"user", "agent"}:
        raise StudioError("invalid author")
    _require_field(stage, field)
    with _studio_lock():
        project = _load(project_id)
        slot = _field(project, stage, field)
        previous = slot.get("text") or ""
        slot["text"] = text if text is not None else ""
        chosen, ref, regulated = _apply_claim(slot["text"], claim, source_ref if source_ref is not None else slot.get("source_ref"))
        slot["claim"] = chosen
        slot["source_ref"] = ref
        slot["regulated"] = regulated
        slot["author"] = author
        slot["updated_at"] = _now()
        if field in COPY_FIELDS:
            if include is not None:
                slot["include"] = bool(include)
            if order is not None:
                slot["order"] = int(order)
        marked = []
        if (slot["text"] or "") != previous:
            row = project["stages"][stage]
            if row["status"] == "not_started":
                row["status"] = "draft"
            marked = _mark_downstream(project, stage)
        saved = _save(project)
        return {
            "project_id": project_id,
            "name": saved["name"],
            "stage": stage,
            "field": field,
            "value": slot["text"],
            "claim": slot["claim"],
            "author": slot["author"],
            "regulated": slot["regulated"],
            "updated_at": saved["updated_at"],
            "review_recommended": marked,
        }


def confirm_brief_summary(project_id: str, provided: str, assumptions: str, missing: str) -> dict:
    """Store the three summary sections. Does not copy assumptions into fact fields."""
    with _studio_lock():
        project = _load(project_id)
        brief = project["stages"]["brief"]["fields"]
        facts_before = brief["product_facts"]["text"]
        for key, value in (
            ("summary_provided", provided),
            ("summary_assumptions", assumptions),
            ("summary_missing", missing),
        ):
            brief[key]["text"] = value or ""
            brief[key]["author"] = "user"
            brief[key]["updated_at"] = _now()
        if brief["product_facts"]["text"] != facts_before:
            raise StudioError("summary confirmation must not change product facts")
        if project["stages"]["brief"]["status"] == "not_started":
            project["stages"]["brief"]["status"] = "draft"
        saved = _save(project)
        return {"project_id": project_id, "updated_at": saved["updated_at"], "facts_unchanged": True}


def _pending_count(slot: dict) -> int:
    return sum(1 for item in slot.get("proposals") or [] if item.get("status") in {"proposed", "in_discussion"})


def save_proposal(project_id: str, stage: str, field: str, text: str, *,
                  exploratory: bool = False, missing: list | None = None,
                  discussion: str = "", thread_id: str = "") -> dict:
    _require_field(stage, field)
    body = (text or "").strip()
    if not body:
        raise StudioError("proposal text is required")
    with _studio_lock():
        project = _load(project_id)
        slot = _field(project, stage, field)
        if _pending_count(slot) >= MAX_PENDING_PROPOSALS:
            raise StudioError("at most three pending proposals per field")
        proposal = {
            "id": "p_" + _new_id(),
            "status": "proposed",
            "text": body,
            "revised_text": "",
            "author": "agent",
            "discussion": discussion or "",
            "exploratory": bool(exploratory),
            "missing_context": list(missing or []),
            "created_at": _now(),
            "updated_at": _now(),
        }
        if thread_id:
            proposal["thread_id"] = thread_id
        slot.setdefault("proposals", []).append(proposal)
        selected = slot.get("text") or ""
        saved = _save(project)
        return {
            "project_id": project_id,
            "name": saved["name"],
            "stage": stage,
            "field": field,
            "proposal": proposal,
            "selected_unchanged": slot.get("text") == selected,
            "updated_at": saved["updated_at"],
        }


def _find_proposal(project: dict, proposal_id: str) -> tuple[str, str, dict, dict]:
    for stage, row in project["stages"].items():
        for field, slot in row.get("fields", {}).items():
            for proposal in slot.get("proposals") or []:
                if proposal.get("id") == proposal_id:
                    return stage, field, slot, proposal
    raise StudioError("proposal not found", status=404)


def update_proposal(project_id: str, proposal_id: str, *, status: str | None = None,
                    revised_text: str | None = None, discussion: str | None = None) -> dict:
    if status is not None and status not in {"proposed", "in_discussion"}:
        raise StudioError("update_proposal only sets proposed or in_discussion; use accept, dismiss, or alternative")
    with _studio_lock():
        project = _load(project_id)
        stage, field, slot, proposal = _find_proposal(project, proposal_id)
        before = slot.get("text")
        if status:
            proposal["status"] = status
        if revised_text is not None:
            proposal["revised_text"] = revised_text
        if discussion is not None:
            proposal["discussion"] = discussion
            if proposal["status"] == "proposed":
                proposal["status"] = "in_discussion"
        proposal["updated_at"] = _now()
        saved = _save(project)
        return {
            "project_id": project_id,
            "name": saved["name"],
            "stage": stage,
            "field": field,
            "proposal": proposal,
            "selected_unchanged": slot.get("text") == before,
            "selected": slot.get("text"),
            "updated_at": saved["updated_at"],
        }


def _accept(project_id: str, proposal_id: str, edited_text: str | None) -> dict:
    with _studio_lock():
        project = _load(project_id)
        stage, field, slot, proposal = _find_proposal(project, proposal_id)
        if edited_text is None:
            final = (proposal.get("revised_text") or proposal.get("text") or "").strip()
            proposal["status"] = "accepted"
        else:
            final = edited_text.strip()
            if not final:
                raise StudioError("edited text is required")
            proposal["revised_text"] = final
            proposal["status"] = "edited_accepted"
        chosen, ref, regulated = _apply_claim(final, None, slot.get("source_ref"))
        slot["text"] = final
        slot["author"] = "agent"
        slot["claim"] = chosen
        slot["source_ref"] = ref
        slot["regulated"] = regulated
        slot["updated_at"] = _now()
        proposal["updated_at"] = _now()
        if project["stages"][stage]["status"] == "not_started":
            project["stages"][stage]["status"] = "draft"
        marked = _mark_downstream(project, stage)
        saved = _save(project)
        return {
            "project_id": project_id,
            "name": saved["name"],
            "stage": stage,
            "field": field,
            "value": final,
            "claim": slot["claim"],
            "author": slot["author"],
            "proposal_status": proposal["status"],
            "review_recommended": marked,
            "updated_at": saved["updated_at"],
        }


def accept_proposal(project_id: str, proposal_id: str) -> dict:
    return _accept(project_id, proposal_id, None)


def edit_accept_proposal(project_id: str, proposal_id: str, text: str) -> dict:
    return _accept(project_id, proposal_id, text)


def dismiss_proposal(project_id: str, proposal_id: str) -> dict:
    return _set_proposal_status(project_id, proposal_id, "dismissed")


def save_alternative(project_id: str, proposal_id: str) -> dict:
    return _set_proposal_status(project_id, proposal_id, "alternative")


def _set_proposal_status(project_id: str, proposal_id: str, status: str) -> dict:
    with _studio_lock():
        project = _load(project_id)
        stage, field, slot, proposal = _find_proposal(project, proposal_id)
        before = slot.get("text")
        proposal["status"] = status
        proposal["updated_at"] = _now()
        saved = _save(project)
        return {
            "project_id": project_id,
            "name": saved["name"],
            "stage": stage,
            "field": field,
            "proposal": proposal,
            "selected": slot.get("text"),
            "selected_unchanged": slot.get("text") == before,
            "updated_at": saved["updated_at"],
        }


def select_alternative(project_id: str, proposal_id: str) -> dict:
    with _studio_lock():
        project = _load(project_id)
        stage, field, slot, proposal = _find_proposal(project, proposal_id)
        if proposal.get("status") != "alternative":
            raise StudioError("only a saved alternative can be selected")
        final = (proposal.get("revised_text") or proposal.get("text") or "").strip()
        chosen, ref, regulated = _apply_claim(final, None, "")
        slot["text"] = final
        slot["author"] = "user"
        slot["claim"] = chosen
        slot["source_ref"] = ref
        slot["regulated"] = regulated
        slot["updated_at"] = _now()
        if project["stages"][stage]["status"] in {"not_started", "approved"}:
            project["stages"][stage]["status"] = "draft"
        marked = _mark_downstream(project, stage)
        saved = _save(project)
        return {
            "project_id": project_id,
            "name": saved["name"],
            "stage": stage,
            "field": field,
            "value": final,
            "claim": slot["claim"],
            "updated_at": saved["updated_at"],
            "review_recommended": marked,
        }


def record_decision(project_id: str, stage: str, field: str, text: str) -> dict:
    if stage not in FIELDS:
        raise StudioError("unknown stage")
    if field:
        _require_field(stage, field)
    body = (text or "").strip()
    if not body:
        raise StudioError("decision text is required")
    with _studio_lock():
        project = _load(project_id)
        before = ""
        if field:
            before = _field(project, stage, field).get("text") or ""
        note = {
            "id": "d_" + _new_id(),
            "stage": stage,
            "field": field or "",
            "text": body,
            "created_at": _now(),
        }
        project.setdefault("decisions", []).append(note)
        saved = _save(project)
        after = before
        if field:
            after = _field(saved, stage, field).get("text") or ""
        return {
            "project_id": project_id,
            "name": saved["name"],
            "decision": note,
            "selected_unchanged": after == before,
            "updated_at": saved["updated_at"],
        }


def set_stage_status(project_id: str, stage: str, status: str, reason: str = "") -> dict:
    if stage not in FIELDS:
        raise StudioError("unknown stage")
    if status not in STAGE_STATUSES:
        raise StudioError("invalid stage status")
    if status == "not_applicable" and not (reason or "").strip():
        raise StudioError("not_applicable requires a short reason")
    with _studio_lock():
        project = _load(project_id)
        project["stages"][stage]["status"] = status
        project["stages"][stage]["reason"] = (reason or "").strip()
        saved = _save(project)
        return {
            "project_id": project_id,
            "name": saved["name"],
            "stage": stage,
            "status": status,
            "reason": project["stages"][stage]["reason"],
            "updated_at": saved["updated_at"],
        }


def update_concept_checks(project_id: str, checks: dict) -> dict:
    allowed = {"single_idea", "plausibility", "visualizability", "villain"}
    unknown = set(checks or {}) - allowed
    if unknown:
        raise StudioError("unknown concept check")
    with _studio_lock():
        project = _load(project_id)
        for key, value in (checks or {}).items():
            project["concept_checks"][key] = bool(value)
        saved = _save(project)
        return {"project_id": project_id, "concept_checks": saved["concept_checks"], "updated_at": saved["updated_at"]}


def set_export_options(project_id: str, *, include_alternatives: bool | None = None,
                       excluded_blocks: list | None = None) -> dict:
    with _studio_lock():
        project = _load(project_id)
        options = project.setdefault("export_options", {})
        if include_alternatives is not None:
            options["include_alternatives"] = bool(include_alternatives)
        if excluded_blocks is not None:
            bad = [name for name in excluded_blocks if name not in COPY_FIELDS]
            if bad:
                raise StudioError("unknown copy block")
            options["excluded_blocks"] = list(excluded_blocks)
        saved = _save(project)
        return {"project_id": project_id, "export_options": saved["export_options"], "updated_at": saved["updated_at"]}


def _set_active_id(project_id: str) -> None:
    store = _read_store()
    store["active_project_id"] = project_id if project_id in store["projects"] else ""
    _write_store(store)


def get_active_project_id() -> str:
    with _studio_lock():
        return _read_store()["active_project_id"]


def set_active_project(project_id: str) -> dict:
    with _studio_lock():
        if project_id:
            _load(project_id)
        _set_active_id(project_id or "")
        return {"project_id": project_id or ""}


def export_markdown(project_id: str, include_alternatives: bool | None = None,
                    excluded_blocks: list | None = None) -> dict:
    with _studio_lock():
        project = _load(project_id)
        options = dict(project.get("export_options") or {})
        if include_alternatives is not None:
            options["include_alternatives"] = bool(include_alternatives)
        if excluded_blocks is not None:
            options["excluded_blocks"] = list(excluded_blocks)
        markdown = _render_markdown(project, options)
        return {
            "project_id": project_id,
            "name": project["name"],
            "markdown": markdown,
            "updated_at": project["updated_at"],
        }


def _render_markdown(project: dict, options: dict) -> str:
    labels = {
        "brief": "Brief",
        "who": "Who",
        "what": "What",
        "hook": "Hook",
        "casts": "CASTS",
        "copy": "Copy blocks",
        "review": "Review",
    }
    lines = [
        f"# {project['name']}",
        "",
        "This export is a creative working brief. It does not certify legal, medical, financial, or platform-policy compliance.",
        "",
    ]
    excluded = set(options.get("excluded_blocks") or [])
    include_alts = bool(options.get("include_alternatives"))
    for stage in STAGES:
        if stage == "review":
            continue
        row = project["stages"][stage]
        lines.append(f"## {labels[stage]}")
        lines.append(f"Status: {row['status']}")
        if row.get("reason"):
            lines.append(f"Reason: {row['reason']}")
        lines.append("")
        fields = list(row["fields"].items())
        if stage == "copy":
            fields.sort(key=lambda item: item[1].get("order", 0))
        for field, slot in fields:
            if stage == "copy" and (field in excluded or not slot.get("include", True)):
                continue
            title = field.replace("_", " ").title()
            lines.append(f"### {title}")
            lines.append(f"Author: {slot.get('author') or 'user'}")
            lines.append(f"Claim: {slot.get('claim') or 'user_approved'}")
            if slot.get("regulated"):
                lines.append("Needs verification: regulated or unsupported-claim wording is present.")
            if slot.get("source_ref"):
                lines.append(f"Source: {slot['source_ref']}")
            lines.append("")
            lines.append(slot.get("text") or "_Empty._")
            lines.append("")
            if include_alts:
                alts = [item for item in slot.get("proposals") or [] if item.get("status") == "alternative"]
                if alts:
                    lines.append("Saved alternatives:")
                    for item in alts:
                        lines.append(f"- {item.get('revised_text') or item.get('text')}")
                    lines.append("")
    if project.get("decisions"):
        lines.append("## Decisions")
        for note in project["decisions"]:
            where = note.get("field") or note.get("stage")
            lines.append(f"- {where}: {note.get('text')}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _http_call(handler, fn):
    from api.helpers import bad, j

    try:
        return j(handler, fn())
    except StudioError as exc:
        return j(handler, exc.payload, status=exc.status)
    except Exception:
        return bad(handler, "creative studio request failed", status=500)


def _pid(parsed, prefix: str) -> str:
    rest = parsed.path[len(prefix):]
    return rest.split("/", 1)[0]


def handle_creative_get(handler, parsed):
    path = parsed.path
    if path == "/api/creative-studio/products":
        return _http_call(handler, list_known_products)
    if path == "/api/creative-studio/projects":
        return _http_call(handler, list_projects)
    if path == "/api/creative-studio/active":
        return _http_call(handler, lambda: {"project_id": get_active_project_id()})
    prefix = "/api/creative-studio/projects/"
    if not path.startswith(prefix):
        return False
    project_id = _pid(parsed, prefix)
    tail = path[len(prefix) + len(project_id):]
    qs = {}
    if parsed.query:
        from urllib.parse import parse_qs
        qs = {key: values[-1] for key, values in parse_qs(parsed.query).items()}
    if tail in {"", "/"}:
        return _http_call(handler, lambda: get_project(
            project_id,
            stage=qs.get("stage") or None,
            field=qs.get("field") or None,
            for_suggestion=qs.get("for_suggestion") == "1",
        ))
    if tail == "/prompt":
        return _http_call(handler, lambda: studio_prompt_pack(project_id, qs.get("stage") or ""))
    if tail == "/export":
        include = qs.get("include_alternatives")
        flag = None if include is None else include == "1"
        return _http_call(handler, lambda: export_markdown(project_id, include_alternatives=flag))
    return False


def handle_creative_post(handler, parsed, body: dict):
    path = parsed.path
    body = body or {}
    if path == "/api/creative-studio/projects":
        return _http_call(handler, lambda: create_project(
            body.get("name") or "",
            body.get("product") or "",
            body.get("product_source") or "",
        ))
    if path == "/api/creative-studio/active":
        return _http_call(handler, lambda: set_active_project(str(body.get("project_id") or "")))
    if path == "/api/creative-studio/resolve":
        return _http_call(handler, lambda: get_project(
            body.get("project_id") or None,
            name=body.get("name") or None,
            stage=body.get("stage") or None,
            field=body.get("field") or None,
            for_suggestion=bool(body.get("for_suggestion")),
        ))
    prefix = "/api/creative-studio/projects/"
    if not path.startswith(prefix):
        return False
    project_id = _pid(parsed, prefix)
    tail = path[len(prefix) + len(project_id):]
    if tail == "/threads":
        return _http_call(handler, lambda: create_chat_thread(project_id))
    if tail == "/threads/active":
        return _http_call(handler, lambda: activate_chat_thread(project_id, str(body.get("thread_id") or "")))
    if tail == "/threads/close":
        return _http_call(handler, lambda: close_chat_thread(project_id, str(body.get("thread_id") or "")))
    if tail == "/threads/session":
        return _http_call(handler, lambda: bind_chat_session(
            project_id,
            str(body.get("thread_id") or ""),
            str(body.get("session_id") or ""),
        ))
    if tail == "/chat-session":
        return _http_call(handler, lambda: bind_scope_session(
            project_id,
            str(body.get("session_id") or ""),
            scope=str(body.get("scope") or "project"),
            stage=str(body.get("stage") or ""),
            field=str(body.get("field") or ""),
        ))
    if tail == "/chat-focus":
        return _http_call(handler, lambda: set_chat_focus(
            project_id,
            str(body.get("session_id") or ""),
            stage=str(body.get("stage") or ""),
            field=str(body.get("field") or ""),
        ))
    if tail == "/rename":
        return _http_call(handler, lambda: rename_project(project_id, body.get("name") or ""))
    if tail == "/duplicate":
        return _http_call(handler, lambda: duplicate_project(project_id, body.get("name")))
    if tail == "/fields":
        return _http_call(handler, lambda: update_field(
            project_id,
            str(body.get("stage") or ""),
            str(body.get("field") or ""),
            body.get("text") if body.get("text") is not None else "",
            claim=body.get("claim"),
            source_ref=body.get("source_ref"),
            author=body.get("author") or "user",
            include=body.get("include") if "include" in body else None,
            order=body.get("order") if "order" in body else None,
        ))
    if tail == "/summary":
        return _http_call(handler, lambda: confirm_brief_summary(
            project_id,
            body.get("provided") or "",
            body.get("assumptions") or "",
            body.get("missing") or "",
        ))
    if tail == "/proposals":
        return _http_call(handler, lambda: save_proposal(
            project_id,
            str(body.get("stage") or ""),
            str(body.get("field") or ""),
            body.get("text") or "",
            exploratory=bool(body.get("exploratory")),
            missing=body.get("missing") or [],
            discussion=body.get("discussion") or "",
        ))
    if tail.startswith("/proposals/"):
        proposal_id = tail[len("/proposals/"):]
        action = body.get("action") or "update"
        if action == "accept":
            return _http_call(handler, lambda: accept_proposal(project_id, proposal_id))
        if action == "edit_accept":
            return _http_call(handler, lambda: edit_accept_proposal(project_id, proposal_id, body.get("text") or ""))
        if action == "dismiss":
            return _http_call(handler, lambda: dismiss_proposal(project_id, proposal_id))
        if action == "alternative":
            return _http_call(handler, lambda: save_alternative(project_id, proposal_id))
        if action == "select":
            return _http_call(handler, lambda: select_alternative(project_id, proposal_id))
        return _http_call(handler, lambda: update_proposal(
            project_id,
            proposal_id,
            status=body.get("status"),
            revised_text=body.get("revised_text"),
            discussion=body.get("discussion"),
        ))
    if tail == "/stage":
        return _http_call(handler, lambda: set_stage_status(
            project_id,
            str(body.get("stage") or ""),
            str(body.get("status") or ""),
            body.get("reason") or "",
        ))
    if tail == "/decision":
        return _http_call(handler, lambda: record_decision(
            project_id,
            str(body.get("stage") or ""),
            str(body.get("field") or ""),
            body.get("text") or "",
        ))
    if tail == "/checks":
        return _http_call(handler, lambda: update_concept_checks(project_id, body.get("checks") or {}))
    if tail == "/export-options":
        return _http_call(handler, lambda: set_export_options(
            project_id,
            include_alternatives=body.get("include_alternatives") if "include_alternatives" in body else None,
            excluded_blocks=body.get("excluded_blocks") if "excluded_blocks" in body else None,
        ))
    return False


def handle_creative_delete(handler, parsed):
    prefix = "/api/creative-studio/projects/"
    if not parsed.path.startswith(prefix):
        return False
    project_id = _pid(parsed, prefix)
    if parsed.path != prefix + project_id:
        return False
    return _http_call(handler, lambda: delete_project(project_id))


def _note_under_catalog(path: Path, roots: list[tuple[str, Path]] | None = None) -> bool:
    try:
        resolved = path.resolve()
    except OSError:
        return False
    if not resolved.is_file():
        return False
    for _kind, root in (product_catalog_roots() if roots is None else roots):
        try:
            root_resolved = root.resolve()
        except OSError:
            continue
        if resolved == root_resolved or root_resolved in resolved.parents:
            return True
    return False


def _read_bounded_note(path: Path, limit: int = 3500, roots: list[tuple[str, Path]] | None = None) -> str:
    if not _note_under_catalog(path, roots=roots):
        return ""
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return ""
    collapsed = text.strip()
    if len(collapsed) <= limit:
        return collapsed
    return collapsed[: limit - 1].rstrip() + "…"


def _product_note(project: dict, profile: str | None = None) -> str:
    """The product file Hermes already has, bounded so a reply stays one completion."""
    roots = None
    if profile:
        try:
            from api.profiles import get_hermes_home_for_profile

            roots = _catalog_roots(get_hermes_home_for_profile(profile))
        except Exception:
            roots = None
    source = str(project.get("product_source") or "").strip()
    if source:
        text = _read_bounded_note(Path(source).expanduser(), roots=roots)
        if text:
            return text
    name = _product_name(project).casefold()
    if not name:
        return ""
    for item in (list_known_products(roots).get("products") or []):
        if str(item.get("name") or "").casefold() != name:
            continue
        text = _read_bounded_note(Path(str(item.get("source") or "")).expanduser(), roots=roots)
        if text:
            return text
    return ""


def studio_prompt_pack(project_id: str, stage: str = "") -> dict:
    """Product note plus the Luke Iha purposes for this stage. No tool calls."""
    if stage and stage not in FIELDS:
        raise StudioError("unknown stage")
    with _studio_lock():
        project = _load(project_id)
    names = list(FIELDS.get(stage) or ()) if stage else []
    purposes = []
    for name in names:
        purpose = FIELD_HELP.get(name)
        if purpose:
            purposes.append(f"{name}: {purpose}")
    roots = []
    for kind, root in product_catalog_roots():
        roots.append(f"{kind}: {root}")
    return {
        "product": _product_name(project),
        "product_note": _product_note(project),
        "framework": "\n".join(purposes),
        "search_roots": roots,
    }


def _product_name(project: dict) -> str:
    try:
        return (project["stages"]["brief"]["fields"]["product_offer"]["text"] or "").strip()
    except (KeyError, TypeError):
        return ""


_SESSION_ID = re.compile(r"[A-Za-z0-9_-]{8,80}")
_FIELD_TEXT_LIMIT = 480
_PROJECT_CONTEXT_BUDGET = 6000


def _compact_field_text(text: str, limit: int = _FIELD_TEXT_LIMIT) -> str:
    collapsed = re.sub(r"\s+", " ", (text or "").strip())
    if len(collapsed) <= limit:
        return collapsed
    return collapsed[: limit - 1].rstrip() + "…"


def _project_context_lines(project: dict, omit: tuple[str, str] | None = None) -> list[str]:
    """Filled fields across the project, in stage order, without the field under review."""
    lines = []
    used = 0
    for name in STAGES:
        if name == "review":
            continue
        row = (project.get("stages") or {}).get(name) or {}
        slots = row.get("fields") or {}
        ordered = list(FIELDS.get(name) or ()) or list(slots)
        for field_name in ordered:
            if omit and (name, field_name) == omit:
                continue
            text = _compact_field_text((slots.get(field_name) or {}).get("text") or "")
            if not text:
                continue
            line = f"{name}.{field_name}: {text}"
            if lines and used + len(line) > _PROJECT_CONTEXT_BUDGET:
                return lines
            lines.append(line)
            used += len(line) + 1
    return lines


def _isolated_field_block(project: dict, stage: str, field: str) -> str:
    slot = ((project.get("stages") or {}).get(stage) or {}).get("fields", {}).get(field) or {}
    text = _compact_field_text(slot.get("text") or "", limit=1200) or "(empty)"
    purpose = FIELD_HELP.get(field) or ""
    block = f"{stage}.{field}: {text}"
    if purpose:
        block += f"\nPurpose: {purpose}"
    return block



_CONTEXT_CAP = 12000


def _valid_session_id(value: str) -> str:
    value = str(value or "").strip()
    if _SESSION_ID.fullmatch(value):
        return value
    return ""


def _migrate_chat_session(project: dict) -> bool:
    """Reuse an older tab session as the project chat. Field chats stay unset."""
    changed = False
    current = _valid_session_id(project.get("chat_session_id") or "")
    if project.get("chat_session_id") != current:
        changed = True
    if not current:
        threads = project.get("threads") or []
        active_id = project.get("active_thread")
        active = next((row for row in threads if row.get("id") == active_id), None)
        if active is None and threads:
            active = threads[-1]
        borrowed = _valid_session_id((active or {}).get("session_id") or "")
        if borrowed:
            current = borrowed
            changed = True
    if project.get("chat_session_id") != current:
        project["chat_session_id"] = current
        changed = True
    return changed


def _ensure_tab_for_bound_session(project: dict) -> bool:
    """Give the open project chat a tab. An empty tab is a new chat, so leave it alone."""
    session_id = _valid_session_id(project.get("chat_session_id") or "")
    if not session_id:
        return False
    threads = project.get("threads") if isinstance(project.get("threads"), list) else []
    project["threads"] = threads
    for row in threads:
        if isinstance(row, dict) and _valid_session_id(row.get("session_id") or "") == session_id:
            return False
    thread_id = _new_id()
    threads.append({
        "id": thread_id,
        "title": "New chat",
        "messages": [],
        "session_id": session_id,
    })
    if not project.get("active_thread"):
        project["active_thread"] = thread_id
    return True


def _scope_bindings(project: dict) -> dict:
    found = {}
    project_id = project.get("id") or ""
    project_session = _valid_session_id(project.get("chat_session_id") or "")
    if project_session:
        found[project_session] = {
            "project_id": project_id,
            "scope": "project",
            "stage": str(project.get("chat_stage") or ""),
            "field": str(project.get("chat_field") or ""),
        }
    for thread in project.get("threads") or []:
        if not isinstance(thread, dict):
            continue
        session_id = _valid_session_id(thread.get("session_id") or "")
        if session_id and session_id not in found:
            found[session_id] = {
                "project_id": project_id,
                "scope": "project",
                "stage": str(project.get("chat_stage") or ""),
                "field": str(project.get("chat_field") or ""),
            }
    for stage, row in (project.get("stages") or {}).items():
        for field, slot in ((row or {}).get("fields") or {}).items():
            session_id = _valid_session_id((slot or {}).get("chat_session_id") or "")
            if session_id:
                found[session_id] = {
                    "project_id": project_id,
                    "scope": "field",
                    "stage": stage,
                    "field": field,
                }
    return found


def _find_session(store: dict, session_id: str) -> tuple[dict, dict] | None:
    for project in store.get("projects", {}).values():
        if not isinstance(project, dict):
            continue
        _prepare_project(project)
        binding = _scope_bindings(project).get(session_id)
        if binding:
            return project, binding
    return None


def bind_scope_session(project_id: str, session_id: str, scope: str = "project", stage: str = "", field: str = "") -> dict:
    """Attach one Hermes session to the project chat or to one field."""
    session_id = _valid_session_id(session_id)
    if not session_id:
        raise StudioError("invalid session id")
    scope = "field" if scope == "field" else "project"
    stage = (stage or "").strip()
    field = (field or "").strip()
    if scope == "field":
        _require_field(stage, field)
    with _studio_lock():
        project = _load(project_id)
        if scope == "field":
            slot = _field(project, stage, field)
            existing = _valid_session_id(slot.get("chat_session_id") or "")
            if existing and existing != session_id:
                raise StudioError("field already has a session")
            slot["chat_session_id"] = session_id
        else:
            existing = _valid_session_id(project.get("chat_session_id") or "")
            if existing and existing != session_id:
                raise StudioError("project already has a session")
            project["chat_session_id"] = session_id
            project["chat_stage"] = stage
            project["chat_field"] = field
        _save(project)
        binding = _scope_bindings(project).get(session_id) or {}
        view = _thread_view(project)
        return {
            "session_id": session_id,
            "chat_session_id": project.get("chat_session_id") or "",
            "scope": binding.get("scope") or scope,
            "stage": binding.get("stage") or "",
            "field": binding.get("field") or "",
            "threads": view["threads"],
            "active_thread": view["active_thread"],
        }


def set_chat_focus(project_id: str, session_id: str, stage: str = "", field: str = "") -> dict:
    """Remember the stage and field the user is editing for this chat."""
    session_id = _valid_session_id(session_id)
    if not session_id:
        raise StudioError("invalid session id")
    stage = (stage or "").strip()
    field = (field or "").strip()
    if stage and stage not in FIELDS:
        raise StudioError("unknown stage")
    if field:
        if not stage:
            stage = _stage_for_field(field)
        _require_field(stage, field)
    with _studio_lock():
        project = _load(project_id)
        thread = next(
            (
                row for row in (project.get("threads") or [])
                if isinstance(row, dict) and _valid_session_id(row.get("session_id") or "") == session_id
            ),
            None,
        )
        if thread is not None or session_id == _valid_session_id(project.get("chat_session_id") or ""):
            project["chat_stage"] = stage
            project["chat_field"] = field
            if thread is not None:
                project["active_thread"] = thread.get("id") or ""
                project["chat_session_id"] = session_id
            _save(project)
            return {"session_id": session_id, "scope": "project", "stage": stage, "field": field}
        for stage_name, row in (project.get("stages") or {}).items():
            for field_name, slot in ((row or {}).get("fields") or {}).items():
                if _valid_session_id((slot or {}).get("chat_session_id") or "") != session_id:
                    continue
                return {
                    "session_id": session_id,
                    "scope": "field",
                    "stage": stage_name,
                    "field": field_name,
                }
        raise StudioError("unknown session")


def lookup_studio_session(session_id: str, profile: str | None = None) -> dict | None:
    session_id = _valid_session_id(session_id)
    if not session_id:
        return None
    with _studio_lock(profile):
        found = _find_session(_read_store(profile), session_id)
    if found is None:
        return None
    return found[1]


STUDIO_MCP_SERVER = "hermes-webui"


def _studio_job(project: dict) -> str:
    project_id = project.get("id") or ""
    return (
        f"You are the Creative Studio assistant for project {project_id}. "
        "When the user requests a draft, concept, or update, propose or save "
        "the structured fields (Brief, Who, What, Hook, CASTS, Copy) into the "
        "project state with the hermes-webui tools save_creative_proposal and "
        "update_creative_field. Call the registered tool whose name ends with "
        "one of those. Save a draft as proposals. Use update_creative_field "
        "when the user tells you to change the selected text. Do not edit the "
        "project store any other way."
    )


def _profile_config_path(profile: str | None) -> Path:
    from api.profiles import get_hermes_home_for_profile

    return get_hermes_home_for_profile(_profile_slug_for(profile)) / "config.yaml"


def _read_profile_config(path: Path) -> dict:
    if not path.exists():
        return {}
    from api import yaml_compat as yaml

    loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
    if loaded is None:
        return {}
    if not isinstance(loaded, dict):
        raise ValueError("profile config must be a mapping")
    return loaded


def _studio_mcp_entry(profile: str) -> dict:
    script = Path(__file__).resolve().parents[1] / "mcp_server.py"
    entry = {
        "command": sys.executable,
        "args": [str(script), "--profile", profile],
        "enabled": True,
    }
    env = {"HERMES_HOME": str(_profile_config_path(profile).parent)}
    for key in ("HERMES_WEBUI_STATE_DIR", "HERMES_WEBUI_PORT", "HERMES_WEBUI_HOST"):
        value = os.environ.get(key, "").strip()
        if value:
            env[key] = value
    if env:
        entry["env"] = env
    return entry


def _with_bound_profile(args, profile: str) -> list:
    rows = [str(item) for item in args] if isinstance(args, list) else []
    for index, item in enumerate(rows):
        if item == "--profile" and index + 1 < len(rows):
            rows[index + 1] = profile
            return rows
    return rows + ["--profile", profile]


def _is_studio_mcp_entry(entry: dict) -> bool:
    args = entry.get("args")
    if not isinstance(args, list):
        return False
    return any(str(item).endswith("mcp_server.py") for item in args)


def ensure_studio_mcp(profile: str | None) -> bool:
    """Register hermes-webui on this profile so a studio chat can call it.

    An existing entry is left alone, except our own server gets this profile
    on --profile. A disabled entry stays disabled. Returns True when the file changes.
    """
    name = _profile_slug_for(profile)
    path = _profile_config_path(name)
    from api.config import _cfg_lock, _save_yaml_config_file

    with _cfg_lock:
        try:
            cfg = _read_profile_config(path)
        except Exception:
            logger.warning("creative studio left profile config unchanged", exc_info=True)
            return False
        raw_servers = cfg.get("mcp_servers")
        if raw_servers is not None and not isinstance(raw_servers, dict):
            logger.warning("creative studio left profile config unchanged: mcp_servers is not a mapping")
            return False
        servers = dict(raw_servers or {})
        current = servers.get(STUDIO_MCP_SERVER)
        if not isinstance(current, dict):
            servers[STUDIO_MCP_SERVER] = _studio_mcp_entry(name)
        elif _is_studio_mcp_entry(current):
            updated = dict(current)
            updated["args"] = _with_bound_profile(current.get("args"), name)
            fresh_env = _studio_mcp_entry(name).get("env") or {}
            env = dict(updated.get("env")) if isinstance(updated.get("env"), dict) else {}
            for key, value in fresh_env.items():
                env.setdefault(key, value)
            if env:
                updated["env"] = env
            elif "env" in updated and not updated.get("env"):
                updated.pop("env", None)
            if updated == current:
                return False
            servers[STUDIO_MCP_SERVER] = updated
        else:
            return False
        cfg["mcp_servers"] = servers
        _save_yaml_config_file(path, cfg)
    return True


def prepare_studio_mcp(session_id: str, profile: str | None = None) -> bool:
    """Register studio tools when this session is bound to a creative. False otherwise."""
    if not lookup_studio_session(session_id, profile=profile):
        return False
    try:
        ensure_studio_mcp(profile)
    except Exception:
        logger.warning("creative studio mcp registration failed", exc_info=True)
    return True


def with_studio_toolset(toolsets) -> list:
    rows = list(toolsets or [])
    if STUDIO_MCP_SERVER not in rows:
        rows.append(STUDIO_MCP_SERVER)
    return rows


def _render_studio_context(project: dict, binding: dict, note: str) -> str:
    scope = binding.get("scope") or "project"
    stage = str(binding.get("stage") or "")
    field = str(binding.get("field") or "")
    parts = [
        "Creative Studio document:",
        f"Project: {project.get('name') or ''}",
        f"Product: {_product_name(project) or '(none)'}",
    ]
    if note:
        parts.append("Product note:\n" + note)
    parts.append(_studio_job(project))
    if stage:
        status = ((project.get("stages") or {}).get(stage) or {}).get("status") or "not_started"
        parts.append(f"Selected stage: {stage} ({status})")
    if field:
        parts.append(f"Selected field: {field}")
    if field and stage:
        if scope == "field":
            parts.append("This conversation is only this field.")
        else:
            parts.append("The user has this field selected.")
        parts.append(_isolated_field_block(project, stage, field))
        rest = _project_context_lines(project, omit=(stage, field))
        parts.append("Other fields, for reference only:\n" + ("\n".join(rest) or "(none)"))
        parts.append(
            "Change this field only with update_creative_field or save_creative_proposal. "
            "Do not rewrite other fields from this chat."
        )
    else:
        if stage:
            parts.append(f"The user is editing the {stage} stage.")
        parts.append("This conversation is the whole project.")
        parts.append("Document:\n" + ("\n".join(_project_context_lines(project)) or "(empty)"))
    text = "\n\n".join(parts)
    if len(text) > _CONTEXT_CAP:
        return text[: _CONTEXT_CAP - 1].rstrip() + "…"
    return text


def studio_ephemeral_context(session_id: str, profile: str | None = None) -> str:
    """Bounded document context for a session bound to a creative. Empty otherwise."""
    session_id = _valid_session_id(session_id)
    if not session_id:
        return ""
    with _studio_lock(profile):
        found = _find_session(_read_store(profile), session_id)
        if found is None:
            return ""
        project = copy.deepcopy(found[0])
        binding = dict(found[1])
    return _render_studio_context(project, binding, _product_note(project, profile=profile))


def append_studio_ephemeral(prompt: str, session_id: str, profile: str | None = None) -> str:
    """Append studio context after the shared ephemeral prompt. Other chats stay unchanged."""
    try:
        extra = studio_ephemeral_context(session_id, profile=profile)
    except Exception:
        return prompt or ""
    base = prompt or ""
    if not extra:
        return base
    if not base:
        return extra
    return base + "\n\n" + extra
