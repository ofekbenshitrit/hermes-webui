"""Session documents and creative attachment, without a live model."""

import base64
import io
import json
from urllib.parse import urlparse

import pytest


PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


@pytest.fixture()
def docs(tmp_path, monkeypatch):
    import api.config as config
    import api.profiles as profiles

    monkeypatch.setattr(config, "STATE_DIR", tmp_path)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "creative-test")
    import api.chat_documents as documents
    import api.creative_studio as studio

    return documents, studio


def test_manual_edit_versions_and_selection_apply(docs):
    documents, _studio = docs
    created = documents.create_document("sess_docs_1", title="Proposal", text="Keep this sentence. And this one.")
    saved = documents.save_user_text(created["id"], "Keep this sentence. And this one.\n")
    assert saved["version_count"] == 2
    documents.set_selection(created["id"], 0, 18)
    applied = documents.apply_document_event(created["id"], {
        "type": "apply",
        "scope": "selection",
        "text": "Keep this line",
        "source": "agent",
        "selection": {"start": 0, "end": 18},
    })
    assert applied["changed"] is True
    assert applied["document"]["text"].startswith("Keep this line")
    assert "And this one." in applied["document"]["text"]
    comment = documents.apply_document_event(created["id"], {"type": "comment", "text": "Looks fine."})
    assert comment["changed"] is False
    assert comment["document"]["text"] == applied["document"]["text"]
    restored = documents.restore_version(created["id"], 0)
    assert restored["text"] == "Keep this sentence. And this one."


def test_attached_creative_is_prompt_context_and_not_a_field_write(docs):
    documents, studio = docs
    project = studio.create_project("Spring", "Trail shoes")
    studio.update_field(project["id"], "who", "segment", "Weekend runners", author="user")
    studio.save_proposal(project["id"], "who", "segment", "Not selected yet")
    documents.attach_creative("sess_docs_2", project["id"])
    prompt = documents.document_ephemeral_context("sess_docs_2")
    assert "Spring" in prompt
    assert "Weekend runners" in prompt
    assert "Not selected yet" not in prompt
    assert "update_creative_field" in prompt
    documents.attach_creative("sess_docs_2", "")
    assert documents.document_ephemeral_context("sess_docs_2") == ""
    assert studio.get_project(project["id"])["stages"]["who"]["fields"]["segment"]["text"] == "Weekend runners"


def test_attached_creative_is_read_from_its_own_profile(docs, monkeypatch):
    documents, studio = docs
    import api.profiles as profiles

    project = studio.create_project("PA - 01", "Shoulder Sensiteq")
    studio.update_field(project["id"], "who", "segment", "Weekend runners", author="user")
    documents.attach_creative("sess_docs_profile", project["id"])
    assert documents.attached_creative("sess_docs_profile") == (project["id"], "creative-test")
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "default")
    prompt = documents.document_ephemeral_context("sess_docs_profile", profile="default")
    assert "Shoulder Sensiteq" in prompt
    assert "Weekend runners" in prompt
    assert "Do not ask which product" in prompt
    assert "Not selected yet" not in prompt


def test_legacy_creative_binding_is_found_when_the_worker_profile_differs(docs, monkeypatch):
    documents, studio = docs
    import api.profiles as profiles

    project = studio.create_project("PA - 01", "CraveShield")
    with documents._LOCK:
        store = documents._read()
        store["session_creative"]["sess_docs_legacy"] = project["id"]
        documents._write(store)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "default")
    prompt = documents.document_ephemeral_context("sess_docs_legacy", profile="default")
    assert "CraveShield" in prompt
    assert documents.attached_creative_id("sess_docs_legacy") == project["id"]


def test_linking_a_document_shows_on_the_creative_without_changing_fields(docs):
    documents, studio = docs
    project = studio.create_project("Launch")
    studio.update_field(project["id"], "hook", "final_hook", "Stay", author="user")
    created = documents.create_document("sess_docs_3", title="Notes", text="Hello")
    linked = documents.link_document(created["id"], project["id"])
    fresh = studio.get_project(project["id"])
    assert fresh["stages"]["hook"]["fields"]["final_hook"]["text"] == "Stay"
    assert any(row["ref"] == linked["id"] and row["kind"] == "document" for row in fresh["links"])
    documents.save_user_text(linked["id"], "Hello there", title="Notes revised")
    titled = studio.get_project(project["id"])
    assert titled["links"][0]["title"] == "Notes revised"
    assert titled["stages"]["hook"]["fields"]["final_hook"]["text"] == "Stay"


