"""Creative Studio project store.

Profile-scoped JSON documents under HERMES_WEBUI_STATE_DIR. HTTP routes and
the WebUI MCP server both call this module. Selected field text changes only
on a user edit, an explicit accept, or selecting an alternative.
"""

from __future__ import annotations

import copy
import json
import os
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

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


def _profile_name() -> str:
    from api.profiles import get_active_profile_name

    name = get_active_profile_name() or "default"
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", str(name)).strip("._") or "default"
    return cleaned[:80]


def _state_dir() -> Path:
    import api.config as config

    return Path(config.STATE_DIR)


def _profile_dir() -> Path:
    path = _state_dir() / "creative_studio" / _profile_name()
    path.mkdir(parents=True, exist_ok=True)
    return path


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
    }


def _project_path(project_id: str) -> Path:
    if not re.fullmatch(r"[a-f0-9]{12}", project_id or ""):
        raise StudioError("invalid project id")
    return _profile_dir() / f"{project_id}.json"


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def _load(project_id: str) -> dict:
    path = _project_path(project_id)
    if not path.is_file():
        raise StudioError("project not found", status=404)
    project = _read_json(path)
    if not isinstance(project.get("chat"), list):
        project["chat"] = []
    if _ensure_threads(project):
        _write_json(path, project)
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
            if title != row.get("title") or len(messages) > 200:
                changed = True
            threads.append({"id": thread_id, "title": title[:80], "messages": messages[-200:]})
        if len(threads) != len(raw):
            changed = True
    if not threads:
        chat = project.get("chat") if isinstance(project.get("chat"), list) else []
        threads = [{"id": _new_id(), "title": _thread_title(chat), "messages": list(chat)[-200:]}]
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
            {"id": row["id"], "title": row["title"], "messages": row.get("messages") or []}
            for row in project.get("threads") or []
        ],
        "active_thread": project.get("active_thread") or "",
        "chat": project.get("chat") or [],
    }


def create_chat_thread(project_id: str) -> dict:
    with _lock_for(_profile_dir()):
        project = _load(project_id)
        if len(project["threads"]) >= 12:
            raise StudioError("too many chats")
        thread = {"id": _new_id(), "title": "New chat", "messages": []}
        project["threads"].append(thread)
        project["active_thread"] = thread["id"]
        _sync_active_chat(project)
        _save(project)
        return _thread_view(project)


def activate_chat_thread(project_id: str, thread_id: str) -> dict:
    thread_id = (thread_id or "").strip()
    with _lock_for(_profile_dir()):
        project = _load(project_id)
        if thread_id not in {row["id"] for row in project["threads"]}:
            raise StudioError("unknown chat")
        project["active_thread"] = thread_id
        _sync_active_chat(project)
        _save(project)
        return _thread_view(project)


def close_chat_thread(project_id: str, thread_id: str) -> dict:
    thread_id = (thread_id or "").strip()
    with _lock_for(_profile_dir()):
        project = _load(project_id)
        remaining = [row for row in project["threads"] if row["id"] != thread_id]
        if len(remaining) == len(project["threads"]):
            raise StudioError("unknown chat")
        if not remaining:
            remaining = [{"id": _new_id(), "title": "New chat", "messages": []}]
        project["threads"] = remaining
        if project.get("active_thread") == thread_id:
            project["active_thread"] = remaining[-1]["id"]
        _sync_active_chat(project)
        _save(project)
        return _thread_view(project)


def _save(project: dict) -> dict:
    _ensure_threads(project)
    project["updated_at"] = _now()
    _write_json(_project_path(project["id"]), project)
    return project


def _iter_projects() -> list[dict]:
    root = _profile_dir()
    projects = []
    for path in sorted(root.glob("*.json")):
        if path.name == "active.json":
            continue
        try:
            projects.append(_read_json(path))
        except (OSError, json.JSONDecodeError):
            continue
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
        active = get_active_project_id()
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
    with _lock_for(_profile_dir()):
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


