"""US-3.5 AC-14: cv_parser/v2 asks for more evidence; the CvExtraction schema and v1 are unchanged.

Code now matches skills against the profile (CONTEXT D42), so v2 asks the model for every
technology of a project, its role, and the soft skills the CV lists. The rest of v1 stays word for
word, the injection rules included.
"""

from app.prompts.files import load_active, load_manifest
from app.prompts.registry import PromptRegistry

V1, V2 = "cv_parser/v1", "cv_parser/v2"
REGISTRY = PromptRegistry(manifest=load_manifest())


def system(version: str) -> str:
    return REGISTRY.render("cv_parser", {"scanned": True}, version=version).system


def skills_and_projects(text: str) -> tuple[str, str]:
    """(the skills and projects bullets, the rest of the system prompt)."""
    head, rest = text.split("   - skills:", 1)
    bullets, tail = rest.split("   - experience:", 1)
    return bullets, head + tail


def test_gd2_v2_is_active_and_released():
    assert load_active()["cv_parser"] == V2
    assert {V1, V2} <= set(load_manifest())


def test_gd2_v2_lists_every_project_technology_role_and_soft_skill():
    bullets, _ = skills_and_projects(system(V2))
    text = " ".join(bullets.split())
    # (a) every technology of a project, also those named only in its description
    assert "technologies: every programming language, framework, library, database" in text
    assert "whether in a technology line or in the description" in text
    assert "Do not add one the CV does not name for this project" in text
    # (b) the role when the CV states one
    assert "role: the student's role in the project as the CV states it" in text
    assert "Null when the CV does not state one; do not infer it" in text
    # (c) soft skills as written; personality traits still left out
    assert 'Also list the soft skills the CV names as skills, such as "Làm việc nhóm"' in text
    assert "Write each name as the CV writes it" in text
    assert "Leave out personality traits (hard-working" in text


def test_gd2_v2_changes_only_the_skills_and_projects_instructions():
    v1_bullets, v1_rest = skills_and_projects(system(V1))
    v2_bullets, v2_rest = skills_and_projects(system(V2))
    assert v2_rest == v1_rest
    assert v2_bullets != v1_bullets
    assert "Leave out personality traits and soft skills" in v1_bullets, "v1 is not edited"


def test_gd2_v2_renders_the_cv_the_same_way_as_v1():
    for variables in ({"scanned": False, "cv_text": "Skills: Java."}, {"scanned": True}):
        v1 = REGISTRY.render("cv_parser", variables, version=V1)
        v2 = REGISTRY.render("cv_parser", variables, version=V2)
        assert v2.user == v1.user
