import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { copyLiveLink } from "../../src/commands/copy-link.ts";
import { findBlueprintFolders, refreshAllGeneratedBlocks, refreshGeneratedBlock } from "../../src/commands/generated-notes.ts";
import { decodeBlueprintString, writeCanonicalJson } from "../../src/core/index.ts";

const BLOCK_START = "<!-- blueprint:generated:start -->";
import { BASE, fakeHost, fixture } from "./helpers.ts";

const json = (name: string) => writeCanonicalJson(decodeBlueprintString(fixture(name)).value);
const FILES = {
  "blueprints/cat/book/blueprint.json": json("book-nested.txt"),
  "blueprints/cat/book/README.md": "---\ntitle: The Book\n---\n\nMine.\n",
  "blueprints/cat/single/blueprint.json": json("tiles.txt"),
  "blueprints/cat/single/README.md": "---\ntitle: Pad\n---\n",
  "blueprints/cat/rendered/blueprint.json": json("wires-2.0.txt"),
  "blueprints/cat/rendered/README.md": "---\ntitle: Lamps\n---\n",
  "blueprints/cat/rendered/renders/0.jpg": "jpg",
  "blueprints/cat/nonotes/blueprint.json": json("tiles.txt"),
  "blueprints/cat/broken/blueprint.json": json("book-nested.txt"),
  "blueprints/cat/broken/README.md": `---\ntitle: B\n---\n${BLOCK_START}\n`,
  "_tools/x/blueprint.json": "{}",
  ".hidden/y/blueprint.json": "{}",
  "blueprints/_drafts/z/blueprint.json": "{}",
  "blog/post/blueprint.json": "{}",
  "notes/plain.md": "x",
};

describe("copy live link", () => {
  test("a single blueprint copies the folder link without asking", async () => {
    const host = fakeHost({ files: FILES });
    const out = await copyLiveLink(host, "blueprints/cat/single");
    assert.deepStrictEqual(out, { action: "copied", folder: "blueprints/cat/single", url: `${BASE}/blueprints/cat/single.txt` });
    assert.equal(host.clipboardText, `${BASE}/blueprints/cat/single.txt`);
    assert.equal(host.picks.length, 0);
    assert.match(host.notices[0]!.message, /^Copied the live link to blueprint blueprints\/cat\/single: https/);
  });

  test("a book offers the root first, then every entry", async () => {
    const host = fakeHost({ files: FILES, pick: () => 4 });
    const out = await copyLiveLink(host, "blueprints/cat/book/renders");
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
    assert.deepStrictEqual(out, { action: "copied", folder: "blueprints/cat/book", url: `${BASE}/blueprints/cat/book/1/1.txt` });
    assert.match(host.notices[0]!.message, /"Trees only" \(slot 1\/1\) of blueprints\/cat\/book/);
  });

  test("root choice, cancel, custom base, and outside a folder", async () => {
    const root = fakeHost({ files: FILES, pick: () => 0, settings: { linkBase: "https://example.test/" } });
    assert.equal((await copyLiveLink(root, "blueprints/cat/book")).action, "copied");
    assert.equal(root.clipboardText, "https://example.test/blueprints/cat/book.txt");
    const cancel = fakeHost({ files: FILES, pick: () => undefined, clipboard: "keep" });
    assert.deepStrictEqual(await copyLiveLink(cancel, "blueprints/cat/book"), { action: "cancelled" });
    assert.equal(cancel.clipboardText, "keep");
    const outside = fakeHost({ files: FILES });
    assert.equal((await copyLiveLink(outside, "notes")).action, "rejected");
  });
});

describe("refresh generated content", () => {
  test("finds blueprint folders under blueprints/ only, skipping _ and . folders", async () => {
    assert.equal(await copyLiveLink(fakeHost({ files: FILES }), "blog/post").then((o) => o.action), "rejected");
    assert.deepStrictEqual(await findBlueprintFolders(fakeHost({ files: FILES })), [
      "blueprints/cat/book",
      "blueprints/cat/broken",
      "blueprints/cat/nonotes",
      "blueprints/cat/rendered",
      "blueprints/cat/single",
    ]);
  });

  test("all notes: writes blocks, reports counts, commits nothing; second run changes nothing", async () => {
    const host = fakeHost({ files: FILES });
    const results = await refreshAllGeneratedBlocks(host);
    assert.deepStrictEqual(
      results.map((r) => [r.folder, r.status]),
      [
        ["blueprints/cat/book", "changed"],
        ["blueprints/cat/broken", "skipped"],
        ["blueprints/cat/nonotes", "skipped"],
        ["blueprints/cat/rendered", "changed"],
        ["blueprints/cat/single", "changed"],
      ],
    );
    assert.match(host.notices[0]!.message, /^Generated content: 3 notes changed, 0 already current, 2 skipped\. Not committed/);
    assert.match(host.notices[0]!.message, /Skipped blueprints\/cat\/broken: This note has an incomplete or repeated/);
    assert.equal(host.commits.length, 0);
    assert.equal(
      host.vault.get("blueprints/cat/rendered/README.md"),
      `---\ntitle: Lamps\nentities: 4\nfactorio_version: "2.0.76"\n---\n\n![Lamps](${BASE}/blueprints/cat/rendered/cover.jpg)\n`,
    );
    assert.ok(host.vault.get("blueprints/cat/book/README.md")!.endsWith(`/cat/book/2.txt)\n\nMine.\n`));
    assert.ok(host.vault.get("blueprints/cat/book/README.md")!.startsWith('---\ntitle: The Book\nentities: 5\ntiles: 9\nblueprints: 2\nfactorio_version: "2.0.76"\n---\n'));
    assert.equal(host.vault.get("blueprints/cat/single/README.md"), "---\ntitle: Pad\nentities: 1\ntiles: 9\nfactorio_version: \"2.0.76\"\n---\n");
    assert.equal(host.vault.get("blueprints/cat/broken/README.md"), FILES["blueprints/cat/broken/README.md"]);

    const again = await refreshAllGeneratedBlocks(host);
    assert.ok(again.every((r) => r.status !== "changed"));
    assert.match(host.notices[1]!.message, /^Generated content: 0 notes changed, 3 already current, 2 skipped\./);
  });

  test("renders removed: the cover line goes, and an empty block goes entirely", async () => {
    const host = fakeHost({ files: FILES });
    await refreshGeneratedBlock(host, "blueprints/cat/rendered");
    host.vault.delete("blueprints/cat/rendered/renders/0.jpg");
    host.folders.delete("blueprints/cat/rendered/renders");
    assert.deepStrictEqual(await refreshGeneratedBlock(host, "blueprints/cat/rendered"), { status: "changed", folder: "blueprints/cat/rendered" });
    assert.equal(host.vault.get("blueprints/cat/rendered/README.md"), '---\ntitle: Lamps\nentities: 4\nfactorio_version: "2.0.76"\n---\n');
  });
});
