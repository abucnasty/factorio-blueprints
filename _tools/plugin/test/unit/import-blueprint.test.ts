import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { chooseImportTarget, importFromClipboard } from "../../src/commands/import-blueprint.ts";
import {
  DEFAULT_NOTES_TEMPLATE,
  decodeBlueprintString,
  readNotesMeta,
  writeCanonicalJson,
} from "../../src/core/index.ts";
import { BASE, fakeHost, fixture } from "./helpers.ts";

const BOOK = fixture("book-nested.txt");
const BOOK_JSON = writeCanonicalJson(decodeBlueprintString(BOOK).value);
const TILES = fixture("tiles.txt");
const WIRES = fixture("wires-2.0.txt");

/** The generated block for book-nested.txt in a folder. */
function bookBlock(folder: string): string {
  const u = (slots: string) => `${BASE}/${folder}/${slots}.txt`;
  return [
    "<!-- blueprint:generated:start -->",
    `- [Concrete pad](${u("0")})`,
    `- Inner book ([book](${u("1")}))`,
    `  - [Wired lamps](${u("1/0")})`,
    `  - [Trees only](${u("1/1")})`,
    `- [Belts to turbo](${u("2")})`,
    "<!-- blueprint:generated:end -->",
  ].join("\n");
}
const TEMPLATE_PATH = "_tools/templates/blueprint-notes.md";
const EXISTING = {
  "megabasing/science/mall/blueprint.json": writeCanonicalJson(decodeBlueprintString(TILES).value),
  "megabasing/science/mall/README.md": '---\ntitle: Mall\nauthors: []\nversion: "3"\nextra: kept\n---\n\nMy notes.\n',
  "megabasing/science/mall/renders/notes.md": "x",
  "megabasing/science/other.md": "x",
  // A vault template the owner changed, to tell it from the built-in copy.
  [TEMPLATE_PATH]: DEFAULT_NOTES_TEMPLATE.replace("posted:\n", "posted:\nfrom_vault: true\n"),
};

describe("create or update", () => {
  test("decision", async () => {
    const host = fakeHost({ files: EXISTING });
    assert.deepStrictEqual(await chooseImportTarget(host, "megabasing/science/mall"), { mode: "update", folder: "megabasing/science/mall" });
    assert.deepStrictEqual(await chooseImportTarget(host, "megabasing/science/mall/renders"), { mode: "update", folder: "megabasing/science/mall" });
    assert.deepStrictEqual(await chooseImportTarget(host, "megabasing/science"), { mode: "create", parent: "megabasing/science" });
    assert.deepStrictEqual(await chooseImportTarget(host, ""), { mode: "create", parent: "" });
    assert.equal((await chooseImportTarget(host, "_tools/templates")).mode, "refuse");
    assert.equal((await chooseImportTarget(host, "megabasing/.hidden")).mode, "refuse");
  });

  test("a blueprint.json under an ignored folder does not count", async () => {
    const host = fakeHost({ files: { "_archive/old/blueprint.json": "{}" } });
    assert.equal((await chooseImportTarget(host, "_archive/old")).mode, "refuse");
  });
});

