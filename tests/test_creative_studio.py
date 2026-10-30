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


def test_field_review_flags_only_dependents(studio):
    project = studio.create_project("Deps")
    studio.update_field(project["id"], "copy", "pain", "Cold stairs", author="user")
    demo = studio.update_field(project["id"], "who", "demographic", "Night shift", author="user")
    assert all(item["field"] != "pain" for item in demo["review_fields"])
    assert not studio.get_project(project["id"], field="pain")["data"].get("needs_review")
    studio.update_field(project["id"], "hook", "final_hook", "Keep the line", author="user")
    studio.set_stage_status(project["id"], "hook", "approved")
    flagged = studio.update_field(project["id"], "what", "concept", "One quiet idea", author="user")
    assert {"stage": "hook", "field": "final_hook"} in flagged["review_fields"]
    hook = studio.get_project(project["id"], stage="hook")["data"]
    assert hook["fields"]["final_hook"]["text"] == "Keep the line"
    assert hook["fields"]["final_hook"]["needs_review"] is True
    assert hook["status"] == "review_recommended"
    studio.update_field(project["id"], "hook", "final_hook", "Keep the line.", author="user")
    cleared = studio.get_project(project["id"], stage="hook")["data"]
    assert cleared["fields"]["final_hook"]["text"] == "Keep the line."
    assert not cleared["fields"]["final_hook"].get("needs_review")
    assert cleared["status"] == "draft"


def test_handoff_omits_hook_process_and_full_keeps_it(studio):
    project = studio.create_project("Handoff")
    studio.update_field(project["id"], "hook", "final_hook", "Ship this line", author="user")
    studio.update_field(project["id"], "hook", "deep_fry", "Process draft", author="user")
    studio.update_field(project["id"], "copy", "pain", "Included pain", author="user")
    studio.update_field(project["id"], "copy", "promise", "Hidden promise", author="user", include=False)
    handoff = studio.export_markdown(project["id"], include_alternatives=True)
    assert handoff["mode"] == "handoff"
    assert "Ship this line" in handoff["markdown"]
    assert "Process draft" not in handoff["markdown"]
    assert "Included pain" in handoff["markdown"]
    assert "Hidden promise" not in handoff["markdown"]
    assert "Status:" not in handoff["markdown"]
    assert "Author:" not in handoff["markdown"]
    assert "_Empty._" not in handoff["markdown"]
    full = studio.export_markdown(project["id"], mode="full")
    assert "Process draft" in full["markdown"]
    assert "Status:" in full["markdown"]


def test_legacy_review_survives_a_missing_field(studio):
    project = studio.create_project("Legacy shape")
    studio.update_field(project["id"], "hook", "final_hook", "Keep", author="user")
    studio.set_stage_status(project["id"], "hook", "review_recommended")
    path = studio._store_path()
    payload = json.loads(path.read_text(encoding="utf-8"))
    del payload["projects"][project["id"]]["stages"]["casts"]["fields"]["format"]
    path.write_text(json.dumps(payload), encoding="utf-8")
    loaded = studio.get_project(project["id"])
    hook = loaded["stages"]["hook"]
    assert hook["status"] == "review_recommended"
    assert hook["fields"]["final_hook"]["text"] == "Keep"
    assert "needs_review" not in hook["fields"]["final_hook"]
    assert "format" not in hook["fields"]
    assert loaded["stages"]["casts"]["fields"]["format"]["text"] == ""
    assert "format" in studio.FIELDS["casts"] and "format" not in studio.FIELDS["hook"]


def test_format_saved_on_the_hook_moves_to_execution(studio):
    project = studio.create_project("Move format")
    path = studio._store_path()
    payload = json.loads(path.read_text(encoding="utf-8"))
    row = payload["projects"][project["id"]]
    row["stages"]["hook"]["fields"]["format"] = {
        "text": "UGC, 15s feed",
        "author": "user",
        "claim": "user_approved",
        "proposals": [{"id": "p_abc", "text": "Founder reel"}],
        "order": 9,
    }
    row["stages"]["casts"]["fields"]["format"]["text"] = ""
    row["stages"]["casts"]["fields"]["format"]["proposals"] = []
    path.write_text(json.dumps(payload), encoding="utf-8")
    loaded = studio.get_project(project["id"])
    assert "format" not in loaded["stages"]["hook"]["fields"]
    names = list(loaded["stages"]["casts"]["fields"])
    assert names.index("conceit") < names.index("format") < names.index("actors")
    moved = loaded["stages"]["casts"]["fields"]["format"]
    assert moved["text"] == "UGC, 15s feed"
    assert moved["proposals"][0]["text"] == "Founder reel"
    payload = json.loads(path.read_text(encoding="utf-8"))
    row = payload["projects"][project["id"]]
    row["stages"]["hook"]["fields"]["format"] = {
        "text": "Static",
        "author": "user",
        "proposals": [],
    }
    path.write_text(json.dumps(payload), encoding="utf-8")
    kept = studio.get_project(project["id"])
    assert "format" not in kept["stages"]["hook"]["fields"]
    assert kept["stages"]["casts"]["fields"]["format"]["text"] == "UGC, 15s feed"


def test_core_trigger_does_not_require_a_hook_type(studio):
    project = studio.create_project("Idea")
    view = studio.get_project(project["id"], field="core_trigger", for_suggestion=True)
    assert "hook.hook_type" not in view["missing"]
    assert "hook.hook_type" not in view["helpful_missing"]
    assert "what.concept" in view["missing"]
    assert "hook.format" not in view["missing"]
    assert "casts.format" not in view["missing"]


def test_core_concept_rejects_a_second_idea(studio):
    project = studio.create_project("One")
    with pytest.raises(studio.StudioError, match="one idea"):
        studio.update_field(
            project["id"], "hook", "core_trigger",
            "Celebrities hide a secret and they skip coffee", author="user",
        )
    with pytest.raises(studio.StudioError, match="one idea"):
        studio.save_proposal(
            project["id"], "hook", "core_trigger", "Secret one. Secret two.",
        )
    saved = studio.update_field(
        project["id"], "hook", "core_trigger", "Celebrities hide a secret", author="user",
    )
    assert saved["value"] == "Celebrities hide a secret"


