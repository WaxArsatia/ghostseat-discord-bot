#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import random
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SEED = 20260313
CATEGORY_TARGET = 100
RARITY_COUNTS = {
    "Common": 70,
    "Rare": 22,
    "Epic": 7,
    "Legendary": 1,
}

RARITY_ADJECTIVE = {
    "Common": "Plain",
    "Rare": "Refined",
    "Epic": "Mythic",
    "Legendary": "Ascendant",
}

NAME_PARTS = {
    "Weapon": {
        "prefixes": [
            "Iron",
            "Ash",
            "Storm",
            "Night",
            "Crimson",
            "Frost",
            "Solar",
            "Lunar",
            "Wild",
            "Runic",
            "Twin",
            "Dawn",
            "Dusk",
            "Void",
            "Rift",
            "Phantom",
            "Ember",
            "Granite",
            "Tempest",
            "Cinder",
        ],
        "cores": [
            "Blade",
            "Saber",
            "Axe",
            "Spear",
            "Glaive",
            "Dagger",
            "Cleaver",
            "Mace",
            "Halberd",
            "Edge",
            "Pike",
            "Rapier",
            "Katana",
            "Hammer",
            "Claw",
        ],
        "suffixes": [
            "of Valor",
            "of Ruin",
            "of Resolve",
            "of Gale",
            "of Echo",
            "of Dawn",
            "of Nightfall",
            "of Fury",
            "of Trial",
            "of Ember",
            "of Tides",
            "of Oath",
            "of Tempest",
            "of Sparks",
            "of Breakers",
        ],
    },
    "Armor": {
        "prefixes": [
            "Iron",
            "Stone",
            "Ward",
            "Bastion",
            "Aegis",
            "Guardian",
            "Frost",
            "Flame",
            "Dawn",
            "Dusk",
            "Echo",
            "Rune",
            "Storm",
            "Moon",
            "Sun",
            "Titan",
            "Oak",
            "Granite",
            "Hollow",
            "Sky",
        ],
        "cores": [
            "Plate",
            "Mail",
            "Harness",
            "Coat",
            "Vest",
            "Shell",
            "Cuirass",
            "Guard",
            "Carapace",
            "Suit",
            "Barrier",
            "Armor",
            "Panoply",
            "Raiment",
            "Mantle",
        ],
        "suffixes": [
            "of Shelter",
            "of Balance",
            "of Bulwark",
            "of Endurance",
            "of Echo",
            "of Mercy",
            "of Defiance",
            "of Oath",
            "of Frost",
            "of Flame",
            "of Stone",
            "of Renewal",
            "of Sand",
            "of Sages",
            "of Champions",
        ],
    },
    "Accessory": {
        "prefixes": [
            "Swift",
            "Mystic",
            "Warden",
            "Arc",
            "Pulse",
            "Silent",
            "Lumen",
            "Nova",
            "Gloom",
            "Rune",
            "Oracle",
            "Vivid",
            "Duskwind",
            "Sunstep",
            "Moonstep",
            "Aether",
            "Fable",
            "Crescent",
            "Harmonic",
            "Whisper",
        ],
        "cores": [
            "Ring",
            "Charm",
            "Amulet",
            "Pendant",
            "Talisman",
            "Band",
            "Brooch",
            "Sigil",
            "Stone",
            "Emblem",
            "Token",
            "Orb",
            "Loop",
            "Relic",
            "Crest",
        ],
        "suffixes": [
            "of Tempo",
            "of Precision",
            "of Fortune",
            "of Focus",
            "of Winds",
            "of Insight",
            "of Twilight",
            "of Growth",
            "of Stride",
            "of Sparks",
            "of Eclipse",
            "of Clarity",
            "of Resonance",
            "of Will",
            "of Control",
        ],
    },
}

BASE_RANGES = {
    "Weapon": {
        "atk": (16, 26),
        "def": (0, 8),
        "hp": (0, 20),
        "spd": (2, 10),
    },
    "Armor": {
        "atk": (0, 7),
        "def": (16, 26),
        "hp": (20, 44),
        "spd": (-4, 4),
    },
    "Accessory": {
        "atk": (4, 14),
        "def": (4, 14),
        "hp": (6, 26),
        "spd": (4, 14),
    },
}

RARITY_MULTIPLIER = {
    "Common": 1.00,
    "Rare": 1.16,
    "Epic": 1.38,
    "Legendary": 1.68,
}


@dataclass(slots=True)
class ItemTemplate:
    id: str
    name: str
    type: str
    rarity: str
    atk: int
    def_stat: int
    hp: int
    spd: int

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["def"] = data.pop("def_stat")
        return data


def scaled_range(value_range: tuple[int, int], multiplier: float) -> tuple[int, int]:
    low, high = value_range
    scaled_low = int(round(low * multiplier))
    scaled_high = int(round(high * multiplier))
    if scaled_low > scaled_high:
        scaled_low, scaled_high = scaled_high, scaled_low
    return scaled_low, scaled_high


