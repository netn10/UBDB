import json
import os

import pytest

import sync_ub_cards
from sync_ub_cards import normalize_print, group_prints

HERE = os.path.dirname(os.path.abspath(__file__))


@pytest.fixture(autouse=True)
def _fixture_maps(monkeypatch):
    # The fixture's set names include "Special Guests", which is not a real UB
    # set. Inject a test set_map so group_prints resolves deterministically
    # without depending on (or mutating) the committed data files.
    set_map = {
        "Avatar: The Last Airbender": "Avatar: The Last Airbender",
        "Special Guests": None,  # treated as franchise-mixed
    }
    monkeypatch.setattr(sync_ub_cards, "_MAPS", (set_map, {}))


def _prints():
    with open(os.path.join(HERE, "fixtures", "scryfall_card.json"), encoding="utf-8") as f:
        return json.load(f)


def test_normalize_print_maps_fields():
    p = normalize_print(_prints()[0])
    assert p["scryfall_id"] == "print-aaaa-0000-0000-000000000001"
    assert p["set"] == "tla"
    assert p["set_name"] == "Avatar: The Last Airbender"
    assert p["collector_number"] == "1"
    assert p["art_uri"] == "https://cards.scryfall.io/normal/a1.jpg"


def test_normalize_print_handles_missing_image_uris():
    raw = dict(_prints()[0])
    del raw["image_uris"]
    assert normalize_print(raw)["art_uri"] is None


def test_group_collapses_two_prints_into_one_card():
    cards = group_prints(_prints()[:2])
    assert len(cards) == 1
    card = cards[0]
    assert card["oracle_id"] == "oracle-1111-0000-0000-000000000001"
    assert card["name"] == "Aang, Airbending Master"
    assert card["mana_cost"] == "{2}{W}{U}"
    assert len(card["prints"]) == 2


def test_group_lists_set_names_sorted_unique():
    card = group_prints(_prints())[0]
    # The slx print is dropped, so "Universes Within" never reaches set_names.
    assert card["set_names"] == ["Avatar: The Last Airbender", "Special Guests"]
    assert "ub_franchises" not in card


def test_group_computes_franchises_from_set_names():
    card = group_prints(_prints())[0]
    # Avatar maps to its franchise; "Special Guests" is mapped to None (mixed)
    # by the injected test set_map, so it contributes nothing.
    assert card["franchises"] == ["Avatar: The Last Airbender"]


def test_group_drops_universes_within_print():
    card = group_prints(_prints())[0]
    assert all(p["set"] != "slx" for p in card["prints"])


def test_group_drops_card_that_is_only_universes_within():
    # A card whose sole print is slx is not a UB card and is excluded entirely.
    raw = [dict(_prints()[0])]
    raw[0]["set"] = "slx"
    raw[0]["set_name"] = "Universes Within"
    assert group_prints(raw) == []


def test_group_picks_first_available_art_as_thumb():
    card = group_prints(_prints())[0]
    assert card["art_uri"] == "https://cards.scryfall.io/normal/a1.jpg"


def test_group_defers_official_uw_image():
    assert group_prints(_prints())[0]["official_uw_image"] is None


def test_group_skips_cards_without_oracle_id():
    raw = _prints()
    del raw[0]["oracle_id"]
    del raw[1]["oracle_id"]
    del raw[2]["oracle_id"]
    assert group_prints(raw) == []


def test_normalize_print_maps_new_fields():
    p = normalize_print(_prints()[0])
    assert p["rarity"] == "mythic"
    assert p["released_at"] == "2025-11-21"
    assert p["image_small"] == "https://cards.scryfall.io/small/a1.jpg"
    assert p["image_normal"] == "https://cards.scryfall.io/normal/a1.jpg"
    assert p["image_art_crop"] == "https://cards.scryfall.io/art_crop/a1.jpg"
    assert p["image_png"] == "https://cards.scryfall.io/png/a1.png"
    assert p["art_uri"] == p["image_normal"]


def test_normalize_print_dfc_uses_front_face_image():
    dfc = _prints()[2]
    p = normalize_print(dfc)
    assert p["image_normal"] == "https://cards.scryfall.io/normal/k1.jpg"
    assert p["image_art_crop"] == "https://cards.scryfall.io/art_crop/k1.jpg"


def test_group_adds_card_level_attributes():
    card = group_prints(_prints()[:2])[0]
    assert card["colors"] == ["W", "U"]
    assert card["color_identity"] == ["U", "W"]
    assert card["cmc"] == 4.0
    assert card["power"] == "3"
    assert card["toughness"] == "4"
    assert card["keywords"] == ["Flying"]
    assert card["layout"] == "normal"
    assert card["rarity"] == "mythic"


