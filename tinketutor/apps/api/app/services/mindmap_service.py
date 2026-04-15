"""
Mindmap Service — Hierarchical Knowledge Map Generation

Uses a single-pass "Knowledge Architect" approach:
1. Collects ALL source chunks for a notebook
2. Sends them to Gemini with a structured output schema
3. Receives a recursive JSON tree representing the knowledge hierarchy
4. Returns the tree directly to the frontend for rendering

The LLM acts as a taxonomy expert, producing a clean hierarchical tree
with labels, summaries, and guiding questions at each node.
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path

from app.config import settings
from app.domain.models import GenerationConfig
from app.providers.base import LLMProvider
from app.repositories import knowledge_retrieval_repository
from app.domain.exceptions import NotFoundError, ValidationError
from app.repositories import notebook_repository

logger = logging.getLogger(__name__)

# Where to persist raw mindmap artifacts for inspection.
# Override via MINDMAP_DEBUG_DIR. Falls back to /tmp/mindmap-debug.
_MINDMAP_DEBUG_DIR = Path(os.environ.get("MINDMAP_DEBUG_DIR", "/tmp/mindmap-debug"))


# ============================================================
# JSON Schema for Recursive Mindmap Tree
# ============================================================

# NOTE: Vertex Gemini structured output does NOT reliably support $ref/$defs
# recursion. We use an explicit 3-level schema instead. This matches our
# documented 3-level hierarchy (themes → concepts → details) exactly.

_LEAF_NODE_SCHEMA = {
    "type": "object",
    "properties": {
        "id": {"type": "string"},
        "label": {"type": "string"},
        "summary": {"type": "string"},
        "guiding_question": {"type": "string"},
    },
    "required": ["id", "label", "summary", "guiding_question"],
}

_MID_NODE_SCHEMA = {
    "type": "object",
    "properties": {
        "id": {"type": "string"},
        "label": {"type": "string"},
        "summary": {"type": "string"},
        "guiding_question": {"type": "string"},
        "children": {
            "type": "array",
            "items": _LEAF_NODE_SCHEMA,
        },
    },
    "required": ["id", "label", "summary", "guiding_question", "children"],
}

_ROOT_NODE_SCHEMA = {
    "type": "object",
    "properties": {
        "id": {"type": "string"},
        "label": {"type": "string"},
        "summary": {"type": "string"},
        "guiding_question": {"type": "string"},
        "children": {
            "type": "array",
            "items": _MID_NODE_SCHEMA,
        },
    },
    "required": ["id", "label", "summary", "guiding_question", "children"],
}

MINDMAP_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {
            "type": "string",
        },
        "nodes": {
            "type": "array",
            "items": _ROOT_NODE_SCHEMA,
        },
    },
    "required": ["title", "nodes"],
}


# ============================================================
# Knowledge Architect System Prompt
# ============================================================

KNOWLEDGE_ARCHITECT_PROMPT = """\
You are a **Knowledge Architect** building a comprehensive study mind map from the source \
material below. Your map must be detailed enough that a student could use it as a complete \
navigation guide to the entire source material.

# HARD CONSTRAINTS — violating ANY of these is a failure
1. You MUST produce **at least 5 and at most 8 Level-1 theme nodes**. Fewer than 5 is UNACCEPTABLE.
2. Each Level-1 node MUST have **at least 2 and at most 6 Level-2 concept children**.
3. Each Level-2 node MUST have **at least 2 Level-3 leaf children** when the source material \
contains any supporting specifics (definitions, examples, named results, sub-distinctions). \
Only use fewer than 2 if the source genuinely has no further detail for that concept.
4. The total tree MUST contain **at least 40 nodes** across all three levels.
5. Every piece of the source material must be represented somewhere in the tree.

# Structure (exactly 3 levels)
- **Level 1 — Themes**: The major topic areas discussed across the source material. \
These should partition the subject comprehensively — every significant topic in the sources \
should fall under exactly one Level-1 theme. Think of these as chapter headings.
- **Level 2 — Concepts**: The key concepts, methods, or sub-topics within each theme, \
as the sources present them. Think of these as section headings.
- **Level 3 — Specifics**: Concrete terms, definitions, named theorems, formulas, examples, \
distinctions, or sub-results from the sources. These are the "atoms" of knowledge — precise \
and look-uppable. Think of these as index entries.

# Grounding mandate
Every node MUST be DIRECTLY grounded in the source material. Do NOT invent topics. \
Do NOT output generic placeholder categories unless those exact terms appear in the sources. \
If you cannot point to a specific passage that justifies a node, do not include it.

