// Expanded books in the plugin: expanding, locating, importing onto them,
// copying, refreshing their notes and their render state.

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { copyBlueprintString } from "../../src/commands/copy-blueprint.ts";
import { copyLiveLink } from "../../src/commands/copy-link.ts";
import { expandBookIntoFolders } from "../../src/commands/expand-book.ts";
import { locate, vaultReader } from "../../src/commands/expanded.ts";
import { findBlueprintFolders, refreshAllGeneratedBlocks } from "../../src/commands/generated-notes.ts";
import { importFromClipboard } from "../../src/commands/import-blueprint.ts";
import { folderRenderState, foldersNeedingRender } from "../../src/commands/render-status.ts";
import {
  applyGeneratedBlock,
  assembleBook,
  blueprintHash,
  decodeBlueprintString,
  encodeBlueprintString,
  expandedBlockLines,
  findGeneratedBlock,
  readFrontmatter,
  writeCanonicalJson,
  writeCompactSortedJson,
  BLUEPRINTS_ROOT,
} from "../../src/core/index.ts";
import { BASE, fakeHost, fixture } from "./helpers.ts";
import type { FakeOptions } from "./helpers.ts";

const BOOK = decodeBlueprintString(fixture("book-nested.txt")).value as { blueprint_book: { blueprints: Record<string, unknown>[] } };
const R = "blueprints/cat/mil";
const NOTE = '---\ntitle: Military\nauthors: [abucnasty, yuu]\nversion: "3"\n---\n\nMy own notes about the book.\n';
const MANIFEST = JSON.stringify({
  schema: 1,
  rendered_at: "2026-11-01T00:00:00.000Z",
  entries: {
    "0": { file: "0.jpg", sha256: "h0", width: 10, height: 20 },
    "1/0": { file: "1/0.jpg", sha256: "h10", width: 30, height: 40 },
  },
});

/** A vault with book-nested.txt as an unexpanded book at cat/mil, with two renders. */
function bookVault(extra: Record<string, string> = {}, opts: FakeOptions = {}) {
  return fakeHost({
    files: {
      [`${R}/blueprint.json`]: writeCanonicalJson(BOOK),
      [`${R}/README.md`]: NOTE,
      [`${R}/renders/0.jpg`]: "jpeg 0",
      [`${R}/renders/1/0.jpg`]: "jpeg 1/0",
      [`${R}/renders/render.json`]: MANIFEST,
      ...extra,
    },
    ...opts,
  });
}

async function expanded(opts: FakeOptions = {}) {
  const host = bookVault({}, opts);
  const out = await expandBookIntoFolders(host, R);
  assert.equal(out.action, "expanded");
  host.notices.length = 0;
  host.commits.length = 0;
  host.confirms.length = 0;
  return host;
}

const tree = (host: ReturnType<typeof fakeHost>) => [...host.vault.keys()].filter((k) => k.startsWith(R + "/")).sort();
const sorted = (v: unknown) => writeCompactSortedJson(v);

