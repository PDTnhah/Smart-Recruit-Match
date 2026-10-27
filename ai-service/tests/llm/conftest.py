import pytest
from llm_support import PROMPTS_ROOT, MemoryCalls, MemoryObjects

from app.llm.recorder import CallRecorder
from app.llm.structured import StructuredLLMClient
from app.llm.usage import DEFAULT_PRICES
from app.prompts.registry import PromptRegistry


@pytest.fixture
def objects() -> MemoryObjects:
    return MemoryObjects()


@pytest.fixture
def calls() -> MemoryCalls:
    return MemoryCalls()


@pytest.fixture
def prompts() -> PromptRegistry:
    return PromptRegistry(PROMPTS_ROOT)


@pytest.fixture
def make_client(objects: MemoryObjects, calls: MemoryCalls):
    def make(provider) -> StructuredLLMClient:
        return StructuredLLMClient(
            provider,
            CallRecorder(objects, calls),
            pricing=DEFAULT_PRICES,
            max_output_tokens=4000,
        )

    return make
