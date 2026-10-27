"""US-2.2 AC-12, AD-10: only app/llm may import a provider SDK; agents go through LLMClient."""

import ast
from pathlib import Path

APP = Path(__file__).resolve().parents[2] / "app"
SDK_PACKAGES = ("anthropic", "google.genai", "google.generativeai")


def sdk_imports(path: Path) -> list[str]:
    found = []
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            names = [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            # `from google import genai` imports google.genai.
            names = [node.module, *(f"{node.module}.{alias.name}" for alias in node.names)]
        else:
            continue
        found += [
            name
            for name in names
            if any(name == sdk or name.startswith(f"{sdk}.") for sdk in SDK_PACKAGES)
        ]
    return found


def violations(root: Path) -> dict[str, list[str]]:
    allowed = root / "llm"
    return {
        str(path.relative_to(root)): imports
        for path in sorted(root.rglob("*.py"))
        if allowed not in path.parents and (imports := sdk_imports(path))
    }


def test_ad10_only_app_llm_imports_provider_sdks():
    assert violations(APP) == {}


def test_the_scan_catches_every_import_form(tmp_path: Path):
    agents = tmp_path / "agents"
    agents.mkdir()
    (agents / "a.py").write_text("import anthropic\n")
    (agents / "b.py").write_text("from google import genai\n")
    (agents / "c.py").write_text("from google.genai import types\n")
    (agents / "d.py").write_text("from app.llm.client import LLMClient\n")
    (tmp_path / "llm").mkdir()
    (tmp_path / "llm" / "ok.py").write_text("import anthropic\n")
    assert set(violations(tmp_path)) == {
        str(Path("agents/a.py")),
        str(Path("agents/b.py")),
        str(Path("agents/c.py")),
    }