describe("expand book into folders", () => {
  test("writes book.json and a slot folder per entry, all the way down, with notes", async () => {
    const host = bookVault();
    const out = await expandBookIntoFolders(host, `${R}/renders`);
    assert.deepStrictEqual(out, { action: "expanded", folder: R, folders: 5, renders: 2 });
    assert.deepStrictEqual(tree(host), [
      `${R}/0-concrete-pad/README.md`,
      `${R}/0-concrete-pad/blueprint.json`,
      `${R}/0-concrete-pad/renders/0.jpg`,
      `${R}/0-concrete-pad/renders/render.json`,
      `${R}/1-inner-book/0-wired-lamps/README.md`,
      `${R}/1-inner-book/0-wired-lamps/blueprint.json`,
      `${R}/1-inner-book/0-wired-lamps/renders/0.jpg`,
      `${R}/1-inner-book/0-wired-lamps/renders/render.json`,
      `${R}/1-inner-book/1-trees-only/README.md`,
      `${R}/1-inner-book/1-trees-only/blueprint.json`,
      `${R}/1-inner-book/README.md`,
      `${R}/1-inner-book/book.json`,
      `${R}/2-belts-to-turbo/README.md`,
      `${R}/2-belts-to-turbo/blueprint.json`,
      `${R}/README.md`,
      `${R}/book.json`,
    ]);
    // Same value, so the same strings as before.
    assert.equal(sorted(await assembleBook(R, vaultReader(host))), sorted(BOOK));
    assert.equal(host.vault.get(`${R}/1-inner-book/0-wired-lamps/renders/0.jpg`), "jpeg 1/0");
    assert.deepStrictEqual(JSON.parse(host.vault.get(`${R}/1-inner-book/0-wired-lamps/renders/render.json`)!), {
      schema: 1,
      rendered_at: "2026-11-01T00:00:00.000Z",
      entries: { "0": { file: "0.jpg", sha256: "h10", width: 30, height: 40 } },
    });
    // Notes: titles from labels, authors from the book's note; the book's note keeps its text.
    const leafNote = host.vault.get(`${R}/1-inner-book/1-trees-only/README.md`)!;
    assert.equal(readFrontmatter(leafNote)["title"], "Trees only");
    assert.deepStrictEqual(readFrontmatter(leafNote)["authors"], ["abucnasty", "yuu"]);
    const rootNote = host.vault.get(`${R}/README.md`)!;
    assert.ok(rootNote.startsWith('---\ntitle: Military\nauthors: [abucnasty, yuu]\nversion: "3"\n'));
    assert.ok(rootNote.endsWith("\n\nMy own notes about the book.\n"));
    assert.ok(rootNote.includes(`![Military](${BASE}/${R}/cover.jpg)\n\n- [Concrete pad](./0-concrete-pad/README.md) ([string](${BASE}/${R}/0.txt))\n`));
    assert.ok(rootNote.includes(`  - [Wired lamps](./1-inner-book/0-wired-lamps/README.md) ([string](${BASE}/${R}/1/0.txt))\n`));
    assert.ok(host.vault.get(`${R}/1-inner-book/README.md`)!.includes(`![Inner book](${BASE}/${R}/renders/1/0.jpg)`));
    assert.ok(host.vault.get(`${R}/0-concrete-pad/README.md`)!.includes(`![Concrete pad](${BASE}/${R}/renders/0.jpg)`));
    // One commit of the book, the owner's message.
    assert.deepStrictEqual(host.commits, [{ folder: R, message: "expand Military into folders" }]);
    assert.match(host.confirms[0]!.lines[0]!, /4 blueprint folders and 1 nested book/);
    assert.match(host.confirms[0]!.lines[1]!, /2 render images move/);
  });

  test("duplicate slots are listed before anything is written; cancel writes nothing", async () => {
    const dup = structuredClone(BOOK);
    dup.blueprint_book.blueprints.push({ index: 0, blueprint: { item: "blueprint", label: "Second zero", entities: [] } });
    const host = fakeHost({ files: { [`${R}/blueprint.json`]: writeCanonicalJson(dup), [`${R}/README.md`]: NOTE }, confirm: () => false });
    const before = new Map(host.vault);
    assert.deepStrictEqual(await expandBookIntoFolders(host, R), { action: "cancelled" });
    assert.deepStrictEqual(host.vault, before);
    assert.ok(host.confirms[0]!.lines.includes("- slot 0: Second zero"));
  });

  test("refuses anything that is not an unexpanded book", async () => {
    const single = fakeHost({ files: { "blueprints/a/b/blueprint.json": writeCanonicalJson(decodeBlueprintString(fixture("tiles.txt")).value) } });
    assert.equal((await expandBookIntoFolders(single, "blueprints/a/b")).action, "rejected");
    assert.match(single.notices[0]!.message, /holds a blueprint, not a book/);
    const host = await expanded();
    assert.equal((await expandBookIntoFolders(host, R)).action, "rejected");
    assert.match(host.notices[0]!.message, /already an expanded book/);
    assert.equal((await expandBookIntoFolders(fakeHost({ files: { "x/n.md": "" } }), "x")).action, "rejected");
  });
});

