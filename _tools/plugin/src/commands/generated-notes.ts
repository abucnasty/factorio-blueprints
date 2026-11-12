// Keeping the generated block in blueprint notes current: after an import,
// after a render, and once for every note in the vault.

import {
  applyGeneratedBlock,
  applyStatsToNote,
  blueprintStats,
  baseName,
  BLUEPRINT_FILE,
  BOOK_FILE,
  bookTree,
  coverUrl,
  expandedBlockLines,
  generatedBlockLines,
  renderUrl,
  joinPath,
  NOTES_FILE,
  readNotesMeta,
} from "../core/index.ts";
import type { BlockUpdate, ExpandedBlockNode } from "../core/index.ts";
import { bookNoteFolders, folderValue, leaves, locate, readTree, renameSlotFolders } from "./expanded.ts";
import type { TreeNode } from "./expanded.ts";
import type { Host } from "./host.ts";

const IMAGE = /\.(?:jpe?g|png|webp)$/i;

/** Render images under <folder>/renders/, as paths relative to renders/, sorted. */
export async function listRenderFiles(host: Host, folder: string): Promise<string[]> {
  const root = joinPath(folder, "renders");
  if (!(await host.files.exists(root))) return [];
  const out: string[] = [];
  const walk = async (dir: string) => {
    const { files, folders } = await host.files.list(dir);
    for (const f of files) if (IMAGE.test(f)) out.push(f.slice(root.length + 1));
    for (const d of folders) await walk(d);
  };
  await walk(root);
  return out.sort();
}

/**
 * The note with its generated content for this blueprint value: the stats
 * in the frontmatter and the block at the top of the body.
 */
export async function noteWithBlock(
  host: Host,
  folder: string,
  note: string,
  value: unknown,
): Promise<BlockUpdate> {
  const tree = bookTree(value);
  if (!tree) return { status: "invalid", text: note, reason: `${folder}/${BLUEPRINT_FILE} is not a blueprint.` };
  let title: string;
  try {
    title = readNotesMeta(note).title ?? baseName(folder);
  } catch {
    title = baseName(folder);
  }
  const lines = await blockLinesFor(host, folder, title, tree);
  const block = applyGeneratedBlock(note, lines);
  if (block.status === "invalid") return block;
  let text: string;
  try {
    text = applyStatsToNote(block.text, blueprintStats(value));
  } catch (e) {
    return { status: "invalid", text: note, reason: e instanceof Error ? e.message : String(e) };
  }
  if (text === note) return { status: "unchanged", text: note };
  return { status: block.status === "unchanged" ? "replaced" : block.status, text };
}

/** The block for a folder: today's block, or the expanded-book form inside an expanded book. */
async function blockLinesFor(host: Host, folder: string, title: string, tree: NonNullable<ReturnType<typeof bookTree>>) {
  const base = host.settings.linkBase;
  const loc = await locate(host, folder);
  if (!loc || loc.folder !== folder || (loc.kind === "blueprint" && loc.slots.length === 0)) {
    const hasRenders = (await listRenderFiles(host, folder)).length > 0;
    return generatedBlockLines({ base, folder, title, tree, hasRenders });
  }
  const slotPath = (slots: number[]) => slots.join("/");
  if (loc.kind === "blueprint") {
    // A leaf of an expanded book: its own image, addressed through the root book.
    const hasRender = (await listRenderFiles(host, folder)).some((f) => /^0\./.test(f));
    const cover = hasRender ? renderUrl(base, loc.root, `${slotPath(loc.slots)}.jpg`) : undefined;
    return expandedBlockLines({ base, root: loc.root, title, cover, nodes: [] });
  }
  const nodes = await readTree(host, folder, loc.slots);
  const first = leaves(nodes).find((l) => l.hasRender);
  const cover =
    first === undefined ? undefined : loc.slots.length === 0 ? coverUrl(base, loc.root) : renderUrl(base, loc.root, `${slotPath(first.slots)}.jpg`);
  const toBlock = (n: TreeNode): ExpandedBlockNode => ({
    slots: n.slots,
    kind: n.kind,
    title: n.title,
    relativeFolder: n.folder.slice(folder.length + 1),
    children: n.children.map(toBlock),
  });
  return expandedBlockLines({ base, root: loc.root, title, cover, nodes: nodes.map(toBlock) });
}

