// Importing into an expanded book: a whole book pasted onto it is compared
// slot by slot and applied after one confirmation; a single blueprint
// pasted onto it becomes a new entry after the highest slot.

import {
  BOOK_FILE,
  BLUEPRINT_FILE,
  expandBook,
  joinPath,
  NOTES_FILE,
  plainLabel,
  readNotesMeta,
  slotFolderName,
  writeCanonicalJson,
  writeCompactSortedJson,
  describeBlueprint,
} from "../core/index.ts";
import type { ExpandedEntry } from "../core/index.ts";
import { entryTitle, writeEntryFolder } from "./expand-book.ts";
import type { NoteDefaults } from "./expand-book.ts";
import { readTree } from "./expanded.ts";
import type { Located, TreeNode } from "./expanded.ts";
import { refreshExpandedBook } from "./generated-notes.ts";
import { reportGit } from "./git-notice.ts";
import type { Host } from "./host.ts";
import { readTemplate } from "./import-blueprint.ts";

export type ExpandedImportOutcome =
  | { action: "updated"; folder: string; counts: Record<"unchanged" | "changed" | "moved" | "new" | "removed", number> }
  | { action: "added"; folder: string; slot: number }
  | { action: "unchanged" | "cancelled"; folder: string }
  | { action: "rejected"; reason: string };

interface NewItem {
  path: string;
  slots: number[];
  entry: ExpandedEntry;
}

const same = (a: unknown, b: unknown) => writeCompactSortedJson(a) === writeCompactSortedJson(b);
const label = (e: { label: string; slot: number; kind: ExpandedEntry["kind"] }) => entryTitle({ ...e, folder: "" });

/** A book pasted onto the expanded book at `loc`: update it slot by slot. */
export async function updateExpandedBook(host: Host, loc: Located, value: unknown): Promise<ExpandedImportOutcome> {
  const folder = loc.folder;
  let expanded: ReturnType<typeof expandBook>;
  let current: TreeNode[];
  let currentBook: unknown;
  try {
    expanded = expandBook(value);
    current = await readTree(host, folder, []);
    currentBook = JSON.parse(await host.files.read(joinPath(folder, BOOK_FILE)));
  } catch (e) {
    return reject(host, errorText(e));
  }

  // Flatten both trees by slot path (relative to this book).
  const now = new Map<string, TreeNode>();
  const walkNow = (nodes: TreeNode[]) => nodes.forEach((n) => (now.set(n.slots.join("/"), n), walkNow(n.children)));
  walkNow(current);
  const next: NewItem[] = [];
  const walkNext = (entries: ExpandedEntry[], prefix: number[]) =>
    entries.forEach((e) => {
      const slots = [...prefix, e.slot];
      next.push({ path: slots.join("/"), slots, entry: e });
      walkNext(e.entries ?? [], slots);
    });
  walkNext(expanded.entries, []);
  const isBook = (e: ExpandedEntry) => e.kind === "blueprint-book";
  const content = (e: ExpandedEntry) => (isBook(e) ? e.book : e.value);

  // Decide each slot path.
  const unchanged = new Set<string>();
  const changed = new Set<string>();
  const created = new Set<string>();
  const moveFrom = new Map<string, string>(); // target path -> source path
  const sources = new Set<string>();
  for (const n of next) {
    const c = now.get(n.path);
    if (c && (c.file === "book") === isBook(n.entry) && same(c.value, content(n.entry))) unchanged.add(n.path);
  }
  // A leaf whose content now sits at another slot moves with its note and renders.
  for (const n of next) {
    if (unchanged.has(n.path) || isBook(n.entry)) continue;
    for (const [q, c] of now) {
      if (c.file === "blueprint" && q !== n.path && !unchanged.has(q) && !sources.has(q) && same(c.value, n.entry.value)) {
        moveFrom.set(n.path, q);
        sources.add(q);
        break;
      }
    }
  }
  const removed = new Set<string>();
  for (const n of next) {
    if (unchanged.has(n.path) || moveFrom.has(n.path)) continue;
    const c = now.get(n.path);
    if (c && !sources.has(n.path) && (c.file === "book") === isBook(n.entry)) changed.add(n.path);
    else {
      created.add(n.path);
      if (c && !sources.has(n.path)) removed.add(n.path);
    }
  }
  for (const [target] of moveFrom) if (now.has(target) && !sources.has(target)) removed.add(target);
  const nextPaths = new Set(next.map((n) => n.path));
  for (const q of now.keys()) if (!nextPaths.has(q) && !sources.has(q)) removed.add(q);
  // A removed book takes its subtree; list only its top.
  const removedTop = [...removed].filter((p) => ![...removed].some((r) => r !== p && p.startsWith(r + "/")));
  const bookChanged = !same(currentBook, expanded.book);

  if (changed.size + created.size + moveFrom.size + removedTop.length === 0 && !bookChanged) {
    host.ui.notice(`${folder} already holds this book; nothing to change.`);
    return { action: "unchanged", folder };
  }

  const title = await noteTitle(host, folder);
  const byPath = new Map(next.map((n) => [n.path, n]));
  const line = (p: string) => `- slot ${p}: ${label(byPath.get(p)?.entry ?? toEntry(now.get(p)!))}`;
  const counts = {
    unchanged: unchanged.size,
    changed: changed.size,
    moved: moveFrom.size,
    new: created.size,
    removed: removedTop.length,
  };
  const ok = await host.ui.confirm({
    title: `Update "${title}" from the clipboard`,
    lines: [
      `${counts.changed} changed, ${counts.moved} moved, ${counts.new} new, ${counts.removed} removed, ${counts.unchanged} unchanged` +
        (bookChanged ? "; the book's own settings changed too" : "") +
        ".",
      ...(changed.size > 0 ? ["Changed:", ...[...changed].map(line)] : []),
      ...(moveFrom.size > 0 ? ["Moved (with their notes and renders):", ...[...moveFrom].map(([t, s]) => `- slot ${s} → ${t}: ${label(byPath.get(t)!.entry)}`)] : []),
      ...(created.size > 0 ? ["New:", ...[...created].map(line)] : []),
      ...(removedTop.length > 0 ? ["Removed, with their notes and renders:", ...removedTop.map((p) => `- slot ${p}: ${now.get(p)!.title}`)] : []),
      ...(expanded.dropped.length > 0
        ? ["Left out, because an earlier entry has the same slot:", ...expanded.dropped.map((d) => `- slot ${d.path}: ${d.label || "(no label)"}`)]
        : []),
    ],
    okText: "Update",
  });
  if (!ok) return { action: "cancelled", folder };

  try {
    const template = await readTemplate(host);
    const notes = await noteDefaults(host, folder);
    // 1. Set aside the folders that move, 2. remove what goes.
    const staging = joinPath(folder, ".moving");
    if (moveFrom.size > 0) await host.files.mkdir(staging);
    const staged = new Map<string, string>();
    let i = 0;
    for (const [target, source] of moveFrom) {
      const to = joinPath(staging, String(i++));
      await host.files.rename(now.get(source)!.folder, to);
      staged.set(target, to);
    }
    for (const p of removedTop) if (await host.files.exists(now.get(p)!.folder)) await host.files.remove(now.get(p)!.folder);
    // 3. Write top down: books first so their children have a parent.
    if (bookChanged) await host.files.write(joinPath(folder, BOOK_FILE), writeCanonicalJson(expanded.book));
    const folderOf = new Map<string, string>([["", folder]]);
    for (const n of next) {
      const parent = folderOf.get(n.slots.slice(0, -1).join("/"))!;
      const existing = now.get(n.path);
      let at: string;
      if (unchanged.has(n.path) || changed.has(n.path)) {
        at = existing!.folder;
        if (changed.has(n.path)) {
          const file = isBook(n.entry) ? BOOK_FILE : BLUEPRINT_FILE;
          await host.files.write(joinPath(at, file), writeCanonicalJson(content(n.entry)));
        }
      } else if (moveFrom.has(n.path)) {
        at = joinPath(parent, slotFolderName(n.entry.slot, n.entry.label));
        await host.files.rename(staged.get(n.path)!, at);
      } else {
        // New: a leaf with its note, or a book folder whose entries follow in this loop.
        at = joinPath(parent, n.entry.folder);
        await writeEntryFolder(host, parent, { ...n.entry, entries: [] }, notes, template);
      }
      folderOf.set(n.path, at);
    }
    if (moveFrom.size > 0) await host.files.remove(staging);
    await refreshExpandedBook(host, loc.root);
  } catch (e) {
    return reject(host, `Stopped while updating ${folder}: ${errorText(e)}. Nothing was committed; check the folder before trying again.`);
  }

  const summary = `Updated ${folder}: ${counts.changed} changed, ${counts.moved} moved, ${counts.new} new, ${counts.removed} removed`;
  if (!host.settings.commitAfterImport || host.git === undefined) host.ui.notice(`${summary}.`);
  else reportGit(host, summary, await host.git.commitAndSync(loc.root, `update ${title}`));
  return { action: "updated", folder, counts };
}

