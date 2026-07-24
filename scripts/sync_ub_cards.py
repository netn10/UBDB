"""Sync all Magic: The Gathering Universes Beyond cards from Scryfall into
data/ub_cards/cards.json. No API key required.

Fetches every UB printing (unique=prints) and groups them by oracle_id so a
card reprinted across multiple UB sets becomes a single logical card with a
prints[] list.

Usage:
    python scripts/sync_ub_cards.py            # writes data/ub_cards/cards.json
    python scripts/sync_ub_cards.py -o out.json
"""
import argparse
import json
import os
import sys
import time
from typing import Optional

import requests

import franchise_map

SEARCH_URL = "https://api.scryfall.com/cards/search"
QUERY = "is:ub game:paper"
# Universes Within = MTG-native counterparts, not UB, so excluded. Scryfall no
# longer tags them is:ub; exclude the set explicitly as a safety net.
UNIVERSES_WITHIN = {"slx"}
# Loaded once on first use; tests monkeypatch this to inject deterministic maps.
_MAPS = None


def _maps():
    global _MAPS
    if _MAPS is None:
        _MAPS = franchise_map.load_maps(franchise_map.DEFAULT_DATA_DIR)
    return _MAPS
HEADERS = {
    "User-Agent": "UBDB/0.1 (github.com/<user>/ubdb)",
    "Accept": "application/json",
}
REQUEST_DELAY_S = 0.1  # Scryfall etiquette: ~10 req/s max


def _images(raw: dict) -> dict:
    """Return a card's image_uris, falling back to the front face for DFCs."""
    imgs = raw.get("image_uris")
    if not imgs:
        faces = raw.get("card_faces") or []
        if faces and faces[0].get("image_uris"):
            imgs = faces[0]["image_uris"]
    return imgs or {}


def _back_images(raw: dict) -> dict:
    """Return the back-face image_uris for a two-faced card, else empty."""
    faces = raw.get("card_faces") or []
    if len(faces) > 1:
        return faces[1].get("image_uris") or {}
    return {}


def _build_faces(raw: dict) -> list:
    """Return per-face text for a two-image DFC, else an empty list.

    Only transform / modal_dfc cards with two image-bearing faces are treated
    as double-faced here; every other layout renders single-faced.
    """
    if raw.get("layout") not in ("transform", "modal_dfc"):
        return []
    faces = raw.get("card_faces") or []
    if len(faces) < 2:
        return []
    if not (faces[0].get("image_uris") and faces[1].get("image_uris")):
        return []
    out = []
    for f in faces[:2]:
        out.append({
            "name": f.get("name"),
            "mana_cost": f.get("mana_cost", ""),
            "type_line": f.get("type_line", ""),
            "oracle_text": f.get("oracle_text", ""),
            "colors": f.get("colors", []),
            "power": f.get("power"),
            "toughness": f.get("toughness"),
            "loyalty": f.get("loyalty"),
        })
    return out


def normalize_print(raw: dict) -> dict:
    """Map one Scryfall printing to a UBDB print record."""
    imgs = _images(raw)
    normal = imgs.get("normal") or imgs.get("large") or imgs.get("png")
    return {
        "scryfall_id": raw.get("id"),
        "set": raw.get("set"),
        "set_name": raw.get("set_name"),
        "collector_number": raw.get("collector_number"),
        "rarity": raw.get("rarity"),
        "released_at": raw.get("released_at"),
        "image_small": imgs.get("small"),
        "image_normal": normal,
        "image_art_crop": imgs.get("art_crop"),
        "image_png": imgs.get("png"),
        "art_uri": normal,
        "reprint": bool(raw.get("reprint")),
        "image_back_small": _back_images(raw).get("small"),
        "image_back_normal": (
            _back_images(raw).get("normal")
            or _back_images(raw).get("large")
            or _back_images(raw).get("png")
        ),
    }


def _face_or_top(raw: dict, key):
    """Prefer a top-level attribute; fall back to the front face (DFCs)."""
    if raw.get(key) is not None:
        return raw.get(key)
    faces = raw.get("card_faces") or []
    front = faces[0] if faces else {}
    return front.get(key)