def product_catalog_roots() -> list[tuple[str, Path]]:
    """Places Hermes already keeps product knowledge: Obsidian, the wiki, and skills."""
    from api.profiles import get_active_hermes_home

    home = get_active_hermes_home()
    vault = _env_assignment(home, "OBSIDIAN_VAULT_PATH") or os.environ.get("OBSIDIAN_VAULT_PATH") or ""
    wiki = _env_assignment(home, "WIKI_PATH") or os.environ.get("WIKI_PATH") or ""
    vault_path = Path(vault).expanduser() if vault else Path.home() / "Documents" / "Obsidian Vault"
    wiki_path = Path(wiki).expanduser() if wiki else Path.home() / "wiki"
    return [
        ("obsidian", vault_path),
        ("wiki", wiki_path),
        ("skills", home / "skills"),
    ]


def list_known_products() -> dict:
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

    for kind, root in product_catalog_roots():
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
    with _lock_for(_profile_dir()):
        project = _blank_project(cleaned, product=(product or "").strip())
        project["product_source"] = (product_source or "").strip()
        _save(project)
        _write_active(project["id"])
        return project


def get_project(project_id: str | None = None, name: str | None = None, stage: str | None = None,
                field: str | None = None, for_suggestion: bool = False) -> dict:
    with _lock_for(_profile_dir()):
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
    with _lock_for(_profile_dir()):
        project = _load(project_id)
        project["name"] = cleaned[:160]
        return _save(project)


def delete_project(project_id: str) -> dict:
    with _lock_for(_profile_dir()):
        path = _project_path(project_id)
        if not path.is_file():
            raise StudioError("project not found", status=404)
        path.unlink()
        if get_active_project_id() == project_id:
            _write_active("")
        return {"ok": True, "id": project_id}


def duplicate_project(project_id: str, name: str | None = None) -> dict:
    with _lock_for(_profile_dir()):
        source = _load(project_id)
        project = copy.deepcopy(source)
        project["id"] = _new_id()
        project["name"] = (name or f"Copy of {source['name']}").strip()[:160]
        project["created_at"] = _now()
        for stage in project["stages"].values():
            for slot in stage["fields"].values():
                for proposal in slot.get("proposals") or []:
                    proposal["id"] = "p_" + _new_id()
        _save(project)
        return project


def update_field(project_id: str, stage: str, field: str, text: str, *,
                 claim: str | None = None, source_ref: str | None = None,
                 author: str = "user", include: bool | None = None, order: int | None = None) -> dict:
    if author not in {"user", "agent"}:
        raise StudioError("invalid author")
    _require_field(stage, field)
    with _lock_for(_profile_dir()):
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
    with _lock_for(_profile_dir()):
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
    with _lock_for(_profile_dir()):
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
    with _lock_for(_profile_dir()):
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
    with _lock_for(_profile_dir()):
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
    with _lock_for(_profile_dir()):
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
    with _lock_for(_profile_dir()):
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
    with _lock_for(_profile_dir()):
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
    with _lock_for(_profile_dir()):
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
    with _lock_for(_profile_dir()):
        project = _load(project_id)
        for key, value in (checks or {}).items():
            project["concept_checks"][key] = bool(value)
        saved = _save(project)
        return {"project_id": project_id, "concept_checks": saved["concept_checks"], "updated_at": saved["updated_at"]}


def set_export_options(project_id: str, *, include_alternatives: bool | None = None,
                       excluded_blocks: list | None = None) -> dict:
    with _lock_for(_profile_dir()):
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


def _active_path() -> Path:
    return _profile_dir() / "active.json"


def _write_active(project_id: str) -> None:
    _write_json(_active_path(), {"project_id": project_id or ""})


def get_active_project_id() -> str:
    path = _active_path()
    if not path.is_file():
        return ""
    try:
        return str(_read_json(path).get("project_id") or "")
    except (OSError, json.JSONDecodeError):
        return ""


def set_active_project(project_id: str) -> dict:
    with _lock_for(_profile_dir()):
        if project_id:
            _load(project_id)
        _write_active(project_id or "")
        return {"project_id": project_id or ""}