def test_hook_move_accepts_a_label_and_keeps_legacy_text(studio):
    project = studio.create_project("Move")
    saved = studio.update_field(project["id"], "hook", "hook_type", "Good thing is bad", author="user")
    assert saved["value"] == "good_is_bad"
    legacy = studio.update_field(project["id"], "hook", "hook_type", "Pattern interrupt", author="user")
    assert legacy["value"] == "Pattern interrupt"


def test_older_caveman_note_becomes_the_core_concept(studio):
    project = studio.create_project("Migrate")
    studio.update_field(project["id"], "hook", "caveman_simple", "Sleep is the leak", author="user")
    moved = studio.get_project(project["id"])
    assert moved["stages"]["hook"]["fields"]["core_trigger"]["text"] == "Sleep is the leak"
    assert moved["stages"]["hook"]["fields"]["caveman_simple"]["text"] == ""
    studio.update_field(project["id"], "hook", "core_trigger", "Keep this idea", author="user")
    studio.update_field(project["id"], "hook", "caveman_simple", "A different note", author="user")
    kept = studio.get_project(project["id"])
    assert kept["stages"]["hook"]["fields"]["core_trigger"]["text"] == "Keep this idea"
    assert kept["stages"]["hook"]["fields"]["caveman_simple"]["text"] == "A different note"


def test_fried_angle_does_not_wait_for_format(studio):
    project = studio.create_project("Fry")
    view = studio.get_project(project["id"], field="deep_fry", for_suggestion=True)
    assert "hook.format" not in view["missing"]
    assert "casts.format" not in view["missing"]
    assert "brief.channel" not in view["missing"]
    assert "brief.format_length" not in view["missing"]
    final = studio.get_project(project["id"], field="final_hook", for_suggestion=True)
    assert "hook.verbal_hook" in final["missing"]
    assert "hook.visual_hook" in final["missing"]
    assert "hook.format" not in final["missing"]
    assert "casts.format" not in final["missing"]
    assert "casts.format" not in final["helpful_missing"]


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
    assert quiet["mode"] == "handoff"
    assert "needs_verification" in quiet["markdown"]
    assert "Unused alternative" not in quiet["markdown"]
    assert "does not certify" in quiet["markdown"]
    assert "Status:" not in quiet["markdown"]
    loud = studio.export_markdown(project["id"], include_alternatives=True, mode="full")
    assert "Unused alternative" in loud["markdown"]
    assert "Status:" in loud["markdown"]


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


def test_save_proposal_falls_back_when_the_api_rejects_auth(studio, monkeypatch):
    import asyncio

    import mcp_server

    monkeypatch.setattr(
        mcp_server, "_api_post",
        lambda endpoint, body: {"error": "API 401: Authentication required"},
    )
    project = studio.create_project("MCP")

    async def _run():
        return await mcp_server.handle_save_creative_proposal({
            "project_id": project["id"],
            "proposals": [
                {"stage": "what", "field": "concept", "text": "Heat slides off the shoulder"},
                {"stage": "what", "field": "angle", "text": "The pad is the false fix"},
            ],
        })

    payload = json.loads(asyncio.run(_run())[0].text)
    assert [row["field"] for row in payload["saved"]] == ["concept", "angle"]
    assert payload["errors"] == []
    concept = studio.get_project(project["id"], field="concept")
    assert concept["data"]["proposals"][0]["text"] == "Heat slides off the shoulder"


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
    assert "function creativeShowProjects" in script
    assert "function creativeToggleRecent" in script
    assert "creative-crumb-link" in script
    assert "creative-crumb-chevron" in script
    assert "creative-project-grid" in script
    assert 'creativeShowProjects()">Creatives</button>' in script
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
    assert "function creativeOpenExport" in script
    assert "function creativeCloseExport" in script
    assert "function _creativePaintExportPreview" in script
    assert "renderMd(text)" in script
    assert "creative-export-note" in script
    assert '<pre id="creativeExportPreview"' not in script
    assert 'id="creativeExportPreview"' in script
    assert 'id="creativeExportLayer"' not in script
    assert "creativeExportLayer" in script
    assert 'role="dialog"' in script
    assert "_creativeStage === 'copy' || _creativeExportOpen" not in script
    assert 'id="creativeExportCard"' not in script
    assert "function creativeCopyExport" in script
    assert "function creativeMoveStage" in script
    assert ">Back</button>" in script
    assert ">Continue</button>" in script
    assert 'data-export-mode="handoff"' in script
    assert 'data-export-mode="full"' in script
    assert 'data-hook-group="isolate"' in script
    assert script.index('data-hook-group="isolate"') < script.index('data-hook-group="fry"')
    assert script.index('data-hook-group="fry"') < script.index('data-hook-group="ground"')
    assert script.index('data-hook-group="ground"') < script.index('data-hook-group="bang"')
    assert "mode=${encodeURIComponent(mode)}" in script
    assert "writeText(text)" in script
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
    assert "one call to the tool whose name ends with save_creative_proposal" in project_prompt
    assert "before any file search or terminal command" in project_prompt
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


