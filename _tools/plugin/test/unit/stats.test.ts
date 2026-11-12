import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { applyStatsToNote, blueprintStats, decodeBlueprintString, encodeFactorioVersion, readFrontmatter } from "../../src/core/index.ts";
import { fixture } from "./fixtures.ts";

const V = encodeFactorioVersion("2.1.24");
const bp = (entities: number, tiles = 0, version: number | null = V) => ({
  blueprint: {
    item: "blueprint",
    entities: Array.from({ length: entities }, (_, i) => ({ entity_number: i + 1, name: "x" })),
    ...(tiles > 0 ? { tiles: Array.from({ length: tiles }, (_, i) => ({ name: "concrete", position: { x: i, y: 0 } })) } : {}),
    ...(version !== null ? { version } : {}),
  },
});
const book = (entries: object[]) => ({ blueprint_book: { item: "blueprint-book", blueprints: entries.map((e, index) => ({ index, ...e })), version: V } });

describe("blueprint stats", () => {
  test("single blueprint; zero tiles omitted; entities kept at 0", () => {
    assert.deepStrictEqual(blueprintStats(bp(12, 3)), { entities: 12, tiles: 3, factorio_version: "2.1.24" });
    assert.deepStrictEqual(blueprintStats(bp(12)), { entities: 12, factorio_version: "2.1.24" });
    assert.deepStrictEqual(blueprintStats(bp(0, 4, null)), { entities: 0, tiles: 4 });
  });

  test("flat book: totals and blueprint count", () => {
    assert.deepStrictEqual(blueprintStats(book([bp(2, 1), bp(3)])), { entities: 5, tiles: 1, blueprints: 2, factorio_version: "2.1.24" });
  });

  test("nested books are summed at every depth; planners count for nothing", () => {
    const nested = book([bp(1), book([bp(10, 5), book([bp(100)]), { upgrade_planner: { item: "upgrade-planner" } }])]);
    assert.deepStrictEqual(blueprintStats(nested), { entities: 111, tiles: 5, blueprints: 3, factorio_version: "2.1.24" });
    assert.deepStrictEqual(blueprintStats(decodeBlueprintString(fixture("book-nested.txt")).value), {
      entities: 5,
      tiles: 9,
      blueprints: 2,
      factorio_version: "2.0.76",
    });
  });

  test("planners get only the version", () => {
    assert.deepStrictEqual(blueprintStats({ upgrade_planner: { item: "upgrade-planner", version: V } }), { factorio_version: "2.1.24" });
    assert.deepStrictEqual(blueprintStats({ deconstruction_planner: {} }), {});
    assert.deepStrictEqual(blueprintStats(book([])), { entities: 0, blueprints: 0, factorio_version: "2.1.24" });
  });
});

describe("stats in the frontmatter", () => {
  const NOTE = '---\ntitle: Mall\n# comment\nentities: 3\ncustom: [a]\nversion: "2"\n---\n\nBody.\n';

  test("adds new keys after the existing ones, in order, quoting the version", () => {
    const out = applyStatsToNote('---\ntitle: Mall\ncustom: x\n---\n\nBody.\n', { entities: 1, tiles: 2, blueprints: 3, factorio_version: "2.1.24" });
    assert.equal(out, '---\ntitle: Mall\ncustom: x\nentities: 1\ntiles: 2\nblueprints: 3\nfactorio_version: "2.1.24"\n---\n\nBody.\n');
    assert.equal(readFrontmatter(out)["factorio_version"], "2.1.24");
  });

  test("updates in place, keeps unknown keys and comments, removes stale keys", () => {
    const withBook = applyStatsToNote(NOTE, { entities: 7, blueprints: 2 });
    assert.equal(withBook, '---\ntitle: Mall\n# comment\nentities: 7\ncustom: [a]\nversion: "2"\nblueprints: 2\n---\n\nBody.\n');
    const single = applyStatsToNote(withBook, { entities: 7, factorio_version: "2.0.76" });
    assert.equal(single, '---\ntitle: Mall\n# comment\nentities: 7\ncustom: [a]\nversion: "2"\nfactorio_version: "2.0.76"\n---\n\nBody.\n');
  });

  test("the same stats twice change nothing, and right values are not rewritten", () => {
    const once = applyStatsToNote(NOTE, { entities: 3, tiles: 1 });
    assert.equal(applyStatsToNote(once, { entities: 3, tiles: 1 }), once);
    const handFormatted = '---\nentities:   3   # mine\n---\n';
    assert.equal(applyStatsToNote(handFormatted, { entities: 3 }), handFormatted);
  });

  test("CRLF stays CRLF; a note without frontmatter gets one", () => {
    const crlf = NOTE.replace(/\n/g, "\r\n");
    const out = applyStatsToNote(crlf, { entities: 4, tiles: 2 });
    assert.ok(!/[^\r]\n/.test(out));
    assert.deepStrictEqual([readFrontmatter(out)["entities"], readFrontmatter(out)["tiles"]], [4, 2]);
    assert.equal(applyStatsToNote("Body.\n", { entities: 1 }), "---\nentities: 1\n---\nBody.\n");
  });
});