def export_markdown(project_id: str, include_alternatives: bool | None = None,
                    excluded_blocks: list | None = None) -> dict:
    with _lock_for(_profile_dir()):
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
    if path == "/api/creative-studio/chat":
        return _http_call(handler, lambda: post_studio_chat(
            str(body.get("project_id") or ""),
            str(body.get("stage") or ""),
            body.get("text") or "",
            scope=str(body.get("scope") or "stage"),
            field=str(body.get("field") or ""),
            model=str(body.get("model") or ""),
            model_provider=str(body.get("model_provider") or ""),
            thread_id=str(body.get("thread_id") or ""),
        ))
    if path == "/api/creative-studio/assist":
        return _http_call(handler, lambda: assist_message(
            str(body.get("project_id") or ""),
            str(body.get("stage") or ""),
            str(body.get("action") or ""),
        ))
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


_PROPOSAL_LINE = re.compile(
    r"(?im)^\s*(?:proposal|save(?:\s+as\s+proposal)?|apply\s+to)\s+([a-z_ ]+?)\s*:\s*(.+?)\s*$"
)


def _product_name(project: dict) -> str:
    try:
        return (project["stages"]["brief"]["fields"]["product_offer"]["text"] or "").strip()
    except (KeyError, TypeError):
        return ""


def _studio_system(project: dict, instructions: str) -> str:
    """Product name lives in the system prompt. Hermes looks the product up itself."""
    name = _product_name(project)
    if not name:
        return instructions
    return (
        f"The product for this creative is {name}. "
        "Use what you already know about this product. "
        "Look it up the same way you look up any product you already know. "
        "A product file is not required.\n\n"
        + instructions
    )


def _field_guide(stage: str, field: str = "") -> str:
    if field:
        names = [field]
    else:
        names = list(FIELDS.get(stage) or ())
    lines = []
    for name in names:
        purpose = FIELD_HELP.get(name)
        if purpose:
            lines.append(f"{name}: {purpose}")
    return "\n".join(lines)


_QUESTION = re.compile(
    r"(\?|^(?:what|why|how|who|when|explain|tell me|describe|מה|למה|איך|מי|הסבר|תסביר)\b)",
    re.IGNORECASE,
)


def _recent_turns(project: dict, thread_id: str, limit: int = 8) -> str:
    thread_id = (thread_id or project.get("active_thread") or "").strip()
    thread = next((row for row in project.get("threads") or [] if row.get("id") == thread_id), None)
    messages = (thread or {}).get("messages") or project.get("chat") or []
    lines = []
    for item in messages[-limit:]:
        role = item.get("role") or "user"
        text = (item.get("text") or "").strip()
        if text:
            lines.append(f"{role}: {text[:1200]}")
    return "\n".join(lines)


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


def _chat_context_lines(project: dict, stage: str, scope: str, field: str = "") -> tuple[list[str], list[str]]:
    if scope == "field" and field:
        slot = project["stages"][stage]["fields"][field]
        text = (slot.get("text") or "").strip()
        lines = [f"{stage}.{field}: {text or '(empty)'}"]
        _context, missing = _suggestion_bundle(project, field)
        return lines, missing
    stages = [stage] if scope != "project" else [name for name in STAGES if name != "review"]
    lines = []
    missing = []
    seen = set()
    for name in stages:
        row = project["stages"].get(name) or {}
        for field, slot in (row.get("fields") or {}).items():
            text = (slot.get("text") or "").strip()
            if text:
                lines.append(f"{name}.{field}: {text}")
            key = (name, field)
            if key not in seen and not text and name == stage:
                seen.add(key)
    if stage in FIELDS and stage != "review":
        for field in FIELDS[stage]:
            _context, field_missing = _suggestion_bundle(project, field)
            for item in field_missing:
                if item not in missing:
                    missing.append(item)
    return lines, missing


def _suggestion_targets(project: dict, stage: str, scope: str, field: str) -> list[dict]:
    if scope == "field" and field:
        names = [field]
    else:
        names = list(FIELDS.get(stage) or ())
    targets = []
    row = (project.get("stages") or {}).get(stage) or {}
    slots = row.get("fields") or {}
    for name in names[:6]:
        slot = slots.get(name) or {}
        targets.append({
            "field": name,
            "text": (slot.get("text") or "").strip(),
        })
    return targets


def _parse_suggestion_payload(raw: str, allowed: set[str]) -> list[dict]:
    text = (raw or "").strip()
    if not text:
        return []
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.I)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.S)
        if not match:
            return []
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return []
    items = data.get("suggestions") if isinstance(data, dict) else None
    if not isinstance(items, list):
        return []
    found = []
    seen = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("field") or "").strip().lower().replace(" ", "_")
        body = str(item.get("text") or "").strip()
        if name not in allowed or name in seen or not body:
            continue
        seen.add(name)
        found.append({"field": name, "text": body[:4000]})
    return found