def test_product_profile_grounds_a_draft_without_manual_facts(studio, tmp_path, monkeypatch):
    vault = tmp_path / "Products"
    vault.mkdir()
    (vault / "Trail Shoes.md").write_text(
        "---\n"
        "avatars:\n"
        "  - label: Night bakers\n"
        "    text: People who bake after a night shift.\n"
        "guidelines: Say the shoe is a trainer, not a medical device.\n"
        "---\n"
        "Cushioned daily trainer.\n\n"
        "## Avatars\n"
        "### Weekend runners\n"
        "People who run on Saturday.\n\n"
        "## Brand guidelines\n"
        "No before-and-after medical claims.\n",
        encoding="utf-8",
    )
    (vault / "Trail Shoes.guidelines.md").write_text("Keep the voice specific.", encoding="utf-8")
    monkeypatch.setattr(studio, "product_catalog_roots", lambda: [("obsidian", vault)])
    project = studio.create_project("Run", "Trail Shoes", product_source=str(vault / "Trail Shoes.md"))
    opened = studio.get_project(project["id"])
    assert opened["exploratory_product"] is False
    assert "brief.product_facts" not in opened["field_context"]["concept"]["required"]
    labels = [row["label"] for row in opened["audience_avatars"]]
    assert labels[:2] == ["Night bakers", "Weekend runners"]
    assert all(row["source"] == "preset" for row in opened["audience_avatars"][:2])
    studio.update_field(project["id"], "who", "segment", "Night bakers", author="user")
    view = studio.get_project(project["id"], field="concept", for_suggestion=True)
    assert view["exploratory"] is False
    assert "brief.product_facts" not in view["missing"]
    profile = view["context"]["product_profile"]["text"]
    assert "Cushioned daily trainer." in profile
    assert "Say the shoe is a trainer" in profile
    assert "No before-and-after medical claims." in profile
    assert "Keep the voice specific." in profile
    assert view["context"]["product_profile"]["product_id"].endswith("Trail Shoes.md")
    bare = studio.create_project("Mug creative", "Mug")
    studio.update_field(bare["id"], "who", "segment", "Desk workers", author="user")
    bare_view = studio.get_project(bare["id"], field="concept", for_suggestion=True)
    assert bare_view["exploratory"] is False
    assert studio.get_project(bare["id"])["exploratory_product"] is False


def test_saved_avatar_is_reusable_for_the_same_product(studio, tmp_path, monkeypatch):
    vault = tmp_path / "Products"
    vault.mkdir()
    note = vault / "Trail Shoes.md"
    note.write_text("Cushioned daily trainer.", encoding="utf-8")
    monkeypatch.setattr(studio, "product_catalog_roots", lambda: [("obsidian", vault)])
    source = str(note)
    first = studio.create_project("Launch", "Trail Shoes", product_source=source)
    saved = studio.save_audience_avatar(first["id"], "Night bakers", "People who bake after a night shift.")
    assert saved["stages"]["brief"]["fields"]["audience_notes"]["text"] == "People who bake after a night shift."
    studio.update_field(first["id"], "brief", "objective", "Offer & Urgency. Direct promo, bundle push, or limited-time framing.", author="user")
    studio.update_field(first["id"], "brief", "audience_notes", "", author="user")
    cleared = studio.get_project(first["id"])
    assert cleared["stages"]["brief"]["fields"]["audience_notes"]["text"] == ""
    remembered = next(row for row in cleared["audience_avatars"] if row["label"] == "Night bakers")
    assert remembered["source"] == "saved"
    assert remembered["text"] == "People who bake after a night shift."
    second = studio.create_project("Retarget", "Trail Shoes", product_source=source)
    again = studio.get_project(second["id"])
    assert any(row["label"] == "Night bakers" for row in again["audience_avatars"])
    studio.update_field(second["id"], "who", "segment", "Unrelated", author="user")
    assert any(row["label"] == "Night bakers" for row in studio.get_project(first["id"])["audience_avatars"])
    with pytest.raises(studio.StudioError):
        studio.save_audience_avatar(studio.create_project("Nameless")["id"], "Nope", "Nobody")


def test_brief_step_drops_the_facts_box_and_exploratory_warning():
    script = Path(__file__).resolve().parents[1].joinpath("static", "creative_studio.js").read_text(encoding="utf-8")
    assert "Product facts are not on file" not in script
    assert "Nothing here is being treated as a known fact" not in script
    assert "_creativeFieldCard('brief','product_facts')" not in script
    assert "Audience & strategy" in script
    assert "Campaign goal" in script
    assert "_creativeChoiceGroup('awareness', 'Awareness'" in script
    assert 'role="radiogroup"' in script
    assert "Unknown / Help me infer" in script
    assert "Project evidence" not in script
    assert "A suggestion can use only this" not in script
    assert "Use only this project evidence" not in script
    assert "Use the product profile, this creative, and the conversation." in script
    assert "creative-choice-group" in script
    assert "creative-pills" not in script
    assert "Cold Acquisition (Direct Sale)" not in script
    assert "Symptom Aware (Educate & Bridge)" not in script
    assert "function creativePickObjective" not in script
    assert "+ New Avatar" in script
    assert "function creativeSaveAvatar" in script
    assert "/avatars" in script
    assert 'ariaLabel: \'Reuse a saved audience\'' in script


def test_audience_field_is_a_text_box_with_saved_history():
    import shutil
    import subprocess

    node = shutil.which("node")
    if not node:
        pytest.skip("node is required to render the audience field")
    script = Path(__file__).resolve().parents[1].joinpath("static", "creative_studio.js")
    payload = json.dumps({
        "stages": {"brief": {"fields": {
            "audience_notes": {"text": "Night-shift bakers", "proposals": []},
        }}},
        "audience_avatars": [
            {"id": "a1", "source": "saved", "label": "Night bakers", "text": "People who bake after a night shift"},
            {"id": "a2", "source": "history", "label": "Recent", "text": "Night-shift bakers"},
        ],
    })
    rendered = subprocess.run(
        [node, "-e", (
            "const fs=require('fs');"
            "const input=JSON.parse(fs.readFileSync(0,'utf8'));"
            "eval(fs.readFileSync(process.argv[1],'utf8')+"
            "'\\n_creativeProject=input;"
            "process.stdout.write(_creativeAudienceControl());');"
        ), str(script)],
        input=payload,
        text=True,
        check=True,
        capture_output=True,
    ).stdout
    assert "creative-picker-value" not in rendered
    assert 'data-creative-field="audience_notes"' in rendered
    assert ">Night-shift bakers</textarea>" in rendered
    combo = rendered.split("creative-input-combo", 1)[1]
    assert "<textarea" in combo and "creative-history-trigger" in combo
    assert "People who bake after a night shift" in rendered
    assert "+ New Avatar" in rendered
    assert 'aria-label="Reuse a saved audience"' in rendered
    assert "Choose an avatar" not in rendered


