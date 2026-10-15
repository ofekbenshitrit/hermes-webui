"""Regression tests for PR #1721 salvage — RTL chat layout (Settings-only, no composer button).

Salvaged from @malulian's PR #1721 per @aronprins design review (May 13 2026):
"Can you implement this as a global setting filed in Settings → Preferences?"
Implementation drops the composer button and keeps only the Settings toggle + CSS.
"""
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
INDEX = REPO_ROOT / "static" / "index.html"
STYLE = REPO_ROOT / "static" / "style.css"
PANELS = REPO_ROOT / "static" / "panels.js"
I18N = REPO_ROOT / "static" / "i18n.js"
CONFIG = REPO_ROOT / "api" / "config.py"


def test_rtl_settings_field_present_in_settings_panel():
    html = INDEX.read_text(encoding="utf-8")
    assert 'id="settingsRtl"' in html, "Settings checkbox for RTL not found"
    assert 'data-i18n="settings_label_rtl"' in html
    assert 'data-i18n="settings_desc_rtl"' in html


def test_no_composer_rtl_button_anywhere():
    """Honor @aronprins design review — no button in composer footer."""
    html = INDEX.read_text(encoding="utf-8")
    assert "btnRtlToggle" not in html, "Composer RTL button must not exist"
    assert "rtl-toggle-btn" not in html
    assert "rtl-toggle-label" not in html
    css = STYLE.read_text(encoding="utf-8")
    assert ".rtl-toggle-btn" not in css, "CSS for composer RTL button must not exist"


def test_rtl_bootstrap_script_runs_synchronously_in_head():
    """Saved RTL state must apply before any chat content paints — no LTR flash."""
    html = INDEX.read_text(encoding="utf-8")
    # The bootstrap should appear before </head>
    head_close = html.index("</head>")
    bootstrap_idx = html.index("localStorage.getItem('hermes-rtl')")
    assert bootstrap_idx < head_close, "RTL bootstrap must run in <head> before paint"
    assert "chat-content-rtl" in html


def test_rtl_css_scoped_to_chat_only():
    """RTL must not affect sidebar, settings panel, workspace panel — only chat area + composer."""
    css = STYLE.read_text(encoding="utf-8")
    assert ".chat-content-rtl .msg-row{" in css
    assert ".chat-content-rtl textarea#msg" in css
    # Negative: must NOT apply RTL to sidebar/panel surfaces
    assert ".chat-content-rtl .sidebar" not in css
    assert ".chat-content-rtl .settings-panel" not in css
    assert ".chat-content-rtl .workspace-panel" not in css
    assert ".chat-content-rtl body{" not in css
    assert ".chat-content-rtl html{" not in css


def test_rtl_code_blocks_stay_ltr():
    """Critical: Arabic users still write English code. Code blocks must NOT flip."""
    css = STYLE.read_text(encoding="utf-8")
    # Must scope pre/code back to LTR
    assert ".chat-content-rtl .msg-body pre" in css
    assert ".chat-content-rtl .msg-body code" in css
    # Must force direction:ltr inside code containers
    code_section_start = css.index(".chat-content-rtl .msg-body pre,")
    code_section_end = css.index("}", code_section_start)
    code_section = css[code_section_start:code_section_end]
    assert "direction:ltr" in code_section
    assert "text-align:left" in code_section
    # Tool-call content also stays LTR (commands, paths, JSON)
    tool_section_start = css.index(".chat-content-rtl .tool-call-group-body,")
    tool_section_end = css.index("}", tool_section_start)
    tool_section = css[tool_section_start:tool_section_end]
    assert "direction:ltr" in tool_section


def test_rtl_math_and_tables_stay_ltr():
    """KaTeX math, diff blocks, CSV tables, and file paths stay LTR even under RTL.
    Opus advisor catch on stage-371 (2026-05-16): math is LTR-only in standard
    notation, CSV columns must read left-to-right regardless of locale."""
    css = STYLE.read_text(encoding="utf-8")
    katex_section_start = css.index(".chat-content-rtl .msg-body .katex,")
    katex_section_end = css.index("}", katex_section_start)
    katex_section = css[katex_section_start:katex_section_end]
    # Must include all four key surfaces
    assert ".katex-display" in katex_section
    assert ".diff-block" in katex_section
    assert ".csv-table" in katex_section
    assert ".skill-file-path" in katex_section
    # Must force direction:ltr
    assert "direction:ltr" in katex_section
    assert "text-align:left" in katex_section


def test_rtl_setting_round_trips_through_panels_js():
    js = PANELS.read_text(encoding="utf-8")
    # Load path: read from settings + localStorage, apply class
    assert "const rtlCb=$('settingsRtl');" in js
    assert "localStorage.setItem('hermes-rtl'" in js
    assert "classList.toggle('chat-content-rtl'" in js
    # Save path: payload + body both carry rtl
    assert "payload.rtl=rtlCb.checked;" in js
    assert "body.rtl=!!($('settingsRtl')||{}).checked;" in js


def test_rtl_in_config_defaults_and_writable_keys():
    src = CONFIG.read_text(encoding="utf-8")
    assert '"rtl": False' in src, "rtl must be in DEFAULTS as opt-in"
    # Must be in the writable preference key set
    assert '"rtl",' in src


def test_rtl_localized_in_all_locales():
    js = I18N.read_text(encoding="utf-8")
    # Count occurrences — should match the 11 locale blocks
    assert js.count("settings_label_rtl:") == 15
    assert js.count("settings_desc_rtl:") == 15


def test_chat_text_is_bidirectional_without_the_layout_toggle():
    """Hebrew/Arabic paragraphs and the composer follow their own direction
    even when the whole-chat RTL layout toggle is off. Code stays LTR."""
    css = STYLE.read_text(encoding="utf-8")
    assert "html:not(.chat-content-rtl) .msg-body," in css
    assert "html:not(.chat-content-rtl) .msg-body p," in css
    assert "html:not(.chat-content-rtl) textarea#msg," in css
    assert "html:not(.chat-content-rtl) .msg-edit-area{" in css
    block_start = css.index("html:not(.chat-content-rtl) .msg-body,")
    block_end = css.index("}", block_start)
    block = css[block_start:block_end]
    assert "unicode-bidi:plaintext" in block
    assert "text-align:start" in block
    section_start = css.index("/* Automatic bidirectional chat text.")
    section_end = css.index("/* ── RTL chat layout", section_start)
    section = css[section_start:section_end]
    code_start = section.index(".msg-body pre,")
    code_end = section.index("}", code_start)
    code = section[code_start:code_end]
    assert "direction:ltr" in code
    assert "unicode-bidi:isolate" in code
    assert "text-align:left" in code
    html = INDEX.read_text(encoding="utf-8")
    assert '<textarea id="msg" dir="auto"' in html
    js = (REPO_ROOT / "static" / "ui.js").read_text(encoding="utf-8")
    assert "ta.dir = 'auto';" in js
    assert ".preview-md,\n.preview-md p," in css
    assert "#previewEditArea{" in css
    preview_start = css.index(".preview-md,\n.preview-md p,")
    preview_end = css.index("}", preview_start)
    preview = css[preview_start:preview_end]
    assert "unicode-bidi:plaintext" in preview
    assert "text-align:start" in preview
    assert ".preview-md pre," in css
    assert ".preview-md code," in css
    assert 'dir="auto"' in html and 'id="previewEditArea"' in html
    workspace = (REPO_ROOT / "static" / "workspace.js").read_text(encoding="utf-8")
    assert "target.dir='auto';" in workspace
    assert "$('previewMd').dir='ltr';" in workspace
