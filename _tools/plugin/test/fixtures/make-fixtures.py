"""Write the small hand-made fixtures in this folder.

Independent of the TypeScript code on purpose: strings are made with
Python's zlib and the expected canonical files with Python's json module,
so the unit tests compare our implementation against a second one.

    python3 -I make-fixtures.py

single-blueprint.txt is not made here: it is a real string exported from
the game (factorio-benchmarks, asteroid inserter stack size benchmark).
"""

import base64
import json
import os
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
COMPACT_ROW_KEYS = {"entities", "tiles", "wires", "stock_connections", "schedules"}


def version(major, minor, patch, build=0):
    return (major << 48) | (minor << 32) | (patch << 16) | build


V2_0_76 = version(2, 0, 76)


def encode(value):
    data = json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return "0" + base64.b64encode(zlib.compress(data, 9)).decode("ascii")


def compact(value):
    return json.dumps(value, separators=(",", ":"), sort_keys=True, ensure_ascii=False)


def canonical(value, indent="", rows=False):
    inner = indent + "  "
    if isinstance(value, list):
        if not value:
            return "[]"
        items = [compact(v) if rows else canonical(v, inner) for v in value]
        return "[\n" + ",\n".join(inner + s for s in items) + "\n" + indent + "]"
    if isinstance(value, dict):
        if not value:
            return "{}"
        lines = [
            inner + json.dumps(k, ensure_ascii=False) + ": " + canonical(value[k], inner, k in COMPACT_ROW_KEYS)
            for k in sorted(value)
        ]
        return "{\n" + ",\n".join(lines) + "\n" + indent + "}"
    return compact(value)


def ent(n, name, x, y, **extra):
    return {"entity_number": n, "name": name, "position": {"x": x, "y": y}, **extra}


wires = {
    "blueprint": {
        "item": "blueprint",
        "label": "Wired lamps",
        "icons": [{"signal": {"name": "small-lamp"}, "index": 1}],
        "entities": [
            ent(1, "small-lamp", 0.5, 0.5, control_behavior={"use_colors": True}),
            ent(2, "small-lamp", 2.5, 0.5),
            ent(3, "constant-combinator", 1.5, 2.5, direction=4, player_description=""),
            ent(4, "medium-electric-pole", 1.5, 0.5),
        ],
        "wires": [[1, 1, 3, 1], [2, 1, 3, 1], [1, 5, 4, 5], [2, 5, 4, 5]],
        "schedules": [
            {
                "locomotives": [5],
                "schedule": {
                    "records": [
                        {"station": "Iron pickup", "wait_conditions": [{"type": "full", "compare_type": "or"}]}
                    ],
                    "group": "",
                },
            }
        ],
        "stock_connections": [{"stock": 5, "front": 6}],
        "version": V2_0_76,
    }
}

tiles = {
    "blueprint": {
        "item": "blueprint",
        "label": "Concrete pad",
        "icons": [{"signal": {"name": "refined-concrete"}, "index": 1}],
        "entities": [ent(1, "steel-chest", 1.5, 1.5)],
        "tiles": [
            {"name": "refined-concrete", "position": {"x": x, "y": y}}
            for y in range(3)
            for x in range(3)
        ],
        "version": V2_0_76,
    }
}

non_ascii = {
    "blueprint": {
        "item": "blueprint",
        "label": "Fußgänger-Brücke — 日本語 🚀",
        "description": "Ünïcödé stays as it is: “quotes”, emoji 🚂, and a tab\there.",
        "icons": [{"signal": {"name": "iron-chest"}, "index": 1}],
        "entities": [ent(1, "iron-chest", 0.5, 0.5)],
        "version": V2_0_76,
    }
}

upgrade_planner = {
    "upgrade_planner": {
        "item": "upgrade-planner",
        "label": "Belts to turbo",
        "settings": {
            "mappers": [
                {"from": {"type": "entity", "name": "transport-belt"}, "to": {"type": "entity", "name": "turbo-transport-belt"}, "index": 0},
                {"from": {"type": "entity", "name": "fast-transport-belt"}, "to": {"type": "entity", "name": "turbo-transport-belt"}, "index": 1},
            ]
        },
        "version": V2_0_76,
    }
}

book_nested = {
    "blueprint_book": {
        "item": "blueprint-book",
        "label": "[item=military-science-pack,quality=uncommon] (240/s) V3",
        "description": "- designed by abucnasty",
        "icons": [{"signal": {"name": "military-science-pack", "quality": "uncommon"}, "index": 1}],
        "active_index": 0,
        "blueprints": [
            {"index": 0, **tiles},
            {
                "index": 1,
                "blueprint_book": {
                    "item": "blueprint-book",
                    "label": "Inner book",
                    "active_index": 0,
                    "blueprints": [
                        {"index": 0, **wires},
                        {
                            "index": 1,
                            "deconstruction_planner": {
                                "item": "deconstruction-planner",
                                "label": "Trees only",
                                "settings": {"tree_rock_only": True},
                                "version": V2_0_76,
                            },
                        },
                    ],
                    "version": V2_0_76,
                },
            },
            {"index": 2, **upgrade_planner},
        ],
        "version": V2_0_76,
    }
}

fixtures = {
    "wires-2.0": wires,
    "tiles": tiles,
    "non-ascii-label": non_ascii,
    "upgrade-planner": upgrade_planner,
    "book-nested": book_nested,
}

for name, value in fixtures.items():
    with open(os.path.join(HERE, name + ".txt"), "w", encoding="utf-8", newline="\n") as f:
        f.write(encode(value) + "\n")
    with open(os.path.join(HERE, name + ".canonical.json"), "w", encoding="utf-8", newline="\n") as f:
        f.write(canonical(value) + "\n")
