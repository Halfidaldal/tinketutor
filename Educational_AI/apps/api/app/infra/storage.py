"""
Runtime object store implementations.

Cloud Storage is the authoritative runtime store. A local file-backed variant
is retained only as an explicitly isolated fallback for tests.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import BinaryIO

from app.infra.firestore import get_storage_bucket
from app.providers.object_store import ObjectStore


class LocalObjectStore(ObjectStore):
    def __init__(self, base_dir: str):
        self.base_dir = Path(base_dir).resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _resolve(self, path: str) -> Path:
        candidate = Path(path)
        if candidate.is_absolute():
            return candidate
        return self.base_dir / candidate

    async def upload(self, file: BinaryIO, path: str) -> str:
        destination = self._resolve(path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        payload = file.read()
        if isinstance(payload, str):
            payload = payload.encode("utf-8")
        await asyncio.to_thread(destination.write_bytes, payload)
        return str(destination)

    async def download(self, path: str) -> bytes:
        return await asyncio.to_thread(self._resolve(path).read_bytes)

    async def delete(self, path: str) -> None:
        destination = self._resolve(path)
        if destination.exists():
            await asyncio.to_thread(destination.unlink)


class CloudStorageObjectStore(ObjectStore):
    """Google Cloud Storage-backed implementation for runtime uploads."""

    @staticmethod
    def _normalize_path(path: str) -> str:
        return path.lstrip("/")

    async def upload(self, file: BinaryIO, path: str) -> str:
        blob_path = self._normalize_path(path)
        payload = file.read()
        if isinstance(payload, str):
            payload = payload.encode("utf-8")

        def _upload() -> None:
            bucket = get_storage_bucket()
            blob = bucket.blob(blob_path)
            blob.upload_from_string(payload)

        await asyncio.to_thread(_upload)
        return blob_path

    async def download(self, path: str) -> bytes:
        blob_path = self._normalize_path(path)

        def _download() -> bytes:
            bucket = get_storage_bucket()
            blob = bucket.blob(blob_path)
            return blob.download_as_bytes()

        return await asyncio.to_thread(_download)

    async def delete(self, path: str) -> None:
        blob_path = self._normalize_path(path)

        def _delete() -> None:
            bucket = get_storage_bucket()
            blob = bucket.blob(blob_path)
            if blob.exists():
                blob.delete()

        await asyncio.to_thread(_delete)