STUDIO_AGENT_PROFILE = "copywriting"


def complete_studio_prompt(system: str, user: str, model: str = "", provider: str = "") -> str:
    """Ask the configured Hermes model for field suggestions.

    A model chosen in the studio composer overrides the default. Tests and
    explicit opt-out skip the model so a studio chat never calls the network
    unless the running server is actually serving a person.
    """
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return ""
    if os.environ.get("HERMES_WEBUI_STUDIO_LLM", "1").strip().lower() in {"0", "false", "off"}:
        return ""
    try:
        from api.routes import _llm_update_summary
        return (_llm_update_summary(
            system,
            user,
            active_profile=STUDIO_AGENT_PROFILE,
            model_override=(model or "").strip() or None,
            provider_override=(provider or "").strip() or None,
        ) or "").strip()
    except Exception:
        return ""


def _draft_field_suggestions(project: dict, stage: str, scope: str, field: str, user_text: str, lines: list[str], model: str = "", provider: str = "") -> list[dict]:
    targets = _suggestion_targets(project, stage, scope, field)
    if not targets:
        return []
    blocks = []
    for item in targets:
        state = item["text"] or "(empty)"
        blocks.append(f"{item['field']}: {state}")
    guide = _field_guide(stage, field if scope == "field" else "")
    history = _recent_turns(project, "")
    isolated = scope == "field" and bool(field)
    if isolated:
        context = "\n".join(_project_context_lines(project, omit=(stage, field))) or "(nothing else saved)"
        subject = _isolated_field_block(project, stage, field)
    else:
        context = "\n".join(lines[:24]) or "(no other saved field text)"
        subject = ""
    system = _studio_system(project, (
        "You draft Creative Studio field text using the Luke Iha method. "
        "Reply with JSON only, no markdown: "
        '{"suggestions":[{"field":"name","text":"replacement"}]}. '
        + (
            "The user wants feedback on one field. "
            "Read the rest of the project as context and return one suggestion for that field only. "
            if isolated else
            "Return one suggestion for every requested field. "
        )
        + "Write each field for its stated purpose. Concept is one idea, not features. "
        "UMP is why the problem happens. UMS is how this product fixes it. "
        "If the field is empty, write a first answer. "
        "If the field already has text, rewrite the whole value using the user's note. "
        "Write about the named product."
    ))
    if isolated:
        user = (
            f"Project: {project.get('name')}\n"
            f"Stage: {stage}\n\n"
            "Field under review:\n"
            f"{subject}\n\n"
            f"User note:\n{user_text}\n\n"
            f"Earlier in this chat:\n{history or '(none)'}\n\n"
            "Rest of the project, for context only:\n"
            f"{context}\n\n"
            "Revise only the field under review:\n" + "\n".join(blocks)
        )
    else:
        user = (
            f"Project: {project.get('name')}\n"
            f"Stage: {stage}\n\n"
            f"What each field is for:\n{guide}\n\n"
            f"User note:\n{user_text}\n\n"
            f"Earlier in this chat:\n{history or '(none)'}\n\n"
            f"Saved context:\n{context}\n\n"
            "Fields to revise:\n" + "\n".join(blocks)
        )
    if model or provider:
        raw = complete_studio_prompt(system, user, model, provider)
    else:
        raw = complete_studio_prompt(system, user)
    allowed = {item["field"] for item in targets}
    current = {item["field"]: item["text"] for item in targets}
    drafts = []
    for item in _parse_suggestion_payload(raw, allowed):
        if item["text"] == current.get(item["field"], ""):
            continue
        drafts.append({
            "field": item["field"],
            "text": item["text"],
            "previous": current.get(item["field"], ""),
        })
    return drafts


def _studio_model_choice(model: str, provider: str) -> tuple[str, str]:
    model = (model or "").strip()
    provider = (provider or "").strip()
    if len(model) > 300 or len(provider) > 80:
        raise StudioError("unknown model")
    if any(char in model or char in provider for char in "\n\r\x00"):
        raise StudioError("unknown model")
    return model, provider


