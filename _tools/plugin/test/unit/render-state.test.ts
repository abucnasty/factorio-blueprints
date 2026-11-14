import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, test } from "node:test";

import {
  blueprintHash,
  decodeBlueprintString,
  parseRenderManifest,
  parseRenderVersion,
  renderState,
  renderStateLabel,
  renderTargets,
  sha256Hex,
} from "../../src/core/index.ts";
import type { RenderManifest } from "../../src/core/index.ts";
import { fixture } from "./fixtures.ts";

const nodeSha = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");

describe("sha256", () => {
  test("standard vectors", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    assert.equal(sha256Hex(enc("")), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    assert.equal(sha256Hex(enc("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    assert.equal(
      sha256Hex(enc("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")),
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
    for (const n of [55, 56, 63, 64, 65, 119, 1000, 100_000]) {
      const data = new Uint8Array(n).map((_, i) => (i * 31 + 7) & 255);
      assert.equal(sha256Hex(data), nodeSha(data), `length ${n}`);
    }
  });
});

describe("blueprintHash", () => {
  test("is SHA-256 of compact JSON with sorted keys", () => {
    const bp = { label: "Mall", entities: [{ name: "a", entity_number: 1 }], version: 1 };
    assert.equal(blueprintHash(bp), nodeSha('{"entities":[{"entity_number":1,"name":"a"}],"label":"Mall","version":1}'));
  });
  test("vector shared with the render tool (_tools/render/src/manifest.js)", () => {
    const input = {
      label: "Zähler ⚙ 🚀",
      item: "blueprint",
      entities: [{ position: { y: -2.5, x: 1 }, name: "stone-furnace", entity_number: 1 }],
      version: 562949958139904,
    };
    const canonical =
      '{"entities":[{"entity_number":1,"name":"stone-furnace","position":{"x":1,"y":-2.5}}],"item":"blueprint","label":"Zähler ⚙ 🚀","version":562949958139904}';
    assert.equal(nodeSha(Buffer.from(canonical, "utf8")), "6673ed1df39ca8d56e1d29dd31c3a90d27ed29e0964c9f8e781bf97a041d39ca");
    assert.equal(blueprintHash(input), "6673ed1df39ca8d56e1d29dd31c3a90d27ed29e0964c9f8e781bf97a041d39ca");
  });

  test("keys sort by code point: U+FF5E before U+1F680, unlike UTF-16 order", () => {
    const v = { "\u{1F680}": 1, "～": 2 };
    assert.deepStrictEqual(Object.keys(v).sort(), ["\u{1F680}", "～"], "UTF-16 order puts the emoji first");
    assert.equal(blueprintHash(v), nodeSha(Buffer.from('{"～":2,"\u{1F680}":1}', "utf8")));
    assert.notEqual(blueprintHash(v), nodeSha(Buffer.from('{"\u{1F680}":1,"～":2}', "utf8")));
  });

  test("key order does not matter, array order does", () => {
    assert.equal(blueprintHash({ a: 1, b: { d: [1, 2], c: 3 } }), blueprintHash({ b: { c: 3, d: [1, 2] }, a: 1 }));
    assert.notEqual(blueprintHash({ a: [1, 2] }), blueprintHash({ a: [2, 1] }));
  });
  test("unicode is hashed as UTF-8, unescaped", () => {
    assert.equal(blueprintHash({ label: "Fußgänger 🚀" }), nodeSha(Buffer.from('{"label":"Fußgänger 🚀"}', "utf8")));
    // Code point order: U+FF5E sorts before U+1F600.
    assert.equal(blueprintHash({ "\u{1F600}": 1, "～": 2 }), nodeSha('{"～":2,"\u{1F600}":1}'));
  });
  test("fixed vector other tools can check against", () => {
    const { value } = decodeBlueprintString(fixture("wires-2.0.txt"));
    const bp = (value as { blueprint: unknown }).blueprint;
    assert.equal(blueprintHash(bp), nodeSha(JSON.stringify(sortDeep(bp))));
  });
});

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep((v as Record<string, unknown>)[k])]));
  }
  return v;
}

const bp = (label: string, entities = 1) => ({
  blueprint: { item: "blueprint", label, entities: Array.from({ length: entities }, (_, i) => ({ entity_number: i + 1, name: "x" })) },
});
const book = (entries: unknown[]) => ({ blueprint_book: { item: "blueprint-book", blueprints: entries } });

function manifestFor(value: unknown, keys: string[], override: Record<string, Partial<{ sha256: string; file: string }>> = {}): RenderManifest {
  const targets = renderTargets(value);
  const entries: RenderManifest["entries"] = {};
  for (const k of keys) {
    const t = targets.find((x) => x.key === k)!;
    entries[k] = { file: t.file, sha256: t.hash, ...override[k] };
  }
  return { schema: 1, rendered_at: "2026-11-12T00:00:00Z", entries };
}

