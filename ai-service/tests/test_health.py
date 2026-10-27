"""US-2.1 AC-11: GET /health of ai-api answers 200 only when PostgreSQL and RabbitMQ answer."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


class FakeProbes:
    def __init__(self, postgres: bool, rabbitmq: bool) -> None:
        self._postgres = postgres
        self._rabbitmq = rabbitmq

    async def postgres(self) -> bool:
        return self._postgres

    async def rabbitmq(self) -> bool:
        return self._rabbitmq


def test_health_ok_when_both_dependencies_answer() -> None:
    with TestClient(create_app(FakeProbes(True, True))) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "postgres": "ok", "rabbitmq": "ok"}


@pytest.mark.parametrize(("postgres", "rabbitmq"), [(False, True), (True, False), (False, False)])
def test_health_503_when_a_dependency_is_down(postgres: bool, rabbitmq: bool) -> None:
    with TestClient(create_app(FakeProbes(postgres, rabbitmq))) as client:
        response = client.get("/health")
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "error"
    assert body["postgres"] == ("ok" if postgres else "error")
    assert body["rabbitmq"] == ("ok" if rabbitmq else "error")
