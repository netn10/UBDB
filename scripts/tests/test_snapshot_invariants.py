"""Structural guards on the committed card snapshot. These catch a stale or
mis-synced cards.json: wrong schema, a leaked Universes Within card, or a set
nobody mapped to a franchise.

Deliberately no hardcoded card count. The count tracks live Scryfall and moves
whenever Wizards ships a set; the invariants below are the durable guarantees.
"""
import json
import os

from franchise_map import DEFAULT_DATA_DIR, load_maps

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_SNAPSHOT = os.path.join(_ROOT, "data", "ub_cards", "cards.json")


def _cards():
    with open(_SNAPSHOT, encoding="utf-8") as f:
        return json.load(f)


def test_every_card_has_new_fields_and_not_the_old_one():
    for c in _cards():
        assert "set_names" in c and "franchises" in c, c["name"]
        assert "ub_franchises" not in c, c["name"]
        assert c["franchises"], f"empty franchises: {c['name']}"


def test_no_universes_within_prints_remain():
    for c in _cards():
        assert all(p["set"] != "slx" for p in c["prints"]), c["name"]


def test_set_map_is_total_over_the_snapshot():
    set_map, _ = load_maps(DEFAULT_DATA_DIR)
    seen = set()
    for c in _cards():
        seen.update(c["set_names"])
    missing = sorted(seen - set(set_map))
    assert not missing, f"set names absent from set_map.json: {missing}"


def test_no_card_is_unassigned():
    stray = [c["name"] for c in _cards() if c["franchises"] == ["Unassigned"]]
    assert not stray, f"cards resolved to Unassigned: {stray}"


def test_no_card_name_uses_private_use_area_glyphs():
    """A printed_name from a non-English printing must never become a card's
    name. Tengwar "The One Ring" (ltr #0) renders as tofu and cannot be typed
    into search, so the card is unreachable."""
    bad = [c["name"] for c in _cards()
           if any("" <= ch <= "" for ch in c["name"])]
    assert not bad, f"names with Private Use Area glyphs: {bad!r}"


def test_universes_within_name_never_equals_the_card_name():
    """A card cannot be its own Universes Within counterpart. When they match,
    a translated printing leaked into the printed_name swap."""
    same = [c["name"] for c in _cards()
            if c["universes_within_name"] == c["name"]]
    assert not same, f"card is its own Universes Within counterpart: {same}"
