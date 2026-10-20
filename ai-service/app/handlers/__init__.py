"""Handler per job type. US-2.3 and US-2.4 replace the fakes with the JD Analyzer and CV Parser."""

from app.consumers.base import Handler
from app.handlers.fake import fake_cv_parse, fake_jd_analyze

HANDLERS: dict[str, Handler] = {
    "CV_PARSE": fake_cv_parse,
    "JD_ANALYZE": fake_jd_analyze,
}
