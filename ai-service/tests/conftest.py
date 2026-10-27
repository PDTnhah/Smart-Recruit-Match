import asyncio
import socket

import pytest

# US-2.2 AC-11: tests never reach an LLM API. No key is visible, the provider is the fixture one,
# and any connection outside the machine fails. Three guards, because asyncio's Proactor loop on
# Windows connects without calling socket.connect: name resolution, the event loop's
# create_connection (httpx and aiohttp go through it), and socket.connect for blocking clients.
# Loopback stays open because asyncio on Windows builds its self-pipe from a localhost socket pair.
LLM_KEY_VARIABLES = (
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
)
LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "localhost", None})

_getaddrinfo = socket.getaddrinfo
_connect = socket.socket.connect
_connect_ex = socket.socket.connect_ex
_create_connection = asyncio.base_events.BaseEventLoop.create_connection


def _refuse(target: object) -> RuntimeError:
    return RuntimeError(f"tests must not open network connections (to {target!r})")


def _host(value: object) -> object:
    return value.decode() if isinstance(value, bytes) else value


def _guarded_getaddrinfo(host, *args, **kwargs):
    if _host(host) not in LOOPBACK_HOSTS:
        raise _refuse(host)
    return _getaddrinfo(host, *args, **kwargs)


def _guarded_connect(original):
    def connect(sock: socket.socket, address):
        host = address[0] if isinstance(address, tuple) else None
        if sock.family in (socket.AF_INET, socket.AF_INET6) and host not in LOOPBACK_HOSTS:
            raise _refuse(address)
        return original(sock, address)

    return connect


async def _guarded_create_connection(self, protocol_factory, host=None, port=None, *args, **kw):
    if _host(host) not in LOOPBACK_HOSTS:
        raise _refuse((host, port))
    return await _create_connection(self, protocol_factory, host, port, *args, **kw)


def pytest_sessionstart(session: pytest.Session) -> None:
    socket.getaddrinfo = _guarded_getaddrinfo
    socket.socket.connect = _guarded_connect(_connect)
    socket.socket.connect_ex = _guarded_connect(_connect_ex)
    asyncio.base_events.BaseEventLoop.create_connection = _guarded_create_connection


def pytest_sessionfinish(session: pytest.Session) -> None:
    socket.getaddrinfo = _getaddrinfo
    socket.socket.connect = _connect
    socket.socket.connect_ex = _connect_ex
    asyncio.base_events.BaseEventLoop.create_connection = _create_connection


@pytest.fixture(autouse=True)
def _no_live_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in LLM_KEY_VARIABLES:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("LLM_PROVIDER", "fixture")


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