def choose_name(category: str, rarity: str, index: int, rng: random.Random) -> str:
    parts = NAME_PARTS[category]
    prefix = parts["prefixes"][index % len(parts["prefixes"])]
    core = parts["cores"][(index * 3 + 1) % len(parts["cores"])]
    suffix = parts["suffixes"][(index * 7 + 2) % len(parts["suffixes"])]

    if index % 9 == 0:
        prefix = rng.choice(parts["prefixes"])
    if index % 13 == 0:
        suffix = rng.choice(parts["suffixes"])

    return f"{RARITY_ADJECTIVE[rarity]} {prefix} {core} {suffix}"


def apply_tradeoff(stats: dict[str, int], rarity: str, rng: random.Random) -> None:
    if rarity not in {"Epic", "Legendary"}:
        return

    proc_rate = 0.50 if rarity == "Epic" else 0.75
    if rng.random() > proc_rate:
        return

    bonus_stat, penalty_stat = rng.sample(["atk", "def", "hp", "spd"], 2)

    bonus_amount = rng.randint(3, 8) if rarity == "Epic" else rng.randint(5, 11)
    if bonus_stat == "hp":
        bonus_amount *= 2

    penalty_amount = rng.randint(2, 6) if rarity == "Epic" else rng.randint(3, 8)
    if penalty_stat == "hp":
        penalty_amount *= 2

    stats[bonus_stat] += bonus_amount
    stats[penalty_stat] -= penalty_amount


def roll_stats(category: str, rarity: str, rng: random.Random) -> dict[str, int]:
    base = BASE_RANGES[category]
    multiplier = RARITY_MULTIPLIER[rarity]
    rolled: dict[str, int] = {}

    for stat_key in ("atk", "def", "hp", "spd"):
        low, high = scaled_range(base[stat_key], multiplier)
        rolled[stat_key] = rng.randint(low, high)

    apply_tradeoff(rolled, rarity, rng)
    return rolled


def rarity_sequence(rng: random.Random) -> list[str]:
    sequence: list[str] = []
    for rarity, count in RARITY_COUNTS.items():
        sequence.extend([rarity] * count)
    rng.shuffle(sequence)
    return sequence


def build_items_for_category(category: str, rng: random.Random) -> list[ItemTemplate]:
    rarities = rarity_sequence(rng)
    items: list[ItemTemplate] = []

    for idx in range(CATEGORY_TARGET):
        rarity = rarities[idx]
        stats = roll_stats(category, rarity, rng)

        item = ItemTemplate(
            id=f"{category.lower()}-{idx + 1:03d}",
            name=choose_name(category, rarity, idx, rng),
            type=category,
            rarity=rarity,
            atk=stats["atk"],
            def_stat=stats["def"],
            hp=stats["hp"],
            spd=stats["spd"],
        )
        items.append(item)

    return items


def validate(items: list[ItemTemplate]) -> None:
    type_counter = Counter(item.type for item in items)
    for category in ["Weapon", "Armor", "Accessory"]:
        if type_counter[category] != CATEGORY_TARGET:
            raise ValueError(
                f"Category {category} expected {CATEGORY_TARGET}, got {type_counter[category]}"
            )

        rarity_counter = Counter(item.rarity for item in items if item.type == category)
        for rarity, count in RARITY_COUNTS.items():
            if rarity_counter[rarity] != count:
                raise ValueError(
                    f"{category} rarity {rarity} expected {count}, got {rarity_counter[rarity]}"
                )

def summarize(items: list[ItemTemplate]) -> dict[str, Any]:
    by_category: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for item in items:
        by_category[item.type][item.rarity] += 1

    return {
        category: {
            "total": sum(counts.values()),
            "rarity": dict(sorted(counts.items())),
        }
        for category, counts in by_category.items()
    }


def generate_catalog(seed: int) -> dict[str, Any]:
    rng = random.Random(seed)
    all_items: list[ItemTemplate] = []

    for category in ["Weapon", "Armor", "Accessory"]:
        all_items.extend(build_items_for_category(category, rng))

    validate(all_items)

    return {
        "version": "1.0.0",
        "generatedAt": datetime.now(tz=timezone.utc).isoformat(),
        "seed": seed,
        "rules": {
            "rarityRate": {
                "Common": 0.70,
                "Rare": 0.22,
                "Epic": 0.07,
                "Legendary": 0.01,
            },
            "perCategory": CATEGORY_TARGET,
        },
        "summary": summarize(all_items),
        "items": [item.to_dict() for item in all_items],
    }


def write_catalog(output_path: Path, catalog: dict[str, Any]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Generate Voicebound Arena item templates (100 per category) aligned to GAME_DESIGN.md"
        )
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("assets/game/item-catalog.json"),
        help="Output JSON path",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=SEED,
        help="Deterministic random seed",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    catalog = generate_catalog(seed=args.seed)
    write_catalog(args.output, catalog)
    print(
        f"Generated {len(catalog['items'])} items to {args.output} (seed={args.seed})"
    )


if __name__ == "__main__":
    main()
