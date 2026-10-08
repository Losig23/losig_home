"""Meal-photo storage backends.

Refs are opaque strings of the form ``uploads/meals/<uuid>.<ext>`` for BOTH
backends, so existing DB rows keep working no matter which backend serves
them. Never store absolute paths or provider-specific URLs in the DB.

Backend selection: the ``STORAGE_BACKEND`` environment variable.

- ``local`` (default): files under ``current_app.instance_path`` — today's
  behavior (``instance/uploads/meals/...``). Fine for dev; Render's
  filesystem is ephemeral, so production uses ``r2``.
- ``r2``: Cloudflare R2 via boto3 (S3-compatible). The object key is the ref
  verbatim. Requires ``R2_ENDPOINT_URL``, ``R2_ACCESS_KEY_ID``,
  ``R2_SECRET_ACCESS_KEY`` and ``R2_BUCKET``.

boto3 is imported lazily so local dev and tests never need it installed.
"""
import os
import uuid

from flask import current_app

MIMETYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


def mimetype_for_ext(ext):
    """MIME type for one of the allowed upload extensions."""
    return MIMETYPES.get((ext or "").lower(), "application/octet-stream")


def backend_name():
    """Active backend: ``local`` unless STORAGE_BACKEND says otherwise."""
    return os.environ.get("STORAGE_BACKEND", "local").lower()


def new_photo_ref(ext):
    """Build a fresh photo ref: ``uploads/meals/<uuid>.<ext>``."""
    return f"uploads/meals/{uuid.uuid4().hex}{ext.lower()}"


def _r2_client():
    try:
        import boto3
    except ImportError:
        raise RuntimeError(
            "STORAGE_BACKEND=r2 needs boto3: pip install boto3"
        )
    missing = [
        name
        for name in (
            "R2_ENDPOINT_URL",
            "R2_ACCESS_KEY_ID",
            "R2_SECRET_ACCESS_KEY",
            "R2_BUCKET",
        )
        if not os.environ.get(name)
    ]
    if missing:
        raise RuntimeError(
            "STORAGE_BACKEND=r2 is missing env vars: " + ", ".join(missing)
        )
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT_URL"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
    )


def _r2_bucket():
    return os.environ["R2_BUCKET"]


def _is_not_found(exc):
    """True for S3-style missing-key errors (duck-typed, no boto3 import)."""
    code = (
        getattr(exc, "response", {}) or {}
    ).get("Error", {}).get("Code", "")
    return code in ("NoSuchKey", "NotFound", "404")


def save_photo(data, ext):
    """Persist photo bytes; returns the opaque ref to store in the DB."""
    ref = new_photo_ref(ext)
    backend = backend_name()
    if backend == "r2":
        _r2_client().put_object(
            Bucket=_r2_bucket(),
            Key=ref,
            Body=data,
            ContentType=mimetype_for_ext(ext),
        )
    elif backend == "local":
        full_path = os.path.join(current_app.instance_path, ref)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "wb") as f:
            f.write(data)
    else:
        raise RuntimeError(f"Unknown STORAGE_BACKEND: {backend!r}")
    return ref


def load_photo(ref):
    """Return photo bytes for a ref, or None when the object is missing."""
    backend = backend_name()
    if backend == "r2":
        try:
            resp = _r2_client().get_object(Bucket=_r2_bucket(), Key=ref)
        except Exception as exc:  # noqa: BLE001 -- duck-typed below
            if _is_not_found(exc):
                return None
            raise
        return resp["Body"].read()
    if backend == "local":
        full_path = os.path.join(current_app.instance_path, ref)
        if not os.path.isfile(full_path):
            return None
        with open(full_path, "rb") as f:
            return f.read()
    raise RuntimeError(f"Unknown STORAGE_BACKEND: {backend!r}")


def photo_exists(ref):
    """True when a photo object exists for the ref."""
    backend = backend_name()
    if backend == "r2":
        try:
            _r2_client().head_object(Bucket=_r2_bucket(), Key=ref)
        except Exception as exc:  # noqa: BLE001 -- duck-typed below
            if _is_not_found(exc):
                return False
            raise
        return True
    if backend == "local":
        return os.path.isfile(os.path.join(current_app.instance_path, ref))
    raise RuntimeError(f"Unknown STORAGE_BACKEND: {backend!r}")
