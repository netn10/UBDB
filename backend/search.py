"""Scryfall-style query parser for UBDB. Parses a query string into predicates,
applies them (implicit AND) to enriched card dicts, then sorts and paginates.
"""
import re

RARITY_RANK = {"common": 0, "uncommon": 1, "rare": 2, "mythic": 3,
               "special": 4, "bonus": 5}
COLOR_LETTERS = set("WUBRG")
OP_RE = re.compile(r"^([a-zA-Z]+)(>=|<=|!=|=|:|>|<)(.*)$")


def tokenize(q):
    """Split a query into (negated, body) tokens, honoring "double quotes"."""
    tokens, i, n = [], 0, len(q or "")
    while i < n:
        if q[i].isspace():
            i += 1
            continue
        neg = False
        if q[i] == "-":
            neg = True
            i += 1
        buf, in_quote = [], False
        while i < n and (in_quote or not q[i].isspace()):
            ch = q[i]
            if ch == '"':
                in_quote = not in_quote
            else:
                buf.append(ch)
            i += 1
        body = "".join(buf)
        if body:
            tokens.append((neg, body))
    return tokens


def _color_set(value):
    v = value.lower()
    if v in ("c", "colorless"):
        return frozenset()
    return frozenset(ch.upper() for ch in v if ch.upper() in COLOR_LETTERS)


def _color_pred(card_key, op, value):
    query = _color_set(value)

    def pred(card):
        have = frozenset(c.upper() for c in (card.get(card_key) or []))
        if op == ":":
            if not query:
                return have == frozenset()
            return query <= have
        if op == "=":
            return have == query
        if op == "<=":
            return have <= query
        if op == ">=":
            return query <= have
        if op == ">":
            return query < have
        if op == "<":
            return have < query
        return False
    return pred


def _num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _numeric_pred(card_key, op, value):
    target = _num(value)

    def pred(card):
        actual = _num(card.get(card_key))
        if actual is None or target is None:
            return False
        if op in (":", "="):
            return actual == target
        if op == "!=":
            return actual != target
        if op == ">=":
            return actual >= target
        if op == "<=":
            return actual <= target
        if op == ">":
            return actual > target
        if op == "<":
            return actual < target
        return False
    return pred


def _rarity_pred(op, value):
    # Pipe = OR (r:rare|mythic). A card has one rarity, so ANDing repeated r:
    # would match nothing. Pipe avoids colliding with commas inside values.
    wants = [v.strip().lower() for v in value.split("|") if v.strip()]
    want = wants[0] if wants else value.lower()
    want_rank = RARITY_RANK.get(want)

    def pred(card):
        have = (card.get("rarity") or "").lower()
        if op in (":", "="):
            return have in wants
        if want_rank is None:
            return False
        have_rank = RARITY_RANK.get(have)
        if have_rank is None:
            return False
        if op == ">=":
            return have_rank >= want_rank
        if op == "<=":
            return have_rank <= want_rank
        if op == ">":
            return have_rank > want_rank
        if op == "<":
            return have_rank < want_rank
        return False
    return pred


def _substr_pred(card_key, value):
    needle = value.lower()
    return lambda card: needle in (card.get(card_key) or "").lower()


def _text_pred(card_key, value):
    """Scryfall text match: /pattern/ is a case-insensitive regex (unanchored,
    like Scryfall); anything else is a plain case-insensitive substring.
    Returns (predicate, warning); warning set only for an invalid regex.
    """
    if len(value) >= 2 and value[0] == "/" and value[-1] == "/":
        try:
            rx = re.compile(value[1:-1], re.IGNORECASE)
        except re.error as e:
            return None, f"invalid regex: {value} ({e})"
        return (lambda card: rx.search(card.get(card_key) or "") is not None), None
    return _substr_pred(card_key, value), None


def _name_pred(value):
    return _text_pred("name", value)


def _set_pred(value):
    # Matches an exact set code (set:tla) or a substring of a set name
    # (set:"final fantasy commander").
    want = value.lower()

    def pred(card):
        if any((p.get("set") or "").lower() == want
               for p in card.get("prints", [])):
            return True
        return any(want in (s or "").lower() for s in card.get("set_names", []))
    return pred


def _franchise_pred(value):
    # Pipe-separated means OR (e.g. fr:"fallout|lord of the rings"). Pipe avoids
    # colliding with commas inside franchise names like "Warhammer 40,000".
    needles = [v.strip().lower() for v in value.split("|") if v.strip()]
    return lambda card: any(n in (f or "").lower()
                            for f in card.get("franchises", [])
                            for n in needles)