# Field rules
- `id`: dot notation — `"n1"`, `"n1.2"`, `"n1.2.3"`.
- `label`: 2-6 words using terminology FROM the sources.
  - **Level-1 labels**: Broad theme names that appear in the source structure.
  - **Level-2 labels**: Concept or method names as the sources present them.
  - **Level-3 labels** MUST be specific: named theorems, defined terms, concrete examples, \
    technical distinctions, or formulas. Add a parenthetical clarifier when it aids precision.
    - ✅ GOOD: "Connectives (¬, ∨, ∧, →, ↔)", "Liar Paradox (Self-reference)", \
      "Closure rules", "Sentence Letters (A, B, C)", "Branching vs. Non-branching rules"
    - ❌ BAD: "Important concepts", "Key ideas", "Other topics", "Further details", \
      "Related methods", "Applications"
- `summary`: ONE sentence paraphrasing what the sources actually say about this concept. \
Be factual and specific — avoid vague summaries like "This is an important topic."
- `guiding_question`: A Socratic question engaging the student with THIS specific material.
  - ✅ GOOD: "How does the closure rule determine when a tree path is finished?"
  - ❌ BAD: "What is X?", "Why is X important?", "Can you explain X?"
- All text MUST be in the same language as the source material.
- Root `title`: a concise, specific name for the overall subject.

# Common mistakes to AVOID
- ❌ Producing only 2-3 Level-1 themes (you MUST produce at least 5)
- ❌ Having Level-2 nodes with 0 or 1 children (aim for 2-4 leaves each)
- ❌ Using vague Level-3 labels like "Related concepts" or "Applications"
- ❌ Collapsing distinct topics into a single over-broad theme
- ❌ Ignoring entire sections or chapters of the source material
- ❌ Making all Level-1 themes about the same narrow sub-area
- ❌ Writing generic summaries that could apply to any topic

# Coverage self-check
Before finalizing your output, mentally verify:
1. Have I covered ALL major sections/chapters from the source material?
2. Does each Level-1 theme represent a genuinely distinct topic area?
3. Are my Level-3 leaves specific enough that a student could look them up in the sources?
4. Would a student using this map be able to navigate the ENTIRE source material?
5. Do I have at least 40 total nodes? If not, I need to add more detail.

# Quality exemplar (shape, breadth, and specificity benchmark)
Do NOT copy this — use it ONLY as a style and density benchmark:

  Title: Foundations and Methods of Formal Logic
  ├── Central Task of Logic
  │   ├── Assessing argument validity
  │   ├── Determining logical consequence
  │   └── Modelling linguistic meaning
  ├── Propositional Logic (PL)
  │   ├── Syntax
  │   │   ├── Sentence Letters (A, B, C)
  │   │   ├── Connectives (¬, ∨, ∧, →, ↔)
  │   │   └── Well-formed formulas (wffs)
  │   └── Semantics
  │       ├── Truth assignments (valuation function v)
  │       └── Logical consequence (semantic)
  ├── Logical Methods
  │   ├── Truth-Table Method
  │   │   ├── Satisfiability-tester
  │   │   └── Exponential growth problem
  │   └── Tree Method
  │       ├── Closure rules
  │       ├── Branching vs. Non-branching rules
  │       └── Read models from open paths
  ├── Metatheory
  │   ├── Soundness (w.r.t. unsatisfiability)
  │   └── Completeness (w.r.t. satisfiability)
  └── Challenges to Bivalence
      ├── Vagueness (Sorites Paradox)
      ├── Fuzzy Logic (Degrees of truth)
      └── Liar Paradox (Self-reference)

Notice: 5 Level-1 themes, 2-3 Level-2 children each, 2-3 specific Level-3 leaves each. \
Total: ~30 nodes. Your output should aim for this density or higher.

# Source Material
{source_content}
"


def _write_debug_artifact(
    notebook_id: str,
    suffix: str,
    content: str,
) -> Path | None:
    """Persist a debug artifact to disk. Returns the path, or None on failure."""
    try:
        _MINDMAP_DEBUG_DIR.mkdir(parents=True, exist_ok=True)
        ts = int(time.time())
        path = _MINDMAP_DEBUG_DIR / f"{ts}-{notebook_id}-{suffix}"
        path.write_text(content, encoding="utf-8")
        return path
    except Exception as e:  # noqa: BLE001
        logger.warning("Failed to write mindmap debug artifact: %s", e)
        return None


# ============================================================
# Service Function
# ============================================================


