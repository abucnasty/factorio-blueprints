import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { blueprintHash, canonicalJson, compareCodePoints, manifestKey, nextManifest, sortedPrettyJson } from "../src/manifest.js";

// The vector the Obsidian plugin's implementation is checked against
const VECTOR = {
    blueprint: { label: "Zähler ⚙ 🚀", item: "blueprint", entities: [{ position: { y: -2.5, x: 1 }, name: "stone-furnace", entity_number: 1 }], version: 562949958139904 },
    canonical: '{"entities":[{"entity_number":1,"name":"stone-furnace","position":{"x":1,"y":-2.5}}],"item":"blueprint","label":"Zähler ⚙ 🚀","version":562949958139904}',
};

test("canonical JSON: sorted keys at every depth, array order kept, no whitespace, unicode unescaped", () => {
    assert.equal(canonicalJson(VECTOR.blueprint), VECTOR.canonical);
    assert.equal(canonicalJson({ b: [3, 1, { d: 1, c: "\n\"" }], a: null, n: 1e21, f: 0.1 }), '{"a":null,"b":[3,1,{"c":"\\n\\"","d":1}],"f":0.1,"n":1e+21}');
    assert.equal(canonicalJson([]), "[]");
    assert.equal(canonicalJson({}), "{}");
});

test("blueprintHash is SHA-256 of the canonical JSON's UTF-8 bytes", () => {
    const expected = createHash("sha256").update(Buffer.from(VECTOR.canonical, "utf8")).digest("hex");
    assert.equal(blueprintHash(VECTOR.blueprint), expected);
    assert.match(expected, /^[0-9a-f]{64}$/);
    // computed independently with Python's hashlib over the same canonical string
    assert.equal(expected, "6673ed1df39ca8d56e1d29dd31c3a90d27ed29e0964c9f8e781bf97a041d39ca");
});

test("key order does not change the hash; array order and labels do", () => {
    const reordered = { version: 562949958139904, entities: [{ entity_number: 1, name: "stone-furnace", position: { x: 1, y: -2.5 } }], item: "blueprint", label: "Zähler ⚙ 🚀" };
    assert.equal(blueprintHash(reordered), blueprintHash(VECTOR.blueprint));
    const two = [{ entity_number: 1, name: "a", position: { x: 0, y: 0 } }, { entity_number: 2, name: "b", position: { x: 1, y: 0 } }];
    assert.notEqual(blueprintHash({ entities: two }), blueprintHash({ entities: [...two].reverse() }));
    assert.notEqual(blueprintHash({ label: "Zähler" }), blueprintHash({ label: "Zahler" }));
});

test("keys are compared by code point, not UTF-16 unit", () => {
    // U+FF61 sorts before U+1F600 by code point, after it by UTF-16 code unit
    assert.ok(compareCodePoints("｡", "\u{1F600}") < 0);
    assert.equal(canonicalJson({ "\u{1F600}": 1, "｡": 2 }), '{"｡":2,"\u{1F600}":1}');
});

test("manifest merge: a full run replaces, an --only run keeps others and drops removed files", () => {
    const at = new Date("2026-11-12T10:00:00.000Z");
    const previous = { schema: 1, rendered_at: "x", entries: { 0: { file: "0.jpg" }, 1: { file: "1.jpg" }, "2/0": { file: "2/0.jpg" } } };
    const produced = [{ key: "2/0", file: "2/0.jpg", sha256: "h", width: 1, height: 2 }];
    assert.deepEqual(nextManifest(previous, produced, [], false, at), { schema: 1, rendered_at: "2026-11-12T10:00:00.000Z", entries: { "2/0": { file: "2/0.jpg", sha256: "h", width: 1, height: 2 } } });
    assert.deepEqual(Object.keys(nextManifest(previous, produced, ["1.jpg"], true, at).entries), ["0", "2/0"]);
    assert.deepEqual(Object.keys(nextManifest(null, produced, [], true, at).entries), ["2/0"]);
    assert.equal(manifestKey(""), "0");
    assert.equal(manifestKey("3/1"), "3/1");
});

test("the manifest is written with keys in code-point order, integer-like keys included", () => {
    const text = sortedPrettyJson({ schema: 1, entries: { "3": { file: "3.jpg" }, "2/0": { file: "2/0.jpg" }, "10": { file: "10.jpg" } } });
    assert.equal(text, '{\n  "entries": {\n    "10": {\n      "file": "10.jpg"\n    },\n    "2/0": {\n      "file": "2/0.jpg"\n    },\n    "3": {\n      "file": "3.jpg"\n    }\n  },\n  "schema": 1\n}');
    assert.deepEqual(JSON.parse(text).entries["2/0"], { file: "2/0.jpg" });
});
