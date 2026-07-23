import suggest_lexicon as lex


def test_weights_match_spec():
    assert lex.WEIGHTS == {"color": 3, "role": 3, "keyword": 4, "type": 2, "franchise": 6}


def test_color_words_map_to_wubrg():
    assert lex.COLOR_WORDS["protector"] == "W"
    assert lex.COLOR_WORDS["ruthless"] == "B"
    assert set(lex.COLOR_WORDS.values()) <= set("WUBRG")


def test_role_word_has_condition_dict():
    assert lex.ROLE_WORDS["guardian"]["keyword"] == "Defender"
    assert lex.ROLE_WORDS["assassin"]["keyword"] == "Deathtouch"
    assert lex.ROLE_WORDS["leader"]["type"] == "Legendary"


from suggest import score_cards

CARDS = [
    {"oracle_id": "w1", "name": "White Wall", "colors": ["W"],
     "keywords": ["Defender"], "toughness": "6", "cmc": 3.0,
     "type_line": "Creature — Human Soldier", "oracle_text": "",
     "ub_franchises": ["Fallout"], "rarity": "rare", "art_uri": "a",
     "reskin_count": 0},
    {"oracle_id": "b1", "name": "Black Blade", "colors": ["B"],
     "keywords": ["Deathtouch"], "toughness": "1", "cmc": 2.0,
     "type_line": "Creature — Human Assassin", "oracle_text": "",
     "ub_franchises": ["The Last of Us"], "rarity": "mythic", "art_uri": "b",
     "reskin_count": 5},
    {"oracle_id": "x1", "name": "Plain Bear", "colors": ["G"],
     "keywords": [], "toughness": "2", "cmc": 2.0,
     "type_line": "Creature — Bear", "oracle_text": "",
     "ub_franchises": [], "rarity": "common", "art_uri": "x",
     "reskin_count": 0},
]


def test_role_and_color_rank_matching_card_first():
    results, _ = score_cards("a loyal guardian who protects", CARDS)
    assert results[0]["oracle_id"] == "w1"
    assert any("guardian" in w.lower() for w in results[0]["why"])


def test_zero_score_cards_dropped():
    results, _ = score_cards("a ruthless assassin", CARDS)
    ids = [r["oracle_id"] for r in results]
    assert "b1" in ids and "x1" not in ids


def test_inferred_facets_report_fired_signals():
    _, facets = score_cards("a ruthless guardian", CARDS)
    assert "B" in facets["colors"]
    assert "guardian" in facets["roles"]


def test_franchise_name_hard_boosts():
    results, _ = score_cards("something from Fallout", CARDS)
    assert results[0]["oracle_id"] == "w1"


def test_facets_override_colors():
    results, _ = score_cards("a fighter", CARDS, facets={"colors": ["B"], "roles": []})
    assert results[0]["oracle_id"] == "b1"


def test_missing_fields_do_not_crash():
    sparse = [{"oracle_id": "s", "name": "Sparse", "type_line": "Creature",
               "oracle_text": "Flying", "keywords": ["Flying"]}]
    results, _ = score_cards("flying", sparse)
    assert results[0]["oracle_id"] == "s"
    assert results[0]["score"] == 4          # keyword weight, missing fields tolerated


def test_color_synonyms_count_once():
    # "noble" and "protector" both map to W -> color scored once (3), not twice.
    results, _ = score_cards("a noble protector", CARDS)
    w1 = next(r for r in results if r["oracle_id"] == "w1")
    assert w1["score"] == 3


def test_distinct_colors_both_count():
    card = [{"oracle_id": "wb", "name": "WB", "colors": ["W", "B"], "keywords": [],
             "type_line": "Creature", "oracle_text": "", "ub_franchises": [],
             "rarity": "rare", "reskin_count": 0, "art_uri": ""}]
    results, _ = score_cards("a noble but ruthless figure", card)  # W + B
    assert results[0]["score"] == 6


def test_identical_role_conditions_count_once():
    # "tank" and "guardian" share the same condition -> role scored once.
    card = [{"oracle_id": "d", "name": "D", "colors": [], "keywords": ["Defender"],
             "toughness": "6", "type_line": "Creature", "oracle_text": "",
             "ub_franchises": [], "rarity": "rare", "reskin_count": 0, "art_uri": ""}]
    results, _ = score_cards("a tank guardian", card)
    assert results[0]["score"] == 3


def test_franchise_requires_word_boundary():
    card = [{"oracle_id": "h", "name": "H", "colors": [], "keywords": [],
             "type_line": "Creature", "oracle_text": "", "ub_franchises": ["Halo"],
             "rarity": "rare", "reskin_count": 0, "art_uri": ""}]
    assert score_cards("the halogen lamp", card)[0] == []      # substring must NOT hit
    hit, _ = score_cards("a hero from Halo", card)
    assert hit and hit[0]["oracle_id"] == "h"


def test_multiword_franchise_still_matches():
    card = [{"oracle_id": "tlou", "name": "T", "colors": [], "keywords": [],
             "type_line": "Creature", "oracle_text": "", "ub_franchises": ["The Last of Us"],
             "rarity": "rare", "reskin_count": 0, "art_uri": ""}]
    hit, _ = score_cards("a survivor from The Last of Us", card)
    assert hit and hit[0]["oracle_id"] == "tlou"


def test_empty_facet_list_drops_signal():
    # explicit empty color facet overrides description-derived colors
    results, _ = score_cards("a noble hero", CARDS, facets={"colors": [], "roles": []})
    assert results == []


def test_tie_break_prefers_higher_rarity_then_fewer_reskins():
    tied = [
        {"oracle_id": "lo", "name": "Lo", "colors": ["W"], "keywords": [],
         "type_line": "Creature", "oracle_text": "", "ub_franchises": [],
         "rarity": "common", "reskin_count": 0, "art_uri": ""},
        {"oracle_id": "hi", "name": "Hi", "colors": ["W"], "keywords": [],
         "type_line": "Creature", "oracle_text": "", "ub_franchises": [],
         "rarity": "mythic", "reskin_count": 0, "art_uri": ""},
    ]
    results, _ = score_cards("noble", tied)
    assert results[0]["oracle_id"] == "hi"
