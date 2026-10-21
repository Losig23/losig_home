"""The game's JavaScript unit tests (tests/js, node's built-in runner).

The modules they cover (vehicle.js, collide.js, octane.js, gamepad.js)
import nothing from three.js, so node loads them straight from
app/static/game. Skipped where node isn't installed.
"""
import pathlib
import shutil
import subprocess

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]


def test_game_js_unit_tests():
    node = shutil.which("node")
    if not node:
        pytest.skip("node isn't installed")
    files = sorted(str(p) for p in (ROOT / "tests" / "js").glob("*.test.mjs"))
    assert files
    r = subprocess.run([node, "--test", *files], cwd=ROOT, capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stdout[-4000:] + r.stderr[-2000:]
