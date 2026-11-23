"""Session-owned text documents and the creative attached to a chat.

The document is the working artifact. Chat messages do not store a second copy.
Opening and editing go through apply_document_event so a local fixture and a
later agent tool call the same function. Creative Studio field text is never
written from here.
"""

from __future__ import annotations

import json
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path

_LOCK = threading.Lock()
_SESSION_ID = re.compile(r"[A-Za-z0-9_-]{8,80}")
_DOC_ID = re.compile(r"[a-f0-9]{12}")
_EXCERPT = 6000
_CREATIVE_CAP = 4000


class DocumentError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _state_dir() -> Path:
    import api.config as config

    return Path(config.STATE_DIR)


def _path() -> Path:
    return _state_dir() / "chat_documents" / "store.json"


def _empty() -> dict:
    return {"documents": {}, "session_creative": {}, "session_active": {}}


def _read() -> dict:
    path = _path()
    if not path.is_file():
        return _empty()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return _empty()
    if not isinstance(payload, dict):
        return _empty()
    payload.setdefault("documents", {})
    payload.setdefault("session_creative", {})
    payload.setdefault("session_active", {})
    return payload


def _write(store: dict) -> None:
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def _session(value: str) -> str:
    value = str(value or "").strip()
    if _SESSION_ID.fullmatch(value):
        return value
    raise DocumentError("invalid session id")


def _doc_id(value: str) -> str:
    value = str(value or "").strip()
    if _DOC_ID.fullmatch(value):
        return value
    raise DocumentError("invalid document id")


def fixtures_enabled() -> bool:
    return os.environ.get("HERMES_WEBUI_DOCUMENT_FIXTURES", "").strip() in {"1", "true", "yes"}


def _public(doc: dict, *, full: bool = True) -> dict:
    text = doc.get("text") or ""
    versions = doc.get("versions") or []
    view = {
        "id": doc["id"],
        "session_id": doc.get("session_id") or "",
        "title": doc.get("title") or "Untitled",
        "kind": doc.get("kind") or "document",
        "creative_id": doc.get("creative_id") or "",
        "selection": doc.get("selection") or None,
        "version_index": int(doc.get("version_index") or 0),
        "version_count": len(versions),
        "updated_at": doc.get("updated_at") or "",
        "created_at": doc.get("created_at") or "",
    }
    if full:
        view["text"] = text
    else:
        view["excerpt"] = text[:180]
    return view


def _push_version(doc: dict, text: str, source: str) -> None:
    versions = doc.setdefault("versions", [])
    index = int(doc.get("version_index") or 0)
    if versions and (versions[index].get("text") if 0 <= index < len(versions) else None) == text:
        doc["text"] = text
        return
    if 0 <= index < len(versions) - 1:
        del versions[index + 1 :]
    versions.append({"text": text, "at": _now(), "source": source})
    if len(versions) > 40:
        del versions[: len(versions) - 40]
    doc["versions"] = versions
    doc["version_index"] = len(versions) - 1
    doc["text"] = text
    doc["updated_at"] = _now()


def _require(store: dict, document_id: str) -> dict:
    doc = store["documents"].get(_doc_id(document_id))
    if not isinstance(doc, dict):
        raise DocumentError("document not found", status=404)
    return doc


def _sync_link(doc: dict) -> None:
    creative_id = doc.get("creative_id") or ""
    if not creative_id:
        return
    try:
        from api.creative_studio import touch_project_link

        touch_project_link(creative_id, doc["id"], doc.get("title") or "Untitled")
    except Exception:
        return


def create_document(session_id: str, title: str = "", text: str = "", kind: str = "document",
                    creative_id: str = "", link: bool = True) -> dict:
    session_id = _session(session_id)
    kind = kind if kind in {"document", "script"} else "document"
    title = (title or "").strip()[:160] or ("Script" if kind == "script" else "Untitled")
    text = text if isinstance(text, str) else ""
    if len(text) > 200_000:
        raise DocumentError("document is too long")
    now = _now()
    with _LOCK:
        store = _read()
        import uuid
        document_id = uuid.uuid4().hex[:12]
        doc = {
            "id": document_id,
            "session_id": session_id,
            "title": title,
            "text": text,
            "kind": kind,
            "creative_id": (creative_id or "").strip(),
            "selection": None,
            "versions": [{"text": text, "at": now, "source": "create"}],
            "version_index": 0,
            "created_at": now,
            "updated_at": now,
        }
        store["documents"][document_id] = doc
        store["session_active"][session_id] = document_id
        _write(store)
    if link and doc["creative_id"]:
        try:
            from api.creative_studio import add_project_link

            add_project_link(doc["creative_id"], doc["kind"], document_id, title)
        except Exception:
            pass
    return _public(doc)


