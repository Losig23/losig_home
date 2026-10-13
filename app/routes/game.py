"""Apartment game frontend (/game) and the public JSON it needs.

/game is intentionally PUBLIC (like /): logged-out visitors can walk the
apartment and see public data; the panels offer log-entry forms only when
the session is authenticated (private endpoints 401 otherwise).
"""
from flask import Blueprint, jsonify, render_template

import app.listening as listening

game_bp = Blueprint("game", __name__)


@game_bp.get("/game")
def game_page():
    return render_template("game.html")


@game_bp.get("/api/public/music")
def public_music():
    """This week's top tracks/artists as JSON — the same data the public
    homepage renders server-side. Null when Last.fm isn't configured."""
    if not listening.configured():
        return jsonify(None)
    return jsonify(
        {
            "tracks": listening.weekly_tracks(limit=5) or [],
            "artists": listening.weekly_artists(limit=5) or [],
        }
    )
