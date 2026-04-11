"""
Seam 1: LLMProvider — Abstract Base Class

File: backend/app/providers/base.py
Per phase-2-implementation-seams.md §Seam 1:

All text generation and embedding calls go through this interface.
No service file should import google.generativeai or openai directly.

Implementations:
- GoogleVertexProvider (v1 primary)
- OpenAIProvider (v1 stub)

Also contains shared types used across the provider layer.
"""

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass

from app.domain.models import EvidenceChunk, LLMResponse, GenerationConfig


@dataclass
class AuthenticatedUser:
    """
    Generic authenticated user. Returned by AuthProvider.verify_token().
    Must NOT contain Firebase-specific types (per ADR-8).
    """
    user_id: str
    email: str
    display_name: str


class LLMProvider(ABC):
    """
    Abstract LLM provider interface.

    Per ADR-1 (phase-0-master-implementation-brief.md §5):
    - All prompt templates live in prompts/, not in provider code
    - Switching models must be a config change, not a refactor
    - Each implementation is ~100 LOC

    See also: phase-2-technical-architecture-pack.md §11.1
    """

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        context: list[EvidenceChunk],
        config: GenerationConfig,
    ) -> LLMResponse:
        """
        Generate a response from the LLM.

        Args:
            prompt: The formatted prompt string (from prompts/ module)
            context: List of evidence chunks for grounding
            config: Generation parameters (temperature, max_tokens, etc.)

        Returns:
            LLMResponse with content, model info, and usage stats
        """
        ...

    @abstractmethod
    async def stream_generate(
        self,
        prompt: str,
        context: list[EvidenceChunk],
        config: GenerationConfig,
    ) -> AsyncIterator[str]:
        """
        Stream a response from the LLM token by token.

        Used for: Socratic tutor streaming (SSE).
        Not used for: Canvas, quiz, or gap generation (these use structured output).

        Args:
            prompt: The formatted prompt string
            context: Evidence chunks for grounding
            config: Generation parameters

        Yields:
            Individual tokens/chunks of the response
        """
        ...

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """
        Generate embeddings for a list of texts.

        Args:
            texts: List of text strings to embed

        Returns:
            List of embedding vectors (float arrays)
        """
        ...