export type RefreshResult =
  | { status: "changed" | "unchanged"; folder: string }
  | { status: "skipped"; folder: string; reason: string };

/** Write or refresh the generated content (stats and block) in one blueprint folder's README.md. */
export async function refreshGeneratedBlock(host: Host, folder: string): Promise<RefreshResult> {
  const notesPath = joinPath(folder, NOTES_FILE);
  try {
    if (!(await host.files.exists(notesPath))) return { status: "skipped", folder, reason: "no README.md" };
    const note = await host.files.read(notesPath);
    const isBook = await host.files.exists(joinPath(folder, BOOK_FILE));
    const value = await folderValue(host, { folder, kind: isBook ? "book" : "blueprint" });
    const update = await noteWithBlock(host, folder, note, value);
    if (update.status === "invalid") return { status: "skipped", folder, reason: update.reason };
    if (update.status === "unchanged") return { status: "unchanged", folder };
    await host.files.write(notesPath, update.text);
    return { status: "changed", folder };
  } catch (e) {
    return { status: "skipped", folder, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Every blueprint folder and expanded book in the vault, skipping folders
 * starting with "_" or ".". With `slotFolders`, also the folders inside
 * expanded books (each has its own note); without, an expanded book is one
 * item, as it is in the catalog.
 */
export async function findBlueprintFolders(host: Host, from = "", opts: { slotFolders?: boolean } = {}): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, inBook: boolean) => {
    const { files, folders } = await host.files.list(dir);
    if (dir !== "" && files.includes(joinPath(dir, BLUEPRINT_FILE))) {
      if (!inBook || opts.slotFolders) out.push(dir);
      return; // a blueprint folder never holds another
    }
    const isBook = dir !== "" && files.includes(joinPath(dir, BOOK_FILE));
    if (isBook && (!inBook || opts.slotFolders)) out.push(dir);
    for (const d of folders) if (!/^[_.]/.test(baseName(d))) await walk(d, inBook || isBook);
  };
  await walk(from, false);
  return out.sort();
}

/** "Refresh generated content in all notes" (stats and block): writes, never commits. */
export async function refreshAllGeneratedBlocks(host: Host): Promise<RefreshResult[]> {
  const results: RefreshResult[] = [];
  // Slot folder names follow labels first, so the contents lists link the final names.
  let renamed = 0;
  for (const folder of await findBlueprintFolders(host)) {
    if (await host.files.exists(joinPath(folder, BOOK_FILE))) {
      try {
        renamed += await renameSlotFolders(host, folder);
      } catch (e) {
        results.push({ status: "skipped", folder, reason: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  for (const folder of await findBlueprintFolders(host, "", { slotFolders: true })) results.push(await refreshGeneratedBlock(host, folder));
  const changed = results.filter((r) => r.status === "changed").length;
  const unchanged = results.filter((r) => r.status === "unchanged").length;
  const skipped = results.filter((r): r is Extract<RefreshResult, { status: "skipped" }> => r.status === "skipped");
  const lines = [
    `Generated content: ${changed} note${changed === 1 ? "" : "s"} changed, ${unchanged} already current` +
      (skipped.length > 0 ? `, ${skipped.length} skipped` : "") +
      (renamed > 0 ? `, ${renamed} slot folder${renamed === 1 ? "" : "s"} renamed after ${renamed === 1 ? "its label" : "their labels"}` : "") +
      ". Not committed; the Git plugin's sync will pick the changes up.",
    ...skipped.map((s) => `Skipped ${s.folder}: ${s.reason}`),
  ];
  host.ui.notice(lines.join("\n"), skipped.length > 0 ? "error" : "info");
  return results;
}

/**
 * After anything changed inside an expanded book: slot folder names follow
 * their labels, then every note in the book (the book's, nested books',
 * leaves') is refreshed, since contents lists and covers span the tree.
 */
export async function refreshExpandedBook(host: Host, root: string): Promise<void> {
  await renameSlotFolders(host, root);
  for (const folder of await bookNoteFolders(host, root)) await refreshGeneratedBlock(host, folder);
}
