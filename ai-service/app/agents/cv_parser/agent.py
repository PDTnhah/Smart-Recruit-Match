"""CV Parser: one structured LLM call that turns a student's CV into a competence profile, with the
personal data split off and masked by code (US-2.4, PRD GĐ2 step 3, FR-11, BR-03, NFR-3,
ARCHITECTURE › Pipeline từng agent › CV Parser, CONTEXT D37).

1. Read the file from cv-files; extract its visible text, dropping hidden text (AC-2, AC-3).
2. A PDF without readable text (a scan) is sent whole to the model as a document (AC-4).
3. Otherwise emails and phone numbers are masked (AC-5) and the text goes in <cv_document>.
4. Call the LLMClient with effort low and the CvExtraction schema (AD-10, AD-12).
5. Put the contacts back into the profile, run the steps of US-2.5 (skill catalogue, embedding),
   build pii, profile_masked and the masked text by code, and check nothing personal is left
   (AC-6, AC-7).

The AI Service never writes core (AD-4): the backend encrypts pii and stores the result.
"""

import logging
from collections.abc import Awaitable, Callable, Sequence
from typing import Any, Self

import anyio
from pydantic import ConfigDict, model_validator

from app.consumers.errors import PermanentError, flag_hidden_text
from app.contracts.cv_extraction import CvExtraction
from app.contracts.cv_parse_job import CvParseJob
from app.contracts.cv_parse_output import CvParseOutput
from app.contracts.cv_profile import CvProfile
from app.contracts.cv_source import CvSource
from app.llm.client import LLMClient
from app.llm.effort import EFFORT_BY_AGENT
from app.llm.types import Document
from app.parsing import PDF_MAGIC, DocumentError, ExtractedText, RemovedSpan, extract_text
from app.parsing.pii import (
    MaskedContacts,
    build_pii,
    find_pii,
    mask_contacts,
    mask_profile,
    mask_text,
    strings_of,
    unmask,
)
from app.prompts.registry import PromptRegistry
from app.storage import CV_FILES_BUCKET, ObjectReader

logger = logging.getLogger(__name__)

AGENT = "cv_parser"
MAX_CV_CHARACTERS = 30_000
"""A CV is a page or three; anything longer is cut, so a padded file cannot inflate the cost."""
MIN_TEXT_CHARACTERS = 100
"""A PDF with images and less visible text than this is read as a scan: scanner apps stamp a short
text watermark on page images (CONTEXT D37)."""
MAX_LOGGED_SPAN = 200

ProfileStep = Callable[[CvProfile], Awaitable[CvProfile]]
"""A step on the profile before it is masked: skill catalogue and embedding of US-2.5
(ARCHITECTURE › Pipeline CV Parser, steps 6 and 8)."""


class CheckedCvExtraction(CvExtraction):
    """The generated contract read as Zod reads it: every text is trimmed before its length is
    checked (`.trim().min(1)`), so an answer with a blank text is invalid output and the
    LLMClient asks again (US-2.2 AC-4) instead of the backend refusing the whole result."""

    # The schema sent to the LLM keeps the contract's description, not this docstring.
    model_config = ConfigDict(
        title="CvExtraction",
        json_schema_extra={"description": "Structured output of the CV Parser"},
    )

    @model_validator(mode="before")
    @classmethod
    def _trimmed(cls, data: Any) -> Any:
        return _strip_strings(data)

    @model_validator(mode="after")
    def _no_blank_text(self) -> Self:
        if any(not text.strip() for text in strings_of(self.model_dump(mode="json"))):
            raise ValueError("texts must not be blank")
        return self


