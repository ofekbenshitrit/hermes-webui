"""Creative Studio store, HTTP, and MCP invariants."""

import io
import json
import sys
from pathlib import Path
from urllib.parse import urlparse

import pytest


@pytest.fixture()
def studio(tmp_path, monkeypatch):
    import api.config as config
    import api.profiles as profiles

    real_get_profile = profiles.get_active_profile_name
    monkeypatch.setattr(config, "STATE_DIR", tmp_path)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "creative-test")
    import api.creative_studio as studio

    yield studio

    # mcp_server binds get_active_profile_name at first import. A studio test
    # that imports it while this fixture's patch is active must not leave
    # later tests stuck on creative-test.
    imported = sys.modules.get("mcp_server")
    if imported is not None and imported.get_active_profile_name is not real_get_profile:
        imported.get_active_profile_name = real_get_profile


def test_product_catalog_reads_names_from_notes(studio, tmp_path, monkeypatch):
    vault = tmp_path / "vault" / "Products"
    vault.mkdir(parents=True)
    (vault / "Trail Shoes.md").write_text("# Trail Shoes\nWaterproof upper.\n", encoding="utf-8")
    (vault / "index.md").write_text("not a product", encoding="utf-8")
    skills = tmp_path / "skills" / "brand" / "products"
    skills.mkdir(parents=True)
    (skills / "day-cream.md").write_text("rich product note", encoding="utf-8")
    monkeypatch.setattr(studio, "product_catalog_roots", lambda: [("obsidian", vault.parent), ("skills", tmp_path / "skills")])
    catalog = studio.list_known_products()
    names = [item["name"] for item in catalog["products"]]
    assert names == ["day cream", "Trail Shoes"]
    assert "Waterproof" not in json.dumps(catalog)
    created = studio.create_project("Launch", "Trail Shoes", str(vault / "Trail Shoes.md"))
    assert created["stages"]["brief"]["fields"]["product_offer"]["text"] == "Trail Shoes"
    assert created["product_source"].endswith("Trail Shoes.md")
    assert created["stages"]["brief"]["fields"]["product_facts"]["text"] == ""


def test_create_reopen_and_user_edit_round_trip(studio):
    created = studio.create_project("Spring", "Trail shoes")
    studio.update_field(created["id"], "who", "segment", "Weekend runners", author="user")
    reopened = studio.get_project(created["id"])
    assert reopened["name"] == "Spring"
    assert reopened["stages"]["brief"]["fields"]["product_offer"]["text"] == "Trail shoes"
    segment = reopened["stages"]["who"]["fields"]["segment"]
    assert segment["text"] == "Weekend runners"
    assert segment["author"] == "user"
    assert segment["proposals"] == []


def test_proposals_do_not_replace_the_selected_value_until_accept(studio):
    project = studio.create_project("Hooks")
    studio.update_field(project["id"], "hook", "final_hook", "Keep this", author="user")
    saved = studio.save_proposal(project["id"], "hook", "final_hook", "Try that")
    assert saved["selected_unchanged"] is True
    dismissed = studio.dismiss_proposal(project["id"], saved["proposal"]["id"])
    assert dismissed["selected"] == "Keep this"
    again = studio.save_proposal(project["id"], "hook", "final_hook", "Option two")
    alt = studio.save_alternative(project["id"], again["proposal"]["id"])
    assert alt["selected"] == "Keep this"
    third = studio.save_proposal(project["id"], "hook", "final_hook", "Option three")
    accepted = studio.accept_proposal(project["id"], third["proposal"]["id"])
    assert accepted["value"] == "Option three"
    assert accepted["proposal_status"] == "accepted"
    edited = studio.save_proposal(project["id"], "hook", "final_hook", "Option four")
    changed = studio.edit_accept_proposal(project["id"], edited["proposal"]["id"], "Option four, edited")
    assert changed["value"] == "Option four, edited"
    assert changed["proposal_status"] == "edited_accepted"
    current = studio.get_project(project["id"], stage="hook", field="final_hook")
    assert current["data"]["text"] == "Option four, edited"