def test_audience_blocks_are_reusable_across_products(studio):
    first = studio.create_project("Launch", "Trail Shoes")
    studio.update_field(first["id"], "who", "outcome", "Fewer blisters", author="user")
    studio.update_field(first["id"], "who", "outcome", "fewer blisters", author="user")
    studio.update_field(first["id"], "who", "outcome", "No hot spots", author="user")
    studio.update_field(first["id"], "who", "segment", "Not a block", author="user")
    second = studio.create_project("Mug ad", "Desk Mug")
    studio.update_field(second["id"], "who", "outcome", "Hot coffee", author="user")
    studio.update_field(second["id"], "who", "demographic", "Night shift", author="user")
    studio.update_field(second["id"], "who", "facet", "Shared friction", author="user")
    nameless = studio.create_project("Nameless")
    studio.update_field(nameless["id"], "who", "outcome", "Nobody", author="user")

    opened = studio.get_project(first["id"])
    outcomes = opened["audience_blocks"]["outcome"]
    product = [row["text"] for row in outcomes if row["scope"] == "product"]
    assert product == ["No hot spots", "fewer blisters"]
    assert [row["text"] for row in outcomes if row["scope"] == "global"] == ["Hot coffee"]
    assert all(row["id"].startswith("bk_") and row["label"] for row in outcomes)
    assert "Not a block" not in [row["text"] for row in outcomes]
    assert "Nobody" not in [row["text"] for row in outcomes]
    demos = opened["audience_blocks"]["demographic"]
    assert any(row["text"] == "Night shift" and row["scope"] == "global" for row in demos)

    path = studio._store_path()
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["audience_blocks"] = {}
    path.write_text(json.dumps(payload), encoding="utf-8")
    wiped = studio.get_project(first["id"])
    restored = [row["text"] for row in wiped["audience_blocks"]["outcome"] if row["scope"] == "product"]
    assert restored == ["No hot spots"]
    assert any(row["text"] == "Hot coffee" and row["scope"] == "global" for row in wiped["audience_blocks"]["outcome"])
    assert "fewer blisters" not in [row["text"].casefold() for row in wiped["audience_blocks"]["outcome"]]

    studio.update_field(second["id"], "who", "outcome", "No hot spots", author="user")
    again = studio.get_project(first["id"])
    global_outcomes = [row["text"].casefold() for row in again["audience_blocks"]["outcome"] if row["scope"] == "global"]
    assert "no hot spots" not in global_outcomes

    for index in range(41):
        studio.update_field(first["id"], "who", "facet", f"Facet {index}", author="user")
    capped = studio.get_project(first["id"])["audience_blocks"]["facet"]
    product_facets = [row["text"] for row in capped if row["scope"] == "product"]
    assert product_facets[0] == "Facet 40"
    assert len(product_facets) == 40
    assert "Facet 0" not in product_facets
    assert any(row["text"] == "Shared friction" and row["scope"] == "global" for row in capped)


def test_generate_segment_requires_the_three_blocks(studio, monkeypatch):
    project = studio.create_project("Run", "Trail Shoes")
    called = []
    monkeypatch.setattr(studio, "_synthesize_segment", lambda *args: called.append(args) or "unused")
    with pytest.raises(studio.StudioError, match="outcome, demographic, and facet"):
        studio.generate_segment(project["id"])
    studio.update_field(project["id"], "who", "outcome", "Fewer blisters", author="user")
    studio.update_field(project["id"], "who", "demographic", "Weekend runners", author="user")
    with pytest.raises(studio.StudioError, match="outcome, demographic, and facet"):
        studio.generate_segment(project["id"])
    assert called == []


def test_generate_segment_writes_one_editable_sentence(studio, monkeypatch):
    project = studio.create_project("Run", "Trail Shoes")
    studio.update_field(project["id"], "who", "outcome", "Fewer blisters", author="user")
    studio.update_field(project["id"], "who", "demographic", "Weekend runners", author="user")
    studio.update_field(project["id"], "who", "facet", "They start on cold pavement", author="user")
    studio.update_field(project["id"], "what", "concept", "One idea", author="user")
    monkeypatch.setattr(
        studio,
        "_synthesize_segment",
        lambda outcome, demographic, facet: (
            "Weekend runners experiencing cold pavement, actively seeking fewer blisters"
            if outcome == "Fewer blisters" and demographic == "Weekend runners" else ""
        ),
    )
    saved = studio.generate_segment(project["id"])
    segment = saved["stages"]["who"]["fields"]["segment"]
    assert segment["text"] == "Weekend runners experiencing cold pavement, actively seeking fewer blisters"
    assert segment["author"] == "user"
    assert saved["stages"]["who"]["fields"]["outcome"]["text"] == "Fewer blisters"
    assert saved["stages"]["who"]["fields"]["demographic"]["text"] == "Weekend runners"
    assert saved["stages"]["who"]["fields"]["facet"]["text"] == "They start on cold pavement"
    assert saved["stages"]["what"]["fields"]["concept"]["needs_review"] is True


def test_generate_segment_keeps_the_previous_sentence_when_synthesis_fails(studio, monkeypatch):
    project = studio.create_project("Run", "Trail Shoes")
    studio.update_field(project["id"], "who", "outcome", "Fewer blisters", author="user")
    studio.update_field(project["id"], "who", "demographic", "Weekend runners", author="user")
    studio.update_field(project["id"], "who", "facet", "Cold pavement", author="user")
    studio.update_field(project["id"], "who", "segment", "Hand written", author="user")

    def fail(outcome, demographic, facet):
        raise studio.StudioError("Could not generate a segment.", status=502)

    monkeypatch.setattr(studio, "_synthesize_segment", fail)
    with pytest.raises(studio.StudioError, match="Could not generate a segment"):
        studio.generate_segment(project["id"])
    assert studio.get_project(project["id"])["stages"]["who"]["fields"]["segment"]["text"] == "Hand written"

    monkeypatch.setattr(studio, "_synthesize_segment", lambda *args: "   ")
    with pytest.raises(studio.StudioError, match="Could not generate a segment"):
        studio.generate_segment(project["id"])
    assert studio.get_project(project["id"])["stages"]["who"]["fields"]["segment"]["text"] == "Hand written"


