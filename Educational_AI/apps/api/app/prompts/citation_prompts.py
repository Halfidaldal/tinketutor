"""
Citation Instruction Fragments

Reusable prompt fragments that instruct the LLM to return chunk_ids
alongside its output. Appended to canvas, tutor, quiz, and gap prompts.

Per ADR-3 and TG-4: Every LLM call that generates user-facing content
includes these instructions.
"""

CITATION_INSTRUCTION = """
IMPORTANT — Citation Requirements:
Each claim or statement you make MUST reference one or more chunk_ids from the
provided context. Include chunk_ids as a JSON array alongside each piece of
generated content.

Rules:
1. Only reference chunk_ids that appear in the provided context
2. Do not fabricate or guess chunk_ids
3. If you cannot ground a statement in the provided chunks, omit the statement
4. Each citation should include the most relevant chunk_id for that specific claim

The backend will validate all chunk_ids. Invalid references will be silently removed.
"""

CONTEXT_FORMAT = """
Source Material (use these chunk_ids for citations):

{chunks}
"""

def format_evidence_context(chunks: list) -> str:
    """Format EvidenceChunk list into a prompt context block."""
    formatted = []
    for chunk in chunks:
        formatted.append(
            f"[chunk_id: {chunk.chunk_id}] "
            f"(Source: {chunk.source_title}, p.{chunk.page_start}"
            f"{'-' + str(chunk.page_end) if chunk.page_end != chunk.page_start else ''}"
            f"{', ' + chunk.section_title if chunk.section_title else ''})\n"
            f"{chunk.content}\n"
        )
    return CONTEXT_FORMAT.format(chunks="\n---\n".join(formatted))