describe("render targets", () => {
  test("single blueprint is key 0, file 0.jpg", () => {
    assert.deepStrictEqual(renderTargets(bp("a")).map((t) => [t.key, t.path, t.file]), [["0", "", "0.jpg"]]);
  });
  test("nested books: only blueprints, slot paths, empty ones skipped", () => {
    const value = book([
      { index: 3, ...book([{ index: 1, ...bp("deep") }, { index: 0, ...bp("empty", 0) }]) },
      { index: 0, ...bp("first") },
      { index: 1, upgrade_planner: {} },
    ]);
    assert.deepStrictEqual(renderTargets(value).map((t) => [t.key, t.file, t.label]), [
      ["0", "0.jpg", "first"],
      ["3/1", "3/1.jpg", "deep"],
    ]);
  });
});

describe("render state", () => {
  const value = book([{ index: 0, ...bp("a") }, { index: 1, ...book([{ index: 0, ...bp("b") }, { index: 2, ...bp("c") }]) }]);
  const all = ["0.jpg", "1/0.jpg", "1/2.jpg"];

  test("none: no images", () => {
    const s = renderState(value, undefined, [], 1);
    assert.equal(s.overall, "none");
    assert.deepStrictEqual(s.counts, { total: 3, current: 0, outdated: 0, none: 3, orphans: 0 });
    assert.equal(renderStateLabel(s), "Render: none");
  });

  test("current: every image with a matching hash", () => {
    const s = renderState(value, manifestFor(value, ["0", "1/0", "1/2"]), all, 1);
    assert.equal(s.overall, "current");
    assert.equal(renderStateLabel(s), "Render: current");
  });

  test("outdated: changed hash, no manifest entry, or no manifest", () => {
    const changed = renderState(value, manifestFor(value, ["0", "1/0", "1/2"], { "1/2": { sha256: "0".repeat(64) } }), all, 1);
    assert.deepStrictEqual(changed.entries.map((e) => e.state), ["current", "current", "outdated"]);
    assert.equal(renderStateLabel(changed), "Render: 1 of 3 outdated");
    const partial = renderState(value, manifestFor(value, ["0"]), all, 1);
    assert.deepStrictEqual(partial.entries.map((e) => e.state), ["current", "outdated", "outdated"]);
    const noManifest = renderState(value, undefined, all, 1);
    assert.equal(noManifest.overall, "outdated");
    assert.equal(noManifest.counts.outdated, 3);
  });

  test("render version: an older stamp is outdated, a missing stamp counts as 1", () => {
    const one = bp("a");
    const at = (stamp: number | undefined) => {
      const m = manifestFor(one, ["0"]);
      if (stamp !== undefined) m.entries["0"]!.render_version = stamp;
      return m;
    };
    assert.equal(renderState(one, at(undefined), ["0.jpg"], 1).overall, "current");
    assert.equal(renderState(one, at(undefined), ["0.jpg"], 2).overall, "outdated");
    assert.equal(renderState(one, at(1), ["0.jpg"], 2).overall, "outdated");
    assert.equal(renderState(one, at(2), ["0.jpg"], 2).overall, "current");
    assert.equal(renderState(one, at(3), ["0.jpg"], 2).overall, "current");
    assert.equal(parseRenderVersion('{"render_version": 2, "rule": "..."}'), 2);
    assert.equal(parseRenderVersion(undefined), 1);
    assert.equal(parseRenderVersion("{"), 1);
  });

  test("mixed none and current is outdated overall; orphans are listed", () => {
    const s = renderState(value, manifestFor(value, ["0"]), ["0.jpg", "7.jpg", "1/5.jpg"], 1);
    assert.deepStrictEqual(s.entries.map((e) => e.state), ["current", "none", "none"]);
    assert.equal(s.overall, "outdated");
    assert.deepStrictEqual(s.orphans, ["1/5.jpg", "7.jpg"]);
    assert.equal(renderStateLabel(s), "Render: 2 of 3 outdated");
  });

  test("single blueprint: current, then outdated after a change", () => {
    const one = bp("a");
    const m = manifestFor(one, ["0"]);
    assert.equal(renderState(one, m, ["0.jpg"], 1).overall, "current");
    assert.equal(renderStateLabel(renderState(bp("a", 2), m, ["0.jpg"], 1)), "Render: outdated");
  });

  test("nothing to render", () => {
    const s = renderState({ upgrade_planner: {} }, undefined, [], 1);
    assert.equal(s.counts.total, 0);
    assert.equal(renderStateLabel(s), "Render: nothing to render");
  });
});

describe("manifest file", () => {
  test("parse", () => {
    const text = JSON.stringify({
      schema: 1,
      rendered_at: "t",
      entries: { "2/1": { file: "2/1.jpg", sha256: "b", render_version: 2, width: 3, height: 4 }, bad: { file: 1 } },
    });
    assert.deepStrictEqual(parseRenderManifest(text), {
      schema: 1,
      rendered_at: "t",
      entries: { "2/1": { file: "2/1.jpg", sha256: "b", render_version: 2, width: 3, height: 4 } },
    });
    assert.equal(parseRenderManifest("{"), undefined);
    assert.equal(parseRenderManifest('{"schema":2,"entries":{}}'), undefined);
    assert.equal(parseRenderManifest(undefined), undefined);
  });
});