def test_synthesize_segment_sends_only_the_three_blocks(studio, monkeypatch):
    seen = {}

    def fake(messages):
        seen["messages"] = messages
        return "People experiencing friction, actively seeking relief."

    monkeypatch.setattr(studio, "_call_segment_llm", fake)
    sentence = studio._synthesize_segment("relief " + ("x" * 600), "People", "friction")
    assert sentence == "People experiencing friction, actively seeking relief."
    system, user = seen["messages"]
    assert "actively seeking" in system["content"]
    assert "Outcome: relief " in user["content"]
    assert "Demographic: People" in user["content"]
    assert "Facet: friction" in user["content"]
    outcome_line = user["content"].splitlines()[0]
    assert len(outcome_line) <= len("Outcome: ") + 500
    assert outcome_line.endswith("…")


def test_audience_step_wires_reuse_and_generation():
    script = Path(__file__).resolve().parents[1].joinpath("static", "creative_studio.js").read_text(encoding="utf-8")
    assert "function _creativeWhoBody" in script
    assert "function creativePickBlock" in script
    assert "function creativeGenerateSegment" in script
    assert "Reuse a saved outcome" in script
    assert "Reuse a saved demographic" in script
    assert "Reuse a saved facet" in script
    assert "This product" in script
    assert "Other creatives" in script
    assert "Generate segment" in script
    assert "Add an outcome, demographic, and facet first." in script
    assert "/segment" in script
    assert "creative-input-combo" in script
    assert "creative-history-trigger" in script
    assert "variant: 'history'" in script


def test_audience_blocks_open_from_inside_the_text_box():
    import shutil
    import subprocess

    node = shutil.which("node")
    if not node:
        pytest.skip("node is required to render the audience fields")
    script = Path(__file__).resolve().parents[1].joinpath("static", "creative_studio.js")
    payload = json.dumps({
        "stages": {"who": {"fields": {
            "outcome": {"text": "Fewer blisters", "proposals": []},
            "demographic": {"text": "Weekend runners", "proposals": []},
            "facet": {"text": "Cold pavement", "proposals": []},
            "segment": {"text": "", "proposals": []},
        }}},
        "audience_blocks": {
            "outcome": [
                {"id": "o1", "scope": "product", "text": "Fewer blisters", "label": "Fewer blisters"},
                {"id": "o2", "scope": "global", "text": "Hot coffee", "label": "Hot coffee"},
            ],
            "demographic": [
                {"id": "d1", "scope": "product", "text": "Weekend runners", "label": "Weekend runners"},
            ],
            "facet": [],
        },
    })
    rendered = subprocess.run(
        [node, "-e", (
            "const fs=require('fs');"
            "const input=JSON.parse(fs.readFileSync(0,'utf8'));"
            "eval(fs.readFileSync(process.argv[1],'utf8')+"
            "'\\n_creativeProject=input;"
            "process.stdout.write(_creativeWhoBody());');"
        ), str(script)],
        input=payload,
        text=True,
        check=True,
        capture_output=True,
    ).stdout
    assert "creative-picker-value" not in rendered
    assert rendered.count("<textarea") == 4
    for field, saved, history in (
        ("outcome", "Fewer blisters", True),
        ("demographic", "Weekend runners", True),
        ("facet", "Cold pavement", False),
    ):
        card = rendered.split(f'data-field="{field}"', 1)[1].split('<div class="creative-field"', 1)[0]
        assert card.count("<textarea") == 1
        assert f">{saved}</textarea>" in card
        assert ("creative-history-trigger" in card) is history
        if history:
            combo = card.split("creative-input-combo", 1)[1]
            assert "<textarea" in combo and "creative-history-trigger" in combo
            assert "creative-picker-panel" in combo
    assert "Hot coffee" in rendered
    assert "This product" in rendered
    assert "Other creatives" in rendered
    assert 'aria-label="Reuse a saved outcome"' in rendered
    assert "creative-history-trigger" not in rendered.split('data-field="segment"', 1)[1]


_COLD = (
    "Cold Acquisition (Direct Sale). Broad appeal, mechanism introduction, "
    "and skepticism breaking."
)
_RETARGET = (
    "Retargeting & Objections. Overcome skepticism, price or efficacy objections, "
    "and comparison to alternatives."
)
_SYMPTOM = (
    "Symptom Aware (Educate & Bridge). Focus on the pain point or trigger, "
    "then bridge into the product solution."
)


def _strip_strategy_fields(studio, project_id):
    path = studio._store_path()
    payload = json.loads(path.read_text(encoding="utf-8"))
    row = payload["projects"][project_id]
    brief = row["stages"]["brief"]["fields"]
    for name in ("campaign_goal", "awareness", "mass_desire", "sophistication", "campaign_context"):
        brief.pop(name, None)
    row["stages"]["what"]["fields"].pop("message_approach", None)
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_new_project_goal_is_a_labeled_default(studio):
    project = studio.create_project("Launch")
    goal = project["stages"]["brief"]["fields"]["campaign_goal"]
    assert goal["text"] == "purchase"
    assert goal["origin"] == "default"
    assert project["stages"]["brief"]["fields"]["awareness"]["text"] == ""
    assert project["stages"]["brief"]["fields"]["objective"]["text"] == ""
    handoff = studio.export_markdown(project["id"])["markdown"]
    assert "Purchase / conversion" in handoff
    assert "Studio default, not confirmed for this product." in handoff
    assert "### Awareness" not in handoff


