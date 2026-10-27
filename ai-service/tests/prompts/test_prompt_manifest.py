"""US-2.2 AC-8, AD-12: a released prompt is never edited; the version in use comes from config."""

import json
import shutil
from pathlib import Path

import pytest

from app.prompts.manifest import manifest_problems, prompt_files, prompt_hash
from app.prompts.registry import PROMPTS_DIR, PromptRegistry

SAMPLE = Path(__file__).resolve().parents[1] / "fixtures" / "prompts" / "echo" / "v1.md"


def released_tree(tmp_path: Path) -> Path:
    """A prompts directory with echo/v1 released and active."""
    (tmp_path / "echo").mkdir()
    shutil.copyfile(SAMPLE, tmp_path / "echo" / "v1.md")
    write_json(tmp_path / "manifest.json", {"echo/v1": prompt_hash(tmp_path / "echo" / "v1.md")})
    write_json(tmp_path / "active.json", {"echo": "echo/v1"})
    return tmp_path


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value), encoding="utf-8")


def test_ad12_released_prompts_in_the_repo_are_unchanged():
    assert manifest_problems(PROMPTS_DIR) == []


def test_ad12_released_prompt_unchanged(tmp_path: Path):
    root = released_tree(tmp_path)
    assert manifest_problems(root) == []
    prompt = root / "echo" / "v1.md"
    prompt.write_text(prompt.read_text(encoding="utf-8") + "\nBe extra strict.\n", encoding="utf-8")
    [problem] = manifest_problems(root)
    assert "echo/v1 changed after release" in problem
    assert "echo/v2.md" in problem


def test_new_prompt_must_be_added_to_the_manifest(tmp_path: Path):
    root = released_tree(tmp_path)
    shutil.copyfile(SAMPLE, root / "echo" / "v2.md")
    [problem] = manifest_problems(root)
    digest = prompt_hash(root / "echo" / "v2.md")
    assert f'"echo/v2": "{digest}"' in problem


def test_missing_file_and_unreleased_active_version_are_reported(tmp_path: Path):
    root = released_tree(tmp_path)
    write_json(root / "active.json", {"echo": "echo/v3"})
    (root / "echo" / "v1.md").unlink()
    problems = manifest_problems(root)
    assert any("echo/v1 is in manifest.json but its file is missing" in p for p in problems)
    assert any("active.json uses echo/v3 for echo, which is not released" in p for p in problems)


def test_ad12_hash_ignores_line_endings(tmp_path: Path):
    lf = tmp_path / "lf.md"
    crlf = tmp_path / "crlf.md"
    lf.write_bytes(b"{% block system %}a\nb{% endblock %}\n")
    crlf.write_bytes(b"{% block system %}a\r\nb{% endblock %}\r\n")
    assert prompt_hash(lf) == prompt_hash(crlf)


def test_ad12_active_version_comes_from_config_not_newest_file(tmp_path: Path):
    root = released_tree(tmp_path)
    (root / "echo" / "v2.md").write_text(
        "{% block system %}Version two.{% endblock %}{% block user %}{{ message }}{% endblock %}"
    )
    variables = {"message": "hi", "context": {}}
    assert PromptRegistry(root).render("echo", variables).prompt_version == "echo/v1"
    configured = PromptRegistry(root, active={"echo": "echo/v2"}).render("echo", variables)
    assert (configured.prompt_version, configured.system) == ("echo/v2", "Version two.")


def test_unknown_agent_and_mismatched_version_are_errors(tmp_path: Path):
    registry = PromptRegistry(released_tree(tmp_path))
    with pytest.raises(KeyError, match="no active prompt version"):
        registry.render("cv_parser", {})
    with pytest.raises(ValueError, match="not a version of agent"):
        registry.render("echo", {}, version="cv_parser/v1")


def test_prompt_files_ignore_other_names(tmp_path: Path):
    root = released_tree(tmp_path)
    (root / "echo" / "notes.md").write_text("draft")
    (root / "echo" / "v0.md").write_text("draft")
    assert list(prompt_files(root)) == ["echo/v1"]


def test_ad12_registry_with_manifest_renders_only_released_prompts(tmp_path: Path):
    root = released_tree(tmp_path)
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    (root / "echo" / "v2.md").write_text(
        "{% block system %}Draft.{% endblock %}{% block user %}{{ message }}{% endblock %}"
    )
    variables = {"message": "hi", "context": {}}
    # An override such as LLM_PROMPT_VERSIONS cannot run a draft in production.
    draft = PromptRegistry(root, active={"echo": "echo/v2"}, manifest=manifest)
    with pytest.raises(ValueError, match="echo/v2 is not released"):
        draft.render("echo", variables)
    released = PromptRegistry(root, manifest=manifest)
    assert released.render("echo", variables).prompt_version == "echo/v1"
    prompt = root / "echo" / "v1.md"
    prompt.write_text(prompt.read_text(encoding="utf-8") + "\nEdited.\n", encoding="utf-8")
    with pytest.raises(ValueError, match="echo/v1 changed after release"):
        PromptRegistry(root, manifest=manifest).render("echo", variables)


def test_production_registry_checks_the_manifest(tmp_path: Path):
    from app.llm.factory import build_prompt_registry
    from app.llm.settings import load_llm_settings

    settings = load_llm_settings(
        {
            "LLM_PROVIDER": "fixture",
            "LLM_FIXTURES_DIR": str(tmp_path),
            "LLM_PROMPT_VERSIONS": '{"cv_parser": "cv_parser/v9"}',
        }
    )
    with pytest.raises(ValueError, match="cv_parser/v9 is not released"):
        build_prompt_registry(settings).render("cv_parser", {})
