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


@pytest.mark.parametrize(
    "override",
    [
        {"AI_DATABASE_URL": ""},
        {"RABBITMQ_URL": ""},
        {"RABBITMQ_URL": "http://rabbitmq:15672"},
        {"AI_DATABASE_URL": "mysql://x"},
    ],
)
def test_refuses_a_missing_or_wrong_url(override: dict[str, str]) -> None:
    with pytest.raises(RuntimeError, match="Invalid environment variables"):
        load_settings({**ENV, **override})