def test_goal_awareness_and_message_approach_stay_distinct(studio):
    project = studio.create_project("Split")
    studio.update_field(project["id"], "brief", "campaign_goal", "lead", author="user")
    studio.update_field(project["id"], "brief", "awareness", "problem_aware", author="user")
    studio.update_field(project["id"], "what", "message_approach", "urgency, educate", author="user")
    stored = studio.get_project(project["id"])
    brief = stored["stages"]["brief"]["fields"]
    assert brief["campaign_goal"]["text"] == "lead"
    assert brief["campaign_goal"]["origin"] == "user"
    assert brief["awareness"]["text"] == "problem_aware"
    assert stored["stages"]["what"]["fields"]["message_approach"]["text"] == "educate, urgency"
    assert brief["objective"]["text"] == ""
    with pytest.raises(studio.StudioError, match="invalid awareness"):
        studio.update_field(project["id"], "brief", "awareness", "Symptom Aware", author="user")
    assert studio.get_project(project["id"], field="awareness")["data"]["text"] == "problem_aware"
    with pytest.raises(studio.StudioError, match="invalid campaign_goal"):
        studio.update_field(project["id"], "brief", "campaign_goal", "cold", author="user")


def test_awareness_and_sophistication_round_trip_including_unknown(studio):
    project = studio.create_project("Levels")
    levels = ("unaware", "problem_aware", "solution_aware", "product_aware", "most_aware", "unknown")
    for level in levels:
        studio.update_field(project["id"], "brief", "awareness", level, author="user")
        reloaded = studio.get_project(project["id"])
        assert reloaded["stages"]["brief"]["fields"]["awareness"]["text"] == level
        handoff = studio.export_markdown(project["id"])["markdown"]
        full = studio.export_markdown(project["id"], mode="full")["markdown"]
        label = studio._strategy_label("awareness", level)
        assert label in handoff
        assert "### Awareness" in full
        assert level in full
    studio.update_field(project["id"], "brief", "sophistication", "unknown", author="user")
    studio.update_field(project["id"], "brief", "awareness", "product_aware", author="user")
    both = studio.get_project(project["id"])["stages"]["brief"]["fields"]
    assert both["awareness"]["text"] == "product_aware"
    assert both["sophistication"]["text"] == "unknown"
    handoff = studio.export_markdown(project["id"])["markdown"]
    assert "Product aware" in handoff
    assert "### Market sophistication" in handoff
    assert "Not a confirmed level." in handoff
    assert "unknown" in studio.export_markdown(project["id"], mode="full")["markdown"]
    for stage in ("stage_1", "stage_2", "stage_3", "stage_4", "stage_5", "unknown"):
        studio.update_field(project["id"], "brief", "sophistication", stage, author="user")
        assert studio.get_project(project["id"], field="sophistication")["data"]["text"] == stage


def test_legacy_objective_is_preserved_and_not_remapped(studio):
    project = studio.create_project("Legacy objective")
    _strip_strategy_fields(studio, project["id"])
    path = studio._store_path()
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["projects"][project["id"]]["stages"]["brief"]["fields"]["objective"]["text"] = _SYMPTOM
    payload["projects"][project["id"]]["stages"]["who"]["fields"]["facet"]["text"] = "Keep this facet"
    path.write_text(json.dumps(payload), encoding="utf-8")
    loaded = studio.get_project(project["id"])
    brief = loaded["stages"]["brief"]["fields"]
    assert brief["objective"]["text"] == _SYMPTOM
    assert brief["awareness"]["text"] == ""
    assert brief["campaign_goal"]["text"] == ""
    assert brief["campaign_context"]["text"] == ""
    assert loaded["stages"]["who"]["fields"]["facet"]["text"] == "Keep this facet"
    assert loaded["legacy_objective"]["kind"] == "ambiguous"
    handoff = studio.export_markdown(project["id"])["markdown"]
    assert "Earlier objective" in handoff
    assert "Symptom Aware" in handoff
    assert "### Campaign goal" not in handoff
    assert "Problem aware" not in handoff

    cold = studio.create_project("Cold line")
    studio.update_field(cold["id"], "brief", "objective", _COLD, author="user")
    studio.update_field(cold["id"], "brief", "campaign_goal", "", author="user")
    viewed = studio.get_project(cold["id"])
    assert viewed["legacy_objective"]["kind"] == "campaign_context"
    assert viewed["legacy_objective"]["value"] == "cold"
    assert viewed["legacy_objective"]["applied"] is False
    assert viewed["stages"]["brief"]["fields"]["campaign_context"]["text"] == ""
    assert viewed["stages"]["brief"]["fields"]["awareness"]["text"] == ""
    studio.update_field(cold["id"], "brief", "campaign_context", "cold", author="user")
    applied = studio.get_project(cold["id"])
    assert applied["stages"]["brief"]["fields"]["objective"]["text"] == _COLD
    assert applied["stages"]["brief"]["fields"]["campaign_context"]["text"] == "cold"
    assert applied["legacy_objective"]["applied"] is True

    retarget = studio.create_project("Retarget line")
    studio.update_field(retarget["id"], "brief", "objective", _RETARGET, author="user")
    assert studio.get_project(retarget["id"])["legacy_objective"]["value"] == "retargeting"
    assert studio.get_project(retarget["id"])["stages"]["brief"]["fields"]["campaign_context"]["text"] == ""


def test_suggestions_keep_unknown_and_defaults_unconfirmed(studio):
    project = studio.create_project("Infer")
    studio.update_field(project["id"], "who", "segment", "Night bakers", author="user")
    studio.update_field(project["id"], "brief", "awareness", "unknown", author="user")
    view = studio.get_project(project["id"], field="concept", for_suggestion=True)
    strategy = view["context"]["strategy"]
    assert strategy["brief.awareness"]["confirmation"] == "unknown"
    assert strategy["brief.awareness"]["text"] == "unknown"
    assert strategy["brief.campaign_goal"]["confirmation"] == "default"
    assert strategy["brief.campaign_goal"]["text"] == "purchase"
    sources = view["context"]["strategy_sources"]
    assert sources["product_note"]["present"] is False
    assert sources["audience_notes"]["present"] is False
    assert sources["outcome"]["present"] is False
    assert "brief.awareness" in view["unresolved"]
    assert "brief.campaign_goal" in view["unresolved"]
    assert "not a confirmed fact" in view["guidance"]
    assert "Use the product profile, the creative, and the conversation." in view["guidance"]
    assert "ask one focused question" not in view["guidance"]
    saved = studio.save_proposal(
        project["id"], "brief", "awareness", "Problem aware",
        discussion="The audience line names a situation, not a confirmed level.",
        exploratory=True,
    )
    assert saved["selected_unchanged"] is True
    assert studio.get_project(project["id"], field="awareness")["data"]["text"] == "unknown"
    accepted = studio.accept_proposal(project["id"], saved["proposal"]["id"])
    assert accepted["value"] == "problem_aware"
    assert studio.get_project(project["id"], field="awareness")["data"]["text"] == "problem_aware"