def group_prints(raw_cards: list) -> list:
    """Group Scryfall printings by oracle_id into ub_card records."""
    by_oracle = {}
    # For Secret Lair UB cards, Scryfall's `name` is the Universes Within
    # (MTG-native) name; `printed_name` is what's on the card. Prefer printed.
    printed_names = {}
    for raw in raw_cards:
        oid = raw.get("oracle_id")
        if not oid:
            continue  # cards without a stable oracle_id can't be anchored
        if raw.get("printed_name"):
            printed_names.setdefault(oid, raw["printed_name"])
        card = by_oracle.get(oid)
        if card is None:
            colors = _face_or_top(raw, "colors")
            card = by_oracle[oid] = {
                "oracle_id": oid,
                "name": raw.get("name"),
                "oracle_text": raw.get("oracle_text", ""),
                "mana_cost": _face_or_top(raw, "mana_cost") or "",
                "type_line": raw.get("type_line", ""),
                "colors": colors if colors is not None else [],
                "color_identity": raw.get("color_identity", []),
                "cmc": raw.get("cmc", 0.0),
                "power": _face_or_top(raw, "power"),
                "toughness": _face_or_top(raw, "toughness"),
                "loyalty": _face_or_top(raw, "loyalty"),
                "keywords": raw.get("keywords", []),
                "layout": raw.get("layout"),
                "faces": _build_faces(raw),
                "rarity": raw.get("rarity"),
                "official_uw_image": None,
                "prints": [],
            }
        card["prints"].append(normalize_print(raw))

    set_map, overrides = _maps()
    result = []
    for card in by_oracle.values():
        prints = [p for p in card["prints"] if p["set"] not in UNIVERSES_WITHIN]
        card["prints"] = prints
        if not prints:
            continue  # existed only as Universes Within, so not a UB card
        # Keep only UB-born cards: those with at least one original (non-reprint)
        # UB printing. If every UB printing is a reprint, the card already existed
        # as normal Magic (e.g. Abrade) and needs no reskin.
        if not any(p["reprint"] is False for p in prints):
            continue
        printed = printed_names.get(card["oracle_id"])
        card["universes_within_name"] = card["name"] if printed else None
        if printed:
            card["name"] = printed
        card["set_names"] = sorted({p["set_name"] for p in prints if p["set_name"]})
        card["franchises"] = franchise_map.resolve_franchises(
            card["set_names"], card["oracle_id"], set_map, overrides)
        card["art_uri"] = next((p["art_uri"] for p in prints if p["art_uri"]), None)
        dates = [p["released_at"] for p in prints if p.get("released_at")]
        card["released_at"] = min(dates) if dates else None
        result.append(card)
    return result


def _get_with_retry(url, params, max_retries: int = 5):
    """GET a Scryfall page, backing off and retrying on HTTP 429."""
    delay = 1.0
    for attempt in range(max_retries + 1):
        resp = requests.get(url, params=params, headers=HEADERS, timeout=30)
        if resp.status_code == 429 and attempt < max_retries:
            wait = float(resp.headers.get("Retry-After") or delay)
            time.sleep(wait)
            delay *= 2
            continue
        resp.raise_for_status()
        return resp
    resp.raise_for_status()
    return resp


def fetch_all_prints() -> list:
    """Page through every printing matching QUERY (raw Scryfall objects)."""
    raw, url, params = [], SEARCH_URL, {"q": QUERY, "unique": "prints"}
    while url:
        resp = _get_with_retry(url, params)
        body = resp.json()
        raw.extend(body.get("data", []))
        url = body.get("next_page")  # already a full URL
        params = None
        time.sleep(REQUEST_DELAY_S)
    return raw


def main(argv: Optional[list] = None) -> int:
    parser = argparse.ArgumentParser()
    default_out = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "data", "ub_cards", "cards.json",
    )
    parser.add_argument("-o", "--out", default=default_out)
    args = parser.parse_args(argv)

    cards = group_prints(fetch_all_prints())
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(cards, f, ensure_ascii=False, indent=2)
    print(f"Wrote {len(cards)} cards to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
