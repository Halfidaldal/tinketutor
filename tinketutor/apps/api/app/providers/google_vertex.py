"""
Google Vertex AI / Gemini Provider

Implementation of LLMProvider for Google Vertex AI.
v1 primary provider per ADR-1.

TODO: [Phase 1] Implement:
- Initialize Vertex AI client
- Implement generate() with structured output support
- Implement stream_generate() for tutor SSE
- Implement embed() using text-embedding-004
"""

from collections.abc import AsyncIterator

from app.providers.base import LLMProvider
from app.domain.models import EvidenceChunk, LLMResponse, GenerationConfig


import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig as VertexGenerationConfig
from vertexai.language_models import TextEmbeddingModel, TextEmbeddingInput

class GoogleVertexProvider(LLMProvider):
    """
    Google Vertex AI / Gemini LLM provider.

    Uses: Gemini models on Vertex AI for generation and text-embedding-004 for embeddings.
    Region: europe-west1 (per deployment requirements).

    NOTE: Do NOT import google.generativeai or vertexai outside this file.
    """

    def __init__(self, project: str, location: str, model: str, embedding_model: str):
        self.project = project
        self.location = location
        self.model = model
        self.embedding_model = embedding_model
        
        vertexai.init(project=project, location=location)
        self.generation_model = GenerativeModel(self.model)
        self.embedding_model_client = TextEmbeddingModel.from_pretrained(self.embedding_model)

    def _serialize_context(self, context: list[EvidenceChunk]) -> str:
        """Serializes evidence context cleanly, preserving chunk IDs for citation traceability."""
        if not context:
            return ""
        lines = ["\n[Context Evidence]:"]
        for chunk in context:
            lines.append(f"Source: {chunk.source_title}")
            lines.append(f"Chunk ID: [{chunk.chunk_id}]")
            lines.append(f"Content: {chunk.content}")
            lines.append("---")
        return "\n".join(lines)

    def _build_vertex_config(self, config: GenerationConfig) -> VertexGenerationConfig:
        return VertexGenerationConfig(
            temperature=config.temperature,
            max_output_tokens=config.max_tokens,
            response_mime_type="application/json" if config.response_format in ("json", "json_object") else None,
            stop_sequences=config.stop_sequences if config.stop_sequences else None,
        )

    async def generate(
        self,
        prompt: str,
        context: list[EvidenceChunk],
        config: GenerationConfig,
    ) -> LLMResponse:
        prompt_with_context = prompt
        if context:
            prompt_with_context += self._serialize_context(context)

        vertex_config = self._build_vertex_config(config)

        resp = await self.generation_model.generate_content_async(
            prompt_with_context,
            generation_config=vertex_config,
        )

        return LLMResponse(
            content=resp.text,
            model=self.model,
            usage={"total_tokens": resp.usage_metadata.total_token_count} if getattr(resp, "usage_metadata", None) else {},
            raw={"finish_reason": resp.candidates[0].finish_reason if resp.candidates else None}
        )

    async def stream_generate(
        self,
        prompt: str,
        context: list[EvidenceChunk],
        config: GenerationConfig,
    ) -> AsyncIterator[str]:
        prompt_with_context = prompt
        if context:
            prompt_with_context += self._serialize_context(context)

        vertex_config = self._build_vertex_config(config)

        response_stream = await self.generation_model.generate_content_stream_async(
            prompt_with_context,
            generation_config=vertex_config,
            # Workaround for struct_output streaming in some older vertexai versions
        )

        async for chunk in response_stream:
            if chunk.text:
                yield chunk.text

    async def embed(self, texts: list[str]) -> list[list[float]]:
        # Vertex get_embeddings_async expects a list of strings or TextEmbeddingInput
        embeddings = await self.embedding_model_client.get_embeddings_async(texts)
        return [e.values for e in embeddings]