def test_selecting_one_of_several_alternatives(studio):
    project = studio.create_project("Angles")
    studio.update_field(project["id"], "what", "angle", "Original angle", author="user")
    first = studio.save_proposal(project["id"], "what", "angle", "Alt A")
    second = studio.save_proposal(project["id"], "what", "angle", "Alt B")
    studio.save_alternative(project["id"], first["proposal"]["id"])
    studio.save_alternative(project["id"], second["proposal"]["id"])
    selected = studio.select_alternative(project["id"], second["proposal"]["id"])
    assert selected["value"] == "Alt B"
    stored = studio.get_project(project["id"], field="angle")
    statuses = {item["id"]: item["status"] for item in stored["data"]["proposals"]}
    assert statuses[first["proposal"]["id"]] == "alternative"
    assert statuses[second["proposal"]["id"]] == "alternative"


def test_upstream_edit_preserves_downstream_and_flags_review(studio):
    project = studio.create_project("Cascade")
    studio.update_field(project["id"], "who", "segment", "First segment", author="user")
    studio.update_field(project["id"], "hook", "final_hook", "Do not erase", author="user")
    result = studio.update_field(project["id"], "who", "segment", "Second segment", author="user")
    assert "hook" in result["review_recommended"]
    hook = studio.get_project(project["id"], stage="hook")
    assert hook["data"]["fields"]["final_hook"]["text"] == "Do not erase"
    assert hook["data"]["status"] == "review_recommended"


def test_ambiguous_name_does_not_write(studio):
    studio.create_project("Same")
    studio.create_project("Same")
    with pytest.raises(studio.StudioError) as raised:
        studio.get_project(name="Same")
    assert raised.value.status == 409
    assert len(raised.value.payload["candidates"]) == 2
    with pytest.raises(studio.StudioError):
        studio._resolve(name="Same")


def test_export_claim_labels_and_optional_alternatives(studio):
    project = studio.create_project("Export")
    studio.update_field(
        project["id"], "what", "mechanism", "This supplement cures diabetes", author="user"
    )
    slot = studio.get_project(project["id"], field="mechanism")["data"]
    assert slot["claim"] == "needs_verification"
    assert slot["text"] == "This supplement cures diabetes"
    assert "studies show" not in slot["text"]
    proposal = studio.save_proposal(project["id"], "what", "mechanism", "Unused alternative")
    studio.save_alternative(project["id"], proposal["proposal"]["id"])
    quiet = studio.export_markdown(project["id"], include_alternatives=False)
    assert "needs_verification" in quiet["markdown"]
    assert "Unused alternative" not in quiet["markdown"]
    assert "does not certify" in quiet["markdown"]
    loud = studio.export_markdown(project["id"], include_alternatives=True)
    assert "Unused alternative" in loud["markdown"]


def test_summary_confirmation_does_not_copy_assumptions_into_facts(studio):
    project = studio.create_project("Brief")
    studio.update_field(project["id"], "brief", "product_facts", "Waterproof", author="user")
    studio.confirm_brief_summary(project["id"], "Waterproof", "Maybe for trails", "Price missing")
    facts = studio.get_project(project["id"], field="product_facts")["data"]["text"]
    assert facts == "Waterproof"
    assumptions = studio.get_project(project["id"], field="summary_assumptions")["data"]["text"]
    assert assumptions == "Maybe for trails"


def test_decision_note_leaves_the_field_alone(studio):
    project = studio.create_project("Notes")
    studio.update_field(project["id"], "who", "facet", "Night shift", author="user")
    noted = studio.record_decision(project["id"], "who", "facet", "Keep discussing option two")
    assert noted["selected_unchanged"] is True
    assert studio.get_project(project["id"], field="facet")["data"]["text"] == "Night shift"


def test_suggestion_context_lists_missing_dependencies(studio):
    project = studio.create_project("Context", "Mug")
    view = studio.get_project(project["id"], field="segment", for_suggestion=True)
    assert "who.outcome" in view["missing"]
    assert any(item["field"] == "product_offer" for item in view["context"]["brief"])


