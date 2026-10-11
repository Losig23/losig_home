"""Public portfolio homepage: recruiter-facing resume content, no phone number."""
import re


def _body(anon_client):
    page = anon_client.get("/")
    assert page.status_code == 200
    return page.data.decode()


def test_public_home_shows_portfolio(anon_client):
    body = _body(anon_client)
    for needle in (
        "Anirudh Yarram",
        "Software Engineer",
        "Open to new opportunities",
        "Mechdyne",
        "Neubode",
        "CareTech",
        "TuneSage",
        "University of Wisconsin",
    ):
        assert needle in body, needle
    assert "Sustainik" not in body


def test_public_home_keeps_training_log(anon_client):
    body = _body(anon_client)
    assert "Training log" in body
    assert "/login" in body


def test_public_home_contact_links_no_phone(anon_client):
    body = _body(anon_client)
    assert "mailto:anirudhyarram@gmail.com" in body
    assert "https://github.com/Losig23" in body
    assert "https://www.linkedin.com/in/anirudh-yarram-7a38ba18b/" in body
    # Phone number must never appear on the public page.
    assert "720-4324" not in body
    assert not re.search(r"\(608\)", body)
    assert "608-720" not in body
