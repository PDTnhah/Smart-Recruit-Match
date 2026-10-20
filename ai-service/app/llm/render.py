"""Helpers that put data into prompts safely and cache-friendly (AC-9, AC-10, AGENTS › Invariant 6).

- `dumps_sorted` gives the same bytes for the same data, so the prompt prefix stays cacheable.
- `wrap_untrusted` puts a CV, JD or answer inside its own tag and breaks any copy of that tag inside
  the data, so the data cannot close the block and pose as instructions.
"""

import json
import re
from typing import Any

TAG_NAME = re.compile(r"^[a-z][a-z0-9_]*$")


def dumps_sorted(value: Any) -> str:
    """JSON for prompts: keys sorted, Vietnamese kept as is."""
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def wrap_untrusted(text: str, tag: str) -> str:
    """`<tag>` + text + `</tag>`, with `<tag` and `</tag` inside the text escaped as `&lt;`."""
    if not TAG_NAME.match(tag):
        raise ValueError(f"tag must be lower_snake_case: {tag!r}")
    pattern = re.compile(rf"<(\s*/?\s*{tag})(?=[\s/>]|$)", re.IGNORECASE)
    return f"<{tag}>\n{pattern.sub(r'&lt;\1', text)}\n</{tag}>"