def _reskin_pred(reskin_counts):
    return lambda card: reskin_counts.get(card.get("oracle_id"), 0) > 0


def _unreskin_pred(reskin_counts):
    return lambda card: reskin_counts.get(card.get("oracle_id"), 0) == 0


def _reskin_count_pred(reskin_counts, op, value):
    # Numeric predicate over a card's approved-reskin count (from reskin_counts,
    # not a card field; the count isn't stamped until after filtering).
    target = _num(value)

    def pred(card):
        if target is None:
            return False
        actual = reskin_counts.get(card.get("oracle_id"), 0)
        if op in (":", "="):
            return actual == target
        if op == "!=":
            return actual != target
        if op == ">=":
            return actual >= target
        if op == "<=":
            return actual <= target
        if op == ">":
            return actual > target
        if op == "<":
            return actual < target
        return False
    return pred


def _build(key, op, value, reskin_counts):
    """Return (predicate, warning). Exactly one is non-None."""
    key = key.lower()
    if not value and key not in ("is", "has"):
        return None, f"empty value for operator: {key}:"
    if key in ("t", "type"):
        return _text_pred("type_line", value)
    if key in ("o", "oracle"):
        return _text_pred("oracle_text", value)
    if key in ("c", "color"):
        return _color_pred("colors", op, value), None
    if key in ("id", "identity"):
        return _color_pred("color_identity", op, value), None
    if key in ("cmc", "mv"):
        return _numeric_pred("cmc", op, value), None
    if key == "pow":
        return _numeric_pred("power", op, value), None
    if key == "tou":
        return _numeric_pred("toughness", op, value), None
    if key == "loy":
        return _numeric_pred("loyalty", op, value), None
    if key in ("r", "rarity"):
        return _rarity_pred(op, value), None
    if key in ("set", "e"):
        return _set_pred(value), None
    if key in ("fr", "franchise"):
        return _franchise_pred(value), None
    if key in ("reskins", "skins"):
        return _reskin_count_pred(reskin_counts, op, value), None
    if key in ("is", "has"):
        if value.lower() in ("reskinned", "reskin"):
            return _reskin_pred(reskin_counts), None
        if value.lower() in ("unreskinned", "noreskin"):
            return _unreskin_pred(reskin_counts), None
        return None, f"unknown value: {key}:{value}"
    return None, f"unknown operator: {key}:"


def parse_query(q, reskin_counts=None):
    reskin_counts = reskin_counts or {}
    preds, warnings = [], []
    for neg, body in tokenize(q):
        m = OP_RE.match(body)
        if m:
            pred, warn = _build(m.group(1), m.group(2), m.group(3), reskin_counts)
        else:
            pred, warn = _name_pred(body)
        if warn:
            warnings.append(warn)
            continue
        preds.append((lambda c, p=pred: not p(c)) if neg else pred)
    return preds, warnings


def _sort_key(order):
    if order == "cmc":
        return lambda c: (c.get("cmc") or 0.0, (c.get("name") or "").lower())
    if order == "rarity":
        return lambda c: (RARITY_RANK.get(c.get("rarity"), -1), (c.get("name") or "").lower())
    if order == "released":
        return lambda c: (c.get("released_at") or "", (c.get("name") or "").lower())
    if order == "franchise":
        return lambda c: ((c.get("franchises") or [""])[0], (c.get("name") or "").lower())
    if order == "set":
        return lambda c: ((c.get("set_names") or [""])[0], (c.get("name") or "").lower())
    return lambda c: (c.get("name") or "").lower()


def search(cards, q="", order="name", direction="asc", page=1, page_size=60,
           reskin_counts=None):
    preds, warnings = parse_query(q, reskin_counts)
    matched = [c for c in cards if all(p(c) for p in preds)]
    matched.sort(key=_sort_key(order), reverse=(direction == "desc"))
    page = max(1, page)
    page_size = max(1, min(page_size, 175))
    total = len(matched)
    start = (page - 1) * page_size
    counts = reskin_counts or {}
    window = [{**c, "reskin_count": counts.get(c.get("oracle_id"), 0)}
              for c in matched[start:start + page_size]]
    return {
        "cards": window,
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": start + page_size < total,
        "warnings": warnings,
    }