describe("import: create", () => {
  test("creates the folder, blueprint.json and notes, then commits", async () => {
    const host = fakeHost({ files: EXISTING, clipboard: BOOK });
    const out = await importFromClipboard(host, "megabasing/science");
    assert.deepStrictEqual(out, {
      action: "created",
      folder: "megabasing/science/military-science-pack-240-v3",
      git: { status: "pushed", commit: "abc1234" },
    });
    const prompt = host.createPrompts[0]!;
    assert.equal(prompt.title, "Military Science Pack (240/s) V3");
    assert.equal(prompt.slug, "military-science-pack-240-v3");
    assert.equal(prompt.parent, "megabasing/science");
    assert.ok(prompt.askChangeNote);
    assert.match(prompt.summary, /^blueprint book /);

    const folder = "megabasing/science/military-science-pack-240-v3";
    assert.equal(host.vault.get(`${folder}/blueprint.json`), BOOK_JSON);
    const notes = host.vault.get(`${folder}/README.md`)!;
    assert.equal(
      notes,
      '---\ntitle: Military Science Pack (240/s) V3\nauthors: [abucnasty]\nversion: "1"\nposted: 2026-11-12\nfrom_vault: true\n---\n\n' +
        bookBlock(folder) +
        "\n",
      "filled from the vault's template; the body is just the generated block",
    );
    assert.deepStrictEqual(readNotesMeta(notes), {
      title: "Military Science Pack (240/s) V3",
      authors: ["abucnasty"],
      version: "1",
      posted: "2026-11-12",
      deprecated: false,
      previous_paths: [],
    });
    assert.deepStrictEqual(host.commits, [{ folder, message: "add Military Science Pack (240/s) V3" }]);
    assert.deepStrictEqual(host.opened, [`${folder}/README.md`]);
    assert.match(host.notices.at(-1)!.message, /committed and pushed \(abc1234\)/);
  });

  test("uses the edited title, slug and change note; falls back to the built-in template", async () => {
    const files: Record<string, string> = { ...EXISTING };
    delete files[TEMPLATE_PATH];
    const host = fakeHost({
      files,
      clipboard: BOOK,
      create: () => ({ title: "  Military Science  ", slug: "military-science-240", changeNote: "  first\nversion " }),
    });
    const out = await importFromClipboard(host, "megabasing");
    assert.equal(out.action, "created");
    const notes = host.vault.get("megabasing/military-science-240/README.md")!;
    assert.equal(
      notes,
      '---\ntitle: Military Science\nauthors: [abucnasty]\nversion: "1"\nposted: 2026-11-12\n---\n\n' + bookBlock("megabasing/military-science-240") + "\n",
    );
    const single = fakeHost({ files, clipboard: WIRES });
    await importFromClipboard(single, "megabasing");
    assert.equal(
      single.vault.get("megabasing/wired-lamps/README.md"),
      '---\ntitle: Wired lamps\nauthors: [abucnasty]\nversion: "1"\nposted: 2026-11-12\n---\n',
      "a single blueprint without renders gets no block: the body stays empty",
    );
    assert.deepStrictEqual(host.commits, [{ folder: "megabasing/military-science-240", message: "first version" }]);
  });

  test("refuses to overwrite an existing folder", async () => {
    const host = fakeHost({ files: EXISTING, clipboard: BOOK, create: () => ({ title: "x", slug: "mall", changeNote: "" }) });
    const prompt = await importFromClipboard(host, "megabasing/science");
    assert.equal(prompt.action, "rejected");
    assert.match(host.notices.at(-1)!.message, /already exists/);
    assert.equal(host.commits.length, 0);
    assert.match((await host.createPrompts[0]!.checkSlug("mall")) ?? "", /megabasing\/science\/mall already exists/);
    assert.equal(await host.createPrompts[0]!.checkSlug("Bad Slug"), "Use lowercase letters, digits and single dashes only, for example military-science-240.");
    assert.equal(await host.createPrompts[0]!.checkSlug("fresh"), undefined);
  });

  test("cancel writes nothing", async () => {
    const host = fakeHost({ files: EXISTING, clipboard: BOOK, create: () => undefined });
    const before = new Map(host.vault);
    assert.deepStrictEqual(await importFromClipboard(host, "megabasing"), { action: "cancelled" });
    assert.deepStrictEqual(host.vault, before);
  });

  test("label-less blueprint gets a title from its kind", async () => {
    const host = fakeHost({ clipboard: fixture("single-blueprint.txt") });
    await importFromClipboard(host, "tests");
    assert.equal(host.createPrompts[0]!.title, "Blueprint");
    assert.equal(host.createPrompts[0]!.slug, "blueprint");
  });

  test("commit switched off", async () => {
    const host = fakeHost({ clipboard: BOOK, settings: { commitAfterImport: false } });
    const out = await importFromClipboard(host, "x");
    assert.equal(out.action, "created");
    assert.equal(host.createPrompts[0]!.askChangeNote, false);
    assert.equal(host.commits.length, 0);
    assert.match(host.notices.at(-1)!.message, /^Created x\/military-science-pack-240-v3 with blueprint book/);
  });
});