def test_http_get_and_accept_match_the_store(studio, monkeypatch):
    from api.routes import handle_get, handle_post

    monkeypatch.setattr("api.routes._check_csrf", lambda handler: True)
    monkeypatch.setattr("api.routes._guard_request_session_visibility", lambda *args, **kwargs: True)
    project = studio.create_project("HTTP")
    proposal = studio.save_proposal(project["id"], "casts", "conceit", "One room, one lamp")

    class Handler:
        def __init__(self, body=b""):
            self.status = None
            self.body = bytearray()
            self.wfile = self
            self.rfile = io.BytesIO(body)
            self.headers = {"Content-Length": str(len(body)), "Host": "127.0.0.1"}
            self.request = None
            self.client_address = ("127.0.0.1", 0)

        def send_response(self, status):
            self.status = status

        def send_header(self, name, value):
            pass

        def end_headers(self):
            pass

        def write(self, data):
            self.body.extend(data)

    reader = Handler()
    assert handle_get(reader, urlparse(f"http://127.0.0.1/api/creative-studio/projects/{project['id']}"))
    loaded = json.loads(bytes(reader.body).decode("utf-8"))
    assert loaded["stages"]["casts"]["fields"]["conceit"]["text"] == ""

    payload = json.dumps({"action": "accept"}).encode("utf-8")
    writer = Handler(payload)
    path = f"/api/creative-studio/projects/{project['id']}/proposals/{proposal['proposal']['id']}"
    assert handle_post(writer, urlparse("http://127.0.0.1" + path))
    accepted = json.loads(bytes(writer.body).decode("utf-8"))
    assert writer.status == 200
    assert accepted["value"] == "One room, one lamp"
    assert studio.get_project(project["id"], field="conceit")["data"]["text"] == "One room, one lamp"


def test_mcp_read_and_accept_use_the_same_store(studio, monkeypatch):
    import asyncio

    import mcp_server

    monkeypatch.setattr(mcp_server, "_api_post", lambda endpoint, body: {"error": "API unreachable: test"})
    project = studio.create_project("MCP")
    proposal = studio.save_proposal(project["id"], "copy", "pain", "Cold mornings")

    async def _run():
        listed = await mcp_server.handle_get_creative_project({"project_id": project["id"], "field": "pain"})
        accepted = await mcp_server.handle_accept_creative_proposal({
            "project_id": project["id"],
            "proposal_id": proposal["proposal"]["id"],
        })
        return listed, accepted

    listed, accepted = asyncio.run(_run())
    read_payload = json.loads(listed[0].text)
    accept_payload = json.loads(accepted[0].text)
    assert read_payload["data"]["text"] == ""
    assert accept_payload["value"] == "Cold mornings"
    assert studio.get_project(project["id"], field="pain")["data"]["text"] == "Cold mornings"


def test_static_panel_wires_stage_switch_proposals_and_export():
    root = Path(__file__).resolve().parents[1]
    html = (root / "static" / "index.html").read_text(encoding="utf-8")
    panels = (root / "static" / "panels.js").read_text(encoding="utf-8")
    script = (root / "static" / "creative_studio.js").read_text(encoding="utf-8")
    assert 'id="panelCreative"' in html
    assert 'id="mainCreative"' in html
    assert "'creative'" in panels.split("const MAIN_VIEW_PANELS =", 1)[1].split("];", 1)[0]
    assert "loadCreativeStudio" in panels
    assert "function creativeNewProject" in script
    assert "function creativeSubmitCreate" in script
    assert "Creative name" in script
    assert "creativeCreateProduct" in script
    assert "CREATIVE_CREATE_FIELDS" not in script
    assert "window.prompt('Project name')" not in script
    assert "function creativeSetStage" in script
    assert "function creativeProposalAction" in script
    assert "function creativeReleaseChat" in script
    assert "function creativeIsolateField" in script
    assert 'id="creativeChatMount"' in script
    assert "creative-chat-tabs" in script
    assert "function creativeNewChatTab" in script
    assert "function creativeCloseChat" in script
    assert "function creativeToggleWorkspacePanel" in script
    assert "Workspace panel" in script
    assert "preserveHome:true" in script
    assert "/chat-session" in script
    assert "/api/projects/create" in script
    assert "/chat-focus" in script
    assert "function creativeSendChat" not in script
    assert "EventSource" not in script
    assert "/api/creative-studio/chat" not in script
    assert "Suggest directions" not in script
    assert "function creativeExport" in script
    assert "function creativeCopyExport" in script
    assert "Nothing is selected for you until you replace a field." in script
    assert ">Replace</button>" in script
    sessions = (root / "static" / "sessions.js").read_text(encoding="utf-8")
    assert "opts.preserveHome" in sessions
    streaming = (root / "api" / "streaming.py").read_text(encoding="utf-8")
    call = streaming.index("agent.ephemeral_system_prompt = _webui_ephemeral_system_prompt(")
    assert streaming.index("append_studio_ephemeral(", call) > call
    assert "profile=_resolved_profile_name" in streaming[call:]
    discover = streaming.index("discover_mcp_tools()")
    assert streaming.rindex("prepare_studio_mcp(", 0, discover) < discover
    assert "with_studio_toolset" in streaming
    gateway = (root / "api" / "gateway_chat.py").read_text(encoding="utf-8")
    assert 'profile=getattr(s, "profile", None)' in gateway
    assert "prepare_studio_mcp(" in gateway