async def generate_mindmap(
    *,
    notebook_id: str,
    user_id: str,
    llm: LLMProvider,
) -> dict:
    """
    Generate a hierarchical mindmap tree for all sources in a notebook.

    Returns the raw JSON tree from the LLM (title + nodes[]).
    """
    # 1. Verify notebook exists (ownership is enforced via source query scoping by user_id)
    notebook = notebook_repository.get_by_id(notebook_id)
    if notebook is None:
        raise NotFoundError("Notebook", notebook_id)

    # 2. Collect all ready source chunks
    ready_sources = knowledge_retrieval_repository.list_ready_sources(notebook_id, user_id)
    if not ready_sources:
        raise ValidationError("No ready sources found for this notebook. Upload and process sources first.")

    source_ids = [s.id for s in ready_sources]
    chunks = knowledge_retrieval_repository.list_chunks_for_source_ids(source_ids)

    if not chunks:
        raise ValidationError("No content chunks found. Sources may still be processing.")

    # 3. Build source content block — concatenate all chunks with source attribution
    source_title_map = {s.id: s.title for s in ready_sources}
    content_parts: list[str] = []
    current_source_id: str | None = None

    for chunk in chunks:
        if chunk.source_id != current_source_id:
            current_source_id = chunk.source_id
            title = source_title_map.get(chunk.source_id, "Unknown Source")
            content_parts.append(f"\n--- Source: {title} ---\n")
        content_parts.append(chunk.content)

    source_content = "\n".join(content_parts)

    logger.info(
        "Mindmap generation for notebook %s: %d sources, %d chunks, ~%d chars",
        notebook_id,
        len(ready_sources),
        len(chunks),
        len(source_content),
    )

    # Preview the first 2000 chars of the source content so we can confirm
    # the LLM is actually seeing the intended material.
    logger.info(
        "Mindmap source preview (notebook=%s, first 2000 chars):\n%s",
        notebook_id,
        source_content[:2000],
    )

    # 4. Build the prompt
    prompt = KNOWLEDGE_ARCHITECT_PROMPT.format(source_content=source_content)
    _write_debug_artifact(notebook_id, "prompt.txt", prompt)
    _write_debug_artifact(
        notebook_id,
        "schema.json",
        json.dumps(MINDMAP_RESPONSE_SCHEMA, indent=2, ensure_ascii=False),
    )

    # 5. Call LLM with structured output schema
    config = GenerationConfig(
        temperature=0.3,
        max_tokens=16384,
        response_format="json",
        response_schema=MINDMAP_RESPONSE_SCHEMA,
    )

    response = await llm.generate(
        prompt=prompt,
        context=[],
        config=config,
    )

    # ALWAYS log + persist the raw response so we can diagnose bad output.
    raw_path = _write_debug_artifact(notebook_id, "response.raw.json", response.content or "")
    logger.info(
        "Mindmap RAW response (notebook=%s, len=%d, debug=%s):\n%s",
        notebook_id,
        len(response.content or ""),
        raw_path,
        (response.content or "")[:4000],
    )

    # 6. Parse and validate the response
    try:
        tree = json.loads(response.content)
    except json.JSONDecodeError as e:
        logger.error(
            "Mindmap LLM response was not valid JSON (notebook=%s): %s\nRaw: %s",
            notebook_id,
            e,
            (response.content or "")[:2000],
        )
        raise ValidationError("Failed to parse mindmap response from LLM") from e

    if "nodes" not in tree or not isinstance(tree["nodes"], list):
        logger.error(
            "Mindmap LLM response missing 'nodes' array (notebook=%s): %s",
            notebook_id,
            tree,
        )
        raise ValidationError("LLM response did not contain a valid mindmap tree")

    if not tree["nodes"]:
        raise ValidationError("LLM returned an empty mindmap tree — sources may lack sufficient content")

    _write_debug_artifact(
        notebook_id,
        "tree.json",
        json.dumps(tree, indent=2, ensure_ascii=False),
    )

    # Log a structural summary of the parsed tree.
    def _shape(node: dict) -> dict:
        return {
            "id": node.get("id"),
            "label": node.get("label"),
            "children": [_shape(c) for c in (node.get("children") or [])],
        }

    shape_summary = {
        "title": tree.get("title"),
        "nodes": [_shape(n) for n in tree["nodes"]],
    }
    logger.info(
        "Mindmap parsed tree shape (notebook=%s):\n%s",
        notebook_id,
        json.dumps(shape_summary, indent=2, ensure_ascii=False),
    )

    logger.info(
        "Mindmap generated for notebook %s: %d top-level nodes, title='%s'",
        notebook_id,
        len(tree["nodes"]),
        tree.get("title", ""),
    )

    return tree
