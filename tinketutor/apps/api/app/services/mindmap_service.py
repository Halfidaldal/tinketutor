"""
Mindmap Service — Hierarchical Knowledge Map Generation (Two-Pass)

Uses a two-pass "Knowledge Architect" approach for NotebookLM-level density:

Pass 1 (Skeleton):
  - Analyses ALL source chunks for a notebook
  - Produces only the Level-1 themes (id, label, summary, guiding_question)
  - Lightweight — focuses model attention on broad coverage

Pass 2 (Fill — parallelised):
  - For each Level-1 theme, a separate LLM call produces its Level-2 concepts
    and Level-3 specific leaves
  - Each branch gets the model's full attention budget
  - Runs concurrently via asyncio.gather for ~3-5s total latency

This architecture removes the single-response token ceiling, quadruples
density, and ensures every branch is richly populated.
"""

from __future__ import annotations

import asyncio
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
# JSON Schemas — one per pass
# ============================================================

# NOTE: Vertex Gemini structured output does NOT reliably support $ref/$defs
# recursion, and minItems/maxItems on nested arrays causes "too many states"
# errors. We keep schemas flat and move cardinality enforcement to prompts.

# --- Pass 1: Skeleton (themes only) ---

_SKELETON_THEME_SCHEMA = {
    "type": "object",
    "properties": {
        "id": {"type": "string"},
        "label": {"type": "string"},
        "summary": {"type": "string"},
        "guiding_question": {"type": "string"},
    },
    "required": ["id", "label", "summary", "guiding_question"],
}

SKELETON_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "themes": {
            "type": "array",
            "items": _SKELETON_THEME_SCHEMA,
        },
    },
    "required": ["title", "themes"],
}

# --- Pass 2: Branch fill (concepts + leaves) ---

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

_CONCEPT_NODE_SCHEMA = {
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

BRANCH_FILL_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "concepts": {
            "type": "array",
            "items": _CONCEPT_NODE_SCHEMA,
        },
    },
    "required": ["concepts"],
}

# --- Legacy: Full tree schema (kept for validation/fallback) ---

_ROOT_NODE_SCHEMA = {
    "type": "object",
    "properties": {
        "id": {"type": "string"},
        "label": {"type": "string"},
        "summary": {"type": "string"},
        "guiding_question": {"type": "string"},
        "children": {
            "type": "array",
            "items": _CONCEPT_NODE_SCHEMA,
        },
    },
    "required": ["id", "label", "summary", "guiding_question", "children"],
}

MINDMAP_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "nodes": {
            "type": "array",
            "items": _ROOT_NODE_SCHEMA,
        },
    },
    "required": ["title", "nodes"],
}


# ============================================================
# Prompts
# ============================================================

# --- Pass 1: Skeleton prompt ---

SKELETON_PROMPT = """\
You are a **Knowledge Architect** analysing source material to identify its major topic areas.

# YOUR TASK
Produce ONLY the Level-1 themes (the major topic areas) from the source material below.
Do NOT produce sub-concepts or specifics — that comes later. Focus entirely on identifying
the 5–8 broadest, most distinct topic areas that comprehensively partition the source material.

# HARD CONSTRAINTS
1. You MUST produce **at least 5 and at most 8** themes. Fewer than 5 is UNACCEPTABLE.
2. Every significant section/chapter/topic in the sources MUST be covered by at least one theme.
3. Themes must be MUTUALLY EXCLUSIVE — each source topic falls under exactly one theme.
4. Themes must be COLLECTIVELY EXHAUSTIVE — no significant source content is left uncovered.

# Field rules
- `id`: sequential — `"n1"`, `"n2"`, etc.
- `label`: 2–6 words using terminology FROM the sources. These are chapter-level headings.
- `summary`: ONE sentence describing what this theme covers, grounded in source content.
- `guiding_question`: A Socratic question about this theme area.
- `title`: A concise, specific name for the overall subject matter.
- All text MUST be in the same language as the source material.

# Grounding mandate
Every theme MUST be DIRECTLY grounded in the source material. Do NOT invent topics.
If you cannot point to specific passages that justify a theme, do not include it.

# Coverage self-check
Before finalizing, verify:
1. Have I covered ALL major sections/chapters from the sources?
2. Does each theme represent a genuinely distinct topic area?
3. Are there at least 5 themes?
4. Would a student using these themes be able to navigate the ENTIRE source material?

# Source Material
{source_content}
"""

# --- Pass 2: Branch fill prompt ---

