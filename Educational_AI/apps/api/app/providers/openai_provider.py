"""
OpenAI Provider (STUB)

Stubbed implementation of LLMProvider for OpenAI.
Per phase-2-implementation-seams.md: stub that raises NotImplementedError.
Only Gemini is needed for the v1 demo.

TODO: [v2] Implement real OpenAI integration.
"""

from collections.abc import AsyncIterator

from app.providers.base import LLMProvider
from app.domain.models import EvidenceChunk, LLMResponse, GenerationConfig


class OpenAIProvider(LLMProvider):
    """
    OpenAI LLM provider (STUB for v1).

    This is intentionally not implemented for v1.
    The provider abstraction exists so that OpenAI can be wired in
    as a config change in v2.
    """

    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model

    async def generate(
        self,
        prompt: str,
        context: list[EvidenceChunk],
        config: GenerationConfig,
    ) -> LLMResponse:
        raise NotImplementedError(
            "OpenAI provider is not implemented in v1. Use google_vertex provider."
        )

    async def stream_generate(
        self,
        prompt: str,
        context: list[EvidenceChunk],
        config: GenerationConfig,
    ) -> AsyncIterator[str]:
        raise NotImplementedError(
            "OpenAI provider is not implemented in v1. Use google_vertex provider."
        )
        yield ""  # type: ignore

    async def embed(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError(
            "OpenAI provider is not implemented in v1. Use google_vertex provider."
        )