def test_studio_prompt_pack_includes_the_product_note_and_framework(studio, tmp_path, monkeypatch):
    vault = tmp_path / "Products"
    vault.mkdir()
    (vault / "Trail Shoes.md").write_text("Cushioned daily trainer. No carbon plate.", encoding="utf-8")
    monkeypatch.setattr(studio, "product_catalog_roots", lambda: [("obsidian", vault)])
    project = studio.create_project("Run", "Trail Shoes", product_source=str(vault / "Trail Shoes.md"))
    pack = studio.studio_prompt_pack(project["id"], "what")
    assert "Cushioned daily trainer" in pack["product_note"]
    assert "concept:" in pack["framework"]
    assert "Unique mechanism" in pack["framework"]


def test_studio_chat_tab_binds_one_agent_session(studio):
    project = studio.create_project("Bound", "Mug")
    opened = studio.create_chat_thread(project["id"])
    bound = studio.bind_chat_session(project["id"], opened["active_thread"], "sess_studio_1")
    match = next(row for row in bound["threads"] if row["id"] == opened["active_thread"])
    assert match["session_id"] == "sess_studio_1"
    again = studio.bind_chat_session(project["id"], opened["active_thread"], "sess_studio_1")
    assert next(row for row in again["threads"] if row["id"] == opened["active_thread"])["session_id"] == "sess_studio_1"
    try:
        studio.bind_chat_session(project["id"], opened["active_thread"], "sess_studio_2")
    except studio.StudioError as exc:
        assert "already" in str(exc)
    else:
        raise AssertionError("expected a second session to be rejected")
    copy = studio.duplicate_project(project["id"])
    assert all(not row.get("session_id") for row in copy["threads"])


def test_each_chat_tab_keeps_its_own_session(studio):
    project = studio.create_project("Tabs", "Mug")
    studio.bind_scope_session(project["id"], "sess_tab_1", stage="who")
    opened = studio.create_chat_thread(project["id"])
    studio.bind_chat_session(project["id"], opened["active_thread"], "sess_tab_2")
    stored = studio.get_project(project["id"])
    assert stored["chat_session_id"] == "sess_tab_2"
    assert studio.lookup_studio_session("sess_tab_1")["scope"] == "project"
    assert studio.lookup_studio_session("sess_tab_2")["scope"] == "project"
    studio.activate_chat_thread(project["id"], stored["threads"][0]["id"])
    assert studio.get_project(project["id"])["chat_session_id"] == "sess_tab_1"
    text = studio.studio_ephemeral_context("sess_tab_1")
    assert "Product: Mug" in text
    assert "Selected stage: who" in text


def test_new_project_stores_the_creative_without_a_chat_tab(studio):
    project = studio.create_project("Plain", "Trail Shoes")
    assert project["threads"] == []
    assert project["chat"] == []
    assert project["chat_session_id"] == ""


def test_legacy_project_without_chat_still_opens(studio):
    project = studio.create_project("Legacy")
    path = studio._store_path()
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw["projects"][project["id"]].pop("chat", None)
    path.write_text(json.dumps(raw), encoding="utf-8")
    loaded = studio.get_project(project["id"])
    assert loaded["chat"] == []
    assert "brief" in loaded["stages"]
    assert loaded["stages"]["who"]["fields"]["outcome"]["text"] == ""


