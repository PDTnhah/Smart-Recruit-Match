"""Loads and renders versioned prompts (AD-12, AC-8 to AC-10).

Each `<agent>/v<N>.md` is a Jinja2 template with two blocks:

    {% block system %}Fixed instructions and rubric. No variables.{% endblock %}
    {% block user %}{{ cv_text | untrusted("cv_document") }}{% endblock %}

`system` is rendered with no variables, so it is byte-identical on every call and stays cacheable;
any variable in it fails the render (AC-9). Data goes in `user`, through the `untrusted` and
`tojson_sorted` filters (AC-10). The version in use comes from active.json plus
LLM_PROMPT_VERSIONS, never from "the newest file" (AC-8). Given a manifest, the registry renders
only released files whose hash still matches, so a configuration override cannot run a draft.
"""

from collections.abc import Mapping
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, StrictUndefined, UndefinedError

from app.llm.render import dumps_sorted, wrap_untrusted
from app.llm.types import PROMPT_VERSION, RenderedPrompt
from app.prompts.files import PROMPTS_DIR, load_active, prompt_hash

BLOCKS = ("system", "user")


class PromptRegistry:
    def __init__(
        self,
        root: Path = PROMPTS_DIR,
        active: Mapping[str, str] | None = None,
        manifest: Mapping[str, str] | None = None,
    ) -> None:
        self._root = root
        self._env = Environment(
            loader=FileSystemLoader(root),
            undefined=StrictUndefined,
            autoescape=False,
            keep_trailing_newline=False,
        )
        self._env.filters["tojson_sorted"] = dumps_sorted
        self._env.filters["untrusted"] = wrap_untrusted
        self._active = dict(load_active(root) if active is None else active)
        self._manifest = manifest
        self._released: set[str] = set()

    def active_version(self, agent: str) -> str:
        if agent not in self._active:
            raise KeyError(
                f"no active prompt version for agent {agent!r} (app/prompts/active.json)"
            )
        return self._active[agent]

    def render(
        self, agent: str, variables: Mapping[str, Any], *, version: str | None = None
    ) -> RenderedPrompt:
        prompt_version = version or self.active_version(agent)
        match = PROMPT_VERSION.match(prompt_version)
        if not match or match["agent"] != agent:
            raise ValueError(f"{prompt_version!r} is not a version of agent {agent!r}")
        name = f"{agent}/v{match['number']}.md"
        self._check_released(prompt_version, name)
        template = self._env.get_template(name)
        missing = [block for block in BLOCKS if block not in template.blocks]
        if missing:
            raise ValueError(f"{prompt_version} lacks block(s) {missing}")
        try:
            system = "".join(template.blocks["system"](template.new_context({}))).strip()
        except UndefinedError as error:
            raise ValueError(
                f"{prompt_version}: the system block must not use variables (AC-9): {error}"
            ) from error
        context = template.new_context(dict(variables))
        user = "".join(template.blocks["user"](context)).strip()
        return RenderedPrompt(prompt_version=prompt_version, system=system, user=user)

    def _check_released(self, prompt_version: str, name: str) -> None:
        if self._manifest is None or prompt_version in self._released:
            return
        if prompt_version not in self._manifest:
            raise ValueError(f"{prompt_version} is not released (app/prompts/manifest.json)")
        if prompt_hash(self._root / name) != self._manifest[prompt_version]:
            raise ValueError(f"{prompt_version} changed after release; create a new version")
        self._released.add(prompt_version)