def list_documents(session_id: str) -> dict:
    session_id = _session(session_id)
    with _LOCK:
        store = _read()
        rows = [
            _public(doc, full=False)
            for doc in store["documents"].values()
            if isinstance(doc, dict) and doc.get("session_id") == session_id
        ]
    rows.sort(key=lambda row: row.get("updated_at") or "", reverse=True)
    return {
        "documents": rows,
        "active_id": active_document_id(session_id),
        "creative_id": attached_creative_id(session_id),
        "fixtures": fixtures_enabled(),
    }


def get_document(document_id: str) -> dict:
    with _LOCK:
        return _public(_require(_read(), document_id))


def active_document_id(session_id: str) -> str:
    try:
        session_id = _session(session_id)
    except DocumentError:
        return ""
    with _LOCK:
        store = _read()
        current = store["session_active"].get(session_id) or ""
        doc = store["documents"].get(current)
        if isinstance(doc, dict) and doc.get("session_id") == session_id:
            return current
    return ""


def focus_document(document_id: str) -> dict:
    with _LOCK:
        store = _read()
        doc = _require(store, document_id)
        store["session_active"][doc["session_id"]] = doc["id"]
        _write(store)
        return _public(doc)


def save_user_text(document_id: str, text: str, title: str | None = None) -> dict:
    if not isinstance(text, str):
        raise DocumentError("text is required")
    if len(text) > 200_000:
        raise DocumentError("document is too long")
    with _LOCK:
        store = _read()
        doc = _require(store, document_id)
        if title is not None:
            cleaned = title.strip()[:160]
            if cleaned:
                doc["title"] = cleaned
        _push_version(doc, text, "user")
        _write(store)
        saved = _public(doc)
    _sync_link(doc)
    return saved


def set_selection(document_id: str, start: int | None, end: int | None) -> dict:
    with _LOCK:
        store = _read()
        doc = _require(store, document_id)
        if start is None or end is None:
            doc["selection"] = None
        else:
            length = len(doc.get("text") or "")
            start = max(0, min(int(start), length))
            end = max(start, min(int(end), length))
            doc["selection"] = {"start": start, "end": end} if end > start else None
        _write(store)
        return _public(doc)


def restore_version(document_id: str, index: int) -> dict:
    with _LOCK:
        store = _read()
        doc = _require(store, document_id)
        versions = doc.get("versions") or []
        if index < 0 or index >= len(versions):
            raise DocumentError("unknown version")
        doc["version_index"] = index
        doc["text"] = versions[index].get("text") or ""
        doc["updated_at"] = _now()
        _write(store)
        saved = _public(doc)
    _sync_link(doc)
    return saved


def apply_document_event(document_id: str, event: dict) -> dict:
    """Apply one explicit document event. Comment leaves the text unchanged."""
    kind = str((event or {}).get("type") or "")
    if kind == "comment":
        doc = get_document(document_id)
        return {"document": doc, "comment": str(event.get("text") or ""), "changed": False}
    if kind != "apply":
        raise DocumentError("unknown document event")
    scope = str(event.get("scope") or "document")
    incoming = event.get("text")
    if not isinstance(incoming, str):
        raise DocumentError("apply requires text")
    source = str(event.get("source") or "agent")
    if source not in {"user", "agent", "shortcut", "fixture"}:
        source = "agent"
    with _LOCK:
        store = _read()
        doc = _require(store, document_id)
        current = doc.get("text") or ""
        if scope == "selection":
            selection = event.get("selection") if isinstance(event.get("selection"), dict) else doc.get("selection")
            if not isinstance(selection, dict):
                raise DocumentError("selection is required")
            start = max(0, min(int(selection.get("start") or 0), len(current)))
            end = max(start, min(int(selection.get("end") or 0), len(current)))
            if end <= start:
                raise DocumentError("selection is empty")
            updated = current[:start] + incoming + current[end:]
            doc["selection"] = {"start": start, "end": start + len(incoming)}
        else:
            updated = incoming
            doc["selection"] = None
        if len(updated) > 200_000:
            raise DocumentError("document is too long")
        _push_version(doc, updated, source)
        _write(store)
        saved = _public(doc)
    _sync_link(doc)
    return {"document": saved, "changed": True}


