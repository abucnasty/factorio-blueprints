// Keeping the generated block in blueprint notes current: after an import,
// after a render, and once for every note in the vault.

import {
  applyGeneratedBlock,
  baseName,
  BLUEPRINT_FILE,
  bookTree,
  generatedBlockLines,
  joinPath,
  NOTES_FILE,
  readCanonicalJson,
  readNotesMeta,
} from "../core/index.ts";
import type { BlockUpdate } from "../core/index.ts";
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

/** The note text with the block for this blueprint value written into it. */
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
  const hasRenders = (await listRenderFiles(host, folder)).length > 0;
  const lines = generatedBlockLines({ base: host.settings.linkBase, folder, title, tree, hasRenders });
  return applyGeneratedBlock(note, lines);
}

export type RefreshResult =
  | { status: "changed" | "unchanged"; folder: string }
  | { status: "skipped"; folder: string; reason: string };

/** Write or refresh the block in one blueprint folder's README.md. */
export async function refreshGeneratedBlock(host: Host, folder: string): Promise<RefreshResult> {
  const notesPath = joinPath(folder, NOTES_FILE);
  try {
    if (!(await host.files.exists(notesPath))) return { status: "skipped", folder, reason: "no README.md" };
    const note = await host.files.read(notesPath);
    const value = readCanonicalJson(await host.files.read(joinPath(folder, BLUEPRINT_FILE)));
    const update = await noteWithBlock(host, folder, note, value);
    if (update.status === "invalid") return { status: "skipped", folder, reason: update.reason };
    if (update.status === "unchanged") return { status: "unchanged", folder };
    await host.files.write(notesPath, update.text);
    return { status: "changed", folder };
  } catch (e) {
    return { status: "skipped", folder, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Every blueprint folder in the vault, skipping folders starting with "_" or ".". */
export async function findBlueprintFolders(host: Host, from = ""): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string) => {
    const { files, folders } = await host.files.list(dir);
    if (dir !== "" && files.includes(joinPath(dir, BLUEPRINT_FILE))) {
      out.push(dir);
      return; // a blueprint folder never holds another
    }
    for (const d of folders) if (!/^[_.]/.test(baseName(d))) await walk(d);
  };
  await walk(from);
  return out.sort();
}

/** "Refresh generated blocks in all notes": writes, never commits. */
export async function refreshAllGeneratedBlocks(host: Host): Promise<RefreshResult[]> {
  const results: RefreshResult[] = [];
  for (const folder of await findBlueprintFolders(host)) results.push(await refreshGeneratedBlock(host, folder));
  const changed = results.filter((r) => r.status === "changed").length;
  const unchanged = results.filter((r) => r.status === "unchanged").length;
  const skipped = results.filter((r): r is Extract<RefreshResult, { status: "skipped" }> => r.status === "skipped");
  const lines = [
    `Generated blocks: ${changed} note${changed === 1 ? "" : "s"} changed, ${unchanged} already current` +
      (skipped.length > 0 ? `, ${skipped.length} skipped` : "") +
      ". Not committed; the Git plugin's sync will pick the changes up.",
    ...skipped.map((s) => `Skipped ${s.folder}: ${s.reason}`),
  ];
  host.ui.notice(lines.join("\n"), skipped.length > 0 ? "error" : "info");
  return results;
}
