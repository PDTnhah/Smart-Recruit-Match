"""Adapters between LLMRequest/ProviderResponse and each provider's SDK (CONTEXT D34).

Documents (US-2.4 AC-4, CONTEXT D37) reach a provider in two steps. `build_params` puts a
placeholder naming each document by its hash where the bytes go, so the parameters stay small and
loggable; `send` swaps the placeholders for the bytes, encoded as that SDK wants them.
"""

from collections.abc import Callable, Sequence
from typing import Any, Protocol

from app.llm.types import Document, DocumentRef, LLMRequest, Provider, ProviderResponse

DOCUMENT_PLACEHOLDER = "$document"


class LLMProvider(Protocol):
    name: Provider
    model: str
    """The configured model; the reply may name another one after a fallback."""

    def build_params(self, request: LLMRequest) -> dict[str, Any]:
        """The exact SDK keyword arguments, JSON-serialisable so they can be logged (AC-6)."""
        ...

    async def send(
        self, params: dict[str, Any], documents: Sequence[Document] = ()
    ) -> ProviderResponse:
        """Raises ProviderCallError when the call fails after the SDK's own retries. `documents`
        are the files whose placeholders `build_params` wrote, in any order."""
        ...


def document_placeholder(ref: DocumentRef) -> dict[str, Any]:
    """Stands in the parameters for the bytes of one document."""
    return {DOCUMENT_PLACEHOLDER: ref.as_json()}


def fill_documents(
    params: dict[str, Any], documents: Sequence[Document], encode: Callable[[bytes], Any]
) -> dict[str, Any]:
    """A copy of `params` with every placeholder replaced by the encoded bytes of its document.

    Raises ValueError when a placeholder names no given document, or a document has no
    placeholder: the model would then read another file than the log says, or none at all.
    """
    if not documents and DOCUMENT_PLACEHOLDER not in repr(params):
        return params
    by_hash = {document.ref.sha256: document for document in documents}
    used: set[str] = set()

    def fill(node: Any) -> Any:
        if isinstance(node, dict):
            if set(node) == {DOCUMENT_PLACEHOLDER}:
                digest = node[DOCUMENT_PLACEHOLDER]["sha256"]
                if digest not in by_hash:
                    raise ValueError(f"no document with sha256 {digest} was given")
                used.add(digest)
                return encode(by_hash[digest].data)
            return {key: fill(value) for key, value in node.items()}
        if isinstance(node, list):
            return [fill(item) for item in node]
        return node

    filled = fill(params)
    unused = set(by_hash) - used
    if unused:
        raise ValueError(f"documents without a placeholder in the parameters: {sorted(unused)}")
    return filled
