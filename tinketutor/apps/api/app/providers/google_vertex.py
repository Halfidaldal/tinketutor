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
import logging

from app.providers.base import LLMProvider
from app.domain.models import EvidenceChunk, LLMResponse, GenerationConfig


import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig as VertexGenerationConfig
from vertexai.language_models import TextEmbeddingModel, TextEmbeddingInput

logger = logging.getLogger(__name__)


class GoogleVertexProvider(LLMProvider):
    """
    Google Vertex AI / Gemini LLM provider.

    Generation and embeddings are routed to DIFFERENT Vertex endpoints:

    - Generative models (Gemini 3.x preview series) are served on the `global`
      endpoint and do not yet exist as regional resources.
    - Embedding models (e.g. text-embedding-005, gemini-embedding-001) are
      regional-only resources and do NOT exist on the `global` endpoint.

    We therefore call ``vertexai.init`` twice — once under ``location`` for the
    generative model, and once under ``embedding_location`` for the embedding
    model. Each model client captures its endpoint at construction time, so
    subsequent calls route to the correct region even after the global init
    state changes.

    NOTE: Do NOT import google.generativeai or vertexai outside this file.

    Embedding client is initialized lazily on first use, so routes that only need
    generation (e.g. tutor, mindmap) don't fail if the embedding model is
    unavailable in the configured region.
    """

    def __init__(
        self,
        project: str,
        location: str,
        model: str,
        embedding_model: str,
        embedding_location: str | None = None,
    ):
        self.project = project
        self.location = location
        self.embedding_location = embedding_location or location
        self.model = model
        self.embedding_model = embedding_model

        # Init under the GENERATIVE region and construct the generative model
        # so it captures this endpoint internally.
        vertexai.init(project=project, location=self.location)
        self.generation_model = GenerativeModel(self.model)
        logger.info(
            "GoogleVertexProvider: generative model '%s' initialized in region '%s'",
            self.model,
            self.location,
        )

        self._embedding_model_client: TextEmbeddingModel | None = None

    def _get_embedding_client(self) -> TextEmbeddingModel:
        """Lazily load the embedding model client bound to the EMBEDDING region."""
        if self._embedding_model_client is None:
            try:
                # Re-init under the embedding region so TextEmbeddingModel
                # captures the regional endpoint.
                vertexai.init(project=self.project, location=self.embedding_location)
                self._embedding_model_client = TextEmbeddingModel.from_pretrained(
                    self.embedding_model
                )
                logger.info(
                    "GoogleVertexProvider: embedding model '%s' initialized in region '%s'",
                    self.embedding_model,
                    self.embedding_location,
                )
            except Exception as e:
                logger.error(
                    "Failed to load embedding model '%s' in region '%s': %s",
                    self.embedding_model,
                    self.embedding_location,
                    e,
                )
                raise
            finally:
                # Restore the generative region as the global default so any
                # subsequent vertexai calls don't accidentally pick up the
                # embedding region.
                try:
                    vertexai.init(project=self.project, location=self.location)
                except Exception:
                    logger.warning(
                        "Failed to restore generative region after embedding init",
                        exc_info=True,
                    )
        return self._embedding_model_client

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
        kwargs: dict = {
            "temperature": config.temperature,
            "max_output_tokens": config.max_tokens,
        }
        if config.response_format in ("json", "json_object"):
            kwargs["response_mime_type"] = "application/json"
        if config.response_schema is not None:
            kwargs["response_mime_type"] = "application/json"
            kwargs["response_schema"] = config.response_schema
        if config.stop_sequences:
            kwargs["stop_sequences"] = config.stop_sequences
        return VertexGenerationConfig(**kwargs)

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
        client = self._get_embedding_client()
        embeddings = await client.get_embeddings_async(texts)
        return [e.values for e in embeddings]
