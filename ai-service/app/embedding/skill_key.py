"""Key two skill names are matched by (US-2.5 AC-3, CONTEXT D39).

The same function as `skillMatchKey` in packages/shared/contracts/skills.ts: NFKC, lower case,
without whitespace, dots, hyphens, underscores and slashes; `+` and `#` stay ("C++", "C#"). Both are
tested with packages/shared/contracts/fixtures/skill-key-cases.json.
"""

import re
import unicodedata

KEY_SEPARATORS = re.compile(r"[\s._/-]+")


def skill_match_key(name: str) -> str:
    return KEY_SEPARATORS.sub("", unicodedata.normalize("NFKC", name).lower())