def test_split_files_collapse_into_one_store(studio, tmp_path):
    legacy = tmp_path / "creative_studio" / "creative-test"
    legacy.mkdir(parents=True)
    project = studio._blank_project("Old")
    project["chat_session_id"] = "sess_old_store"
    (legacy / f"{project['id']}.json").write_text(json.dumps(project), encoding="utf-8")
    (legacy / "active.json").write_text(json.dumps({"project_id": project["id"]}), encoding="utf-8")
    (legacy / "session-index.json").write_text("{}", encoding="utf-8")
    loaded = studio.get_project(project["id"])
    assert loaded["name"] == "Old"
    assert studio.get_active_project_id() == project["id"]
    assert studio.lookup_studio_session("sess_old_store")["scope"] == "project"
    store_path = tmp_path / "creative_studio" / "creative-test.json"
    assert store_path.is_file()
    assert not legacy.exists()
    second = studio.create_project("Second")
    files = [path for path in (tmp_path / "creative_studio").rglob("*") if path.is_file()]
    assert [path.name for path in files] == ["creative-test.json"]
    stored = json.loads(store_path.read_text(encoding="utf-8"))
    assert set(stored["projects"]) == {project["id"], second["id"]}


def test_scope_sessions_stay_separate_and_duplicate_clears_them(studio):
    project = studio.create_project("Bound", "Mug")
    project_chat = studio.bind_scope_session(project["id"], "sess_project_1")
    assert project_chat["chat_session_id"] == "sess_project_1"
    again = studio.bind_scope_session(project["id"], "sess_project_1")
    assert again["session_id"] == "sess_project_1"
    with pytest.raises(studio.StudioError):
        studio.bind_scope_session(project["id"], "sess_project_2")
    field_chat = studio.bind_scope_session(
        project["id"], "sess_field_outcome", scope="field", stage="who", field="outcome"
    )
    assert field_chat["scope"] == "field"
    assert field_chat["field"] == "outcome"
    stored = studio.get_project(project["id"])
    assert stored["chat_session_id"] == "sess_project_1"
    assert stored["stages"]["who"]["fields"]["outcome"]["chat_session_id"] == "sess_field_outcome"
    assert studio.lookup_studio_session("sess_field_outcome")["scope"] == "field"
    assert studio.lookup_studio_session("missing_session_id") is None
    copy = studio.duplicate_project(project["id"])
    assert copy["chat_session_id"] == ""
    assert "chat_session_id" not in copy["stages"]["who"]["fields"]["outcome"]
    assert all(not row.get("session_id") for row in copy["threads"])


def test_field_context_puts_the_field_first_and_leaves_other_chats_alone(studio, tmp_path, monkeypatch):
    vault = tmp_path / "Products"
    vault.mkdir()
    (vault / "Trail Shoes.md").write_text("Cushioned daily trainer.", encoding="utf-8")
    monkeypatch.setattr(studio, "product_catalog_roots", lambda: [("obsidian", vault)])
    project = studio.create_project("Run", "Trail Shoes", product_source=str(vault / "Trail Shoes.md"))
    studio.update_field(project["id"], "who", "segment", "Night bakers", author="user")
    studio.update_field(project["id"], "what", "concept", "Quiet mornings", author="user")
    studio.bind_scope_session(project["id"], "sess_project_ctx")
    studio.bind_scope_session(project["id"], "sess_field_ctx", scope="field", stage="who", field="segment")
    field_prompt = studio.studio_ephemeral_context("sess_field_ctx")
    assert "Cushioned daily trainer" in field_prompt
    assert "who.segment: Night bakers" in field_prompt
    assert "This conversation is only this field." in field_prompt
    assert field_prompt.index("who.segment: Night bakers") < field_prompt.index("Other fields, for reference only")
    rest = field_prompt.split("Other fields, for reference only", 1)[1]
    assert "what.concept: Quiet mornings" in rest
    assert "who.segment:" not in rest
    assert "Do not rewrite other fields" in field_prompt
    project_prompt = studio.studio_ephemeral_context("sess_project_ctx")
    assert "This conversation is the whole project." in project_prompt
    assert f"You are the Creative Studio assistant for project {project['id']}" in project_prompt
    assert "whose name ends with save_creative_proposal" in project_prompt
    assert "No field is selected." in project_prompt
    assert "Choose the stage and field you think each part belongs in, and save it there." in project_prompt
    assert "The draft belongs in those proposals, not in the chat." in project_prompt
    assert "update_creative_field" in project_prompt
    assert "hook: hook_type, visual_hook, verbal_hook" in project_prompt
    assert "Do not edit the project store any other way" in project_prompt
    assert "save_creative_proposal" in field_prompt
    assert "who.segment: Night bakers" in project_prompt
    assert studio.studio_ephemeral_context("not_a_studio_session") == ""
    shared = "WebUI session context:\n- shared"
    assert studio.append_studio_ephemeral(shared, "not_a_studio_session") == shared
    appended = studio.append_studio_ephemeral(shared, "sess_field_ctx")
    assert appended.startswith(shared + "\n\n")
    assert "who.segment: Night bakers" in appended


