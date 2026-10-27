"""US-2.5 AC-3, AC-4, AC-10: skill names mapped by key, then embedding, else NEW (PRD GĐ2 step 3).

The embedder returns the vectors each test chooses, so the similarity to the catalogue is set
exactly; the store keeps them in memory as ai.embeddings would.
"""

import pytest
from embedding_support import (
    MemoryCatalog,
    MemoryEmbeddingStore,
    TableEmbedder,
    at_similarity,
    skill,
    unit,
)

from app.contracts.skill_match import SkillMatch
from app.embedding import SkillMapping, SkillNormalizer, new_skill_names

pytestmark = pytest.mark.anyio

REACT = unit(1)


def harness(*, threshold: float = 0.85, vectors: dict[str, list[float]] | None = None):
    catalog = MemoryCatalog(
        [
            skill(1, "React", "ReactJS", group="FRAMEWORK"),
            skill(2, "Java", group="LANGUAGE"),
            skill(3, "PostgreSQL", "Postgres", group="DATABASE"),
        ]
    )
    store = MemoryEmbeddingStore(catalog)
    catalogue = {"React": REACT, "Java": unit(0, 0, 1), "PostgreSQL": unit(0, 0, 0, 1)}
    embedder = TableEmbedder({**catalogue, **(vectors or {})})
    normalizer = SkillNormalizer(
        catalog=catalog, store=store, embedder=embedder, threshold=threshold
    )
    return normalizer, catalog, store, embedder


async def test_gd2_reactjs_variants_map_to_react():
    """AC-3: the alias key catches every spelling; no embedding is needed."""
    normalizer, _, _, embedder = harness()
    mappings = await normalizer.normalize(["ReactJS", "React.js", "react js", "postgres"])
    assert mappings == [
        SkillMapping("ReactJS", "React", SkillMatch.ALIAS),
        SkillMapping("React.js", "React", SkillMatch.ALIAS),
        SkillMapping("react js", "React", SkillMatch.ALIAS),
        SkillMapping("postgres", "PostgreSQL", SkillMatch.ALIAS),
    ]
    assert embedder.calls == []


@pytest.mark.parametrize(("similarity", "match"), [(0.9, "EMBEDDING"), (0.85, "EMBEDDING")])
async def test_gd2_close_name_maps_by_embedding(similarity: float, match: str):
    """AC-3: cosine at or above 0.85 to the closest catalogue skill maps the name to it."""
    normalizer, _, _, _ = harness(vectors={"Reakt Hooks": at_similarity(similarity)})
    [mapping] = await normalizer.normalize(["Reakt Hooks"])
    assert mapping == SkillMapping("Reakt Hooks", "React", SkillMatch(match))


async def test_gd2_below_threshold_marked_new():
    """AC-4: under the threshold the name stays as written, NEW; the threshold is a setting."""
    vectors = {"Reakt Hooks": at_similarity(0.84)}
    normalizer, _, _, _ = harness(vectors=vectors)
    assert await normalizer.normalize(["Reakt Hooks", "Rust embedded"]) == [
        SkillMapping("Reakt Hooks", None, SkillMatch.NEW),
        SkillMapping("Rust embedded", None, SkillMatch.NEW),
    ]
    lower, _, _, _ = harness(threshold=0.8, vectors=vectors)
    [mapping] = await lower.normalize(["Reakt Hooks"])
    assert mapping.match is SkillMatch.EMBEDDING


async def test_gd2_catalogue_embedded_once_and_each_unknown_key_once():
    normalizer, _, store, embedder = harness()
    await normalizer.normalize(["Rust embedded", "rust-embedded", "Kotlin"])
    await normalizer.normalize(["Rust embedded"])
    catalogue_calls = [call for call in embedder.calls if "Java" in call]
    assert catalogue_calls == [["React", "Java", "PostgreSQL"]]
    assert embedder.calls[1] == ["Rust embedded", "Kotlin"], "one query per key"
    assert sorted(key[1] for key in store.rows if key[0] == "skill") == [1, 2, 3]


async def test_approved_skill_matched_next_time():
    """AC-10: once ADMIN approves a skill or merges a name into one, the next call maps it."""
    normalizer, catalog, store, _ = harness()
    [before] = await normalizer.normalize(["Rust"])
    assert before.match is SkillMatch.NEW

    catalog.skills.append(skill(4, "Rust", group="LANGUAGE"))
    catalog.skills[1] = skill(2, "Java", "Java SE", group="LANGUAGE", version=1)
    after = await normalizer.normalize(["Rust", "java se"])
    assert after == [
        SkillMapping("Rust", "Rust", SkillMatch.ALIAS),
        SkillMapping("java se", "Java", SkillMatch.ALIAS),
    ]
    # The new skill and the new version of Java get their embeddings on the next lookup.
    await normalizer.normalize(["Unknown skill"])
    assert ("skill", 4, 0, "table-v1") in store.rows and ("skill", 2, 1, "table-v1") in store.rows


async def test_ad11_superseded_skill_embeddings_deleted():
    """A new row version or another model replaces a skill's vector, so stale vectors cannot crowd
    the skill index (CONTEXT D39). Vectors of other owners stay."""
    normalizer, catalog, store, _ = harness()
    store.rows[("skill", 1, 0, "hashing-v1")] = unit(1)
    store.rows[("cv", 9, 1, "hashing-v1")] = unit(1)
    await normalizer.embed_catalogue()
    catalog.skills[1] = skill(2, "Java", "Java SE", group="LANGUAGE", version=1)
    assert await normalizer.embed_catalogue() == 1
    assert sorted(store.rows) == [
        ("cv", 9, 1, "hashing-v1"),
        ("skill", 1, 0, "table-v1"),
        ("skill", 2, 1, "table-v1"),
        ("skill", 3, 0, "table-v1"),
    ]


async def test_gd2_empty_catalogue_leaves_every_name_new():
    catalog = MemoryCatalog()
    normalizer = SkillNormalizer(
        catalog=catalog, store=MemoryEmbeddingStore(catalog), embedder=TableEmbedder()
    )
    assert [m.match for m in await normalizer.normalize(["Go", "Rust"])] == [SkillMatch.NEW] * 2
    assert await normalizer.normalize([]) == []


def test_br03_new_skill_names_distinct_without_masked_values():
    names = ["Rust embedded", "rust-embedded", "[NAME] Toolkit", "-", "Kotlin", "KOTLIN"]
    assert new_skill_names(names) == ["Rust embedded", "Kotlin"]


def test_gd2_mapping_is_a_stored_cv_skill():
    assert SkillMapping("ReactJS", "React", SkillMatch.ALIAS).as_json() == {
        "name": "ReactJS",
        "canonical_name": "React",
        "match": "ALIAS",
    }
