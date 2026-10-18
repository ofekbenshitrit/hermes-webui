"""Composer session submenus fly out beside the parent menu.

Hovering a row opens Profile, Workspace, Thinking, or Model beside the session
menu: to the right when that side has room, otherwise to the left.
"""
import json
import subprocess
import textwrap
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
UI_JS = (REPO / "static" / "ui.js").read_text(encoding="utf-8")
HTML = (REPO / "static" / "index.html").read_text(encoding="utf-8")
CSS = (REPO / "static" / "style.css").read_text(encoding="utf-8")


def _function_body(src: str, marker: str) -> str:
    start = src.index(marker)
    depth = 0
    opened = False
    for idx, ch in enumerate(src[start:], start):
        if ch == "{":
            depth += 1
            opened = True
        elif ch == "}":
            depth -= 1
            if opened and depth == 0:
                return src[start : idx + 1]
    raise AssertionError(f"Could not extract function body for {marker}")


def test_session_rows_expose_hover_flyout_actions():
    menu = HTML[HTML.index('id="composerSessionMenu"') : HTML.index('id="composerSessionMenu"') + 1800]
    for action in ("profile", "workspace", "thinking", "model"):
        assert f'data-session-action="{action}"' in menu
        assert 'aria-haspopup="menu"' in menu
    assert "mouseover" in UI_JS
    assert "_scheduleComposerSessionFlyout" in UI_JS
    assert "(hover: hover) and (pointer: fine)" in UI_JS
    assert "composer-session-flyout" in CSS


def test_flyout_opens_right_then_left_when_the_right_side_is_tight():
    snippets = [
        _function_body(UI_JS, "function _sessionFlyoutBounds("),
        _function_body(UI_JS, "function _sessionFlyoutIsFixed("),
        _function_body(UI_JS, "function _positionSessionFlyout("),
    ]
    script = textwrap.dedent(
        f"""
        const assert = require('assert');
        const snippets = {json.dumps(snippets)};
        class ClassList {{
          constructor(el) {{ this.el = el; this.set = new Set(); }}
          add(n) {{ this.set.add(n); this._sync(); }}
          remove(n) {{ this.set.delete(n); this._sync(); }}
          contains(n) {{ return this.set.has(n); }}
          toggle(n, f) {{
            if (f === undefined) f = !this.set.has(n);
            if (f) this.add(n); else this.remove(n);
            return f;
          }}
          _sync() {{ this.el.className = [...this.set].join(' '); }}
        }}
        class Node {{
          constructor(id) {{
            this.id = id || '';
            this.hidden = false;
            this.classList = new ClassList(this);
            this.style = {{}};
            this.dataset = {{}};
            this.offsetWidth = 200;
            this.offsetHeight = 120;
            this._rect = {{left:0, top:400, right:0, bottom:520, width:0, height:120}};
            this._active = null;
          }}
          querySelector() {{ return this._active; }}
          getBoundingClientRect() {{ return this._rect; }}
        }}
        const menu = new Node('composerSessionMenu');
        menu._rect = {{left:120, top:360, right:400, bottom:520, width:280, height:160}};
        const row = new Node('composerSessionModelRow');
        row._rect = {{left:120, top:470, right:400, bottom:502, width:280, height:32}};
        const footer = new Node('footer');
        footer._rect = {{left:40, top:560, right:900, bottom:600, width:860, height:40}};
        const main = new Node('main');
        main._rect = {{left:0, top:0, right:1200, bottom:800, width:1200, height:800}};
        const dd = new Node('composerModelDropdown');
        const active = new Node('active');
        active._rect = {{left:0, top:470, right:200, bottom:502, width:200, height:32}};
        dd._active = active;
        const elements = new Map([
          ['composerSessionMenu', menu],
          ['composerModelDropdown', dd],
        ]);
        globalThis.document = {{
          getElementById: (id) => elements.get(id) || null,
          querySelector: (sel) => sel === '.main' ? main : (sel === '.composer-footer' ? footer : null),
        }};
        globalThis.$ = (id) => elements.get(id) || null;
        globalThis.window = {{
          matchMedia: () => ({{matches: false}}),
          innerWidth: 1200,
          innerHeight: 800,
        }};
        globalThis.getComputedStyle = () => ({{position: 'absolute'}});
        eval(snippets.join('\\n'));

        assert.strictEqual(_positionSessionFlyout(dd, row), true);
        assert.strictEqual(dd.dataset.flyoutSide, 'right');
        assert.strictEqual(dd.style.left, '368px');
        assert.strictEqual(dd.classList.contains('composer-session-flyout-left'), false);

        menu._rect = {{left:980, top:360, right:1180, bottom:520, width:200, height:160}};
        row._rect = {{left:980, top:470, right:1180, bottom:502, width:200, height:32}};
        assert.strictEqual(_positionSessionFlyout(dd, row), true);
        assert.strictEqual(dd.dataset.flyoutSide, 'left');
        assert.strictEqual(dd.classList.contains('composer-session-flyout-left'), true);
        const left = parseFloat(dd.style.left);
        const viewLeft = left + footer._rect.left;
        assert.ok(viewLeft + dd.offsetWidth <= menu._rect.left, 'left flyout must sit before the parent menu');
        """
    )
    result = subprocess.run(["node", "-e", script], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr or result.stdout
