"""A complete, synthetic CV_PARSE output, for tests of the job layer that stub the CV Parser."""

from app.contracts.cv_parse_output import CvParseOutput

PROFILE = {
    "summary": None,
    "education": [],
    "skills": [{"name": "Java"}],
    "projects": [],
    "experience": [],
    "languages": [],
    "certificates": [],
}
PII = {
    "full_name": "Nguyễn Văn Test",
    "emails": [],
    "phones": [],
    "links": [],
    "address": None,
    "date_of_birth": None,
    "gender": None,
    "hometown": None,
    "religion": None,
    "marital_status": None,
    "has_photo": False,
}


def fake_cv_output(cv_id: int = 457, cv_version: int = 2) -> CvParseOutput:
    return CvParseOutput.model_validate(
        {
            "prompt_version": "cv_parser/v1",
            "model": "fixture",
            "cv_id": cv_id,
            "cv_version": cv_version,
            "source": "TEXT_PDF",
            "profile": PROFILE,
            "pii": PII,
            "profile_masked": PROFILE,
            "masked_text": "[NAME]\nJava",
            "hidden_text_detected": False,
        }
    )
