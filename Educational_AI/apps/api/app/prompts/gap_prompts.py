"""Prompt templates for optional topic-level gap synthesis.

The Phase 3 implementation keeps signal extraction deterministic.
This prompt is only for a narrow, source-grounded polish pass when an LLM
is available and the caller already assembled the evidence bundle.
"""


GAP_SYNTHESIS_PROMPT = """You are improving the phrasing of a grounded knowledge-gap report.

You are NOT discovering new gaps.
You must only rewrite the provided deterministic evidence into a concise,
human-readable topic, description, and confidence score.

Rules:
- Do not invent concepts, sources, or evidence.
- Do not merge or split gaps beyond what is already provided.
- Confidence must stay within 0.0-1.0 and reflect only the supplied signals.
- Preserve the source_ids exactly as given.

Output JSON:
{{
  "topic": "string",
  "description": "string",
  "confidence": number
}}
"""
