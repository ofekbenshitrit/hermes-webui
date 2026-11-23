"""Choice-card presentation for clarify prompts.

The card above the composer is how a clarify() call is answered: a numbered
row per option, a recommended mark, and a free-text row. Choice strings stay
the agent's labels; this only splits a reason and the recommended suffix out
for display.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).parent.parent.resolve()
MESSAGES_JS = REPO / "static" / "messages.js"
NODE = shutil.which("node")

pytestmark = pytest.mark.skipif(NODE is None, reason="node not on PATH")


def test_clarify_card_uses_choice_rows():
    html = (REPO / "static" / "index.html").read_text(encoding="utf-8")
    css = (REPO / "static" / "style.css").read_text(encoding="utf-8")
    js = MESSAGES_JS.read_text(encoding="utf-8")
    prompt = (REPO / "api" / "streaming.py").read_text(encoding="utf-8")
    assert 'class="clarify-needs"' in html
    assert 'data-i18n="clarify_later"' in html
    assert ".clarify-choice-desc" in css
    assert ".clarify-recommended" in css
    assert ".clarify-card.has-choices:not(.is-custom) .clarify-response" in css
    assert "function _parseClarifyChoice(" in js
    assert 'card.classList.toggle("has-choices"' in js
    assert "call the clarify tool instead of listing options in the chat" in prompt


def test_parse_clarify_choice_splits_reason_and_recommended_mark():
    script = r"""
const fs = require('fs');
const src = fs.readFileSync(process.argv[1], 'utf8');
const marker = 'function _parseClarifyChoice(';
const start = src.indexOf(marker);
if (start < 0) throw new Error('missing parser');
const brace = src.indexOf('{', src.indexOf(')', start));
let depth = 0;
let end = -1;
for (let i = brace; i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') {
    depth--;
    if (depth === 0) { end = i + 1; break; }
  }
}
eval(src.slice(start, end));
const cases = {
  plain: _parseClarifyChoice('SQS'),
  reason: _parseClarifyChoice('Kafka — durable log you can replay'),
  hyphen: _parseClarifyChoice('SQS - Managed, nothing to run'),
  recommended: _parseClarifyChoice('Postgres (Recommended)'),
  both: _parseClarifyChoice('Kafka — durable log (Recommended)'),
  paren: _parseClarifyChoice('Shoulder Senseq (מכשיר חימום לכתף)'),
};
process.stdout.write(JSON.stringify(cases));
"""
    result = subprocess.run(
        [NODE, "-e", script, str(MESSAGES_JS)],
        check=True,
        capture_output=True,
        text=True,
    )
    cases = json.loads(result.stdout)
    assert cases["plain"] == {
        "value": "SQS",
        "answer": "SQS",
        "title": "SQS",
        "description": "",
        "recommended": False,
    }
    assert cases["reason"]["title"] == "Kafka"
    assert cases["reason"]["description"] == "durable log you can replay"
    assert cases["reason"]["recommended"] is False
    assert cases["reason"]["answer"] == "Kafka — durable log you can replay"
    assert cases["hyphen"]["title"] == "SQS"
    assert cases["hyphen"]["description"] == "Managed, nothing to run"
    assert cases["recommended"]["title"] == "Postgres"
    assert cases["recommended"]["answer"] == "Postgres"
    assert cases["recommended"]["recommended"] is True
    assert cases["recommended"]["description"] == ""
    assert cases["both"]["title"] == "Kafka"
    assert cases["both"]["description"] == "durable log"
    assert cases["both"]["answer"] == "Kafka — durable log"
    assert cases["both"]["recommended"] is True
    assert cases["paren"]["title"] == "Shoulder Senseq"
    assert "מכשיר" in cases["paren"]["description"]