def test_group_released_at_is_earliest_print():
    card = group_prints(_prints()[:2])[0]
    assert card["released_at"] == "2024-06-14"


def test_group_dfc_pulls_power_from_front_face():
    cards = {c["oracle_id"]: c for c in group_prints(_prints())}
    katara = cards["oracle-2222-0000-0000-000000000002"]
    assert katara["power"] == "2"
    assert katara["toughness"] == "3"
    assert katara["mana_cost"] == "{1}{U}{U}"


def test_group_missing_power_is_none():
    raw = _prints()[:1]
    del raw[0]["power"]
    del raw[0]["toughness"]
    card = group_prints(raw)[0]
    assert card["power"] is None
    assert card["toughness"] is None


def test_normalize_captures_reprint_flag():
    assert normalize_print(_prints()[0])["reprint"] is False
    assert normalize_print(_prints()[1])["reprint"] is True


def test_normalize_reprint_defaults_false_when_absent():
    raw = dict(_prints()[0])
    raw.pop("reprint", None)
    assert normalize_print(raw)["reprint"] is False


def test_group_keeps_card_with_an_original_printing():
    # Aang debuts in Universes Beyond (first print reprint == False), so it is
    # kept even though a later printing is a reprint.
    cards = group_prints(_prints()[:2])
    assert len(cards) == 1
    assert cards[0]["name"] == "Aang, Airbending Master"


def test_group_drops_card_whose_prints_are_all_reprints():
    # A card whose every UB printing is a reprint already exists as a normal
    # Magic card (e.g. Abrade), so it has a within-universe version and is
    # excluded from the database.
    raw = _prints()[:2]
    for p in raw:
        p["reprint"] = True
    assert group_prints(raw) == []


def test_normalize_print_adds_back_images_for_dfc():
    p = normalize_print(_prints()[2])  # Katara // Waterbender (transform)
    assert p["image_back_normal"] == "https://cards.scryfall.io/normal/k2.jpg"


def test_normalize_print_back_images_none_for_single_faced():
    p = normalize_print(_prints()[0])  # Aang, no card_faces
    assert p["image_back_normal"] is None
    assert p["image_back_small"] is None


def test_group_builds_faces_for_dfc():
    cards = {c["oracle_id"]: c for c in group_prints(_prints())}
    katara = cards["oracle-2222-0000-0000-000000000002"]
    assert len(katara["faces"]) == 2
    assert katara["faces"][0]["name"] == "Katara"
    assert katara["faces"][1]["name"] == "Waterbender"
    assert katara["faces"][0]["power"] == "2"
    assert katara["faces"][1]["type_line"] == "Legendary Creature — Human"


def test_group_faces_empty_for_single_faced():
    card = group_prints(_prints()[:2])[0]  # Aang
    assert card["faces"] == []


def test_group_uses_printed_name_from_english_printing():
    # Secret Lair UB cards: Scryfall's `name` is the Universes Within name and
    # `printed_name` is what is actually printed, so the two are swapped.
    raw = _prints()[:1]
    raw[0]["lang"] = "en"
    raw[0]["printed_name"] = "Ken, Burning Brawler"
    card = group_prints(raw)[0]
    assert card["name"] == "Ken, Burning Brawler"
    assert card["universes_within_name"] == "Aang, Airbending Master"


def test_group_ignores_printed_name_from_non_english_printing():
    # A non-English printing's printed_name is a translation of the same card,
    # not a Universes Within pairing.
    raw = _prints()[:1]
    raw[0]["lang"] = "grc"
    raw[0]["printed_name"] = "Κλεοπάτρα, Ἐξόριστος Φαραώ"
    card = group_prints(raw)[0]
    assert card["name"] == "Aang, Airbending Master"
    assert card["universes_within_name"] is None


def test_group_non_english_print_does_not_poison_a_multi_print_card():
    # The One Ring's shape: many English printings plus one Tengwar printing
    # (ltr #0, lang qya) whose printed_name is Private Use Area glyphs.
    tengwar = dict(_prints()[0])
    tengwar["lang"] = "qya"
    tengwar["collector_number"] = "0"
    tengwar["printed_name"] = " "
    card = group_prints(_prints()[:2] + [tengwar])[0]
    assert card["name"] == "Aang, Airbending Master"
    assert card["universes_within_name"] is None
