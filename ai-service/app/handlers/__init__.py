"""Handler per job type: CV_PARSE runs the CV Parser (US-2.4), JD_ANALYZE the JD Analyzer (US-2.3),
SKILL_NORMALIZE the skill normalizer (US-2.5), MATCH the Matching Agent (US-3.2),
QUESTIONS_GENERATE the Test Generator (US-4.1), QUESTIONS_VALIDATE the Validator on the drafts
CENTER sends it (US-4.2, US-4.10), ESSAY_GRADE the Grader (US-4.4), CV_VERIFY_GENERATE and
CV_VERIFY_EVALUATE the two steps of part C (US-4.8).

`fake_file_keys` wraps the CV Parser with the failure markers of the end-to-end test (US-2.1);
only that test sets it (AI_FAKE_FILE_KEYS, CONTEXT D37).
"""

from app.consumers.base import Handler
from app.handlers.fake import with_fake_markers


def build_handlers(
    *,
    cv_parser: Handler,
    jd_analyzer: Handler,
    skill_normalizer: Handler,
    matching: Handler,
    test_generator: Handler,
    question_validator: Handler,
    grader: Handler,
    cv_verify_generate: Handler,
    cv_verify_evaluate: Handler,
    fake_file_keys: bool = False,
) -> dict[str, Handler]:
    return {
        "CV_PARSE": with_fake_markers(cv_parser) if fake_file_keys else cv_parser,
        "JD_ANALYZE": jd_analyzer,
        "SKILL_NORMALIZE": skill_normalizer,
        "MATCH": matching,
        "QUESTIONS_GENERATE": test_generator,
        "QUESTIONS_VALIDATE": question_validator,
        "ESSAY_GRADE": grader,
        "CV_VERIFY_GENERATE": cv_verify_generate,
        "CV_VERIFY_EVALUATE": cv_verify_evaluate,
    }
