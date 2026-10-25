"""Files uploaded to MinIO by the Core Backend, read by the agents (CONTEXT D35).

The buckets are server-side encrypted (SSE-S3, CONTEXT D28): MinIO decrypts on read, so the reader
needs no key. The SDK is blocking, so calls run in a worker thread.
"""

from typing import Protocol
from urllib.parse import urlsplit

import anyio
from minio import Minio
from minio.error import S3Error

from app.consumers.errors import PermanentError

JD_FILES_BUCKET = "jd-files"
CV_FILES_BUCKET = "cv-files"
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
"""The API refuses larger uploads (413, US-1.5); anything bigger here is not one of its files."""

MISSING_OBJECT_CODES = frozenset({"NoSuchKey", "NoSuchBucket", "NoSuchObject"})


def minio_client(endpoint: str, access_key: str, secret_key: str) -> Minio:
    """A client for `http(s)://host:port`, TLS when the scheme is https."""
    url = urlsplit(endpoint)
    return Minio(
        url.netloc, access_key=access_key, secret_key=secret_key, secure=url.scheme == "https"
    )


class ObjectReader(Protocol):
    async def get_bytes(self, bucket: str, key: str) -> bytes: ...


class MinioObjectReader:
    def __init__(self, client: Minio, max_bytes: int = MAX_UPLOAD_BYTES) -> None:
        self._client = client
        self._max_bytes = max_bytes

    async def get_bytes(self, bucket: str, key: str) -> bytes:
        """The whole object. A missing or oversized object is a PermanentError; a connection
        failure propagates and the job is retried."""
        return await anyio.to_thread.run_sync(self._get, bucket, key)

    def _get(self, bucket: str, key: str) -> bytes:
        try:
            size = self._client.stat_object(bucket, key).size or 0
            if size > self._max_bytes:
                raise PermanentError(
                    f"{bucket}/{key} is {size} bytes, over {self._max_bytes}", code="FILE_TOO_LARGE"
                )
            response = self._client.get_object(bucket, key)
        except S3Error as error:
            if error.code in MISSING_OBJECT_CODES:
                raise PermanentError(f"{bucket}/{key} not found", code="FILE_MISSING") from error
            raise
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()