def test_strategy_edit_preserves_downstream_and_flags_review(studio):
    project = studio.create_project("Review")
    studio.update_field(project["id"], "who", "segment", "Night bakers", author="user")
    studio.update_field(project["id"], "what", "concept", "One quiet idea", author="user")
    studio.update_field(project["id"], "brief", "awareness", "solution_aware", author="user")
    flagged = studio.update_field(project["id"], "brief", "awareness", "most_aware", author="user")
    assert {"stage": "what", "field": "concept"} in flagged["review_fields"]
    concept = studio.get_project(project["id"], field="concept")["data"]
    assert concept["text"] == "One quiet idea"
    assert concept["needs_review"] is True
    studio.update_field(project["id"], "brief", "awareness", "product_aware", author="user")
    studio.update_field(project["id"], "brief", "audience_notes", "People who bake after a night shift", author="user")
    awareness = studio.get_project(project["id"], field="awareness")["data"]
    assert awareness["text"] == "product_aware"
    assert awareness["needs_review"] is True


def test_hook_prereq_lists_earlier_work_only(studio):
    import shutil
    import subprocess

    node = shutil.which("node")
    if not node:
        pytest.skip("node is required to render the prerequisite list")
    project = studio.create_project("Hook list")
    studio.update_field(project["id"], "who", "segment", "Night bakers", author="user")
    studio.update_field(project["id"], "brief", "awareness", "problem_aware", author="user")
    studio.update_field(project["id"], "brief", "mass_desire", "Rest after a shift", author="user")
    studio.update_field(project["id"], "brief", "campaign_context", "cold", author="user")
    opened = studio.get_project(project["id"])
    script = Path(__file__).resolve().parents[1].joinpath("static", "creative_studio.js")
    payload = json.dumps({
        "stage": "hook",
        "project": {
            "stages": opened["stages"],
            "field_context": opened["field_context"],
        },
    })
    rendered = subprocess.run(
        [node, "-e", (
            "const fs=require('fs');"
            "const input=JSON.parse(fs.readFileSync(0,'utf8'));"
            "eval(fs.readFileSync(process.argv[1],'utf8')+"
            "'\\n_creativeStage=input.stage;_creativeProject=input.project;"
            "process.stdout.write(_creativePrereqMarkup());');"
        ), str(script)],
        input=payload,
        text=True,
        check=True,
        capture_output=True,
    ).stdout
    for label in ("Core idea", "Audience segment", "Mechanism summary", "Campaign goal", "Awareness", "Core desire", "Market sophistication", "Campaign context", "Message approach"):
        assert label in rendered
    assert "Audience segment" in rendered and ">Present<" in rendered
    for label in ("Length and placement", "Channel", "Visual hook", "Verbal hook", "Format / placement", "Hook approach", "Format and placement"):
        assert label not in rendered


def test_hook_step_leads_with_one_concept():
    import shutil
    import subprocess

    node = shutil.which("node")
    if not node:
        pytest.skip("node is required to render the hook step")
    script = Path(__file__).resolve().parents[1].joinpath("static", "creative_studio.js")
    payload = json.dumps({
        "stages": {
            "brief": {"fields": {}},
            "who": {"fields": {}},
            "what": {"fields": {"concept": {"text": "Sleep is the leak"}}},
            "hook": {"fields": {
                "core_trigger": {"text": "Sleep is the leak"},
                "hook_type": {"text": "good_is_bad"},
                "deep_fry": {"text": ""},
                "walk_it_back": {"text": ""},
                "verbal_hook": {"text": ""},
                "visual_hook": {"text": ""},
                "final_hook": {"text": ""},
            }},
        },
    })
    rendered = subprocess.run(
        [node, "-e", (
            "const fs=require('fs');"
            "const input=JSON.parse(fs.readFileSync(0,'utf8'));"
            "eval(fs.readFileSync(process.argv[1],'utf8')+"
            "'\\n_creativeStage=\"hook\";_creativeProject=input;"
            "process.stdout.write(_creativeHookBody());');"
        ), str(script)],
        input=payload,
        text=True,
        check=True,
        capture_output=True,
    ).stdout
    order = ["isolate", "fry", "ground", "bang"]
    positions = [rendered.index(f'data-hook-group="{name}"') for name in order]
    assert positions == sorted(positions)
    for label in ("Core concept", "Deep-fry move", "Good thing is bad", "Deep-fried angle", "Grounded claim", "Verbal hook", "Visual hook", "Final hook pair", "Fry", "Walk it back", "Make it bang"):
        assert label in rendered
    for label in ("Channel", "Length and placement", "Caveman-simple", "One central idea", "Hook approach", "Exploratory draft", "Polish notes", "Format and placement"):
        assert label not in rendered
    assert "creative-pair" in rendered


