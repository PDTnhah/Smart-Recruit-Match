"""Every job type the worker consumes, with its generated contract models (AD-6)."""

from app.consumers.base import JobKind
from app.contracts.cv_parse_job import CvParseJob
from app.contracts.cv_parse_result import CvParseResult
from app.contracts.jd_analyze_job import JdAnalyzeJob
from app.contracts.jd_analyze_result import JdAnalyzeResult
from app.queues import QUEUES

JOB_KINDS: dict[str, JobKind] = {
    "CV_PARSE": JobKind("CV_PARSE", QUEUES.jobs["CV_PARSE"], CvParseJob, CvParseResult),
    "JD_ANALYZE": JobKind("JD_ANALYZE", QUEUES.jobs["JD_ANALYZE"], JdAnalyzeJob, JdAnalyzeResult),
}
