import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  assembleBook,
  decodeBlueprintString,
  expandBook,
  parseSlotFolder,
  slotFolderName,
  slotFolders,
  writeCanonicalJson,
} from "../../src/core/index.ts";
import type { ExpandedEntry, FolderReader } from "../../src/core/index.ts";
import { fixture } from "./fixtures.ts";

/** A FolderReader over an in-memory map of file path to text. */
function memoryReader(files: Record<string, string>): FolderReader {
  return {
    async folders(folder) {
      const prefix = folder === "" ? "" : folder + "/";
      const names = new Set<string>();
      for (const path of Object.keys(files)) {
        if (!path.startsWith(prefix)) continue;
        const rest = path.slice(prefix.length).split("/");
        if (rest.length > 1) names.add(rest[0]!);
      }
      return [...names];
    },
    async read(path) {
      return files[path];
    },
  };
}

/** The files an expanded book is written as, under `folder`. */
function writeTree(folder: string, book: unknown, entries: ExpandedEntry[], files: Record<string, string> = {}) {
  files[`${folder}/book.json`] = writeCanonicalJson(book);
  for (const e of entries) {
    const path = `${folder}/${e.folder}`;
    if (e.entries) writeTree(path, e.book, e.entries, files);
    else files[`${path}/blueprint.json`] = writeCanonicalJson(e.value);
  }
  return files;
}

/** The book with every entry's `index` written and entries sorted by slot, all the way down. */
function normalized(value: unknown): unknown {
  const v = value as Record<string, Record<string, unknown>>;
  const body = v["blueprint_book"];
  if (!body) return value;
  const items = ((body["blueprints"] as Record<string, unknown>[]) ?? []).map((item, position) => {
    const index = typeof item["index"] === "number" ? item["index"] : position;
    const { index: _, ...rest } = item;
    return { index, ...(normalized(rest) as object) };
  });
  items.sort((a, b) => a.index - b.index);
  return { blueprint_book: { ...body, blueprints: items } };
}

const nested = decodeBlueprintString(fixture("book-nested.txt")).value;

describe("slot folder names", () => {
  test("slot and slug of the plain label, capped at 60 characters", () => {
    assert.equal(slotFolderName(0, "Any% Patch Sizes"), "0-any-patch-sizes");
    assert.equal(slotFolderName(6, "[item=stone]480/s"), "6-stone-480");
    assert.equal(slotFolderName(3, "日本語"), "3");
    assert.equal(slotFolderName(3, undefined), "3");
    assert.equal(slotFolderName(12, "word ".repeat(30)).length, "12-".length + 59);
    assert.ok(!slotFolderName(12, "word ".repeat(30)).endsWith("-"));
  });

  test("parse", () => {
    assert.equal(parseSlotFolder("0-any-patch-sizes"), 0);
    assert.equal(parseSlotFolder("6-480"), 6);
    assert.equal(parseSlotFolder("13"), 13);
    assert.equal(parseSlotFolder("06-x"), undefined);
    assert.equal(parseSlotFolder("3-"), undefined);
    assert.equal(parseSlotFolder("-3"), undefined);
    assert.equal(parseSlotFolder("renders"), undefined);
    assert.equal(parseSlotFolder("1e3"), undefined);
  });
});

