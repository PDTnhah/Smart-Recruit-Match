"""Masking personal data of a CV (US-2.4 AC-5 to AC-7, BR-03, NFR-3, CONTEXT D37).

The cases in packages/shared/contracts/fixtures/pii-mask-cases.json are shared with the TypeScript
side (US-2.6), so both mask a profile the same way.
"""

import json
from pathlib import Path

import pytest

from app.contracts.cv_pii import CvPii
from app.contracts.cv_profile import CvProfile
from app.parsing.pii import (
    MaskedContacts,
    build_pii,
    find_pii,
    folded,
    mask_contacts,
    mask_profile,
    mask_text,
    phone_key,
    strings_of,
    unmask,
)

CASES_FILE = Path(__file__).parents[3] / "packages/shared/contracts/fixtures/pii-mask-cases.json"
CASES = json.loads(CASES_FILE.read_text(encoding="utf-8"))

PII = CvPii.model_validate(
    {
        "full_name": "Nguyễn Văn An",
        "emails": ["nguyenvanan.dev@gmail.com"],
        "phones": ["0912 345 678"],
        "links": ["https://github.com/nguyenvanan"],
        "address": "Số 1 Đại Cồ Việt, Hai Bà Trưng, Hà Nội",
        "date_of_birth": "15/03/2004",
        "gender": "MALE",
        "hometown": "Nam Định",
        "religion": "Phật giáo",
        "marital_status": "SINGLE",
        "has_photo": True,
    }
)

# A profile whose free text repeats the name, email and other personal values (AC-7).
PROFILE = CvProfile.model_validate(
    {
        "summary": "Tôi là Nguyễn Văn An, quê Nam Định, muốn thực tập Backend tại Việt Nam.",
        "education": [
            {
                "institution": "Đại học Bách khoa",
                "degree": "Kỹ sư",
                "major": "Khoa học máy tính",
                "start": "09/2022",
                "end": None,
                "gpa": "3.2/4",
            }
        ],
        "skills": [
            {"name": "Java", "canonical_name": "Java", "match": "ALIAS"},
            {"name": "SpringBoot", "canonical_name": "Spring Boot", "match": "ALIAS"},
            {"name": "Rust embedded", "canonical_name": None, "match": "NEW"},
        ],
        "projects": [
            {
                "name": "Library API",
                "role": "Backend",
                "description": (
                    "NGUYEN VAN AN viết REST API; mã nguồn tại github.com/nguyenvanan/library, "
                    "liên hệ nguyenvanan.dev@gmail.com hoặc 0912.345.678."
                ),
                "technologies": ["Java", "PostgreSQL"],
                "start": "2024",
                "end": "2024",
            }
        ],
        "experience": [
            {
                "organization": "CLB Lập trình",
                "position": "Thành viên",
                "description": "An Nguyễn hướng dẫn tân sinh viên; sinh ngày 15 tháng 3 năm 2004.",
                "start": "2023",
                "end": None,
            }
        ],
        "languages": [{"language": "Tiếng Anh", "level": "TOEIC 650"}],
        "certificates": [{"name": "Phật giáo và đời sống", "issuer": None, "year": "2023"}],
    }
)

PII_VALUES = [
    "Nguyễn Văn An",
    "nguyenvanan.dev@gmail.com",
    "0912345678",
    "github.com/nguyenvanan",
    "Số 1 Đại Cồ Việt",
    "15/03/2004",
    "Nam Định",
    "Phật giáo",
]


@pytest.mark.parametrize("case", CASES["mask"], ids=lambda case: case["name"])
def test_br03_mask_cases_shared_with_typescript(case):
    pii = CvPii.model_validate(case["pii"])
    assert mask_text(case["text"], pii) == case["masked"]
    assert find_pii(case["masked"], pii) == []


@pytest.mark.parametrize("case", CASES["contacts"], ids=lambda case: case["text"][:30])
def test_nfr3_contact_cases_shared_with_typescript(case):
    masked = mask_contacts(case["text"])
    assert (masked.text, masked.tokens) == (case["masked"], case["tokens"])


def test_br03_pii_split_from_profile():
    """AC-6: personal values go to pii; the masked profile keeps the shape, with tokens."""
    masked = mask_profile(PROFILE, PII)
    assert set(CvProfile.model_fields) == set(masked.model_dump())
    assert masked.summary.root == (
        "Tôi là [NAME], quê [HOMETOWN], muốn thực tập Backend tại Việt Nam."
    )
    assert masked.projects[0].description.root == (
        "[NAME] viết REST API; mã nguồn tại [LINK], liên hệ [EMAIL] hoặc [PHONE]."
    )
    assert masked.experience[0].description.root == ("[NAME] hướng dẫn tân sinh viên; sinh [DOB].")
    # What is not personal stays as written.
    assert masked.education == PROFILE.education
    assert masked.skills == PROFILE.skills


def test_br03_profile_masked_contains_no_pii_values():
    """AC-7: the JSON of profile_masked holds no personal value, ignoring case and diacritics."""
    masked = folded(json.dumps(mask_profile(PROFILE, PII).model_dump(), ensure_ascii=False))
    digits = "".join(ch for ch in masked if ch.isdigit())
    for value in PII_VALUES:
        assert folded(value) not in masked, value
    assert phone_key("0912 345 678") not in digits
    texts = strings_of(mask_profile(PROFILE, PII).model_dump())
    assert all(not find_pii(text, PII) for text in texts)


def test_nfr3_same_contact_gets_the_same_token_and_comes_back_on_unmask():
    contacts = mask_contacts("a@example.com, A@Example.com, 0912 345 678, +84912345678")
    assert contacts.text == "[EMAIL_1], [EMAIL_1], [PHONE_1], [PHONE_1]"
    assert unmask({"x": ["Mail [EMAIL_1]", 3]}, contacts.tokens) == {"x": ["Mail a@example.com", 3]}


def test_gd2_build_pii_merges_regex_contacts_and_drops_tokens_and_empty_values():
    contacts = MaskedContacts("", {"[EMAIL_1]": "an@example.com", "[PHONE_1]": "0912 345 678"})
    personal = CvPii.model_validate(
        {
            "full_name": " Nguyễn Văn An ",
            "emails": ["[EMAIL_1]", "AN@example.com", "[EMAIL_7]", "not-an-email"],
            "phones": ["[PHONE_1]", "+84 912 345 678", "112"],
            "links": ["https://github.com/an", "github.com/an/"],
            "address": None,
            "date_of_birth": None,
            "gender": "MALE",
            "hometown": None,
            "religion": "Không",
            "marital_status": None,
            "has_photo": False,
        }
    )
    pii = build_pii(personal, contacts, has_photo=True)
    assert pii.full_name.root == "Nguyễn Văn An"
    assert [e.root for e in pii.emails] == ["an@example.com"]
    assert [p.root for p in pii.phones] == ["0912 345 678"]
    assert [link.root for link in pii.links] == ["https://github.com/an"]
    assert pii.religion is None, "'Không' means none, not a religion"
    assert pii.has_photo is True, "the file decides, not the LLM"
    assert build_pii(personal, contacts, has_photo=None).has_photo is False


def test_br03_masking_is_deterministic():
    assert mask_profile(PROFILE, PII) == mask_profile(PROFILE, PII)


def test_br03_find_pii_reports_what_is_left():
    assert find_pii("Liên hệ Nguyen Van An qua 0912345678", PII) == ["[NAME]", "[PHONE]"]
