import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { copyLiveLink } from "../../src/commands/copy-link.ts";
import { findBlueprintFolders, refreshAllGeneratedBlocks, refreshGeneratedBlock } from "../../src/commands/generated-notes.ts";
import { decodeBlueprintString, writeCanonicalJson } from "../../src/core/index.ts";

const BLOCK_START = "<!-- blueprint:generated:start -->";
import { BASE, fakeHost, fixture } from "./helpers.ts";

const json = (name: string) => writeCanonicalJson(decodeBlueprintString(fixture(name)).value);
const FILES = {
  "cat/book/blueprint.json": json("book-nested.txt"),
  "cat/book/README.md": "---\ntitle: The Book\n---\n\nMine.\n",
  "cat/single/blueprint.json": json("tiles.txt"),
  "cat/single/README.md": "---\ntitle: Pad\n---\n",
  "cat/rendered/blueprint.json": json("wires-2.0.txt"),
  "cat/rendered/README.md": "---\ntitle: Lamps\n---\n",
  "cat/rendered/renders/0.jpg": "jpg",
  "cat/nonotes/blueprint.json": json("tiles.txt"),
  "cat/broken/blueprint.json": json("book-nested.txt"),
  "cat/broken/README.md": `---\ntitle: B\n---\n${BLOCK_START}\n`,
  "_tools/x/blueprint.json": "{}",
  ".hidden/y/blueprint.json": "{}",
  "notes/plain.md": "x",
};

describe("copy live link", () => {
  test("a single blueprint copies the folder link without asking", async () => {
    const host = fakeHost({ files: FILES });
    const out = await copyLiveLink(host, "cat/single");
    assert.deepStrictEqual(out, { action: "copied", folder: "cat/single", url: `${BASE}/cat/single.txt` });
    assert.equal(host.clipboardText, `${BASE}/cat/single.txt`);
    assert.equal(host.picks.length, 0);
    assert.match(host.notices[0]!.message, /^Copied the live link to blueprint cat\/single: https/);
  });

  test("a book offers the root first, then every entry", async () => {
    const host = fakeHost({ files: FILES, pick: () => 4 });
    const out = await copyLiveLink(host, "cat/book/renders");
    const items = host.picks[0]!;
    assert.equal(items[0]!.label, "Whole book: Military Science Pack (240/s) V3");
    assert.deepStrictEqual(items.map((i) => i.detail?.split(" · ")[0]), [
      "slot path: none (the root)",
      "slot 0",
      "slot 1",
      "slot 1/0",
      "slot 1/1",
      "slot 2",
    ]);
    assert.deepStrictEqual(out, { action: "copied", folder: "cat/book", url: `${BASE}/cat/book/1/1.txt` });
    assert.match(host.notices[0]!.message, /"Trees only" \(slot 1\/1\) of cat\/book/);
  });

  test("root choice, cancel, custom base, and outside a folder", async () => {
    const root = fakeHost({ files: FILES, pick: () => 0, settings: { linkBase: "https://example.test/" } });
    assert.equal((await copyLiveLink(root, "cat/book")).action, "copied");
    assert.equal(root.clipboardText, "https://example.test/cat/book.txt");
    const cancel = fakeHost({ files: FILES, pick: () => undefined, clipboard: "keep" });
    assert.deepStrictEqual(await copyLiveLink(cancel, "cat/book"), { action: "cancelled" });
    assert.equal(cancel.clipboardText, "keep");
    const outside = fakeHost({ files: FILES });
    assert.equal((await copyLiveLink(outside, "notes")).action, "rejected");
  });
});

describe("refresh generated content", () => {
  test("finds blueprint folders, skipping _ and . folders", async () => {
    assert.deepStrictEqual(await findBlueprintFolders(fakeHost({ files: FILES })), [
      "cat/book",
      "cat/broken",
      "cat/nonotes",
      "cat/rendered",
      "cat/single",
    ]);
  });

  test("all notes: writes blocks, reports counts, commits nothing; second run changes nothing", async () => {
    const host = fakeHost({ files: FILES });
    const results = await refreshAllGeneratedBlocks(host);
    assert.deepStrictEqual(
      results.map((r) => [r.folder, r.status]),
      [
        ["cat/book", "changed"],
        ["cat/broken", "skipped"],
        ["cat/nonotes", "skipped"],
        ["cat/rendered", "changed"],
        ["cat/single", "changed"],
      ],
    );
    assert.match(host.notices[0]!.message, /^Generated content: 3 notes changed, 0 already current, 2 skipped\. Not committed/);
    assert.match(host.notices[0]!.message, /Skipped cat\/broken: This note has an incomplete or repeated/);
    assert.equal(host.commits.length, 0);
    assert.equal(
      host.vault.get("cat/rendered/README.md"),
      `---\ntitle: Lamps\nentities: 4\nfactorio_version: "2.0.76"\n---\n\n![Lamps](${BASE}/cat/rendered/cover.jpg)\n`,
    );
    assert.ok(host.vault.get("cat/book/README.md")!.endsWith(`/cat/book/2.txt)\n\nMine.\n`));
    assert.ok(host.vault.get("cat/book/README.md")!.startsWith('---\ntitle: The Book\nentities: 5\ntiles: 9\nblueprints: 2\nfactorio_version: "2.0.76"\n---\n'));
    assert.equal(host.vault.get("cat/single/README.md"), "---\ntitle: Pad\nentities: 1\ntiles: 9\nfactorio_version: \"2.0.76\"\n---\n");
    assert.equal(host.vault.get("cat/broken/README.md"), FILES["cat/broken/README.md"]);

    const again = await refreshAllGeneratedBlocks(host);
    assert.ok(again.every((r) => r.status !== "changed"));
    assert.match(host.notices[1]!.message, /^Generated content: 0 notes changed, 3 already current, 2 skipped\./);
  });

  test("renders removed: the cover line goes, and an empty block goes entirely", async () => {
    const host = fakeHost({ files: FILES });
    await refreshGeneratedBlock(host, "cat/rendered");
    host.vault.delete("cat/rendered/renders/0.jpg");
    host.folders.delete("cat/rendered/renders");
    assert.deepStrictEqual(await refreshGeneratedBlock(host, "cat/rendered"), { status: "changed", folder: "cat/rendered" });
    assert.equal(host.vault.get("cat/rendered/README.md"), '---\ntitle: Lamps\nentities: 4\nfactorio_version: "2.0.76"\n---\n');
  });
});
