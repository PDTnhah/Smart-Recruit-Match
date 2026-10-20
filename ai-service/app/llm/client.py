"""What an agent sees of the LLM (NFR-12, AD-10, CONTEXT D34).

    result = await llm.generate(
        prompt=prompts.render("cv_parser", {"cv_text": text}),
        output_model=CvProfile,
        effort=EFFORT_BY_AGENT["cv_parser"],
        job_id=job.job_id,
    )
    CvParseOutput(..., prompt_version=result.prompt_version, model=result.model)

`effort` has no default, so forgetting it fails at the call (AC-2). A refusal or output that stays
invalid raises NeedsHumanReview; a provider outage raises RetryableError (US-2.1 job layer).
"""

from typing import Protocol
from uuid import UUID

from pydantic import BaseModel

from app.llm.types import Effort, LLMResult, RenderedPrompt


class LLMClient(Protocol):
    async def generate[T: BaseModel](
        self,
        *,
        prompt: RenderedPrompt,
        output_model: type[T],
        effort: Effort,
        job_id: UUID | None,
        max_output_tokens: int | None = None,
    ) -> LLMResult[T]: ...