def post_studio_chat(project_id: str, stage: str, text: str, scope: str = "stage", field: str = "", model: str = "", model_provider: str = "", thread_id: str = "") -> dict:
    """Append a studio thread turn. A suggestion replaces a field only when applied."""
    cleaned = (text or "").strip()
    if not cleaned:
        raise StudioError("message is required")
    if len(cleaned) > 8000:
        raise StudioError("message is too long")
    if stage not in FIELDS or stage in {"brief", "review"}:
        raise StudioError("unknown stage")
    field = (field or "").strip()
    if scope == "field":
        if field not in FIELDS[stage]:
            raise StudioError("unknown field")
    elif scope == "project":
        scope = "project"
        field = ""
    else:
        scope = "stage"
        field = ""
    model, model_provider = _studio_model_choice(model, model_provider)
    with _lock_for(_profile_dir()):
        bound = _load(project_id)
        thread_id = (thread_id or bound.get("active_thread") or "").strip()
        if thread_id not in {row["id"] for row in bound.get("threads") or []}:
            raise StudioError("unknown chat")
    saved = []
    for match in _PROPOSAL_LINE.finditer(cleaned):
        raw_field = match.group(1).strip().lower().replace(" ", "_")
        body = match.group(2).strip()
        if not body:
            continue
        owner = stage
        if raw_field not in FIELDS.get(stage, ()):
            try:
                owner = _stage_for_field(raw_field)
            except StudioError:
                continue
            if raw_field not in FIELDS[owner]:
                continue
        result = save_proposal(
            project_id, owner, raw_field, body, discussion=cleaned[:500], thread_id=thread_id,
        )
        slot_text = ""
        try:
            slot_text = ((get_project(project_id, field=raw_field).get("data") or {}).get("text") or "")
        except StudioError:
            slot_text = ""
        saved.append({
            "id": result["proposal"]["id"],
            "stage": owner,
            "field": raw_field,
            "text": body,
            "previous": slot_text,
        })
    answer = ""
    asking = bool(_QUESTION.search(cleaned)) and not saved
    if asking:
        with _lock_for(_profile_dir()):
            preview = _load(project_id)
            preview_lines, _preview_missing = _chat_context_lines(preview, stage, scope, field)
            guide = _field_guide(stage, field if scope == "field" else "")
            history = _recent_turns(preview, thread_id)
            isolated = scope == "field" and bool(field)
        if isolated:
            question_user = (
                f"Project: {preview.get('name')}\n\n"
                "Answer about the field under review. The other fields are context.\n\n"
                "Field under review:\n"
                f"{_isolated_field_block(preview, stage, field)}\n\n"
                "Rest of the project:\n"
                + ("\n".join(_project_context_lines(preview, omit=(stage, field))) or "(nothing else saved)")
                + f"\n\nEarlier in this chat:\n{history or '(none)'}\n\n"
                f"Question:\n{cleaned}"
            )
            question_system = (
                "You are Hermes inside Creative Studio, using the Luke Iha method. "
                "The user isolated one field for feedback. "
                "Read every other saved field as context and answer about that field. "
                "Plain sentences."
            )
        else:
            question_user = (
                f"Project: {preview.get('name')}\n\n"
                f"Field purposes:\n{guide}\n\n"
                f"Saved fields:\n" + ("\n".join(preview_lines[:24]) or "(none)") + "\n\n"
                f"Earlier in this chat:\n{history or '(none)'}\n\n"
                f"Question:\n{cleaned}"
            )
            question_system = (
                "You are Hermes inside Creative Studio, using the Luke Iha method. "
                "Answer the user's question about this product or these fields. "
                "Use the field purposes and what you already know about the product. "
                "Plain sentences."
            )
        answer = complete_studio_prompt(
            _studio_system(preview, question_system),
            question_user,
            model,
            model_provider,
        )
    if not saved and not asking:
        with _lock_for(_profile_dir()):
            preview = _load(project_id)
            preview_lines, _preview_missing = _chat_context_lines(preview, stage, scope, field)
        for draft in _draft_field_suggestions(
            preview, stage, scope, field, cleaned, preview_lines, model=model, provider=model_provider,
        ):
            try:
                result = save_proposal(
                    project_id, stage, draft["field"], draft["text"], discussion=cleaned[:500],
                    thread_id=thread_id,
                )
            except StudioError:
                continue
            saved.append({
                "id": result["proposal"]["id"],
                "stage": stage,
                "field": draft["field"],
                "text": draft["text"],
                "previous": draft["previous"],
            })
    with _lock_for(_profile_dir()):
        project = _load(project_id)
        lines, missing = _chat_context_lines(project, stage, scope, field)
        now = _now()
        user_msg = {
            "id": _new_id(),
            "role": "user",
            "text": cleaned,
            "stage": stage,
            "field": field,
            "scope": scope,
            "created_at": now,
        }
        if scope == "field":
            where = f"feedback on {stage}.{field}, using the rest of the project"
        elif scope == "stage":
            where = f"the {stage} stage"
        else:
            where = "the whole project"
        parts = [f"{project['name']}, {where}."]
        if answer:
            parts.append(answer)
        if lines:
            parts.append("Already on the project:\n" + "\n".join(lines[:24]))
        elif not answer:
            parts.append("Nothing is saved here yet, so this chat can't fill the fields in.")
        stage_missing = [
            item.split(".", 1)[-1].replace("_", " ")
            for item in missing
            if item.startswith(stage + ".")
        ]
        if stage_missing and not lines:
            parts.append("Still open: " + ", ".join(dict.fromkeys(stage_missing)) + ".")
        elif missing and not lines:
            parts.append("This stage is waiting on product notes that aren't in the project yet.")
        if saved:
            parts = [
                f"Suggested replacements for {project['name']}, {where}. "
                "The fields stay as they are until you replace them."
            ]
        elif not answer:
            example = field if scope == "field" and field else (FIELDS.get(stage) or ("outcome",))[0]
            parts.append(
                "Hermes didn't return a suggestion. To hold a line yourself, send "
                f"proposal {example}: your line, then replace the field."
            )
        assistant = {
            "id": _new_id(),
            "role": "assistant",
            "text": "\n\n".join(parts),
            "stage": stage,
            "field": field,
            "scope": scope,
            "created_at": now,
            "proposals": saved,
        }
        thread = next((row for row in project["threads"] if row["id"] == thread_id), None)
        if thread is None:
            raise StudioError("unknown chat")
        thread.setdefault("messages", []).extend([user_msg, assistant])
        thread["messages"] = thread["messages"][-200:]
        if thread.get("title") in {"", "New chat"}:
            thread["title"] = _thread_title(thread["messages"])
        project["active_thread"] = thread["id"]
        _sync_active_chat(project)
        _save(project)
    view = _thread_view(project)
    return {"messages": [user_msg, assistant], "chat": view["chat"], "proposals": saved, "threads": view["threads"], "active_thread": view["active_thread"]}


