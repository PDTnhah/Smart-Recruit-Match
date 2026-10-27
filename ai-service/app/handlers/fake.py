"""Failures on purpose, so the end-to-end test drives the retry and DLQ paths through a real worker
(US-2.1, CONTEXT D33, D37).

With AI_FAKE_FILE_KEYS set, a CV whose file_key starts with a marker below fails without reading
the file; any other CV goes to the real handler. Compose never sets it.
"""

from app.consumers.base import Handler
from app.consumers.errors import PermanentError, RetryableError
from app.contracts.cv_parse_job import CvParseJob
from app.contracts.cv_parse_output import CvParseOutput

RETRYABLE_MARKER = "__fake__/retryable"
PERMANENT_MARKER = "__fake__/permanent"


def with_fake_markers(handler: Handler) -> Handler:
    async def handle(job: CvParseJob) -> CvParseOutput:
        if job.file_key.startswith(RETRYABLE_MARKER):
            raise RetryableError("fake transient failure")
        if job.file_key.startswith(PERMANENT_MARKER):
            raise PermanentError("fake permanent failure", code="FAKE_PERMANENT")
        return await handler(job)

    return handle
