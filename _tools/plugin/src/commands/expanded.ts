// Expanded books in the vault (see _tools/docs/conventions.md): a folder
// with book.json whose entries are slot folders. Finding the folder a
// command is about, reading the tree, renaming slot folders after their
// labels, and the generated notes inside a book.

import {
  assembleBook,
  baseName,
  BLUEPRINT_FILE,
  BOOK_FILE,
  bookTree,
  displayLabel,
  isScannedPath,
  joinPath,
  NOTES_FILE,
  parentFolder,
  parseSlotFolder,
  readCanonicalJson,
  selfAndAncestors,
  slotFolderName,
  slotFolders,
} from "../core/index.ts";
import type { BlueprintKind, FolderReader } from "../core/index.ts";
import type { Host } from "./host.ts";

/** The blueprint folder or expanded book a command is about. */
export interface Located {
  folder: string;
  /** blueprint: the folder has blueprint.json; book: it has book.json. */
  kind: "blueprint" | "book";
  /** The root book it is in (the folder itself when it is a root book or not in a book). */
  root: string;
  /** Slots from the root book down to the folder; [] when not inside a book. */
  slots: number[];
}

/** The nearest blueprint folder or expanded book at or above a folder, with its root book and slot path. */
export async function locate(host: Host, contextFolder: string): Promise<Located | undefined> {
  for (const f of selfAndAncestors(contextFolder)) {
    if (f === "" || !isScannedPath(f)) continue;
    const kind = (await host.files.exists(joinPath(f, BOOK_FILE)))
      ? "book"
      : (await host.files.exists(joinPath(f, BLUEPRINT_FILE)))
        ? "blueprint"
        : undefined;
    if (!kind) continue;
    const slots: number[] = [];
    let cur = f;
    for (;;) {
      const parent = parentFolder(cur);
      const slot = parseSlotFolder(baseName(cur));
      if (parent === "" || slot === undefined || !(await host.files.exists(joinPath(parent, BOOK_FILE)))) break;
      slots.unshift(slot);
      cur = parent;
    }
    return { folder: f, kind, root: cur, slots };
  }
  return undefined;
}

/** The core's FolderReader over the vault. */
export function vaultReader(host: Host): FolderReader {
  return {
    folders: async (folder) => (await host.files.list(folder)).folders.map(baseName),
    read: async (path) => ((await host.files.exists(path)) ? host.files.read(path) : undefined),
  };
}

/** The value a folder stands for: its blueprint.json, or the assembled book. */
export async function folderValue(host: Host, loc: Pick<Located, "folder" | "kind">): Promise<unknown> {
  return loc.kind === "book"
    ? assembleBook(loc.folder, vaultReader(host))
    : readCanonicalJson(await host.files.read(joinPath(loc.folder, BLUEPRINT_FILE)));
}

export interface TreeNode {
  slot: number;
  /** Slots from the root book. */
  slots: number[];
  folder: string;
  kind: BlueprintKind;
  /** Plain label; "" when none. */
  label: string;
  /** Label to show: the plain label, or e.g. "Blueprint (slot 3)". */
  title: string;
  /** "blueprint": a leaf with blueprint.json (its value); "book": an expanded book. */
  file: "blueprint" | "book";
  value: unknown;
  /** A leaf with a render image. */
  hasRender: boolean;
  children: TreeNode[];
}

/** The slot folders under an expanded book, all the way down. */
export async function readTree(host: Host, bookFolder: string, prefix: number[]): Promise<TreeNode[]> {
  const out: TreeNode[] = [];
  for (const { slot, path } of await slotFolders(bookFolder, vaultReader(host))) {
    const slots = [...prefix, slot];
    const isBook = await host.files.exists(joinPath(path, BOOK_FILE));
    const value = readCanonicalJson(await host.files.read(joinPath(path, isBook ? BOOK_FILE : BLUEPRINT_FILE)));
    const node = bookTree(value);
    if (!node) throw new Error(`${path} does not hold a blueprint, book or planner.`);
    const children = isBook ? await readTree(host, path, slots) : [];
    out.push({
      slot,
      slots,
      folder: path,
      kind: node.kind,
      label: node.label,
      title: displayLabel({ ...node, slot }),
      file: isBook ? "book" : "blueprint",
      value,
      hasRender: !isBook && (await hasImage(host, path)),
      children,
    });
  }
  return out;
}

/** Every leaf, depth first in slot order. */
export function leaves(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((n) => (n.file === "book" ? leaves(n.children) : [n]));
}

async function hasImage(host: Host, folder: string): Promise<boolean> {
  const renders = joinPath(folder, "renders");
  if (!(await host.files.exists(renders))) return false;
  return (await host.files.list(renders)).files.some((f) => /\/0\.(?:jpe?g|png|webp)$/i.test(f));
}

/**
 * Rename a slot folder to slotFolderName(slot, label) when its name differs.
 * Returns the folder's path afterwards (unchanged if the name is right or
 * the wanted name is taken).
 */
export async function renameSlotFolder(host: Host, folder: string, slot: number, label: string): Promise<string> {
  const want = joinPath(parentFolder(folder), slotFolderName(slot, label));
  if (want === folder || (await host.files.exists(want))) return folder;
  await host.files.rename(folder, want);
  return want;
}

/**
 * Bring every slot folder name under a book in step with its label,
 * top down. Returns how many folders were renamed.
 */
export async function renameSlotFolders(host: Host, bookFolder: string): Promise<number> {
  let renamed = 0;
  for (const { slot, path } of await slotFolders(bookFolder, vaultReader(host))) {
    const isBook = await host.files.exists(joinPath(path, BOOK_FILE));
    const node = bookTree(readCanonicalJson(await host.files.read(joinPath(path, isBook ? BOOK_FILE : BLUEPRINT_FILE))));
    const now = await renameSlotFolder(host, path, slot, node?.label ?? "");
    if (now !== path) renamed++;
    if (isBook) renamed += await renameSlotFolders(host, now);
  }
  return renamed;
}

/** The root book and every folder under it that has a note to keep current: the book, nested books and leaves. */
export async function bookNoteFolders(host: Host, bookFolder: string): Promise<string[]> {
  const out = [bookFolder];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      out.push(n.folder);
      walk(n.children);
    }
  };
  walk(await readTree(host, bookFolder, []));
  return out;
}

/** Note path of a folder. */
export const notePath = (folder: string) => joinPath(folder, NOTES_FILE);

/** The folder at a slot path under a root book (after renames), or undefined. */
export async function locateBySlots(host: Host, root: string, slots: number[]): Promise<string | undefined> {
  let folder = root;
  for (const slot of slots) {
    const child = (await slotFolders(folder, vaultReader(host))).find((c) => c.slot === slot);
    if (!child) return undefined;
    folder = child.path;
  }
  return folder;
}
