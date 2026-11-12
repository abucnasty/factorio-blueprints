import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { chooseImportTarget, importFromClipboard } from "../../src/commands/import-blueprint.ts";
import {
  DEFAULT_NOTES_TEMPLATE,
  decodeBlueprintString,
  readNotesMeta,
  writeCanonicalJson,
} from "../../src/core/index.ts";
import { fakeHost, fixture } from "./helpers.ts";

const BOOK = fixture("book-nested.txt");
const BOOK_JSON = writeCanonicalJson(decodeBlueprintString(BOOK).value);
const TILES = fixture("tiles.txt");
const TEMPLATE_PATH = "_tools/templates/blueprint-notes.md";
const EXISTING = {
  "megabasing/science/mall/blueprint.json": writeCanonicalJson(decodeBlueprintString(TILES).value),
  "megabasing/science/mall/README.md": '---\ntitle: Mall\nauthors: []\nversion: "3"\nextra: kept\n---\n\nMy notes.\n',
  "megabasing/science/mall/renders/notes.md": "x",
  "megabasing/science/other.md": "x",
  [TEMPLATE_PATH]: DEFAULT_NOTES_TEMPLATE.replace("## Overview", "## Overview (vault copy)"),
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
    assert.ok(notes.includes("## Overview (vault copy)"), "uses the vault's template");
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
    assert.equal(readNotesMeta(notes).title, "Military Science");
    assert.ok(notes.includes("## Overview\n"));
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
      '---\ntitle: Mall\nauthors: []\nversion: "4"\nextra: kept\n---\n\nMy notes.\n',
    );
    assert.deepStrictEqual(host.commits, [{ folder: "megabasing/science/mall", message: "update Mall" }]);
  });

  test("keeping the version leaves README.md untouched", async () => {
    const host = fakeHost({ files: EXISTING, clipboard: BOOK, update: () => ({ newVersion: undefined, changeNote: "tweak belts" }) });
    await importFromClipboard(host, "megabasing/science/mall/renders");
    assert.equal(host.vault.get("megabasing/science/mall/README.md"), EXISTING["megabasing/science/mall/README.md"]);
    assert.deepStrictEqual(host.commits, [{ folder: "megabasing/science/mall", message: "tweak belts" }]);
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
    assert.match(host.notices.at(-1)!.message, /but git is busy: a merge is in progress\. The file is saved/);
  });

  test("no git available skips the commit step", async () => {
    const host = fakeHost({ clipboard: BOOK, git: "none" });
    const out = await importFromClipboard(host, "x");
    assert.deepStrictEqual(out, { action: "created", folder: "x/military-science-pack-240-v3", git: undefined });
    assert.equal(host.createPrompts[0]!.askChangeNote, false);
  });
});
