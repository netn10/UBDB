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