def test_duplicate_copies_document_body_and_image(docs):
    documents, studio = docs
    project = studio.create_project("Original")
    created = documents.create_document("sess_docs_4", title="Script", text="Body A", kind="script", creative_id=project["id"])
    studio.save_project_image(project["id"], "Frame", "image/png", base64.b64encode(PNG).decode("ascii"))
    copy = studio.duplicate_project(project["id"])
    assert copy["id"] != project["id"]
    refs = {row["ref"] for row in copy["links"]}
    assert created["id"] not in refs
    script = next(row for row in copy["links"] if row["kind"] == "script")
    assert documents.get_document(script["ref"])["text"] == "Body A"
    image = next(row for row in copy["links"] if row["kind"] == "image")
    data, media = studio.read_project_image(copy["id"], image["ref"])
    assert data == PNG
    assert media == "image/png"


def test_delete_clears_the_chat_binding_and_keeps_the_document(docs):
    documents, studio = docs
    project = studio.create_project("Gone")
    created = documents.create_document("sess_docs_5", title="Keep", text="Still here", creative_id=project["id"])
    documents.attach_creative("sess_docs_5", project["id"])
    studio.delete_project(project["id"])
    assert documents.attached_creative_id("sess_docs_5") == ""
    assert documents.get_document(created["id"])["text"] == "Still here"
    assert documents.get_document(created["id"])["creative_id"] == ""


def test_document_http_round_trip(docs, monkeypatch):
    from api.routes import handle_get, handle_post

    documents, _studio = docs
    monkeypatch.setattr("api.routes._check_csrf", lambda handler: True)
    monkeypatch.setattr("api.routes._guard_request_session_visibility", lambda *args, **kwargs: True)

    class Handler:
        def __init__(self, body=b""):
            self.status = None
            self.body = bytearray()
            self.wfile = self
            self.rfile = io.BytesIO(body)
            self.headers = {"Content-Length": str(len(body)), "Host": "127.0.0.1"}

        def send_response(self, status):
            self.status = status

        def send_header(self, name, value):
            pass

        def end_headers(self):
            pass

        def write(self, data):
            self.body.extend(data)

    payload = json.dumps({"session_id": "sess_docs_6", "title": "Draft", "text": "One"}).encode()
    writer = Handler(payload)
    assert handle_post(writer, urlparse("http://127.0.0.1/api/chat-documents"))
    created = json.loads(bytes(writer.body).decode())
    reader = Handler()
    assert handle_get(reader, urlparse("http://127.0.0.1/api/chat-documents/" + created["id"]))
    loaded = json.loads(bytes(reader.body).decode())
    assert loaded["text"] == "One"
    assert documents.get_document(created["id"])["title"] == "Draft"


def test_long_prose_reply_is_a_document_and_a_short_reply_is_not():
    import shutil
    import subprocess
    from pathlib import Path

    node = shutil.which("node")
    if not node:
        pytest.skip("node is required to check the document heuristic")
    script = Path("static/chat_documents.js").read_text()
    copy = "הנה מודעת לונג פורם.\n\n**רעיון לויזואל**\n\n" + ("משפט ארוך על המוצר. " * 40)
    copy += "\n\n**טקסט המודעה**\n\n" + ("עוד משפט של הקופי. " * 40)
    code = script + "\n" + (
        "const copy = " + json.dumps(copy) + ";\n"
        "if(!_looksLikeLongDocument(copy)) process.exit(2);\n"
        "if(_documentTitleFromText(copy) !== 'רעיון לויזואל') process.exit(3);\n"
        "if(_looksLikeLongDocument('איזה מוצר לכתוב?')) process.exit(4);\n"
        "if(_looksLikeLongDocument('```\\n' + 'x'.repeat(2000) + '\\n```')) process.exit(5);\n"
    )
    result = subprocess.run([node, "-e", code], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
