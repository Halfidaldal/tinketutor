from __future__ import annotations

import re
import unicodedata


_INLINE_SPACE_RE = re.compile(r"[ \t\f\v]+")
_EXTRA_NEWLINES_RE = re.compile(r"\n{3,}")
_WORD_RE = re.compile(r"\b\w{2,}\b", flags=re.UNICODE)


def normalize_extracted_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value or "")
    normalized = normalized.replace("\x00", "")
    normalized = normalized.replace("\u00ad", "")
    normalized = normalized.replace("\u00a0", " ")
    normalized = normalized.replace("\r\n", "\n").replace("\r", "\n")
    normalized = _INLINE_SPACE_RE.sub(" ", normalized)
    normalized = re.sub(r" *\n *", "\n", normalized)
    normalized = _EXTRA_NEWLINES_RE.sub("\n\n", normalized)
    return normalized.strip()


def looks_readable_text(value: str, *, strict_min_length: int = 120) -> bool:
    normalized = normalize_extracted_text(value)
    if not normalized:
        return False

    disallowed_controls = sum(
        1
        for char in normalized
        if unicodedata.category(char) == "Cc" and char not in "\n\t"
    )
    if disallowed_controls:
        return False

    if len(normalized) < strict_min_length:
        return True

    non_space_chars = [char for char in normalized if not char.isspace()]
    if not non_space_chars:
        return False

    alnum_ratio = sum(1 for char in non_space_chars if char.isalnum()) / len(non_space_chars)
    symbol_ratio = sum(
        1 for char in non_space_chars if unicodedata.category(char).startswith("S")
    ) / len(non_space_chars)
    whitespace_ratio = 1.0 - (len(non_space_chars) / len(normalized))
    word_count = len(_WORD_RE.findall(normalized))

    if whitespace_ratio < 0.03 and word_count < 4 and symbol_ratio > 0.10:
        return False
    if alnum_ratio < 0.45 and word_count < 8:
        return False
    if symbol_ratio > 0.35 and word_count < 8:
        return False

    return True
