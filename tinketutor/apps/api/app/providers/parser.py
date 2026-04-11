"""
Seam 2: ParserProvider — Abstract Base Class

File: backend/app/providers/parser.py
Per phase-2-implementation-seams.md §Seam 2:

PDF parsing libraries are fragile. May need to swap unstructured
for PyMuPDF or a custom parser for Danish documents.

Leak check: No service file should import `unstructured` directly.

Implementations:
- UnstructuredParser (v1)
"""

from abc import ABC, abstractmethod

from app.domain.models import ParsedDocument


class ParserProvider(ABC):
    """
    Abstract document parser interface.

    Extracts structured text from uploaded documents (PDF/PPTX/DOCX).
    The output is a ParsedDocument with sections, page numbers, and metadata.
    """

    @abstractmethod
    async def parse(self, file_path: str, file_type: str) -> ParsedDocument:
        """
        Parse a document file into structured text.

        Args:
            file_path: Local path to the downloaded file
            file_type: One of "pdf", "pptx", "docx"

        Returns:
            ParsedDocument with sections, page numbers, and hierarchy

        Raises:
            ProviderError if parsing fails
        """
        ...