describe("import: update", () => {
  test("overwrites blueprint.json, bumps the version, leaves the notes body", async () => {
    const host = fakeHost({ files: EXISTING, clipboard: BOOK });
    const out = await importFromClipboard(host, "megabasing/science/mall");
    assert.equal(out.action, "updated");
    const p = host.updatePrompts[0]!;
    assert.equal(p.currentVersion, "3");
    assert.equal(p.suggestedVersion, "4");
    assert.equal(p.title, "Mall");
    assert.match(p.previousSummary ?? "", /^blueprint "Concrete pad"/);
    assert.equal(host.vault.get("megabasing/science/mall/blueprint.json"), BOOK_JSON);
    assert.equal(
      host.vault.get("megabasing/science/mall/README.md"),
      '---\ntitle: Mall\nauthors: []\nversion: "4"\nextra: kept\n---\n\n' + bookBlock("megabasing/science/mall") + "\n\nMy notes.\n",
      "version bumped, block added at the top of the body, notes kept",
    );
    assert.deepStrictEqual(host.commits, [{ folder: "megabasing/science/mall", message: "update Mall" }]);
  });

  test("keeping the version leaves README.md untouched (single blueprint, no renders: no block)", async () => {
    const host = fakeHost({ files: EXISTING, clipboard: WIRES, update: () => ({ newVersion: undefined, changeNote: "tweak belts" }) });
    await importFromClipboard(host, "megabasing/science/mall/renders");
    assert.equal(host.vault.get("megabasing/science/mall/README.md"), EXISTING["megabasing/science/mall/README.md"]);
    assert.deepStrictEqual(host.commits, [{ folder: "megabasing/science/mall", message: "tweak belts" }]);
  });

  const RICH_NOTE = [
    "---",
    "title: Mall",
    "authors: [abucnasty, yuu]",
    'version: "2.2"',
    "posted: 2026-03-10",
    "video: https://youtu.be/example",
    "factoriobin: https://factoriobin.com/post/90pg6z",
    "deprecated: true",
    "previous_paths: [old/mall]",
    "# kept comment",
    "custom: value",
    "---",
    "",
    "## How I use it",
    "",
    "Hand-written notes, kept as they are.",
    "",
  ].join("\n");

  test("optional keys and a hand-written body survive an update with a bump", async () => {
    const files = { ...EXISTING, "megabasing/science/mall/README.md": RICH_NOTE };
    const host = fakeHost({ files, clipboard: WIRES });
    await importFromClipboard(host, "megabasing/science/mall");
    assert.equal(host.updatePrompts[0]!.suggestedVersion, "2.3");
    assert.equal(host.vault.get("megabasing/science/mall/README.md"), RICH_NOTE.replace('version: "2.2"', 'version: "2.3"'));
  });

  test("a book update adds the block above a hand-written body and keeps everything else", async () => {
    const files = { ...EXISTING, "megabasing/science/mall/README.md": RICH_NOTE };
    const host = fakeHost({ files, clipboard: BOOK, update: () => ({ newVersion: undefined, changeNote: "" }) });
    await importFromClipboard(host, "megabasing/science/mall");
    const [fm, body] = RICH_NOTE.split("custom: value\n---\n");
    assert.equal(
      host.vault.get("megabasing/science/mall/README.md"),
      `${fm}custom: value\n---\n\n${bookBlock("megabasing/science/mall")}\n${body}`,
    );
    // Importing the same book into the note with its block again changes nothing.
    const again = fakeHost({
      files: { ...files, "megabasing/science/mall/README.md": host.vault.get("megabasing/science/mall/README.md")!, "megabasing/science/mall/blueprint.json": "{}" },
      clipboard: BOOK,
      update: () => ({ newVersion: undefined, changeNote: "" }),
    });
    await importFromClipboard(again, "megabasing/science/mall");
    assert.equal(again.vault.get("megabasing/science/mall/README.md"), host.vault.get("megabasing/science/mall/README.md"));
  });

  test("optional keys and a hand-written body survive an update without a bump", async () => {
    const files = { ...EXISTING, "megabasing/science/mall/README.md": RICH_NOTE };
    const host = fakeHost({ files, clipboard: WIRES, update: () => ({ newVersion: undefined, changeNote: "" }) });
    await importFromClipboard(host, "megabasing/science/mall");
    assert.equal(host.vault.get("megabasing/science/mall/README.md"), RICH_NOTE);
  });

  test("a note without a version key gets one when bumped", async () => {
    const note = "---\ntitle: Mall\nauthors: []\n---\n\nNotes.\n";
    const files = { ...EXISTING, "megabasing/science/mall/README.md": note };
    const host = fakeHost({ files, clipboard: WIRES });
    await importFromClipboard(host, "megabasing/science/mall");
    const p = host.updatePrompts[0]!;
    assert.equal(p.currentVersion, undefined);
    assert.equal(p.suggestedVersion, "2");
    assert.ok(p.canBumpVersion);
    assert.equal(host.vault.get("megabasing/science/mall/README.md"), '---\ntitle: Mall\nauthors: []\nversion: "2"\n---\n\nNotes.\n');
  });

  test("an empty-body note from the template is bumped in place", async () => {
    const note = '---\ntitle: Mall\nauthors: [abucnasty]\nversion: "1"\nposted: 2026-11-12\n---\n';
    const files = { ...EXISTING, "megabasing/science/mall/README.md": note };
    const host = fakeHost({ files, clipboard: WIRES });
    await importFromClipboard(host, "megabasing/science/mall");
    assert.equal(host.vault.get("megabasing/science/mall/README.md"), note.replace('"1"', '"2"'));
  });

  test("the same blueprint again changes nothing", async () => {
    const host = fakeHost({ files: EXISTING, clipboard: TILES });
    assert.deepStrictEqual(await importFromClipboard(host, "megabasing/science/mall"), {
      action: "unchanged",
      folder: "megabasing/science/mall",
    });
    assert.equal(host.updatePrompts.length, 0);
    assert.equal(host.commits.length, 0);
  });

  test("a folder without notes cannot bump a version", async () => {
    const host = fakeHost({ files: { "a/b/blueprint.json": "{}" }, clipboard: BOOK });
    await importFromClipboard(host, "a/b");
    assert.equal(host.updatePrompts[0]!.canBumpVersion, false);
    assert.equal(host.updatePrompts[0]!.previousSummary, undefined);
    assert.ok(!host.vault.has("a/b/README.md"));
    assert.deepStrictEqual(host.commits, [{ folder: "a/b", message: "update b" }]);
  });
});