describe("expand", () => {
  test("splits a nested book all the way down", () => {
    const { book, entries, dropped } = expandBook(nested);
    assert.deepStrictEqual(dropped, []);
    assert.equal((book as { blueprint_book: object }).blueprint_book.hasOwnProperty("blueprints"), false);
    assert.equal((book as { blueprint_book: { label: string } }).blueprint_book.label.includes("240/s"), true);
    assert.deepStrictEqual(
      entries.map((e) => [e.slot, e.folder, e.kind, e.entries?.map((c) => c.folder)]),
      [
        [0, "0-concrete-pad", "blueprint", undefined],
        [1, "1-inner-book", "blueprint-book", ["0-wired-lamps", "1-trees-only"]],
        [2, "2-belts-to-turbo", "upgrade-planner", undefined],
      ],
    );
    const leaf = entries[0]!.value as Record<string, Record<string, unknown>>;
    assert.deepStrictEqual(Object.keys(leaf), ["blueprint"]);
    assert.equal(leaf["blueprint"]!["label"], "Concrete pad");
  });

  test("slots: index, else position; the first of a slot wins, the rest are reported", () => {
    const bp = (label: string, index?: number) => ({ ...(index === undefined ? {} : { index }), blueprint: { label } });
    const { entries, dropped } = expandBook({
      blueprint_book: { item: "blueprint-book", blueprints: [bp("A", 4), bp("B"), bp("C", 4), bp("D", 1)] },
    });
    assert.deepStrictEqual(entries.map((e) => [e.slot, e.label]), [[1, "B"], [4, "A"]]);
    assert.deepStrictEqual(dropped, [
      { path: "4", label: "C" },
      { path: "1", label: "D" },
    ]);
  });

  test("not a book", () => {
    assert.throws(() => expandBook({ blueprint: {} }), /Not a blueprint book/);
  });
});

describe("assemble", () => {
  test("invariant: assemble(expand(book)) is the book with slots sorted and indexes written", async () => {
    const { book, entries } = expandBook(nested);
    const files = writeTree("cat/book", book, entries);
    const assembled = await assembleBook("cat/book", memoryReader(files));
    assert.equal(writeCanonicalJson(assembled), writeCanonicalJson(normalized(nested)));
  });

  test("entries out of slot order come back sorted; an empty book has no entries", async () => {
    const value = {
      blueprint_book: { item: "blueprint-book", label: "X", blueprints: [{ index: 2, blueprint: { label: "b" } }, { index: 0, blueprint: { label: "a" } }] },
    };
    const { book, entries } = expandBook(value);
    assert.deepStrictEqual(await assembleBook("x", memoryReader(writeTree("x", book, entries))), normalized(value));
    const empty = { "e/book.json": '{"blueprint_book":{"item":"blueprint-book"}}' };
    assert.deepStrictEqual(await assembleBook("e", memoryReader(empty)), { blueprint_book: { item: "blueprint-book", blueprints: [] } });
  });

  test("ignores folders that are not named by slot", async () => {
    const files = {
      "b/book.json": '{"blueprint_book":{}}',
      "b/0-a/blueprint.json": '{"blueprint":{"label":"a"}}',
      "b/0-a/renders/0.jpg": "jpg",
      "b/attachments/x.png": "png",
    };
    assert.deepStrictEqual(await assembleBook("b", memoryReader(files)), {
      blueprint_book: { blueprints: [{ index: 0, blueprint: { label: "a" } }] },
    });
    assert.deepStrictEqual(await slotFolders("b", memoryReader(files)), [{ slot: 0, name: "0-a", path: "b/0-a" }]);
  });

  test("broken trees throw readable errors", async () => {
    const base = { "b/book.json": '{"blueprint_book":{}}' };
    const fails = (files: Record<string, string>, message: RegExp) =>
      assert.rejects(assembleBook("b", memoryReader({ ...base, ...files })), message);
    await fails({ "b/1-a/blueprint.json": "{}", "b/1-b/blueprint.json": "{}" }, /b has two folders for slot 1 \(1-a, 1-b\)/);
    await fails({ "b/1-a/README.md": "x" }, /b\/1-a is named like a slot folder but has neither/);
    await fails({ "b/1-a/blueprint.json": "{}", "b/1-a/book.json": "{}" }, /b\/1-a has both book\.json and blueprint\.json/);
    await fails({ "b/blueprint.json": "{}" }, /^Error: b has both/);
    await fails({ "b/0/blueprint.json": "{ nope" }, /b\/0\/blueprint\.json is not valid JSON/);
    await fails({ "b/0/blueprint.json": '{"other":{}}' }, /b\/0\/blueprint\.json is not a blueprint/);
    await assert.rejects(assembleBook("none", memoryReader(base)), /none has no book\.json/);
  });
});