def link_document(document_id: str, creative_id: str) -> dict:
    creative_id = (creative_id or "").strip()
    if not re.fullmatch(r"[a-f0-9]{12}", creative_id):
        raise DocumentError("invalid creative id")
    with _LOCK:
        store = _read()
        doc = _require(store, document_id)
        doc["creative_id"] = creative_id
        doc["updated_at"] = _now()
        _write(store)
        saved = _public(doc)
    from api.creative_studio import add_project_link

    add_project_link(creative_id, doc.get("kind") or "document", doc["id"], doc.get("title") or "Untitled")
    return saved


def clone_document(document_id: str, creative_id: str) -> dict | None:
    """A duplicated creative gets its own document body."""
    try:
        source = get_document(document_id)
    except DocumentError:
        return None
    return create_document(
        source["session_id"],
        title=source["title"],
        text=source["text"],
        kind=source["kind"],
        creative_id=creative_id,
        link=False,
    )


def _binding(value) -> tuple[str, str]:
    project_id = ""
    profile = ""
    if isinstance(value, str):
        project_id = value.strip()
    elif isinstance(value, dict):
        project_id = str(value.get("project_id") or "").strip()
        profile = str(value.get("profile") or "").strip()
    if not re.fullmatch(r"[a-f0-9]{12}", project_id):
        return "", ""
    profile = re.sub(r"[^A-Za-z0-9._-]+", "_", profile).strip("._")[:80]
    return project_id, profile


def attach_creative(session_id: str, project_id: str, profile: str | None = None) -> dict:
    session_id = _session(session_id)
    project_id = (project_id or "").strip()
    if project_id and not re.fullmatch(r"[a-f0-9]{12}", project_id):
        raise DocumentError("invalid creative id")
    bound_profile = ""
    if project_id:
        from api.creative_studio import locate_project
        from api.profiles import get_active_profile_name

        bound_profile, _project = locate_project(project_id, profile or get_active_profile_name())
    with _LOCK:
        store = _read()
        if project_id:
            store["session_creative"][session_id] = {
                "project_id": project_id,
                "profile": bound_profile,
            }
        else:
            store["session_creative"].pop(session_id, None)
        _write(store)
    return {"session_id": session_id, "creative_id": project_id, "profile": bound_profile}


def attached_creative(session_id: str) -> tuple[str, str]:
    try:
        session_id = _session(session_id)
    except DocumentError:
        return "", ""
    with _LOCK:
        value = _read()["session_creative"].get(session_id)
    return _binding(value)


def attached_creative_id(session_id: str) -> str:
    return attached_creative(session_id)[0]


def clear_creative_bindings(project_id: str) -> None:
    with _LOCK:
        store = _read()
        store["session_creative"] = {
            key: value
            for key, value in store["session_creative"].items()
            if _binding(value)[0] != project_id
        }
        for doc in store["documents"].values():
            if isinstance(doc, dict) and doc.get("creative_id") == project_id:
                doc["creative_id"] = ""
        _write(store)


def _fit_creative_prompt(header: list[str], body: list[str]) -> str:
    head = "\n".join(line for line in header if line).strip()
    rest = "\n".join(line for line in body if line).strip()
    text = head if not rest else head + "\n" + rest
    if len(text) <= _CREATIVE_CAP:
        return text
    room = _CREATIVE_CAP - len(head) - 2
    if room < 80:
        return head[: _CREATIVE_CAP - 1].rstrip() + "…"
    return head + "\n" + rest[: room - 1].rstrip() + "…"


def _creative_lines(project_id: str, profile: str | None = None) -> str:
    from api.creative_studio import locate_project

    _slug, project = locate_project(project_id, profile)
    header = [
        f"Attached creative: {project.get('name') or 'Untitled'} ({project_id}).",
        "This attached creative is the product for this conversation. "
        "Use its selected values. Do not ask which product to write about.",
    ]
    product = ((project.get("stages") or {}).get("brief") or {}).get("fields", {}).get("product_offer", {})
    product_text = (product.get("text") or "").strip() if isinstance(product, dict) else ""
    if product_text:
        header.append(f"Product: {product_text}")
    header.append(
        "These are selected creative values. A document edit does not change them. "
        "Use update_creative_field or save_creative_proposal only when the user asks to change a field."
    )
    body = []
    for stage, fields in (project.get("stages") or {}).items():
        slots = (fields or {}).get("fields") or {}
        if not isinstance(slots, dict):
            continue
        for name, slot in slots.items():
            if not isinstance(slot, dict):
                continue
            text = (slot.get("text") or "").strip()
            if text:
                body.append(f"{stage}.{name}: {text}")
    note = project.get("product_note") or {}
    excerpt = (note.get("excerpt") or "").strip() if isinstance(note, dict) else ""
    if excerpt:
        body.append("Product profile:\n" + excerpt)
    return _fit_creative_prompt(header, body)


