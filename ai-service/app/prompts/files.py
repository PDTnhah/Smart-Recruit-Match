"""Where prompt files live and how a released one is identified (AD-12, CONTEXT D34).

The hash is taken after turning CRLF into LF, so a Windows checkout and CI agree.
"""

import hashlib
import json
from pathlib import Path

PROMPTS_DIR = Path(__file__).parent
ACTIVE_FILE = "active.json"
MANIFEST_FILE = "manifest.json"


def prompt_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def load_active(root: Path = PROMPTS_DIR) -> dict[str, str]:
    return json.loads((root / ACTIVE_FILE).read_text(encoding="utf-8"))


def load_manifest(root: Path = PROMPTS_DIR) -> dict[str, str]:
    return json.loads((root / MANIFEST_FILE).read_text(encoding="utf-8"))