def test_context_uses_the_session_profile_and_names_the_selection(studio, monkeypatch):
    import api.profiles as profiles

    project = studio.create_project("Run", "Trail Shoes")
    studio.update_field(project["id"], "who", "outcome", "Fewer blisters", author="user")
    studio.bind_scope_session(project["id"], "sess_who_ctx", stage="who")
    focused = studio.set_chat_focus(project["id"], "sess_who_ctx", stage="who", field="outcome")
    assert focused == {"session_id": "sess_who_ctx", "scope": "project", "stage": "who", "field": "outcome"}
    studio.bind_scope_session(
        project["id"], "sess_who_field", scope="field", stage="who", field="outcome"
    )
    studio.update_field(project["id"], "who", "segment", "Night bakers", author="user")
    stored = studio.get_project(project["id"])
    assert stored["chat_stage"] == "who"
    assert stored["chat_field"] == "outcome"
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "default")
    assert studio.studio_ephemeral_context("sess_who_ctx") == ""
    text = studio.studio_ephemeral_context("sess_who_ctx", profile="creative-test")
    assert "Product: Trail Shoes" in text
    assert "Selected stage: who" in text
    assert "Selected field: outcome" in text
    assert text.index("who.outcome: Fewer blisters") < text.index("Other fields, for reference only")
    field_text = studio.studio_ephemeral_context("sess_who_field", profile="creative-test")
    assert "This conversation is only this field." in field_text
    assert "Selected field: outcome" in field_text
    assert "Product: Trail Shoes" in field_text


def test_legacy_thread_session_becomes_the_project_chat(studio):
    project = studio.create_project("Legacy tab")
    opened = studio.create_chat_thread(project["id"])
    studio.bind_chat_session(project["id"], opened["active_thread"], "sess_legacy_tab")
    loaded = studio.get_project(project["id"])
    assert loaded["chat_session_id"] == "sess_legacy_tab"
    assert studio.lookup_studio_session("sess_legacy_tab")["scope"] == "project"


def test_deleting_a_project_drops_its_session_index(studio):
    project = studio.create_project("Gone")
    studio.bind_scope_session(project["id"], "sess_gone_1")
    assert studio.lookup_studio_session("sess_gone_1")["project_id"] == project["id"]
    studio.delete_project(project["id"])
    assert studio.lookup_studio_session("sess_gone_1") is None