class CvParser:
    """The CV_PARSE handler: called with the job, returns the result for ai.results."""

    def __init__(
        self,
        *,
        files: ObjectReader,
        llm: LLMClient,
        prompts: PromptRegistry,
        mask_contacts: bool = True,
        profile_steps: Sequence[ProfileStep] = (),
        extract: Callable[[bytes], ExtractedText] = extract_text,
    ) -> None:
        self._files = files
        self._llm = llm
        self._prompts = prompts
        self._mask_contacts = mask_contacts
        self._profile_steps = tuple(profile_steps)
        self._extract = extract

    async def __call__(self, job: CvParseJob) -> CvParseOutput:
        data = await self._files.get_bytes(CV_FILES_BUCKET, job.file_key)
        extracted = await self._read(job, data)
        source = source_of(data, extracted)
        removed = extracted.removed
        if removed:
            _log_removed(job, removed)
        try:
            return await self._parse(job, data, extracted, source)
        except Exception as error:
            # A failed analysis still tells staff the file hid text (AC-2, CONTEXT D35).
            if removed:
                flag_hidden_text(error)
            raise

    async def _read(self, job: CvParseJob, data: bytes) -> ExtractedText:
        try:
            return await anyio.to_thread.run_sync(self._extract, data)
        except DocumentError as error:
            raise PermanentError(f"CV {job.cv_id}: {error}", code="CV_FILE_UNREADABLE") from error

    async def _parse(
        self, job: CvParseJob, data: bytes, extracted: ExtractedText, source: CvSource
    ) -> CvParseOutput:
        scanned = source is CvSource.SCANNED_PDF
        if scanned:
            if extracted.removed:
                # The model would read the whole file, hidden text included (AC-4 vs AC-2).
                raise PermanentError(
                    f"CV {job.cv_id}: a scan-like PDF with hidden text cannot be sent whole",
                    code="CV_SCAN_WITH_HIDDEN_TEXT",
                )
            text = ""
            contacts = MaskedContacts("", {})
            documents = [Document("application/pdf", data)]
        else:
            text = _cut(job, extracted.text.strip())
            if not text:
                raise PermanentError(f"CV {job.cv_id} has no readable text", code="CV_NO_TEXT")
            contacts = mask_contacts(text) if self._mask_contacts else MaskedContacts(text, {})
            documents = []
        prompt = self._prompts.render(AGENT, {"scanned": scanned, "cv_text": contacts.text})
        result = await self._llm.generate(
            prompt=prompt,
            output_model=CheckedCvExtraction,
            effort=EFFORT_BY_AGENT[AGENT],
            job_id=job.job_id,
            documents=documents,
        )
        profile = CvProfile.model_validate(
            unmask(result.data.profile.model_dump(mode="json"), contacts.tokens)
        )
        for step in self._profile_steps:
            profile = await step(profile)
        # A text CV shows no photo to the model; its embedded images decide (CONTEXT D37).
        pii = build_pii(
            result.data.personal, contacts, has_photo=None if scanned else extracted.has_images
        )
        profile_masked = mask_profile(profile, pii)
        masked_text = mask_text(text, pii) if text else None
        left = sorted(
            {
                token
                for value in [*strings_of(profile_masked.model_dump()), masked_text or ""]
                for token in find_pii(value, pii)
            }
        )
        if left:
            # Only the kinds, never the values: this message reaches logs and ai.results.
            raise PermanentError(
                f"CV {job.cv_id}: personal data left after masking: {', '.join(left)}",
                code="PII_MASK_FAILED",
            )
        return CvParseOutput(
            prompt_version=result.prompt_version,
            model=result.model,
            cv_id=job.cv_id,
            cv_version=job.cv_version,
            source=source,
            profile=profile,
            pii=pii,
            profile_masked=profile_masked,
            masked_text=masked_text,
            hidden_text_detected=bool(extracted.removed),
        )


def source_of(data: bytes, extracted: ExtractedText) -> CvSource:
    """DOCX, a PDF with a text layer, or a PDF read as a scan (AC-4, CONTEXT D37)."""
    if not data.startswith(PDF_MAGIC):
        return CvSource.DOCX
    if not extracted.has_text_layer:
        return CvSource.SCANNED_PDF
    visible = sum(not char.isspace() for char in extracted.text)
    if extracted.has_images and visible < MIN_TEXT_CHARACTERS:
        return CvSource.SCANNED_PDF
    return CvSource.TEXT_PDF


def _cut(job: CvParseJob, text: str) -> str:
    if len(text) > MAX_CV_CHARACTERS:
        logger.warning(
            "cv %s: text cut from %d to %d characters", job.cv_id, len(text), MAX_CV_CHARACTERS
        )
        return text[:MAX_CV_CHARACTERS]
    return text


def _strip_strings(value: Any) -> Any:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        return [_strip_strings(item) for item in value]
    if isinstance(value, dict):
        return {key: _strip_strings(item) for key, item in value.items()}
    return value


def _log_removed(job: CvParseJob, removed: tuple[RemovedSpan, ...]) -> None:
    """The job log keeps what was dropped, for staff; the prompt never sees it (AC-2)."""
    logger.warning(
        "cv %s v%s: removed %d hidden span(s): %s",
        job.cv_id,
        job.cv_version,
        len(removed),
        "; ".join(
            f"[{span.reason} {span.location}] {span.text[:MAX_LOGGED_SPAN]!r}" for span in removed
        ),
    )
