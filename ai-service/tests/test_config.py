import pytest

from app.config import load_settings

ENV = {
    "AI_DATABASE_URL": "postgres://ai_service:secret-password@postgres:5432/srm",
    "RABBITMQ_URL": "amqp://srm:secret@rabbitmq:5672",
}


def test_reads_the_service_urls() -> None:
    settings = load_settings({**ENV, "LOG_LEVEL": "debug"})
    assert settings.ai_database_url == ENV["AI_DATABASE_URL"]
    assert settings.log_level == "DEBUG"
    assert load_settings(ENV).log_level == "INFO"


def test_maps_the_api_log_levels_shared_in_compose() -> None:
    assert load_settings({**ENV, "LOG_LEVEL": "trace"}).log_level == "DEBUG"
    assert load_settings({**ENV, "LOG_LEVEL": "silent"}).log_level == "CRITICAL"


@pytest.mark.parametrize(
    "override",
    [
        {"AI_DATABASE_URL": ""},
        {"RABBITMQ_URL": ""},
        {"RABBITMQ_URL": "http://rabbitmq:15672"},
        {"AI_DATABASE_URL": "mysql://x"},
        {"LOG_LEVEL": "loud"},
    ],
)
def test_refuses_a_missing_or_wrong_url(override: dict[str, str]) -> None:
    with pytest.raises(RuntimeError, match="Invalid environment variables"):
        load_settings({**ENV, **override})


def test_us24_contacts_masked_and_fake_keys_off_by_default() -> None:
    settings = load_settings({**ENV, "CV_MASK_CONTACTS": "", "AI_FAKE_FILE_KEYS": ""})
    assert (settings.cv_mask_contacts, settings.fake_file_keys) == (True, False)
    settings = load_settings({**ENV, "CV_MASK_CONTACTS": "false", "AI_FAKE_FILE_KEYS": "true"})
    assert (settings.cv_mask_contacts, settings.fake_file_keys) == (False, True)


def test_us24_refuses_a_flag_that_is_not_a_boolean() -> None:
    with pytest.raises(RuntimeError, match="Invalid environment variables"):
        load_settings({**ENV, "CV_MASK_CONTACTS": "maybe"})


def test_us25_embedding_provider_and_threshold_defaults() -> None:
    """LESSONS §14: compose passes an unset variable as an empty string."""
    settings = load_settings({**ENV, "EMBEDDING_PROVIDER": "", "SKILL_MATCH_THRESHOLD": ""})
    assert (settings.embedding_provider, settings.skill_match_threshold) == ("bge-m3", 0.85)
    settings = load_settings(
        {**ENV, "EMBEDDING_PROVIDER": "Hashing", "SKILL_MATCH_THRESHOLD": "0.9"}
    )
    assert (settings.embedding_provider, settings.skill_match_threshold) == ("hashing", 0.9)


@pytest.mark.parametrize(
    "override",
    [
        {"EMBEDDING_PROVIDER": "openai"},
        {"SKILL_MATCH_THRESHOLD": "1.5"},
        {"SKILL_MATCH_THRESHOLD": "0"},
    ],
)
def test_us25_refuses_an_unknown_provider_or_threshold(override: dict[str, str]) -> None:
    with pytest.raises(RuntimeError, match="Invalid environment variables"):
        load_settings({**ENV, **override})