def test_execution_step_includes_format_and_placement():
    import shutil
    import subprocess

    node = shutil.which("node")
    if not node:
        pytest.skip("node is required to render the execution step")
    script = Path(__file__).resolve().parents[1].joinpath("static", "creative_studio.js")
    payload = json.dumps({
        "stages": {
            "casts": {"fields": {
                "conceit": {"text": ""},
                "format": {"text": "UGC, 15s feed"},
                "actors": {"text": ""},
                "style": {"text": ""},
                "terrain": {"text": ""},
                "setup": {"text": ""},
            }},
        },
        "field_context": {"conceit": {"required": [], "helpful": [["casts", "format"]]}},
    })
    rendered = subprocess.run(
        [node, "-e", (
            "const fs=require('fs');"
            "const input=JSON.parse(fs.readFileSync(0,'utf8'));"
            "eval(fs.readFileSync(process.argv[1],'utf8')+"
            "'\\n_creativeStage=\"casts\";_creativeProject=input;"
            "process.stdout.write(_creativeStepBody(input.stages.casts));');"
        ), str(script)],
        input=payload,
        text=True,
        check=True,
        capture_output=True,
    ).stdout
    assert "Format and placement" in rendered
    assert 'data-creative-field="format"' in rendered
    assert rendered.index("Conceit") < rendered.index("Format and placement") < rendered.index("Actors")


def test_strategy_controls_are_separated_in_the_script_and_contract():
    root = Path(__file__).resolve().parents[1]
    script = (root / "static" / "creative_studio.js").read_text(encoding="utf-8")
    style = (root / "static" / "style.css").read_text(encoding="utf-8")
    contract = (root / "mcp_server.py").read_text(encoding="utf-8")
    group = script.split("function _creativeChoiceGroup", 1)[1].split("function _creativeIsolateButton", 1)[0]
    assert "Unknown / Help me infer" not in group
    assert 'role="radiogroup"' in script
    assert "Audience & strategy" in script
    assert "function creativeInfer" in script
    assert "function creativeToggleApproach" in script
    assert "flex-direction:column" in style
    for name in (
        "campaign_goal", "awareness", "mass_desire", "sophistication",
        "campaign_context", "message_approach",
    ):
        assert name in contract
    assert "the campaign goal or the awareness level" in contract


def test_field_guides_use_the_original_framework_wording():
    import shutil
    import subprocess

    root = Path(__file__).resolve().parents[1]
    html = (root / "static" / "index.html").read_text(encoding="utf-8")
    guide_tag = html.find("static/creative_guide.js")
    studio_tag = html.find("static/creative_studio.js")
    assert guide_tag != -1 and studio_tag != -1 and guide_tag < studio_tag
    guide = (root / "static" / "creative_guide.js").read_text(encoding="utf-8")
    assert "כתוב כאן" not in guide
    node = shutil.which("node")
    if not node:
        pytest.skip("node is required to render field guides")
    runner = r"""
const stages = {};
Object.entries(CREATIVE_FIELDS).forEach(([stage, names]) => {
  stages[stage] = {fields:{}, status:'not_started'};
  names.forEach(name => stages[stage].fields[name] = {text:'', proposals:[], include:true});
});
_creativeProject = {stages, audience_blocks:{outcome:[], demographic:[], facet:[]}, concept_checks:{}, audience_avatars:[], product_note:{}};
const bodies = [
  _creativeWhoBody(),
  (_creativeStage = 'what', _creativeStepBody(stages.what)),
  _creativeHookBody(),
  (_creativeStage = 'casts', _creativeStepBody(stages.casts)),
  (_creativeStage = 'copy', _creativeStepBody(stages.copy)),
];
const fields = ['outcome','demographic','facet','segment','concept','angle','ump','ums','mechanism','hook_type','core_trigger','deep_fry','walk_it_back','format','verbal_hook','visual_hook','final_hook','conceit','actors','style','terrain','setup','pain','promise','proof','curiosity','constraints','conditions'];
const html = bodies.join('\n');
const missing = fields.filter(name => !html.includes('data-creative-guide="' + name + '"'));
if(missing.length) throw new Error('missing explain controls: ' + missing.join(','));
const phrases = {
  outcome:'התוצאה הרצויה.',
  concept:'רעיון אחד בלבד (Single Idea)',
  angle:'ההשוואה הבלתי הוגנת',
  ump:'למה הבעיה באמת קורית.',
  mechanism:'UMP + UMS',
  visual_hook:'Visual Hook (מה רואים)',
  core_trigger:'הטעות הכי נפוצה היא לנסות להכניס להוק',
  deep_fry:'Good Thing is Bad (הדבר הטוב הוא האויב)',
  walk_it_back:'הוק טוב נשמע כמו קליקבייט קיצוני',
  verbal_hook:'הנדל&quot;ן הראשון',
  final_hook:'Cognitive Dissonance (דיסוננס קוגניטיבי ושבירת פרדיגמה)',
  format:'פורמט התוכן.',
  actors:'שחקנים / דמויות.',
  pain:'מתהפך לצד השני במיטה',
  conditions:'מיועד לכאבי כתף ליליים',
};
Object.entries(phrases).forEach(([field, phrase]) => {
  const markup = _creativeGuideMarkup(field);
  if(!markup.includes('role="dialog"')) throw new Error(field + ' dialog');
  if(!markup.includes(phrase)) throw new Error(field + ' missing phrase');
});
if(_creativeGuideMarkup('campaign_goal')) throw new Error('strategy field has no framework note');
const concept = _creativeGuideMarkup('concept');
if(!concept.includes('dir="rtl"')) throw new Error('hebrew concept guide should be rtl');
if(concept.includes('dir="auto"')) throw new Error('guide lines should follow the dialog direction');
const mechanism = _creativeGuideMarkup('mechanism');
if(!mechanism.includes('dir="ltr"')) throw new Error('english mechanism guide should be ltr');
const format = _creativeGuideMarkup('format');
if(!format.includes('dir="rtl"')) throw new Error('hebrew format guide should be rtl despite the english title');
process.stdout.write('ok');
"""
    rendered = subprocess.run(
        [node, "-e", (
            "const fs=require('fs');"
            "const root=process.argv[1];"
            "eval(fs.readFileSync(root+'/static/creative_guide.js','utf8')+'\\n'+"
            "fs.readFileSync(root+'/static/creative_studio.js','utf8')+'\\n'+"
            "process.argv[2]);"
        ), str(root), runner],
        text=True,
        check=True,
        capture_output=True,
    )
    assert rendered.stdout == "ok"
