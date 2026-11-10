"""Every job type the worker consumes, with its generated contract models (AD-6)."""

from pydantic import BaseModel

from app.consumers.base import JobKind
from app.contracts.ai_result_status import AiResultStatus
from app.contracts.cv_parse_job import CvParseJob
from app.contracts.cv_parse_result import CvParseResult
from app.contracts.essay_grade_job import EssayGradeJob
from app.contracts.essay_grade_result import EssayGradeResult
from app.contracts.jd_analyze_job import JdAnalyzeJob
from app.contracts.jd_analyze_result import JdAnalyzeResult
from app.contracts.match_run_job import MatchRunJob
from app.contracts.match_run_result import MatchRunResult
from app.contracts.questions_generate_job import QuestionsGenerateJob
from app.contracts.questions_generate_result import QuestionsGenerateResult
from app.contracts.skill_normalize_job import SkillNormalizeJob
from app.contracts.skill_normalize_result import SkillNormalizeResult
from app.queues import QUEUES


def match_status(output: BaseModel) -> AiResultStatus:
    """A MATCH result lists the pairs left without an assessment; any makes it PARTIAL (AC-9)."""
    failed = getattr(output, "failed_pairs", None)
    return AiResultStatus.PARTIAL if failed else AiResultStatus.SUCCEEDED


def questions_status(output: BaseModel) -> AiResultStatus:
    """A QUESTIONS_GENERATE result lists the cells still short of drafts; any makes it PARTIAL
    (US-4.1 AC-5)."""
    missing = getattr(output, "missing_cells", None)
    return AiResultStatus.PARTIAL if missing else AiResultStatus.SUCCEEDED


def essay_status(output: BaseModel) -> AiResultStatus:
    """An ESSAY_GRADE result lists the passes left without a grade; any makes it PARTIAL
    (US-4.4 AC-7)."""
    failed = getattr(output, "failed", None)
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
    "QUESTIONS_GENERATE": JobKind(
        "QUESTIONS_GENERATE",
        QUEUES.jobs["QUESTIONS_GENERATE"],
        QuestionsGenerateJob,
        QuestionsGenerateResult,
        status_of=questions_status,
    ),
    "ESSAY_GRADE": JobKind(
        "ESSAY_GRADE",
        QUEUES.jobs["ESSAY_GRADE"],
        EssayGradeJob,
        EssayGradeResult,
        status_of=essay_status,
    ),
}
