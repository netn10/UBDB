"""Deterministic heuristic scorer for Suggest-a-Reskin. Pure functions only:
no Flask, no I/O. Cards are passed in so tests can inject fixtures."""
import re

import suggest_lexicon as lex

_RARITY_RANK = {"common": 0, "uncommon": 1, "rare": 2, "mythic": 3,
                "special": 4, "bonus": 5}


def _tokens(description):
    return set(re.findall(r"[a-z]+", (description or "").lower()))


def _int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _fired_colors(tokens, facets):
    """Return {color_letter: source_word|None}, one entry per distinct color."""
    if facets is not None and "colors" in facets:
        return {c: None for c in facets["colors"]}
    out = {}
    for t in tokens:
        if t in lex.COLOR_WORDS:
            out.setdefault(lex.COLOR_WORDS[t], t)  # first word wins per color
    return out


def _fired_roles(tokens, facets):
    if facets is not None and "roles" in facets:
        return [r for r in facets["roles"] if r in lex.ROLE_WORDS]
    return [t for t in tokens if t in lex.ROLE_WORDS]


def _franchise_hit(franchise, desc_lower):
    return re.search(r"\b" + re.escape(franchise.lower()) + r"\b", desc_lower) is not None


def _role_matches(card, cond):
    kws = {k.lower() for k in card.get("keywords", []) or []}
    if "keyword" in cond and cond["keyword"].lower() not in kws:
        return False
    if "min_toughness" in cond and _int(card.get("toughness")) < cond["min_toughness"]:
        return False
    if "max_cmc" in cond and (card.get("cmc") or 0) > cond["max_cmc"]:
        return False
    if "type" in cond and cond["type"].lower() not in (card.get("type_line") or "").lower():
        return False
    if "text" in cond and cond["text"].lower() not in (card.get("oracle_text") or "").lower():
        return False
    return True


def _score_card(card, tokens, colors, roles, desc_lower):
    score, why = 0, []

    # Color: once per distinct color letter shared by fired-colors and the card.
    card_colors = set(card.get("colors", []) or [])
    for color in sorted(card_colors & set(colors)):
        score += lex.WEIGHTS["color"]
        word = colors[color]
        why.append(f"'{word}' -> {color}" if word else f"facet: {color}")

    # Role: once per DISTINCT condition signature (synonyms collapse).
    seen = set()
    for word in roles:
        cond = lex.ROLE_WORDS[word]
        sig = frozenset(cond.items())
        if sig in seen:
            continue
        if _role_matches(card, cond):
            seen.add(sig)
            score += lex.WEIGHTS["role"]
            why.append(f"'{word}' -> role fit")

    # Literal keywords.
    kws = {k.lower() for k in card.get("keywords", []) or []}
    for t in tokens & lex.KEYWORD_WORDS:
        if t in kws:
            score += lex.WEIGHTS["keyword"]
            why.append(f"'{t}' -> keyword")

    # Creature-type words.
    tline = (card.get("type_line") or "").lower()
    for t in tokens & lex.TYPE_WORDS:
        if t in tline:
            score += lex.WEIGHTS["type"]
            why.append(f"'{t}' -> type")

    # Franchise: whole-word / phrase match on the description.
    for fr in card.get("ub_franchises", []) or []:
        if _franchise_hit(fr, desc_lower):
            score += lex.WEIGHTS["franchise"]
            why.append(f"franchise: {fr}")

    return score, why


def score_cards(description, cards, facets=None, top_n=8):
    tokens = _tokens(description)
    desc_lower = (description or "").lower()
    colors = _fired_colors(tokens, facets)
    roles = _fired_roles(tokens, facets)

    scored = []
    for card in cards:
        score, why = _score_card(card, tokens, colors, roles, desc_lower)
        if score > 0:
            scored.append((score, card, why))

    scored.sort(key=lambda s: (
        -s[0],
        -_RARITY_RANK.get((s[1].get("rarity") or "").lower(), -1),
        _int(s[1].get("reskin_count"), 0),
    ))

    results = [{
        "oracle_id": c.get("oracle_id"),
        "name": c.get("name"),
        "score": score,
        "why": why,
        "art_uri": c.get("art_uri"),
        "type_line": c.get("type_line"),
    } for score, c, why in scored[:top_n]]

    inferred = {"colors": sorted(colors), "roles": sorted(set(roles))}
    return results, inferred
