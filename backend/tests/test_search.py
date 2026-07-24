from search import tokenize, search

CARDS = [
    {
        "oracle_id": "o-aang", "name": "Aang, Airbending Master",
        "oracle_text": "Flying. Whenever Aang attacks", "type_line": "Legendary Creature — Monk",
        "colors": ["W", "U"], "color_identity": ["U", "W"], "cmc": 4.0,
        "power": "3", "toughness": "4", "loyalty": None, "rarity": "mythic",
        "keywords": ["Flying"], "franchises": ["Avatar: The Last Airbender"],
        "set_names": ["Avatar: The Last Airbender"],
        "released_at": "2025-11-21",
        "prints": [{"set": "tla", "set_name": "Avatar: The Last Airbender"}],
    },
    {
        "oracle_id": "o-bolt", "name": "Lightning Bolt",
        "oracle_text": "Deal 3 damage to any target.", "type_line": "Instant",
        "colors": ["R"], "color_identity": ["R"], "cmc": 1.0,
        "power": None, "toughness": None, "loyalty": None, "rarity": "common",
        "keywords": [], "franchises": ["Warhammer 40,000"],
        "set_names": ["Warhammer 40,000 Commander"],
        "released_at": "2022-10-07",
        "prints": [{"set": "40k", "set_name": "Warhammer 40,000 Commander"}],
    },
    {
        "oracle_id": "o-wall", "name": "Stone Wall",
        "oracle_text": "Defender", "type_line": "Creature — Wall",
        "colors": [], "color_identity": [], "cmc": 2.0,
        "power": "*", "toughness": "5", "loyalty": None, "rarity": "uncommon",
        "keywords": ["Defender"], "franchises": ["Fallout"],
        "set_names": ["Fallout"],
        "released_at": "2024-03-08",
        "prints": [{"set": "pip", "set_name": "Fallout"}],
    },
]


def _names(q, **kw):
    return [c["name"] for c in search(CARDS, q, **kw)["cards"]]


def test_tokenize_quotes_and_negation():
    toks = tokenize('bolt -t:land fr:"warhammer 40,000"')
    assert toks == [(False, "bolt"), (True, "t:land"), (False, "fr:warhammer 40,000")]


def test_bare_word_matches_name():
    assert _names("bolt") == ["Lightning Bolt"]


def test_type_operator():
    assert _names("t:instant") == ["Lightning Bolt"]


def test_oracle_operator():
    assert _names("o:defender") == ["Stone Wall"]


def test_color_inclusive_default():
    assert set(_names("c:w")) == {"Aang, Airbending Master"}


def test_color_exact():
    assert set(_names("c=wu")) == {"Aang, Airbending Master"}


def test_colorless():
    assert _names("c:c") == ["Stone Wall"]


def test_colorless_gte_matches_all():
    assert set(_names("c>=c")) == {
        "Aang, Airbending Master", "Lightning Bolt", "Stone Wall",
    }


def test_colorless_gt_matches_only_colored():
    assert set(_names("c>c")) == {"Aang, Airbending Master", "Lightning Bolt"}


def test_colorless_lt_matches_none():
    assert _names("c<c") == []


def test_colorless_lte_matches_only_colorless():
    assert _names("c<=c") == ["Stone Wall"]


def test_cmc_numeric():
    assert _names("cmc<=1") == ["Lightning Bolt"]


def test_power_star_never_matches_numeric():
    assert "Stone Wall" not in _names("pow>=1")


def test_rarity_exact_and_order():
    assert _names("r:common") == ["Lightning Bolt"]
    assert set(_names("r>=rare")) == {"Aang, Airbending Master"}


def test_set_operator():
    assert _names("set:40k") == ["Lightning Bolt"]


def test_set_operator_matches_set_name_substring():
    # set: now also matches a substring of the card's set names, not just code.
    assert _names('set:"warhammer"') == ["Lightning Bolt"]


def test_set_name_substring_does_not_match_the_franchise_field():
    # Lightning Bolt's franchise is "Warhammer 40,000" but its set name is
    # "Warhammer 40,000 Commander". set: matches the set, fr: the franchise.
    assert _names('set:"commander"') == ["Lightning Bolt"]
    assert _names('fr:"commander"') == []


def test_order_by_set_name():
    # Alphabetical by first set name: Avatar, Fallout, Warhammer 40,000 Cmdr.
    assert _names("", order="set") == [
        "Aang, Airbending Master", "Stone Wall", "Lightning Bolt"]


def test_order_by_franchise():
    assert _names("", order="franchise") == [
        "Aang, Airbending Master", "Stone Wall", "Lightning Bolt"]


def test_franchise_operator_quoted():
    assert _names('fr:"warhammer 40,000"') == ["Lightning Bolt"]


