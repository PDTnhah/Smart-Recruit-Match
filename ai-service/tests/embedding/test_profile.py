"""US-2.5 AC-9 (BR-03): the profile embedding comes from the masked profile, deterministically."""

import pytest
from embedding_support import MemoryCatalog, MemoryEmbeddingStore, TableEmbedder

from app.contracts.cv_profile import CvProfile
from app.embedding import ProfileEmbeddings, profile_text
from app.embedding.profile import MAX_PROFILE_TEXT

pytestmark = pytest.mark.anyio


def masked_profile(**overrides) -> CvProfile:
    data = {
        "summary": "[NAME] muốn thực tập Backend.",
        "education": [
            {
                "institution": "Đại học Demo",
                "degree": "Kỹ sư",
                "major": "Khoa học máy tính",
                "start": "2022",
                "end": None,
                "gpa": "3.2/4",
            }
        ],
        "skills": [
            {"name": "ReactJS", "canonical_name": "React", "match": "ALIAS"},
            {"name": "Rust embedded", "canonical_name": None, "match": "NEW"},
        ],
        "projects": [
            {
                "name": "Library API",
                "role": "Backend",
                "description": "REST API, liên hệ [EMAIL].",
                "technologies": ["Java", "PostgreSQL"],
                "start": None,
                "end": None,
            }
        ],
        "experience": [
            {
                "organization": "Công ty Demo",
                "position": "Intern",
                "description": None,
                "start": None,
                "end": None,
            }
        ],
        "languages": [{"language": "Tiếng Anh", "level": "TOEIC 650"}],
        "certificates": [{"name": "AWS Cloud Practitioner", "issuer": None, "year": None}],
        **overrides,
    }
    return CvProfile.model_validate(data)


def test_br03_profile_text_from_masked_profile_skills_first():
    text = profile_text(masked_profile())
    assert text.splitlines() == [
        "Skills: React, Rust embedded",
        "[NAME] muốn thực tập Backend.",
        "Library API - Backend - Java, PostgreSQL - REST API, liên hệ [EMAIL].",
        "Intern - Công ty Demo",
        "Kỹ sư - Khoa học máy tính - Đại học Demo",
        "Certificates: AWS Cloud Practitioner",
        "Tiếng Anh - TOEIC 650",
    ]
    assert profile_text(masked_profile()) == text


def test_gd2_profile_text_is_cut():
    long = masked_profile(summary="x" * 3000, projects=[], experience=[])
    long_text = profile_text(
        masked_profile(
            summary="x" * 3000,
            experience=[
                {
                    "organization": "Demo",
                    "position": None,
                    "description": "y" * 5000,
                    "start": None,
                    "end": None,
                }
            ],
        )
    )
    assert len(profile_text(long)) < MAX_PROFILE_TEXT
    assert len(long_text) == MAX_PROFILE_TEXT


async def test_br03_profile_embedding_upserted_for_cv_version():
    catalog = MemoryCatalog()
    store = MemoryEmbeddingStore(catalog)
    embedder = TableEmbedder()
    embeddings = ProfileEmbeddings(store=store, embedder=embedder)
    await embeddings.store_cv(457, 2, masked_profile())
    await embeddings.store_cv(457, 2, masked_profile())
    assert list(store.rows) == [("cv", 457, 2, "table-v1")]
    assert embedder.calls[0] == [profile_text(masked_profile())]