describe("finding the folder", () => {
  test("leaves, nested books and the root know their root book and slot path", async () => {
    const host = await expanded();
    assert.deepStrictEqual(await locate(host, `${R}/1-inner-book/0-wired-lamps/renders`), {
      folder: `${R}/1-inner-book/0-wired-lamps`,
      kind: "blueprint",
      root: R,
      slots: [1, 0],
    });
    assert.deepStrictEqual(await locate(host, `${R}/1-inner-book`), { folder: `${R}/1-inner-book`, kind: "book", root: R, slots: [1] });
    assert.deepStrictEqual(await locate(host, R), { folder: R, kind: "book", root: R, slots: [] });
    assert.equal(await locate(host, "blueprints/cat"), undefined);
  });

  test("lists: an expanded book is one item, its slot folders only with slotFolders", async () => {
    const host = await expanded();
    assert.deepStrictEqual(await findBlueprintFolders(host), [R]);
    assert.equal((await findBlueprintFolders(host, BLUEPRINTS_ROOT, { slotFolders: true })).length, 6);
  });
});

describe("copy from an expanded book", () => {
  test("string: the leaf, the nested book or the whole book, assembled", async () => {
    const host = await expanded();
    await copyBlueprintString(host, R);
    assert.equal(sorted(decodeBlueprintString(host.clipboardText).value), sorted(BOOK));
    await copyBlueprintString(host, `${R}/1-inner-book`);
    assert.equal(sorted(decodeBlueprintString(host.clipboardText).value), sorted({ blueprint_book: BOOK.blueprint_book.blueprints[1]!["blueprint_book"] }));
    await copyBlueprintString(host, `${R}/2-belts-to-turbo`);
    assert.ok("upgrade_planner" in (decodeBlueprintString(host.clipboardText).value as object));
  });

  test("link: addressed by slots from the root book", async () => {
    const leaf = await expanded();
    await copyLiveLink(leaf, `${R}/1-inner-book/0-wired-lamps`);
    assert.equal(leaf.clipboardText, `${BASE}/${R}/1/0.txt`);
    const nested = await expanded({ pick: () => 2 });
    await copyLiveLink(nested, `${R}/1-inner-book`);
    assert.equal(nested.picks[0]![0]!.label, "Whole book: Inner book");
    assert.equal(nested.clipboardText, `${BASE}/${R}/1/1.txt`);
  });
});

