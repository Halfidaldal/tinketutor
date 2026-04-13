"""
Canvas Generation Prompts

LLM-powered concept extraction from source material.
Used to replace regex phrase extraction with semantic concept identification.
"""

CONCEPT_EXTRACTION_PROMPT = """\
You are an expert at identifying key concepts from educational material.

Analyze the following source chunks and extract the {node_count} most important \
concepts, along with relationships between them.

Requirements:
- Each concept should be a concise label (1-4 words)
- Concepts should represent distinct, meaningful ideas from the material
- Include both high-level themes and specific technical terms
- Relationships should describe how concepts connect (e.g. "requires", "part of", "leads to")
- Detect the language of the source material and respond in that same language

Source material:
{chunks_text}

Respond with ONLY a JSON object in this exact format:
{{
  "concepts": [
    {{"label": "Concept Name", "summary": "One sentence explaining this concept from the sources"}}
  ],
  "relationships": [
    {{"source": "Concept A", "target": "Concept B", "label": "relationship verb"}}
  ]
}}

Extract exactly {node_count} concepts and up to {edge_count} relationships.
"""


CANVAS_SYSTEM_PROMPT = """You are a concept map generator for educational material.
Given source material chunks, generate a structured concept map as JSON.

Requirements:
- Generate {node_count} nodes and appropriate edges connecting them
- Include {skeleton_count} intentionally blank "skeleton" nodes with guiding questions
- Include 1-2 edges with "Define this relationship" labels
- Each non-skeleton node must reference at least one chunk_id from the provided context
- Nodes should represent key concepts from the material
- Edges should represent meaningful relationships between concepts

The source material may be in Danish or English. Generate content in the same language as the source.

Output JSON schema:
{{
  "nodes": [
    {{
      "label": "string",
      "content": "string",
      "type": "concept|question|evidence|summary",
      "status": "ai_generated|skeleton",
      "guiding_question": "string or null",
      "chunk_ids": ["string"],
      "position_x": number,
      "position_y": number
    }}
  ],
  "edges": [
    {{
      "source_index": number,
      "target_index": number,
      "label": "string",
      "status": "ai_generated|skeleton"
    }}
  ]
}}
"""
