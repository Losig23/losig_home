"""Storage backends: local round-trip, backend selection, stubbed R2."""
import sys

import pytest

from app import storage


@pytest.fixture()
def local_instance(app, tmp_path, monkeypatch):
    """Point the local backend at a throwaway instance dir."""
    # Set on the real app object (not the current_app proxy) so monkeypatch
    # can undo it without an app context at teardown.
    monkeypatch.setattr(app, "instance_path", str(tmp_path))
    with app.app_context():
        yield tmp_path


def test_default_backend_is_local(monkeypatch):
    monkeypatch.delenv("STORAGE_BACKEND", raising=False)
    assert storage.backend_name() == "local"


def test_local_save_load_exists_round_trip(local_instance):
    ref = storage.save_photo(b"fake-bytes", ".png")
    assert ref.startswith("uploads/meals/")
    assert ref.endswith(".png")
    assert storage.photo_exists(ref) is True
    assert storage.load_photo(ref) == b"fake-bytes"


def test_local_missing_returns_none_and_false(local_instance):
    assert storage.load_photo("uploads/meals/does-not-exist.png") is None
    assert storage.photo_exists("uploads/meals/does-not-exist.png") is False


def test_mimetype_map():
    assert storage.mimetype_for_ext(".png") == "image/png"
    assert storage.mimetype_for_ext(".JPG") == "image/jpeg"
    assert storage.mimetype_for_ext(".jpeg") == "image/jpeg"
    assert storage.mimetype_for_ext(".webp") == "image/webp"
    assert storage.mimetype_for_ext(".gif") == "image/gif"
    assert storage.mimetype_for_ext(".bmp") == "application/octet-stream"


def test_unknown_backend_raises(app, tmp_path, monkeypatch):
    monkeypatch.setenv("STORAGE_BACKEND", "tape-drive")
    monkeypatch.setattr(app, "instance_path", str(tmp_path))
    with app.app_context():
        with pytest.raises(RuntimeError, match="Unknown STORAGE_BACKEND"):
            storage.save_photo(b"x", ".png")


# ---- R2 backend, boto3 stubbed (no moto, no network) ----


class _FakeBody:
    def __init__(self, data):
        self._data = data

    def read(self):
        return self._data


class _NotFound(Exception):
    """Duck-typed botocore ClientError for a missing key."""

    def __init__(self):
        super().__init__("not found")
        self.response = {"Error": {"Code": "NoSuchKey"}}


class _FakeS3:
    def __init__(self):
        self.objects = {}
        self.puts = []

    def put_object(self, Bucket, Key, Body, ContentType=None):
        self.puts.append((Bucket, Key, ContentType))
        self.objects[Key] = Body

    def get_object(self, Bucket, Key):
        if Key not in self.objects:
            raise _NotFound()
        return {"Body": _FakeBody(self.objects[Key])}

    def head_object(self, Bucket, Key):
        if Key not in self.objects:
            raise _NotFound()


class _FakeBoto3:
    def __init__(self, fake_s3):
        self._s3 = fake_s3
        self.client_kwargs = None

    def client(self, *args, **kwargs):
        self.client_kwargs = (args, kwargs)
        return self._s3


def _stub_r2(monkeypatch):
    fake_s3 = _FakeS3()
    monkeypatch.setitem(sys.modules, "boto3", _FakeBoto3(fake_s3))
    monkeypatch.setenv("STORAGE_BACKEND", "r2")
    monkeypatch.setenv(
        "R2_ENDPOINT_URL", "https://example.r2.cloudflarestorage.com"
    )
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "fake-key-id")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "fake-secret")
    monkeypatch.setenv("R2_BUCKET", "fake-bucket")
    return fake_s3


def test_r2_save_load_exists_round_trip(monkeypatch):
    fake_s3 = _stub_r2(monkeypatch)
    ref = storage.save_photo(b"r2-bytes", ".jpg")
    assert ref.startswith("uploads/meals/")
    assert ref.endswith(".jpg")
    assert storage.photo_exists(ref) is True
    assert storage.load_photo(ref) == b"r2-bytes"
    bucket, key, content_type = fake_s3.puts[0]
    assert (bucket, key) == ("fake-bucket", ref)
    assert content_type == "image/jpeg"


def test_r2_missing_returns_none_and_false(monkeypatch):
    _stub_r2(monkeypatch)
    assert storage.load_photo("uploads/meals/nope.png") is None
    assert storage.photo_exists("uploads/meals/nope.png") is False


def test_r2_missing_env_vars_raise(monkeypatch):
    monkeypatch.setitem(sys.modules, "boto3", _FakeBoto3(_FakeS3()))
    monkeypatch.setenv("STORAGE_BACKEND", "r2")
    for var in (
        "R2_ENDPOINT_URL",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET",
    ):
        monkeypatch.delenv(var, raising=False)
    with pytest.raises(RuntimeError, match="missing env vars"):
        storage.save_photo(b"x", ".png")


def test_r2_missing_boto3_raises(monkeypatch):
    # None in sys.modules makes `import boto3` raise ImportError.
    monkeypatch.setitem(sys.modules, "boto3", None)
    monkeypatch.setenv("STORAGE_BACKEND", "r2")
    monkeypatch.setenv(
        "R2_ENDPOINT_URL", "https://example.r2.cloudflarestorage.com"
    )
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "x")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "y")
    monkeypatch.setenv("R2_BUCKET", "b")
    with pytest.raises(RuntimeError, match="needs boto3"):
        storage.save_photo(b"x", ".png")
