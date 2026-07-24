"""Resolve a card's franchises from its set names, using two committed data
files. Pure: the only I/O is reading those JSON files in load_maps().

- set_map.json: set name -> franchise, or null for franchise-mixed sets
  (Secret Lair, promo grab-bags) whose cards cannot be resolved from the set.
- card_overrides.json: oracle_id -> {"name": ..., "franchise": ...}, for cards
  printed only in mixed sets and thus not resolvable from a set name at all.
"""
import json
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA_DIR = os.path.join(os.path.dirname(_HERE), "data", "franchises")


def load_maps(data_dir: str) -> tuple:
    """Read both data files. Returns (set_map, overrides)."""
    with open(os.path.join(data_dir, "set_map.json"), encoding="utf-8") as f:
        set_map = json.load(f)
    with open(os.path.join(data_dir, "card_overrides.json"), encoding="utf-8") as f:
        overrides = json.load(f)
    return set_map, overrides


def resolve_franchises(set_names: list, oracle_id: str,
                       set_map: dict, overrides: dict) -> list:
    """Return the sorted franchises for a card, or ["Unassigned"] if none.

    The override adds to whatever the sets resolved rather than replacing it, so
    a Fallout card that also appeared in a Secret Lair drop stays Fallout.

    Raises KeyError if a set name is missing from set_map: a new Universes
    Beyond set must be mapped deliberately, never silently bucketed.
    """
    franchises = set()
    for name in set_names:
        if name not in set_map:
            raise KeyError(f"set name not in set_map.json: {name!r}")
        franchise = set_map[name]
        if franchise is not None:
            franchises.add(franchise)
    override = overrides.get(oracle_id)
    if override:
        franchises.add(override["franchise"])
    return sorted(franchises) if franchises else ["Unassigned"]
