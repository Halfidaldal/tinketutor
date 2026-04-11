"""
Seam 4: ObjectStore — Abstract Base Class

File: backend/app/providers/object_store.py
Per phase-2-implementation-seams.md §Seam 4:

Cloud Storage may be replaced with S3 or local filesystem for testing.

Implementations:
- CloudStorageStore (v1: Google Cloud Storage)
- Future: LocalFileStore (for testing), S3Store
"""

from abc import ABC, abstractmethod
from typing import BinaryIO


class ObjectStore(ABC):
    """
    Abstract file storage interface.

    Used for uploading/downloading source documents (PDF/PPTX/DOCX).
    """

    @abstractmethod
    async def upload(self, file: BinaryIO, path: str) -> str:
        """
        Upload a file to object storage.

        Args:
            file: File-like object to upload
            path: Destination path in storage

        Returns:
            The storage path/URL of the uploaded file
        """
        ...

    @abstractmethod
    async def download(self, path: str) -> bytes:
        """
        Download a file from object storage.

        Args:
            path: Path to the file in storage

        Returns:
            File contents as bytes
        """
        ...

    @abstractmethod
    async def delete(self, path: str) -> None:
        """
        Delete a file from object storage.

        Args:
            path: Path to the file in storage
        """
        ...
