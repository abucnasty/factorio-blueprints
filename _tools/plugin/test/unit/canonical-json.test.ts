import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  compareCodePoints,
  decodeBlueprintString,
  isCanonicalJson,
  readCanonicalJson,
  writeCanonicalJson,
} from "../../src/core/index.ts";
import { fixture } from "./fixtures.ts";

describe("canonical blueprint.json", () => {
  // Expected files come from a separate Python implementation (make-fixtures.py).
  for (const name of ["book-nested", "upgrade-planner", "tiles", "non-ascii-label", "wires-2.0"]) {
    test(`${name} matches the independent implementation`, () => {
      const { value } = decodeBlueprintString(fixture(`${name}.txt`));
      const text = writeCanonicalJson(value);
      assert.equal(text, fixture(`${name}.canonical.json`));
      assert.deepStrictEqual(readCanonicalJson(text), value);
      assert.equal(writeCanonicalJson(readCanonicalJson(text)), text);
      assert.ok(isCanonicalJson(text));
    });
  }

  test("single blueprint from the game is byte-stable", () => {
    const { value } = decodeBlueprintString(fixture("single-blueprint.txt"));
    const text = writeCanonicalJson(value);
    assert.equal(writeCanonicalJson(readCanonicalJson(text)), text);
    assert.match(text, /^ {6}\{"entity_number":1,"name":"turbo-transport-belt","position":\{"x":-6\.5,"y":-9\.5\}\},$/m);
  });

  test("layout rules", () => {
    const value = {
      z: { entities: [], tiles: {}, wires: [[1, 2]], other: [[1, 2]] },
      a: [],
      m: {},
      n: [1, "two", null, true],
    };
    assert.equal(
      writeCanonicalJson(value),
      [
        "{",
        '  "a": [],',
        '  "m": {},',
        '  "n": [',
        "    1,",
        '    "two",',
        "    null,",
        "    true",
        "  ],",
        '  "z": {',
        '    "entities": [],',
        '    "other": [',
        "      [",
        "        1,",
        "        2",
        "      ]",
        "    ],",
        '    "tiles": {},',
        '    "wires": [',
        "      [1,2]",
        "    ]",
        "  }",
        "}",
        "",
      ].join("\n"),
    );
  });

  test("compact rows sort keys at every depth", () => {
    const text = writeCanonicalJson({ entities: [{ b: { d: 1, c: 2 }, a: [{ y: 1, x: 2 }] }] });
    assert.ok(text.includes('{"a":[{"x":2,"y":1}],"b":{"c":2,"d":1}}'));
  });

  test("numbers use the shortest form and integers stay integers", () => {
    const text = writeCanonicalJson(JSON.parse('{"a":5.0,"b":0.1,"c":-0.5,"d":1e21,"e":1e-7,"f":562949958402048,"g":-0}'));
    assert.match(text, /"a": 5,/);
    assert.match(text, /"b": 0.1,/);
    assert.match(text, /"c": -0.5,/);
    assert.match(text, /"d": 1e\+21,/);
    assert.match(text, /"e": 1e-7,/);
    assert.match(text, /"f": 562949958402048,/);
    assert.match(text, /"g": 0\n/);
  });

  test("non-ASCII is written as-is; control characters are escaped", () => {
    const text = writeCanonicalJson({ label: "Fußgänger 🚀 日本", d: 'tab\tquote"back\\slash\u0001' });
    assert.ok(text.includes('"Fußgänger 🚀 日本"'));
    assert.ok(text.includes('"tab\\tquote\\"back\\\\slash\\u0001"'));
  });

  test("keys sort by code point, not UTF-16 unit", () => {
    // U+1F600 (surrogates D83D DE00) sorts after U+FF5E by code point.
    const keys = ["\u{1F600}", "～", "a", "B", "é"];
    assert.deepStrictEqual([...keys].sort(compareCodePoints), ["B", "a", "é", "～", "\u{1F600}"]);
    const text = writeCanonicalJson(Object.fromEntries(keys.map((k) => [k, 1])));
    assert.deepStrictEqual(Object.keys(readCanonicalJson(text) as object).sort(compareCodePoints), Object.keys(readCanonicalJson(text) as object));
  });

  test("LF, one trailing newline; CRLF or a BOM is readable but not canonical", () => {
    const text = writeCanonicalJson({ a: [1] });
    assert.ok(text.endsWith("]\n}\n") && !text.includes("\r"));
    const crlf = text.replace(/\n/g, "\r\n");
    assert.equal(isCanonicalJson(crlf), false);
    assert.deepStrictEqual(readCanonicalJson(crlf), { a: [1] });
    assert.deepStrictEqual(readCanonicalJson("﻿" + text), { a: [1] });
    assert.equal(isCanonicalJson(text.trimEnd()), false);
  });

  test("rejects values JSON cannot hold", () => {
    assert.throws(() => writeCanonicalJson({ a: Number.NaN }));
    assert.throws(() => writeCanonicalJson({ a: Infinity }));
  });
});
