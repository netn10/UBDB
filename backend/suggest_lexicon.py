"""Single source of truth for the Suggest-a-Reskin heuristic: which words map to
which card signal, and how heavily each signal counts. No scoring logic here."""

WEIGHTS = {"color": 3, "role": 3, "keyword": 4, "type": 2, "franchise": 6}

# concept word -> WUBRG color
COLOR_WORDS = {
    "protector": "W", "healer": "W", "noble": "W", "holy": "W", "loyal": "W",
    "order": "W", "knight": "W",
    "cunning": "U", "clever": "U", "control": "U", "trickster": "U",
    "scholar": "U", "spy": "U", "illusion": "U",
    "ruthless": "B", "death": "B", "undead": "B", "assassin": "B",
    "sacrifice": "B", "corrupt": "B", "vampire": "B",
    "rage": "R", "fire": "R", "reckless": "R", "warrior": "R",
    "chaos": "R", "burn": "R", "goblin": "R",
    "beast": "G", "nature": "G", "wild": "G", "growth": "G",
    "hunter": "G", "elf": "G", "primal": "G",
}

# concept word -> condition dict tested against a card
ROLE_WORDS = {
    "tank": {"keyword": "Defender", "min_toughness": 4},
    "guardian": {"keyword": "Defender", "min_toughness": 4},
    "defender": {"keyword": "Defender"},
    "assassin": {"keyword": "Deathtouch", "max_cmc": 3},
    "killer": {"keyword": "Deathtouch"},
    "leader": {"type": "Legendary"},
    "commander": {"type": "Legendary"},
    "swarm": {"text": "token"},
    "army": {"text": "token"},
    "flyer": {"keyword": "Flying"},
}

# literal MTG keywords, matched against card["keywords"]
KEYWORD_WORDS = {
    "flying", "trample", "lifelink", "haste", "deathtouch", "vigilance",
    "menace", "reach", "defender", "hexproof", "ward", "flash",
}

# creature-type words, substring-matched against type_line
TYPE_WORDS = {
    "dragon", "soldier", "wizard", "zombie", "angel", "demon", "human",
    "elf", "goblin", "knight", "warrior", "beast", "spirit", "vampire",
    "merfolk", "dwarf", "giant", "robot",
}
