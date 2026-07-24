import pytest

from franchise_map import DEFAULT_DATA_DIR, load_maps, resolve_franchises


@pytest.fixture(scope="module")
def maps():
    return load_maps(DEFAULT_DATA_DIR)


def test_single_set_resolves_to_its_franchise(maps):
    set_map, overrides = maps
    assert resolve_franchises(
        ["Avatar: The Last Airbender"], "o-x", set_map, overrides
    ) == ["Avatar: The Last Airbender"]


def test_multiple_sets_collapse_to_one_franchise(maps):
    set_map, overrides = maps
    assert resolve_franchises(
        ["Final Fantasy", "Final Fantasy Commander", "Final Fantasy Promos"],
        "o-x", set_map, overrides,
    ) == ["Final Fantasy"]


def test_sets_spanning_two_franchises_returns_both_sorted(maps):
    set_map, overrides = maps
    assert resolve_franchises(
        ["Fallout", "Warhammer 40,000 Commander"], "o-x", set_map, overrides
    ) == ["Fallout", "Warhammer 40,000"]


def test_mixed_set_alone_is_unassigned(maps):
    set_map, overrides = maps
    assert resolve_franchises(
        ["Secret Lair Drop"], "o-not-overridden", set_map, overrides
    ) == ["Unassigned"]


def test_override_resolves_a_mixed_only_card(maps):
    set_map, overrides = maps
    oid = next(k for k, v in overrides.items() if v["name"] == "Sonic the Hedgehog")
    assert resolve_franchises(
        ["Secret Lair Drop"], oid, set_map, overrides
    ) == ["Sonic the Hedgehog"]


def test_override_is_additive_not_replacing(maps):
    set_map, overrides = maps
    oid = next(k for k, v in overrides.items() if v["name"] == "Sonic the Hedgehog")
    assert resolve_franchises(
        ["Fallout", "Secret Lair Drop"], oid, set_map, overrides
    ) == ["Fallout", "Sonic the Hedgehog"]


def test_unknown_set_raises(maps):
    set_map, overrides = maps
    with pytest.raises(KeyError):
        resolve_franchises(["No Such Set 2099"], "o-x", set_map, overrides)


def test_overrides_all_reference_valid_franchises(maps):
    _, overrides = maps
    for entry in overrides.values():
        assert entry["franchise"] and isinstance(entry["franchise"], str)