def document_ephemeral_context(session_id: str, profile: str | None = None) -> str:
    try:
        session_id = _session(session_id)
    except DocumentError:
        return ""
    parts = []
    try:
        from api.creative_studio import studio_ephemeral_context

        studio_bound = bool(studio_ephemeral_context(session_id, profile=profile))
    except Exception:
        studio_bound = False
    creative_id, bound_profile = attached_creative(session_id)
    if studio_bound:
        creative_id = ""
    if creative_id:
        try:
            parts.append(_creative_lines(creative_id, bound_profile or profile))
        except Exception:
            parts.append(f"Attached creative id: {creative_id}.")
    document_id = active_document_id(session_id)
    if document_id:
        try:
            doc = get_document(document_id)
        except DocumentError:
            doc = None
        if doc:
            text = doc.get("text") or ""
            excerpt = text if len(text) <= _EXCERPT else text[: _EXCERPT - 1].rstrip() + "…"
            selection = doc.get("selection") or {}
            selected = ""
            if selection:
                selected = text[int(selection.get("start") or 0):int(selection.get("end") or 0)]
            parts.append(
                "\n".join([
                    f'Open document {doc["id"]} "{doc.get("title") or "Untitled"}".',
                    "The conversation directs the work. This document contains the work.",
                    "A question or opinion about the document is a normal reply. Do not edit it.",
                    "An edit instruction replaces the selected passage when one is selected, otherwise the whole document.",
                    "Call apply_chat_document with the full replacement text. Call open_chat_document to start a new document.",
                    f"Selection: {selected}" if selected else "Selection: none",
                    "Document:",
                    excerpt or "(empty)",
                ])
            )
    return "\n\n".join(part for part in parts if part).strip()


def append_document_ephemeral(prompt: str, session_id: str, profile: str | None = None) -> str:
    try:
        extra = document_ephemeral_context(session_id, profile=profile)
    except Exception:
        return prompt or ""
    base = prompt or ""
    if not extra:
        return base
    if not base:
        return extra
    return base + "\n\n" + extra


def _http(handler, fn):
    from api.helpers import bad, j

    try:
        return j(handler, fn())
    except DocumentError as exc:
        return j(handler, {"error": str(exc)}, status=exc.status)
    except Exception:
        return bad(handler, "document request failed", status=500)


def handle_document_get(handler, parsed):
    path = parsed.path
    if path == "/api/chat-documents/fixtures":
        return _http(handler, lambda: {"enabled": fixtures_enabled()})
    from urllib.parse import parse_qs
    qs = {key: values[-1] for key, values in parse_qs(parsed.query or "").items()}
    if path == "/api/chat-documents":
        return _http(handler, lambda: list_documents(qs.get("session_id") or ""))
    if path == "/api/chat-bindings":
        session_id = qs.get("session_id") or ""
        return _http(handler, lambda: {
            "session_id": _session(session_id),
            "creative_id": attached_creative_id(session_id),
            "active_document_id": active_document_id(session_id),
        })
    prefix = "/api/chat-documents/"
    if not path.startswith(prefix):
        return False
    document_id = path[len(prefix):].split("/", 1)[0]
    if path != prefix + document_id:
        return False
    return _http(handler, lambda: get_document(document_id))


def handle_document_post(handler, parsed, body: dict):
    path = parsed.path
    body = body or {}
    if path == "/api/chat-documents":
        return _http(handler, lambda: create_document(
            body.get("session_id") or "",
            title=body.get("title") or "",
            text=body.get("text") or "",
            kind=body.get("kind") or "document",
            creative_id=body.get("creative_id") or "",
        ))
    if path == "/api/chat-bindings":
        return _http(handler, lambda: attach_creative(
            body.get("session_id") or "",
            body.get("project_id") or "",
        ))
    prefix = "/api/chat-documents/"
    if not path.startswith(prefix):
        return False
    rest = path[len(prefix):]
    document_id, _, tail = rest.partition("/")
    if tail == "text":
        return _http(handler, lambda: save_user_text(
            document_id, body.get("text") if body.get("text") is not None else "", body.get("title"),
        ))
    if tail == "selection":
        return _http(handler, lambda: set_selection(document_id, body.get("start"), body.get("end")))
    if tail == "events":
        return _http(handler, lambda: apply_document_event(document_id, body))
    if tail == "restore":
        return _http(handler, lambda: restore_version(document_id, int(body.get("index") or 0)))
    if tail == "focus":
        return _http(handler, lambda: focus_document(document_id))
    if tail == "link":
        return _http(handler, lambda: link_document(document_id, body.get("project_id") or ""))
    return False