/** A single blueprint or planner pasted onto an expanded book: a new entry after the highest slot. */
export async function addEntryToBook(host: Host, loc: Located, value: unknown): Promise<ExpandedImportOutcome> {
  const folder = loc.folder;
  let slot: number;
  let entry: ExpandedEntry;
  try {
    const current = await readTree(host, folder, []);
    slot = current.length === 0 ? 0 : Math.max(...current.map((c) => c.slot)) + 1;
    const d = describeBlueprint(value);
    const l = plainLabel(d.label ?? "");
    entry = { slot, folder: slotFolderName(slot, l), kind: d.kind, label: l, value };
  } catch (e) {
    return reject(host, errorText(e));
  }
  const title = await noteTitle(host, folder);
  try {
    await writeEntryFolder(host, folder, entry, await noteDefaults(host, folder), await readTemplate(host));
    await refreshExpandedBook(host, loc.root);
  } catch (e) {
    return reject(host, `Could not add the entry to ${folder}: ${errorText(e)}`);
  }
  const summary = `Added "${entryTitle(entry)}" to ${folder} as slot ${slot}`;
  if (!host.settings.commitAfterImport || host.git === undefined) host.ui.notice(`${summary}.`);
  else reportGit(host, summary, await host.git.commitAndSync(loc.root, `add ${entryTitle(entry)} to ${title}`));
  return { action: "added", folder, slot };
}

function toEntry(n: TreeNode): ExpandedEntry {
  return { slot: n.slot, folder: "", kind: n.kind, label: n.label };
}

async function noteTitle(host: Host, folder: string): Promise<string> {
  try {
    return readNotesMeta(await host.files.read(joinPath(folder, NOTES_FILE))).title ?? folder.slice(folder.lastIndexOf("/") + 1);
  } catch {
    return folder.slice(folder.lastIndexOf("/") + 1);
  }
}

/** Notes for new entries copy the book's authors. */
async function noteDefaults(host: Host, folder: string): Promise<NoteDefaults> {
  try {
    return { authors: readNotesMeta(await host.files.read(joinPath(folder, NOTES_FILE))).authors, posted: host.today() };
  } catch {
    return { authors: host.settings.authors, posted: host.today() };
  }
}

function reject(host: Host, reason: string): ExpandedImportOutcome {
  host.ui.notice(reason, "error");
  return { action: "rejected", reason };
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
