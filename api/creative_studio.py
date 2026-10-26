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

FIELD_HELP = {
    "outcome": "The change the audience wants.",
    "demographic": "Who they are in observable terms.",
    "facet": "The specific situation or belief that makes the message land.",
    "segment": "Outcome + demographic + facet, written as one audience.",
    "concept": "One idea the ad is about.",
    "angle": "The point of view on that idea.",
    "ump": "Unique mechanism of the problem.",
    "ums": "Unique mechanism of the solution.",
    "mechanism": "How the product produces the outcome, in plain language.",
    "hook_type": "The hook pattern you are using.",
    "visual_hook": "What the viewer sees first.",
    "verbal_hook": "What they hear or read first.",
    "core_trigger": "The emotion or tension the hook pulls.",
    "caveman_simple": "The idea in the fewest concrete words.",
    "deep_fry": "A sharper, more specific version.",
    "walk_it_back": "The support line that keeps the hook honest.",
    "make_it_bang": "The line that earns the next second.",
    "final_hook": "The hook you are willing to ship.",
    "format": "Length and placement shape.",
    "conceit": "The central execution idea.",
    "actors": "Who or what is on camera.",
    "style": "How it looks.",
    "terrain": "Where it happens.",
    "setup": "What is already true in the first frame.",
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
    return project


def _save(project: dict) -> dict:
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
                  discussion: str = "") -> dict:
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


def _chat_context_lines(project: dict, stage: str, scope: str) -> tuple[list[str], list[str]]:
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


def post_studio_chat(project_id: str, stage: str, text: str, scope: str = "stage") -> dict:
    """Append a studio thread turn. Writes a proposal only when the user names one."""
    cleaned = (text or "").strip()
    if not cleaned:
        raise StudioError("message is required")
    if len(cleaned) > 8000:
        raise StudioError("message is too long")
    if stage not in FIELDS or stage in {"brief", "review"}:
        raise StudioError("unknown stage")
    scope = "project" if scope == "project" else "stage"
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
        result = save_proposal(project_id, owner, raw_field, body, discussion=cleaned[:500])
        saved.append({
            "id": result["proposal"]["id"],
            "stage": owner,
            "field": raw_field,
            "text": body,
        })
    with _lock_for(_profile_dir()):
        project = _load(project_id)
        lines, missing = _chat_context_lines(project, stage, scope)
        now = _now()
        user_msg = {
            "id": _new_id(),
            "role": "user",
            "text": cleaned,
            "stage": stage,
            "scope": scope,
            "created_at": now,
        }
        parts = [
            f"Looking at {project['name']}"
            + (f", stage {stage}." if scope == "stage" else ", across the project."),
        ]
        if lines:
            parts.append("Saved context:\n" + "\n".join(lines[:24]))
        else:
            parts.append("This view has no saved field text yet. Hermes product notes stay outside the project until you write a field or a proposal.")
        if missing:
            parts.append("Still empty for suggestions on this stage: " + ", ".join(missing[:12]) + ".")
        if saved:
            parts.append(
                "Saved "
                + ", ".join(f"{item['field']} proposal" for item in saved)
                + ". The selected field is unchanged until you apply it."
            )
        else:
            parts.append(
                "Nothing was written to the project. To keep a line as a proposal, send "
                "`proposal field_name: the line`. Applying it is a separate step."
            )
        assistant = {
            "id": _new_id(),
            "role": "assistant",
            "text": "\n\n".join(parts),
            "stage": stage,
            "scope": scope,
            "created_at": now,
            "proposals": saved,
        }
        project.setdefault("chat", []).extend([user_msg, assistant])
        project["chat"] = project["chat"][-200:]
        _save(project)
    return {"messages": [user_msg, assistant], "chat": project["chat"], "proposals": saved}


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