def test_implicit_and():
    assert _names("t:creature c:w") == ["Aang, Airbending Master"]


def test_negation():
    assert "Lightning Bolt" not in _names("-c:r")


def test_unknown_operator_warns_and_ignores():
    res = search(CARDS, "foo:bar bolt")
    assert res["warnings"] and "foo" in res["warnings"][0]
    assert [c["name"] for c in res["cards"]] == ["Lightning Bolt"]


def test_is_reskinned_uses_counts():
    counts = {"o-bolt": 2}
    res = search(CARDS, "is:reskinned", reskin_counts=counts)
    assert [c["name"] for c in res["cards"]] == ["Lightning Bolt"]


def test_is_unreskinned_uses_counts():
    counts = {"o-bolt": 2}
    res = search(CARDS, "is:unreskinned", reskin_counts=counts)
    assert set(c["name"] for c in res["cards"]) == {
        "Aang, Airbending Master", "Stone Wall",
    }


def test_is_noreskin_alias():
    counts = {"o-bolt": 2}
    assert set(_names("is:noreskin", reskin_counts=counts)) == {
        "Aang, Airbending Master", "Stone Wall",
    }


def test_reskin_count_numeric_operator():
    counts = {"o-bolt": 3, "o-aang": 1}  # o-wall absent -> 0
    assert _names("reskins>=2", reskin_counts=counts) == ["Lightning Bolt"]
    assert set(_names("reskins>=1", reskin_counts=counts)) == {
        "Aang, Airbending Master", "Lightning Bolt",
    }
    assert _names("reskins:0", reskin_counts=counts) == ["Stone Wall"]


def test_reskin_count_skins_alias():
    counts = {"o-bolt": 3}
    assert _names("skins>2", reskin_counts=counts) == ["Lightning Bolt"]


def test_search_stamps_reskin_count_on_cards():
    res = search(CARDS, "", reskin_counts={"o-bolt": 3})
    by_name = {c["name"]: c.get("reskin_count") for c in res["cards"]}
    assert by_name["Lightning Bolt"] == 3
    assert by_name["Stone Wall"] == 0


def test_search_does_not_mutate_source_cards():
    # Enrichment must copy, not stamp the shared card cache.
    search(CARDS, "", reskin_counts={"o-bolt": 3})
    assert all("reskin_count" not in c for c in CARDS)


def test_sort_by_cmc_desc():
    names = [c["name"] for c in search(CARDS, "", order="cmc", direction="desc")["cards"]]
    assert names[0] == "Aang, Airbending Master"


def test_pagination_reports_has_more():
    res = search(CARDS, "", page=1, page_size=2)
    assert res["total"] == 3
    assert res["has_more"] is True
    assert len(res["cards"]) == 2
    res2 = search(CARDS, "", page=2, page_size=2)
    assert res2["has_more"] is False
    assert len(res2["cards"]) == 1


def test_empty_query_returns_all_sorted_by_name():
    assert _names("") == ["Aang, Airbending Master", "Lightning Bolt", "Stone Wall"]


def test_rarity_or_pipe():
    assert set(_names("r:mythic|uncommon")) == {"Aang, Airbending Master", "Stone Wall"}


def test_franchise_or_pipe():
    assert set(_names('fr:"fallout|avatar"')) == {"Stone Wall", "Aang, Airbending Master"}


def test_franchise_comma_in_name_not_split():
    # "Warhammer 40,000" must stay one needle — comma is not an OR delimiter.
    assert _names('fr:"warhammer 40,000"') == ["Lightning Bolt"]


def test_franchise_exclude_or_pipe():
    assert _names('-fr:"fallout|avatar"') == ["Lightning Bolt"]


# --- Scryfall /regex/ value support ---

def test_name_regex_anchored():
    # /^light/ anchors at start; only Lightning Bolt qualifies.
    assert _names("/^light/") == ["Lightning Bolt"]


def test_name_regex_differs_from_substring():
    # Substring "wall" matches Stone Wall; anchored /^wall/ does not.
    assert _names("wall") == ["Stone Wall"]
    assert _names("/^wall/") == []


def test_oracle_regex_digit_class():
    # o:/deal \d+ damage/ — quoted so the tokenizer keeps the space.
    assert _names('o:"/deal \\d+ damage/"') == ["Lightning Bolt"]


def test_type_regex():
    assert _names("t:/^legendary/") == ["Aang, Airbending Master"]


def test_regex_is_case_insensitive():
    assert _names("/BOLT/") == ["Lightning Bolt"]


def test_invalid_regex_warns_and_ignores():
    res = search(CARDS, "o:/[/ bolt")
    assert res["warnings"] and "regex" in res["warnings"][0].lower()
    assert [c["name"] for c in res["cards"]] == ["Lightning Bolt"]
