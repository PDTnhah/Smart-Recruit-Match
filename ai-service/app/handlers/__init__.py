"""Handler per job type. JD_ANALYZE runs the JD Analyzer (US-2.3); CV_PARSE is still the fake until
US-2.4 brings the CV Parser."""

from app.consumers.base import Handler
from app.handlers.fake import fake_cv_parse


def build_handlers(*, jd_analyzer: Handler) -> dict[str, Handler]:
    return {
        "CV_PARSE": fake_cv_parse,
        "JD_ANALYZE": jd_analyzer,
    }
