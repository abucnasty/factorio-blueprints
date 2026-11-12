// Expanded books: a blueprint book stored as folders, per
// _tools/docs/conventions.md ("Repo layout"). The book's own keys are in
// book.json; each entry is a slot folder named `<slot>` or `<slot>-<slug>`
// holding blueprint.json (a leaf) or book.json (a nested book).
//
// Pure: the caller reads files through a FolderReader (git in CI, the vault
// in the plugin). Slots follow the book-tree rule: an entry's `index`, else
// its position; of several entries with one slot the first in the array wins.

import { BLUEPRINT_FILE, joinPath } from "./blueprint-folder.ts";
import { KIND_KEYS } from "./book-tree.ts";
import { readCanonicalJson } from "./canonical-json.ts";
import type { BlueprintKind } from "./describe.ts";
import { plainLabel, slugify } from "./slug.ts";

export const BOOK_FILE = "book.json";

/** Longest name part of a slot folder. */
const MAX_NAME = 60;

/** "0-any-patch-sizes", "6-480", or "3" when the label gives no slug. */
export function slotFolderName(slot: number, label: string | undefined): string {
  const slug = slugify(label ?? "")
    .slice(0, MAX_NAME)
    .replace(/-+$/, "");
  return slug === "" ? String(slot) : `${slot}-${slug}`;
}

/** The slot of a slot folder name (`<n>` or `<n>-<anything>`, n without leading zeros), else undefined. */
export function parseSlotFolder(name: string): number | undefined {
  const m = /^(0|[1-9][0-9]*)(?:-.+)?$/.exec(name);
  if (!m) return undefined;
  const slot = Number(m[1]);
  return Number.isSafeInteger(slot) ? slot : undefined;
}

export interface ExpandedEntry {
  slot: number;
  folder: string; // slotFolderName(slot, label)
  kind: BlueprintKind;
  label: string; // plain text, may be empty
  /** A leaf: the value to write as blueprint.json, e.g. { blueprint: {...} }. */
  value?: unknown;
  /** A nested book: its book.json value and its own entries. */
  book?: unknown;
  entries?: ExpandedEntry[];
}

/** Split a book value ({ blueprint_book: ... }) into its book.json value and entries, all the way down. */
export function expandBook(value: unknown): {
  book: unknown;
  entries: ExpandedEntry[];
  /** Entries left out because an earlier entry has the same slot: slot path and label. */
  dropped: { path: string; label: string }[];
} {
  const body = isObject(value) ? value["blueprint_book"] : undefined;
  if (!isObject(body)) throw new Error("Not a blueprint book: the value has no blueprint_book object.");
  const dropped: { path: string; label: string }[] = [];
  const { book, entries } = expandBody(body, [], dropped);
  return { book, entries, dropped };
}

function expandBody(
  body: Record<string, unknown>,
  slots: number[],
  dropped: { path: string; label: string }[],
): { book: unknown; entries: ExpandedEntry[] } {
  const { blueprints, ...rest } = body;
  const bySlot = new Map<number, ExpandedEntry>();
  (Array.isArray(blueprints) ? blueprints : []).forEach((item, position) => {
    const index = isObject(item) ? item["index"] : undefined;
    const slot = typeof index === "number" && Number.isInteger(index) && index >= 0 ? index : position;
    const path = [...slots, slot].join("/");
    const found = kindOf(item);
    if (!found) throw new Error(`Book entry ${path} is not a blueprint, book or planner.`);
    const [key, kind, entryBody] = found;
    const label = typeof entryBody["label"] === "string" ? plainLabel(entryBody["label"]) : "";
    if (bySlot.has(slot)) {
      dropped.push({ path, label });
      return;
    }
    const entry: ExpandedEntry = { slot, folder: slotFolderName(slot, label), kind, label };
    if (kind === "blueprint-book") {
      const nested = expandBody(entryBody, [...slots, slot], dropped);
      entry.book = nested.book;
      entry.entries = nested.entries;
    } else {
      entry.value = { [key]: entryBody };
    }
    bySlot.set(slot, entry);
  });
  const entries = [...bySlot.values()].sort((a, b) => a.slot - b.slot);
  return { book: { blueprint_book: rest }, entries };
}

