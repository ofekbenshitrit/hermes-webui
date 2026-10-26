"""Creative Studio store, HTTP, and MCP invariants."""

import io
import json
from pathlib import Path
from urllib.parse import urlparse

import pytest


@pytest.fixture()
def studio(tmp_path, monkeypatch):
    import api.config as config
    import api.profiles as profiles

    monkeypatch.setattr(config, "STATE_DIR", tmp_path)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "creative-test")
    import api.creative_studio as studio

    return studio


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
    assert "function creativeExport" in script
    assert "function creativeCopyExport" in script
    assert "Continue never accepts" in script or "Nothing is selected for you." in script