describe("import: problems", () => {
  const cases: [string, string, RegExp][] = [
    ["empty clipboard", "", /clipboard is empty/],
    ["plain text", "remember to buy milk", /does not hold a blueprint string/],
    ["new version byte", "1" + TILES.trim().slice(1), /Unsupported blueprint string version "1"/],
    ["corrupt", TILES.trim().slice(0, 100), /corrupt|not valid/],
  ];
  for (const [name, clip, message] of cases) {
    test(name, async () => {
      const host = fakeHost({ files: EXISTING, clipboard: clip });
      const before = new Map(host.vault);
      const out = await importFromClipboard(host, "megabasing");
      assert.equal(out.action, "rejected");
      assert.equal(host.notices.length, 1);
      assert.equal(host.notices[0]!.kind, "error");
      assert.match(host.notices[0]!.message, message);
      assert.deepStrictEqual(host.vault, before);
      assert.equal(host.createPrompts.length + host.updatePrompts.length, 0);
    });
  }

  test("git failure after the commit is reported, and the files stay", async () => {
    const host = fakeHost({
      clipboard: BOOK,
      git: { status: "failed", step: "push", committed: true, commit: "def5678", message: "git push failed: fatal: unable to access" },
    });
    const out = await importFromClipboard(host, "x");
    assert.equal(out.action, "created");
    assert.ok(host.vault.has("x/military-science-pack-240-v3/blueprint.json"));
    const last = host.notices.at(-1)!;
    assert.equal(last.kind, "error");
    assert.match(last.message, /committed def5678 locally, but git push failed: fatal: unable to access\. The Git plugin's timed sync will try again\./);
  });

  test("git failure before the commit says the file is saved", async () => {
    const host = fakeHost({
      clipboard: BOOK,
      git: { status: "failed", step: "check", committed: false, message: "git is busy: a merge is in progress" },
    });
    await importFromClipboard(host, "x");
    assert.match(host.notices.at(-1)!.message, /but git is busy: a merge is in progress\. The files are saved/);
  });

  test("no git available skips the commit step", async () => {
    const host = fakeHost({ clipboard: BOOK, git: "none" });
    const out = await importFromClipboard(host, "x");
    assert.deepStrictEqual(out, { action: "created", folder: "x/military-science-pack-240-v3", git: undefined });
    assert.equal(host.createPrompts[0]!.askChangeNote, false);
  });
});