export interface FolderReader {
  /** Names of the child folders of `folder`. */
  folders(folder: string): Promise<string[]>;
  /** The text of a file, or undefined when it does not exist. */
  read(path: string): Promise<string | undefined>;
}

/** The assembled value of the expanded book at `folder`. Throws a readable Error on a broken tree
 *  (two folders for one slot, a slot folder with neither file, both files in one folder, unreadable JSON). */
export async function assembleBook(folder: string, reader: FolderReader): Promise<unknown> {
  const bookPath = joinPath(folder, BOOK_FILE);
  const bookText = await reader.read(bookPath);
  if (bookText === undefined) throw new Error(`${folder} has no ${BOOK_FILE}.`);
  if ((await reader.read(joinPath(folder, BLUEPRINT_FILE))) !== undefined) {
    throw new Error(`${folder} has both ${BOOK_FILE} and ${BLUEPRINT_FILE}; keep only one.`);
  }
  const book = parse(bookPath, bookText);
  const body = isObject(book) ? book["blueprint_book"] : undefined;
  if (!isObject(body)) throw new Error(`${bookPath} has no blueprint_book object.`);

  const items: unknown[] = [];
  for (const child of await slotFolders(folder, reader)) {
    const leafPath = joinPath(child.path, BLUEPRINT_FILE);
    const leafText = await reader.read(leafPath);
    if (leafText === undefined) {
      if ((await reader.read(joinPath(child.path, BOOK_FILE))) === undefined) {
        throw new Error(
          `${child.path} is named like a slot folder but has neither ${BLUEPRINT_FILE} nor ${BOOK_FILE}; add one or rename the folder.`,
        );
      }
      const nested = (await assembleBook(child.path, reader)) as { blueprint_book: unknown };
      items.push({ index: child.slot, blueprint_book: nested.blueprint_book });
      continue;
    }
    if ((await reader.read(joinPath(child.path, BOOK_FILE))) !== undefined) {
      throw new Error(`${child.path} has both ${BOOK_FILE} and ${BLUEPRINT_FILE}; keep only one.`);
    }
    const found = kindOf(parse(leafPath, leafText));
    if (!found) throw new Error(`${leafPath} is not a blueprint, book or planner.`);
    const [key, , entryBody] = found;
    items.push({ index: child.slot, [key]: entryBody });
  }
  return { blueprint_book: { ...body, blueprints: items } };
}

/** The slot folders of an expanded book, ascending by slot: for walking a tree without assembling it. */
export async function slotFolders(
  folder: string,
  reader: FolderReader,
): Promise<{ slot: number; name: string; path: string }[]> {
  const out: { slot: number; name: string; path: string }[] = [];
  for (const name of await reader.folders(folder)) {
    const slot = parseSlotFolder(name);
    if (slot !== undefined) out.push({ slot, name, path: joinPath(folder, name) });
  }
  out.sort((a, b) => a.slot - b.slot || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (let i = 1; i < out.length; i++) {
    if (out[i]!.slot === out[i - 1]!.slot) {
      throw new Error(
        `${folder} has two folders for slot ${out[i]!.slot} (${out[i - 1]!.name}, ${out[i]!.name}); renumber or merge one.`,
      );
    }
  }
  return out;
}

function parse(path: string, text: string): unknown {
  try {
    return readCanonicalJson(text);
  } catch (e) {
    throw new Error(`${path} is not valid JSON: ${(e as Error).message}`);
  }
}

/** The first kind key of a value (as in bookTree), its kind and body, else undefined. */
function kindOf(value: unknown): [string, BlueprintKind, Record<string, unknown>] | undefined {
  if (!isObject(value)) return undefined;
  for (const [key, kind] of KIND_KEYS) {
    const body = value[key];
    if (isObject(body)) return [key, kind, body];
  }
  return undefined;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