def test_studio_mcp_registers_on_the_session_profile(tmp_path, monkeypatch):
    import yaml

    import api.creative_studio as studio
    import api.profiles as profiles

    home = tmp_path / "copywriting"
    monkeypatch.setattr(profiles, "get_hermes_home_for_profile", lambda name: home)
    monkeypatch.setenv("HERMES_WEBUI_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.delenv("HERMES_WEBUI_PASSWORD", raising=False)
    assert studio.ensure_studio_mcp("copywriting") is True
    saved = yaml.safe_load((home / "config.yaml").read_text(encoding="utf-8"))
    entry = saved["mcp_servers"]["hermes-webui"]
    assert entry["args"][-2:] == ["--profile", "copywriting"]
    assert entry["args"][0].endswith("mcp_server.py")
    assert entry["enabled"] is True
    assert entry["env"]["HERMES_WEBUI_STATE_DIR"] == str(tmp_path / "state")
    assert entry["env"]["HERMES_HOME"] == str(home)
    assert "HERMES_WEBUI_PASSWORD" not in entry.get("env", {})
    assert studio.ensure_studio_mcp("copywriting") is False

    (home / "config.yaml").write_text(
        yaml.safe_dump({
            "mcp_servers": {
                "notes": {"command": "notes"},
                "hermes-webui": {
                    "command": sys.executable,
                    "args": [entry["args"][0], "--profile", "default"],
                    "enabled": False,
                    "env": {"HERMES_WEBUI_STATE_DIR": str(tmp_path / "state")},
                },
            }
        }),
        encoding="utf-8",
    )
    assert studio.ensure_studio_mcp("copywriting") is True
    repaired = yaml.safe_load((home / "config.yaml").read_text(encoding="utf-8"))
    assert repaired["mcp_servers"]["notes"]["command"] == "notes"
    own = repaired["mcp_servers"]["hermes-webui"]
    assert own["args"][-2:] == ["--profile", "copywriting"]
    assert own["enabled"] is False

    (home / "config.yaml").write_text(
        yaml.safe_dump({"mcp_servers": {"hermes-webui": {"url": "http://studio.example/mcp"}}}),
        encoding="utf-8",
    )
    assert studio.ensure_studio_mcp("copywriting") is False
    kept = yaml.safe_load((home / "config.yaml").read_text(encoding="utf-8"))
    assert kept["mcp_servers"]["hermes-webui"]["url"] == "http://studio.example/mcp"

    (home / "config.yaml").write_text("mcp_servers:\n- not-a-mapping\n", encoding="utf-8")
    assert studio.ensure_studio_mcp("copywriting") is False
    assert "not-a-mapping" in (home / "config.yaml").read_text(encoding="utf-8")


def test_prepare_studio_mcp_ignores_other_chats(studio, tmp_path, monkeypatch):
    import api.profiles as profiles

    home = tmp_path / "profile-home"
    monkeypatch.setattr(profiles, "get_hermes_home_for_profile", lambda name: home)
    assert studio.prepare_studio_mcp("not_a_studio_session", "creative-test") is False
    assert not (home / "config.yaml").exists()


def test_mcp_v2_tool_callable_passes_named_fields():
    pytest.importorskip("mcp", reason="mcp package not installed")
    import mcp_server

    seen = {}

    async def handler(arguments):
        seen.update(arguments)
        return [{"text": "saved"}]

    fn = mcp_server._tool_callable(
        "save_creative_proposal",
        {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "exploratory": {"type": "boolean"},
            },
            "required": ["project_id"],
        },
        handler,
    )

    async def _run():
        return await fn(project_id="abc", exploratory=True)

    import asyncio
    assert asyncio.run(_run()) == "saved"
    assert seen == {"project_id": "abc", "exploratory": True}

    class _Schema:
        input_schema = {"type": "object", "properties": {"project_id": {"type": "string"}}}

    assert mcp_server._tool_input_schema(_Schema())["properties"]["project_id"]["type"] == "string"

    listed = mcp_server._tool_callable(
        "save_creative_proposal",
        next(tool.inputSchema for tool in mcp_server.TOOLS if tool.name == "save_creative_proposal"),
        handler,
    )
    assert listed.__annotations__["stage"].__args__ == mcp_server._CREATIVE_STAGES

    nullable = mcp_server._tool_callable(
        "move_session",
        {
            "type": "object",
            "properties": {"project_id": {"type": ["string", "null"]}},
            "required": ["project_id"],
        },
        handler,
    )
    assert "project_id" in nullable.__annotations__


def test_creative_write_falls_back_on_the_bound_profile_when_unauthenticated(monkeypatch):
    pytest.importorskip("mcp", reason="mcp package not installed")
    from mcp.server import Server as mcp_server_type
    if not hasattr(mcp_server_type, "list_tools"):
        pytest.skip("mcp SDK does not provide the decorator API")
    import mcp_server
    import api.auth as auth

    monkeypatch.setattr(mcp_server, "_active_profile", lambda: "copywriting")
    monkeypatch.setattr(mcp_server, "_api_auth", lambda: None)
    monkeypatch.setattr(auth, "is_auth_enabled", lambda: False)
    header, err = mcp_server._request_cookie_header()
    assert err is None
    assert header == "hermes_profile=copywriting"

    monkeypatch.setattr(auth, "is_auth_enabled", lambda: True)
    called = {}

    def fallback():
        called["fell_back"] = True
        return {"saved": "copywriting"}

    monkeypatch.setattr(mcp_server, "_creative_store_call", lambda fn: fn())
    result = mcp_server._creative_write("/api/creative-studio/projects/p/fields", {}, fallback)
    assert called["fell_back"] is True
    assert result == {"saved": "copywriting"}
