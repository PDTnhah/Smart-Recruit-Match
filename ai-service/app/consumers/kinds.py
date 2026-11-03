"""Every job type the worker consumes, with its generated contract models (AD-6)."""

from pydantic import BaseModel

from app.consumers.base import JobKind
from app.contracts.ai_result_status import AiResultStatus
from app.contracts.cv_parse_job import CvParseJob
from app.contracts.cv_parse_result import CvParseResult
from app.contracts.jd_analyze_job import JdAnalyzeJob
from app.contracts.jd_analyze_result import JdAnalyzeResult
from app.contracts.match_run_job import MatchRunJob
from app.contracts.match_run_result import MatchRunResult
from app.contracts.skill_normalize_job import SkillNormalizeJob
from app.contracts.skill_normalize_result import SkillNormalizeResult
from app.queues import QUEUES


def match_status(output: BaseModel) -> AiResultStatus:
    """A MATCH result lists the pairs left without an assessment; any makes it PARTIAL (AC-9)."""
    failed = getattr(output, "failed_pairs", None)
    return AiResultStatus.PARTIAL if failed else AiResultStatus.SUCCEEDED


JOB_KINDS: dict[str, JobKind] = {
    "CV_PARSE": JobKind("CV_PARSE", QUEUES.jobs["CV_PARSE"], CvParseJob, CvParseResult),
    "JD_ANALYZE": JobKind("JD_ANALYZE", QUEUES.jobs["JD_ANALYZE"], JdAnalyzeJob, JdAnalyzeResult),
    "SKILL_NORMALIZE": JobKind(
        "SKILL_NORMALIZE",
        QUEUES.jobs["SKILL_NORMALIZE"],
        SkillNormalizeJob,
        SkillNormalizeResult,
    ),
    "MATCH": JobKind(
        "MATCH", QUEUES.jobs["MATCH"], MatchRunJob, MatchRunResult, status_of=match_status
    ),
}
