"""Fixed results to exercise the job pipeline before the real agents exist (US-2.1).

A CV whose file_key starts with a marker below makes the fake fail, so the end-to-end test can
drive the retry and DLQ paths through a real worker without a test-only setting.
"""

from app.consumers.errors import PermanentError, RetryableError
from app.contracts.cv_parse_job import CvParseJob
from app.contracts.cv_parse_output import CvParseOutput
from app.contracts.jd_analyze_job import JdAnalyzeJob
from app.contracts.jd_analyze_output import JdAnalyzeOutput

FAKE_PROMPT_VERSION = "fake/v0"
FAKE_MODEL = "fake"
RETRYABLE_MARKER = "__fake__/retryable"
PERMANENT_MARKER = "__fake__/permanent"


async def fake_cv_parse(job: CvParseJob) -> CvParseOutput:
    if job.file_key.startswith(RETRYABLE_MARKER):
        raise RetryableError("fake transient failure")
    if job.file_key.startswith(PERMANENT_MARKER):
        raise PermanentError("fake permanent failure", code="FAKE_PERMANENT")
    return CvParseOutput(prompt_version=FAKE_PROMPT_VERSION, model=FAKE_MODEL)


async def fake_jd_analyze(job: JdAnalyzeJob) -> JdAnalyzeOutput:
    return JdAnalyzeOutput(prompt_version=FAKE_PROMPT_VERSION, model=FAKE_MODEL)
