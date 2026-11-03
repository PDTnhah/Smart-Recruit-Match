"""US-3.2 AC-5, BR-03, NFR-3: the Matching Agent reads three masked views and sends no PII."""

import json
import re

import pytest
from matching_support import Harness, match_job, ref

from app.agents.matching import source

pytestmark = pytest.mark.anyio

VIEWS = {"core.v_ai_match_pairs", "core.v_ai_cv_profile_masked", "core.v_ai_jd_requirements"}
PII_FIELDS = (
    "pii",
    "full_name",
    "email",
    "phone",
    "photo",
    "avatar",
    "gender",
    "date_of_birth",
    "birth",
    "hometown",
    "address",
    "religion",
    "marital",
)


def test_br03_reads_only_the_three_views() -> None:
    sql = " ".join([source.PAIRS_SQL, source.CVS_SQL, source.JDS_SQL])
    tables = set(re.findall(r"\b(?:FROM|JOIN)\s+([a-z_]+\.[a-z_]+)", sql))
    assert tables == VIEWS
    assert not re.search(r"\bpii\b|\bprofile\b(?!_masked)|\braw_text\b", sql)


async def test_br03_llm_request_has_no_pii() -> None:
    worker = Harness()
    captured: list[dict] = []
    real_submit = worker.provider.submit

    async def capture(items, *, display_name):
        captured.extend(params for _, params in items)
        return await real_submit(items, display_name=display_name)

    worker.provider.submit = capture
    await worker.agent(match_job(ref(1, 10), ref(2, 20)))

    assert len(captured) == 2
    for params in captured:
        text = json.dumps(params, ensure_ascii=False)
        # The masked text of the file carries placeholders; only the masked profile is sent.
        assert "[EMAIL]" not in text and "[PHONE]" not in text and "[NAME]" not in text
        profile = json.loads(
            params["user"].split("<cv_profile>\n", 1)[1].split("\n</cv_profile>")[0]
        )
        assert not [field for field in profile if any(p in field for p in PII_FIELDS)]