BRANCH_FILL_PROMPT = """\
You are a **Knowledge Architect** building a detailed sub-tree for ONE theme of a study mind map.

# CONTEXT
The overall mind map title is: **{map_title}**
You are expanding theme **{theme_id}**: **{theme_label}**
Theme summary: {theme_summary}

# YOUR TASK
Produce the Level-2 concepts and Level-3 specifics for this theme ONLY, based on the
source material below. Each concept you produce will become a child of this theme node.

# HARD CONSTRAINTS
1. You MUST produce **at least 3 and at most 6 Level-2 concept nodes**.
2. Each Level-2 concept MUST have **at least 2 and at most 5 Level-3 leaf children**.
3. Every piece of source content relevant to theme "{theme_label}" must appear somewhere.
4. You MUST produce at least 10 total nodes (concepts + leaves combined).

# Structure
- **Level 2 — Concepts**: Key concepts, methods, or sub-topics within this theme. \
Think of these as section headings within a chapter.
- **Level 3 — Specifics**: Concrete terms, definitions, named theorems, formulas, examples, \
distinctions, or sub-results. These are the "atoms" of knowledge — precise and look-uppable. \
Think of these as index entries.

# Field rules
- `id`: Use dot notation starting from the theme id. For theme "{theme_id}":
  - Concepts: "{theme_id}.1", "{theme_id}.2", etc.
  - Leaves: "{theme_id}.1.1", "{theme_id}.1.2", etc.
- `label`: 2–6 words using terminology FROM the sources.
  - **Level-2 labels**: Concept or method names as the sources present them.
  - **Level-3 labels** MUST be specific: named theorems, defined terms, concrete examples, \
    technical distinctions, or formulas. Add a parenthetical clarifier when it aids precision.
    - ✅ GOOD: "Connectives (¬, ∨, ∧, →, ↔)", "Liar Paradox (Self-reference)", \
      "Closure rules", "Sentence Letters (A, B, C)", "Branching vs. Non-branching rules"
    - ❌ BAD: "Important concepts", "Key ideas", "Other topics", "Further details"
- `summary`: ONE sentence paraphrasing what the sources actually say about this concept.
- `guiding_question`: A Socratic question engaging the student with THIS specific material.
  - ✅ GOOD: "How does the closure rule determine when a tree path is finished?"
  - ❌ BAD: "What is X?", "Why is X important?"
- All text MUST be in the same language as the source material.

# Grounding mandate
Every node MUST be DIRECTLY grounded in the source material. Do NOT invent topics.

# Common mistakes to AVOID
- ❌ Producing only 1–2 concepts (you MUST produce at least 3)
- ❌ Having concepts with 0 or 1 children (each MUST have at least 2 leaves)
- ❌ Using vague leaf labels like "Related concepts" or "Applications"
- ❌ Writing generic summaries that could apply to any topic
- ❌ Ignoring source content that falls under this theme

# Source Material
{source_content}
"""


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
# Two-Pass Generation Internals
# ============================================================


async def _pass1_skeleton(
    *,
    llm: LLMProvider,
    source_content: str,
    notebook_id: str,
) -> dict:
    """
    Pass 1: Generate the skeleton — just the Level-1 themes.
    Returns {"title": str, "themes": [{"id", "label", "summary", "guiding_question"}, ...]}.
    """
    prompt = SKELETON_PROMPT.format(source_content=source_content)
    _write_debug_artifact(notebook_id, "pass1-prompt.txt", prompt)

    config = GenerationConfig(
        temperature=0.3,
        max_tokens=4096,  # Themes-only is lightweight
        response_format="json",
        response_schema=SKELETON_RESPONSE_SCHEMA,
    )

    response = await llm.generate(prompt=prompt, context=[], config=config)

    _write_debug_artifact(notebook_id, "pass1-response.json", response.content or "")
    logger.info(
        "Pass 1 skeleton response (notebook=%s, len=%d):\n%s",
        notebook_id,
        len(response.content or ""),
        (response.content or "")[:3000],
    )

    try:
        skeleton = json.loads(response.content)
    except json.JSONDecodeError as e:
        logger.error("Pass 1 response not valid JSON: %s", e)
        raise ValidationError("Failed to parse skeleton response from LLM") from e

    themes = skeleton.get("themes", [])
    if not themes:
        raise ValidationError("Pass 1 returned no themes")

    logger.info(
        "Pass 1 produced %d themes: %s",
        len(themes),
        [t.get("label", "?") for t in themes],
    )
    return skeleton


