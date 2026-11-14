import assert from "node:assert/strict";
import { test } from "node:test";

import { setBlueprintStatus } from "../../src/commands/set-status.ts";
import { decodeBlueprintString, writeCanonicalJson } from "../../src/core/index.ts";
import { fakeHost, fixture } from "./helpers.ts";

const value = writeCanonicalJson(decodeBlueprintString(fixture("book-nested.txt")).value);
const NOTE = '---\ntitle: Mall\nauthors: []\nversion: "2"\nstatus: public\nentities: 3\n---\n\nMy notes.\n';
const files = {
  "blueprints/cat/mall/blueprint.json": value,
  "blueprints/cat/mall/README.md": NOTE,
  "blueprints/cat/old/blueprint.json": value,
  "blueprints/cat/old/README.md": "---\ntitle: Old\nauthors: []\ndeprecated: true\nentities: 3\n---\n",
  "blueprints/cat/book/book.json": writeCanonicalJson({ blueprint_book: { item: "blueprint-book", label: "Book" } }),
  "blueprints/cat/book/README.md": "---\ntitle: Book\nauthors: []\nstatus: draft\n---\n",
  "blueprints/cat/book/0-a/blueprint.json": value,
  "blueprints/cat/book/0-a/README.md": "---\ntitle: A\nauthors: []\n---\n",
  "blueprints/cat/bare/blueprint.json": value,
  "notes/plain.md": "x",
};
const pickStatus = (label: string) => (items: { label: string }[]) => items.findIndex((i) => i.label.startsWith(label));

test("offers the four statuses, marks the current one, writes the note and commits the folder", async () => {
  const host = fakeHost({ files, pick: pickStatus("Deprecated") });
  const out = await setBlueprintStatus(host, "blueprints/cat/mall/renders");
  assert.deepStrictEqual(out, { action: "set", folder: "blueprints/cat/mall", status: "deprecated", git: { status: "pushed", commit: "abc1234" } });
  assert.deepStrictEqual(host.picks[0]!.map((i) => i.label), ["Draft", "Public (now)", "Deprecated", "Unlisted"]);
  assert.ok(host.picks[0]!.every((i) => i.detail));
  assert.equal(host.vault.get("blueprints/cat/mall/README.md"), NOTE.replace("status: public", "status: deprecated"));
  // Published for the first time: its version is recorded in a second commit.
  assert.deepStrictEqual(host.commits, [
    { folder: "blueprints/cat/mall", message: "set Mall to deprecated" },
    { folder: "blueprints/cat/mall", message: "record Mall version 2" },
  ]);
  assert.match(host.vault.get("blueprints/cat/mall/versions.json")!, /"label": "2"/);
  assert.match(host.notices.at(-1)!.message, /^Set Mall to deprecated, committed and pushed \(abc1234\)\. Published version "2"\.$/);
});

test("a leftover deprecated key gives way to status", async () => {
  const host = fakeHost({ files, pick: pickStatus("Public") });
  await setBlueprintStatus(host, "blueprints/cat/old");
  assert.equal(host.vault.get("blueprints/cat/old/README.md"), "---\ntitle: Old\nauthors: []\nstatus: public\nentities: 3\n---\n");
});

test("inside an expanded book it sets the root book's note, never the entry's", async () => {
  const host = fakeHost({ files, pick: pickStatus("Unlisted") });
  const out = await setBlueprintStatus(host, "blueprints/cat/book/0-a");
  assert.equal(out.action, "set");
  assert.equal(host.vault.get("blueprints/cat/book/README.md"), "---\ntitle: Book\nauthors: []\nstatus: unlisted\n---\n");
  assert.equal(host.vault.get("blueprints/cat/book/0-a/README.md"), files["blueprints/cat/book/0-a/README.md"]);
  assert.deepStrictEqual(host.commits, [{ folder: "blueprints/cat/book", message: "set Book to unlisted" }]);
});

test("the same status again changes nothing; cancelling changes nothing", async () => {
  const same = fakeHost({ files, pick: pickStatus("Public") });
  assert.equal((await setBlueprintStatus(same, "blueprints/cat/mall")).action, "unchanged");
  assert.deepStrictEqual(same.commits, []);
  assert.match(same.notices[0]!.message, /already public/);
  const cancel = fakeHost({ files, pick: () => undefined });
  assert.deepStrictEqual(await setBlueprintStatus(cancel, "blueprints/cat/mall"), { action: "cancelled" });
  assert.equal(cancel.vault.get("blueprints/cat/mall/README.md"), NOTE);
});

test("without committing it only writes", async () => {
  const host = fakeHost({ files, pick: pickStatus("Draft"), settings: { commitAfterImport: false } });
  const out = await setBlueprintStatus(host, "blueprints/cat/mall");
  assert.deepStrictEqual(out, { action: "set", folder: "blueprints/cat/mall", status: "draft", git: undefined });
  assert.deepStrictEqual(host.commits, []);
  assert.equal(host.notices.at(-1)!.message, "Set Mall to draft.");
});

test("outside a blueprint folder, or without a note", async () => {
  const outside = fakeHost({ files });
  assert.equal((await setBlueprintStatus(outside, "notes")).action, "rejected");
  assert.match(outside.notices[0]!.message, /not inside a blueprint folder/);
  const bare = fakeHost({ files });
  assert.equal((await setBlueprintStatus(bare, "blueprints/cat/bare")).action, "rejected");
  assert.match(bare.notices[0]!.message, /has no README\.md/);
  assert.deepStrictEqual(bare.picks, []);
});