def assist_message(project_id: str, stage: str, action: str) -> dict:
    """Build the chat turn for Studio assistance. Does not write proposals."""
    if stage not in FIELDS or stage == "review":
        raise StudioError("unknown stage")
    if action not in {"suggest", "clarify", "critique"}:
        raise StudioError("unknown assistance action")
    with _lock_for(_profile_dir()):
        project = _load(project_id)
    verbs = {
        "suggest": (
            "Suggest at most three directions for the fields in this stage. "
            "Call get_creative_project with for_suggestion=true for each target field before writing. "
            "Save each direction with save_creative_proposal. Do not update the selected field."
        ),
        "clarify": (
            "Identify ambiguity and ask focused questions. Do not rewrite the selected fields "
            "and do not save a proposal unless I explicitly ask for one."
        ),
        "critique": (
            "Critique this stage: gaps, contradictions, generic phrasing, and unsupported claims. "
            "Do not invent proof, numbers, testimonials, product capabilities, or usage conditions. "
            "Suggest revisions only if I ask. Do not change the selected field."
        ),
    }
    message = (
        f"Creative Studio project {project['id']} ({project['name']}), stage {stage}. "
        f"{verbs[action]} "
        "Framework examples are copywriting examples, not evidence. "
        "If a required dependency is missing, ask or mark the proposal exploratory and name the missing context. "
        "Read the project with the Creative Studio MCP tools before you answer."
    )
    return {"project_id": project_id, "stage": stage, "action": action, "message": message}