async def _pass2_fill_branch(
    *,
    llm: LLMProvider,
    source_content: str,
    map_title: str,
    theme: dict,
    notebook_id: str,
) -> dict:
    """
    Pass 2: Fill a single branch — produce Level-2 concepts and Level-3 leaves
    for one theme. Returns the full theme node with children populated.
    """
    theme_id = theme["id"]
    theme_label = theme["label"]
    theme_summary = theme.get("summary", "")

    prompt = BRANCH_FILL_PROMPT.format(
        map_title=map_title,
        theme_id=theme_id,
        theme_label=theme_label,
        theme_summary=theme_summary,
        source_content=source_content,
    )
    _write_debug_artifact(notebook_id, f"pass2-{theme_id}-prompt.txt", prompt)

    config = GenerationConfig(
        temperature=0.3,
        max_tokens=8192,  # Each branch gets a generous budget
        response_format="json",
        response_schema=BRANCH_FILL_RESPONSE_SCHEMA,
    )

    response = await llm.generate(prompt=prompt, context=[], config=config)

    _write_debug_artifact(notebook_id, f"pass2-{theme_id}-response.json", response.content or "")
    logger.info(
        "Pass 2 branch '%s' response (notebook=%s, len=%d)",
        theme_label,
        notebook_id,
        len(response.content or ""),
    )

    try:
        branch_data = json.loads(response.content)
    except json.JSONDecodeError as e:
        logger.error(
            "Pass 2 branch '%s' response not valid JSON: %s\nRaw: %s",
            theme_label, e, (response.content or "")[:2000],
        )
        # Return theme with empty children rather than failing the whole map
        return {**theme, "children": []}

    concepts = branch_data.get("concepts", [])
    logger.info(
        "Pass 2 branch '%s' produced %d concepts with %d total leaves",
        theme_label,
        len(concepts),
        sum(len(c.get("children", [])) for c in concepts),
    )

    # Assemble the full theme node
    return {
        "id": theme_id,
        "label": theme_label,
        "summary": theme_summary,
        "guiding_question": theme.get("guiding_question", ""),
        "children": concepts,
    }


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

    Uses a two-pass approach:
      Pass 1: Generate Level-1 themes (skeleton)
      Pass 2: Fill each branch in parallel (concepts + leaves)

    Returns the assembled JSON tree (title + nodes[]).
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

    # 4. PASS 1 — Generate skeleton (Level-1 themes)
    logger.info("Starting Pass 1: Skeleton generation (notebook=%s)", notebook_id)
    skeleton = await _pass1_skeleton(
        llm=llm,
        source_content=source_content,
        notebook_id=notebook_id,
    )
    map_title = skeleton.get("title", "Untitled")
    themes = skeleton["themes"]

    _write_debug_artifact(
        notebook_id,
        "skeleton.json",
        json.dumps(skeleton, indent=2, ensure_ascii=False),
    )

    # 5. PASS 2 — Fill each branch in parallel
    logger.info(
        "Starting Pass 2: Filling %d branches in parallel (notebook=%s)",
        len(themes),
        notebook_id,
    )

    fill_tasks = [
        _pass2_fill_branch(
            llm=llm,
            source_content=source_content,
            map_title=map_title,
            theme=theme,
            notebook_id=notebook_id,
        )
        for theme in themes
    ]

    filled_nodes = await asyncio.gather(*fill_tasks, return_exceptions=True)

    # Handle any exceptions from individual branches gracefully
    final_nodes: list[dict] = []
    for i, result in enumerate(filled_nodes):
        if isinstance(result, Exception):
            logger.error(
                "Pass 2 branch %d ('%s') failed: %s",
                i, themes[i].get("label", "?"), result,
            )
            # Include the theme with empty children rather than dropping it
            final_nodes.append({**themes[i], "children": []})
        else:
            final_nodes.append(result)

    # 6. Assemble final tree
    tree = {
        "title": map_title,
        "nodes": final_nodes,
    }

    _write_debug_artifact(
        notebook_id,
        "tree.json",
        json.dumps(tree, indent=2, ensure_ascii=False),
    )

    # Log structural summary
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

    total_nodes = 0
    for n in tree["nodes"]:
        total_nodes += 1
        for c in n.get("children", []):
            total_nodes += 1
            total_nodes += len(c.get("children", []))

    logger.info(
        "Mindmap generated for notebook %s: %d L1 nodes, %d total nodes, title='%s'\n%s",
        notebook_id,
        len(tree["nodes"]),
        total_nodes,
        tree.get("title", ""),
        json.dumps(shape_summary, indent=2, ensure_ascii=False),
    )

    if not tree["nodes"]:
        raise ValidationError("LLM returned an empty mindmap tree — sources may lack sufficient content")

    return tree
