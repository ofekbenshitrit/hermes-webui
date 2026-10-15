"""Markdown file editing uses the formatted preview, not the raw textarea."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WS = (ROOT / "static" / "workspace.js").read_text(encoding="utf-8")
HTML = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
CSS = (ROOT / "static" / "style.css").read_text(encoding="utf-8")


def test_markdown_edit_enters_formatted_preview():
    assert "function _enterFormattedMarkdownEdit" in WS
    assert "_enterFormattedMarkdownEdit(currentText)" in WS
    assert "el.contentEditable='true'" in WS or 'el.contentEditable = "true"' in WS or "el.contentEditable='true'" in WS


def test_markdown_save_serializes_preview_dom():
    assert "function _markdownFromPreview" in WS
    assert "_markdownFromPreview($('previewMd'))" in WS
    assert "renderCsvPreviewContent(_previewCurrentPath, savedContent)" in WS


def test_format_toolbar_is_present():
    assert 'id="previewFormatBar"' in HTML
    assert ".preview-format-bar.is-on{display:flex;}" in CSS
    assert '.preview-md[contenteditable="true"]' in CSS
