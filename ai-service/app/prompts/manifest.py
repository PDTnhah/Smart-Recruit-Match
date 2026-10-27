"""Checks that released prompt files are unchanged (AD-12, AC-8)."""

from pathlib import Path

from app.llm.types import PROMPT_VERSION
from app.prompts.files import MANIFEST_FILE, PROMPTS_DIR, load_active, load_manifest, prompt_hash

__all__ = ["manifest_problems", "prompt_files", "prompt_hash"]


def prompt_files(root: Path = PROMPTS_DIR) -> dict[str, Path]:
    """`<agent>/v<N>` → file, for every prompt file under root."""
    files = {}
    for path in sorted(root.glob("*/v*.md")):
        version = f"{path.parent.name}/{path.stem}"
        if PROMPT_VERSION.match(version):
            files[version] = path
    return files


def manifest_problems(root: Path = PROMPTS_DIR) -> list[str]:
    """Empty when every prompt file is released unchanged and every active version is released."""
    manifest = load_manifest(root)
    files = prompt_files(root)
    problems = []
    for version, path in files.items():
        digest = prompt_hash(path)
        if version not in manifest:
            problems.append(
                f'{version} is not in {MANIFEST_FILE}; once reviewed, add "{version}": "{digest}"'
            )
        elif manifest[version] != digest:
            agent, number = PROMPT_VERSION.match(version).group("agent", "number")
            problems.append(
                f"{version} changed after release; restore it and put the new wording in "
                f"{agent}/v{int(number) + 1}.md"
            )
    for version in manifest:
        if version not in files:
            problems.append(f"{version} is in {MANIFEST_FILE} but its file is missing")
    for agent, version in load_active(root).items():
        if version not in manifest:
            problems.append(f"active.json uses {version} for {agent}, which is not released")
    return problems