describe("importing onto an expanded book", () => {
  const withChanges = () => {
    const v = structuredClone(BOOK);
    const items = v.blueprint_book.blueprints;
    const pad = items[0]!;
    const inner = (items[1]!["blueprint_book"] as { blueprints: Record<string, unknown>[] }).blueprints;
    // slot 0 changes content and label; the wired lamps move from 1/0 to 5; 1/1 is gone; 2 stays.
    (pad["blueprint"] as Record<string, unknown>)["label"] = "Bigger pad";
    ((pad["blueprint"] as Record<string, unknown>)["entities"] as unknown[]).push({ entity_number: 2, name: "steel-chest", position: { x: 0.5, y: 0.5 } });
    items.push({ ...inner[0]!, index: 5 });
    inner.splice(0, 2);
    return v;
  };

  test("the same book again changes nothing", async () => {
    const host = await expanded({ clipboard: fixture("book-nested.txt") });
    const before = new Map(host.vault);
    const out = await importFromClipboard(host, R);
    assert.deepStrictEqual(out, { action: "expanded-book", result: { action: "unchanged", folder: R } });
    assert.deepStrictEqual(host.vault, before);
    assert.equal(host.confirms.length, 0);
  });

  test("changed, moved, new and removed slots, after one confirmation", async () => {
    const host = await expanded();
    host.clipboardText = encodeBlueprintString(withChanges());
    const out = await importFromClipboard(host, `${R}/1-inner-book`.replace("/1-inner-book", ""));
    assert.deepStrictEqual(out, {
      action: "expanded-book",
      result: { action: "updated", folder: R, counts: { unchanged: 2, changed: 1, moved: 1, new: 0, removed: 1 } },
    });
    const lines = host.confirms[0]!.lines;
    assert.ok(lines.includes("- slot 0: Bigger pad"));
    assert.ok(lines.includes("- slot 1/0 → 5: Wired lamps"));
    assert.ok(lines.includes("- slot 1/1: Trees only"));
    // In place with the folder renamed after the new label; the note stays.
    assert.ok(host.vault.has(`${R}/0-bigger-pad/blueprint.json`) && !host.vault.has(`${R}/0-concrete-pad/blueprint.json`));
    assert.equal(readFrontmatter(host.vault.get(`${R}/0-bigger-pad/README.md`)!)["title"], "Concrete pad");
    // Moved with its note and render.
    assert.equal(host.vault.get(`${R}/5-wired-lamps/renders/0.jpg`), "jpeg 1/0");
    assert.ok(!host.vault.has(`${R}/1-inner-book/0-wired-lamps/blueprint.json`));
    assert.ok(!host.vault.has(`${R}/1-inner-book/1-trees-only/blueprint.json`));
    assert.ok(![...host.vault.keys()].some((k) => k.includes(".moving")));
    assert.equal(sorted(await assembleBook(R, vaultReader(host))), sorted(withChanges()).replace(/,\{"index":1,"blueprint_book"/, (m) => m));
    assert.deepStrictEqual(host.commits, [{ folder: R, message: "update Military" }]);
  });

  test("a nested book that changed slot keeps its note; its entries move with theirs", async () => {
    const host = await expanded();
    const innerNote = `${R}/1-inner-book/README.md`;
    host.vault.set(innerNote, host.vault.get(innerNote)!.replace(/\n$/, "\nWhat I wrote about the inner book.\n"));
    const kept = host.vault.get(innerNote)!;
    const v = structuredClone(BOOK);
    v.blueprint_book.blueprints[1]!["index"] = 4;
    host.clipboardText = encodeBlueprintString(v);
    const out = await importFromClipboard(host, R);
    assert.deepStrictEqual(out, {
      action: "expanded-book",
      result: { action: "updated", folder: R, counts: { unchanged: 2, changed: 0, moved: 3, new: 0, removed: 0 } },
    });
    const lines = host.confirms[0]!.lines;
    assert.ok(lines.some((l) => l.startsWith("- slot 1 → 4: Inner book (book;")));
    assert.ok(!lines.includes("New:") && !lines.some((l) => l.startsWith("Removed")));
    assert.ok(!host.vault.has(innerNote));
    assert.ok(host.vault.get(`${R}/4-inner-book/README.md`)!.endsWith("What I wrote about the inner book.\n"));
    assert.equal(host.vault.get(`${R}/4-inner-book/README.md`)!.split("\n---\n")[1]!.trim().length > 0, kept.length > 0);
    assert.equal(host.vault.get(`${R}/4-inner-book/0-wired-lamps/renders/0.jpg`), "jpeg 1/0");
  });

  test("expanding copies posted from the book's note", async () => {
    const host = bookVault({ [`${R}/README.md`]: NOTE.replace('version: "3"\n', 'version: "3"\nposted: 2025-01-02\n') });
    await expandBookIntoFolders(host, R);
    assert.equal(readFrontmatter(host.vault.get(`${R}/0-concrete-pad/README.md`)!)["posted"], "2025-01-02");
  });

  test("a new slot is created; a declined confirmation writes nothing", async () => {
    const v = structuredClone(BOOK);
    v.blueprint_book.blueprints.push({ index: 7, deconstruction_planner: { item: "deconstruction-planner", label: "Rocks" } });
    const answer = { ok: true };
    const host = await expanded({ clipboard: encodeBlueprintString(v), confirm: () => answer.ok });
    answer.ok = false;
    const before = new Map(host.vault);
    assert.equal((await importFromClipboard(host, R)).action, "expanded-book");
    assert.deepStrictEqual(host.vault, before);
    const yes = await expanded({ clipboard: encodeBlueprintString(v) });
    await importFromClipboard(yes, R);
    assert.ok(yes.vault.has(`${R}/7-rocks/blueprint.json`));
    assert.equal(readFrontmatter(yes.vault.get(`${R}/7-rocks/README.md`)!)["title"], "Rocks");
    assert.equal("status" in readFrontmatter(yes.vault.get(`${R}/7-rocks/README.md`)!), false, "an entry note has no status");
  });

  test("status: only the root note has one; expanding and updating never add one to entry notes or change the root's", async () => {
    const host = bookVault({ [`${R}/README.md`]: NOTE.replace("---\n\n", "status: public\n---\n\n") });
    await expandBookIntoFolders(host, R);
    const v = structuredClone(BOOK);
    v.blueprint_book.blueprints.push({ index: 7, blueprint: { item: "blueprint", label: "New one", entities: [] } });
    host.clipboardText = encodeBlueprintString(v);
    await importFromClipboard(host, R);
    assert.ok(host.vault.has(`${R}/7-new-one/README.md`));
    const notes = [...host.vault.keys()].filter((k) => k.startsWith(R + "/") && k.endsWith("/README.md"));
    assert.ok(notes.length > 5);
    for (const n of notes) {
      const fm = readFrontmatter(host.vault.get(n)!);
      if (n === `${R}/README.md`) assert.equal(fm["status"], "public");
      else assert.equal("status" in fm, false, n);
    }
  });

  test("a book pasted from the category folder finds the expanded book by its slug", async () => {
    const host = await expanded({ clipboard: fixture("book-nested.txt") });
    await importFromClipboard(host, "blueprints/cat");
    // The slug of the book's label is not "mil", so this one is created as a new, unexpanded book.
    assert.ok(host.vault.has("blueprints/cat/military-science-pack-240-v3/blueprint.json"));
    const named = await expanded({ clipboard: fixture("book-nested.txt") });
    named.vault.set("blueprints/cat/military-science-pack-240-v3/book.json", named.vault.get(`${R}/book.json`)!);
    named.folders.add("blueprints/cat/military-science-pack-240-v3");
    const out = await importFromClipboard(named, "blueprints/cat");
    assert.equal(out.action, "expanded-book");
  });

  test("a single blueprint onto a leaf updates it and renames it after its label", async () => {
    const lamps = decodeBlueprintString(fixture("non-ascii-label.txt")).value;
    const host = await expanded({ clipboard: encodeBlueprintString(lamps) });
    const out = await importFromClipboard(host, `${R}/1-inner-book/0-wired-lamps`);
    assert.equal(out.action, "updated");
    assert.ok(host.vault.has(`${R}/1-inner-book/0-fussganger-brucke/blueprint.json`));
    assert.ok(host.vault.get(`${R}/README.md`)!.includes("./1-inner-book/0-fussganger-brucke/README.md"));
    assert.deepStrictEqual(host.commits, [{ folder: R, message: "update Wired lamps" }]);
  });

  test("a single blueprint onto an expanded book is added after the highest slot", async () => {
    const host = await expanded({ clipboard: fixture("tiles.txt") });
    const out = await importFromClipboard(host, `${R}/1-inner-book`);
    assert.deepStrictEqual(out, { action: "expanded-book", result: { action: "added", folder: `${R}/1-inner-book`, slot: 2 } });
    assert.ok(host.vault.has(`${R}/1-inner-book/2-concrete-pad/blueprint.json`));
    assert.deepStrictEqual(host.commits, [{ folder: R, message: "add Concrete pad to Inner book" }]);
  });

  test("a book imported as new stays one blueprint.json", async () => {
    const host = fakeHost({ clipboard: fixture("book-nested.txt") });
    await importFromClipboard(host, "blueprints/cat");
    assert.ok(host.vault.has("blueprints/cat/military-science-pack-240-v3/blueprint.json"));
    assert.ok(!host.vault.has("blueprints/cat/military-science-pack-240-v3/book.json"));
  });
});

describe("refresh and render state", () => {
  test("refresh renames a slot folder whose label was edited by hand, then refreshes the notes", async () => {
    const host = await expanded();
    const path = `${R}/2-belts-to-turbo/blueprint.json`;
    host.vault.set(path, host.vault.get(path)!.replace('"Belts to turbo"', '"All belts to turbo"'));
    await refreshAllGeneratedBlocks(host);
    assert.ok(host.vault.has(`${R}/2-all-belts-to-turbo/blueprint.json`));
    assert.ok(host.vault.get(`${R}/README.md`)!.includes("[All belts to turbo](./2-all-belts-to-turbo/README.md)"));
    assert.match(host.notices[0]!.message, /1 slot folder renamed after its label/);
    await refreshAllGeneratedBlocks(host);
    assert.match(host.notices[1]!.message, /^Generated content: 0 notes changed/);
  });

  test("an expanded book is the sum of its leaves, listed once", async () => {
    const host = await expanded();
    const state = await folderRenderState(host, R);
    assert.deepStrictEqual(state.entries.map((e) => [e.path, e.state]), [
      ["0", "outdated"],
      ["1/0", "outdated"],
    ]);
    const lamps = host.vault.get(`${R}/1-inner-book/0-wired-lamps/blueprint.json`)!;
    const hash = blueprintHash((JSON.parse(lamps) as { blueprint: unknown }).blueprint);
    host.vault.set(`${R}/1-inner-book/0-wired-lamps/renders/render.json`, JSON.stringify({ schema: 1, rendered_at: "t", entries: { "0": { file: "0.jpg", sha256: hash } } }));
    assert.deepStrictEqual((await folderRenderState(host, R)).entries.map((e) => e.state), ["outdated", "current"]);
    assert.deepStrictEqual((await foldersNeedingRender(host)).map((f) => f.folder), [R]);
  });
});

describe("the block of notes inside an expanded book", () => {
  test("book and leaf forms, recognised and replaced", () => {
    const lines = expandedBlockLines({
      base: BASE,
      root: "a/b",
      title: "T [1]",
      cover: `${BASE}/a/b/renders/3/1.jpg`,
      nodes: [{ slots: [3], kind: "blueprint-book", title: "Odd (name)", relativeFolder: "3-odd name", children: [{ slots: [3, 1], kind: "blueprint", title: "x", relativeFolder: "3-odd name/1-x", children: [] }] }],
    })!;
    assert.deepStrictEqual(lines, [
      `![T \\[1\\]](${BASE}/a/b/renders/3/1.jpg)`,
      "",
      `- [Odd (name)](./3-odd%20name/README.md) ([book](${BASE}/a/b/3.txt))`,
      `  - [x](./3-odd%20name/1-x/README.md) ([string](${BASE}/a/b/3/1.txt))`,
    ]);
    const body = `\n${lines.join("\n")}\n\nMine.\n`;
    assert.deepStrictEqual(findGeneratedBlock(body), { start: 1, end: body.length - "\nMine.\n".length });
    assert.equal(applyGeneratedBlock(`---\nt: 1\n---\n${body}`, ["- [n](https://x.example/a.txt)"]).text, "---\nt: 1\n---\n\n- [n](https://x.example/a.txt)\n\nMine.\n");
    assert.deepStrictEqual(expandedBlockLines({ base: BASE, root: "a", title: "L", cover: undefined, nodes: [] }), undefined);
  });
});
