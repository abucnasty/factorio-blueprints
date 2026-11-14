// Render state of blueprint folders in the vault: for the status bar, the
// "Show blueprints needing a render" list and "Render all that need it".

import {
  BLUEPRINT_FILE,
  BOOK_FILE,
  joinPath,
  NOTES_FILE,
  parseRenderManifest,
  parseRenderVersion,
  readCanonicalJson,
  RENDER_MANIFEST,
  renderState,
  renderStateLabel,
} from "../core/index.ts";
import type { FolderRenderState } from "../core/index.ts";
import { leaves, readTree } from "./expanded.ts";
import { findBlueprintFolders, listRenderFiles } from "./generated-notes.ts";
import type { Host } from "./host.ts";
import { cancelRender, isRendering, RENDER_VERSION_FILE, renderPreview } from "./render-preview.ts";

/** The render tool's current render version (1 when its file is missing or unreadable). */
export async function readRenderVersion(host: Host): Promise<number> {
  try {
    return parseRenderVersion((await host.files.exists(RENDER_VERSION_FILE)) ? await host.files.read(RENDER_VERSION_FILE) : undefined);
  } catch {
    return parseRenderVersion(undefined);
  }
}

/**
 * Render state of one blueprint folder, or of an expanded book as the sum of
 * its leaves (entries keyed by slot path under the book). Throws if a file
 * is unreadable. renderVersion: the tool's current one, read when not given.
 */
export async function folderRenderState(host: Host, folder: string, renderVersion?: number): Promise<FolderRenderState> {
  renderVersion ??= await readRenderVersion(host);
  if (await host.files.exists(joinPath(folder, BOOK_FILE))) return bookRenderState(host, folder, renderVersion);
  const value = readCanonicalJson(await host.files.read(joinPath(folder, BLUEPRINT_FILE)));
  const manifestPath = joinPath(folder, "renders", RENDER_MANIFEST);
  const manifest = (await host.files.exists(manifestPath))
    ? parseRenderManifest(await host.files.read(manifestPath))
    : undefined;
  return renderState(value, manifest, await listRenderFiles(host, folder), renderVersion);
}

async function bookRenderState(host: Host, folder: string, renderVersion: number): Promise<FolderRenderState> {
  const entries: FolderRenderState["entries"] = [];
  const orphans: string[] = [];
  for (const leaf of leaves(await readTree(host, folder, []))) {
    const prefix = leaf.slots.join("/");
    const own = await folderRenderState(host, leaf.folder, renderVersion);
    for (const e of own.entries) {
      // A leaf's own entry "0" (path "") is the book's slot path; an unexpanded book in a leaf nests below it.
      const path = e.path === "" ? prefix : `${prefix}/${e.path}`;
      entries.push({ ...e, key: path, path, file: `${path}.jpg` });
    }
    orphans.push(...own.orphans.map((o) => `${leaf.folder.slice(folder.length + 1)}/renders/${o}`));
  }
  const count = (st: string) => entries.filter((e) => e.state === st).length;
  const counts = { total: entries.length, current: count("current"), outdated: count("outdated"), none: count("none"), orphans: orphans.length };
  const overall = counts.total === 0 || counts.none === counts.total ? "none" : counts.current === counts.total ? "current" : "outdated";
  return { entries, orphans, overall, counts };
}

export interface FolderNeedingRender {
  folder: string;
  state: FolderRenderState;
}

/** Every blueprint folder whose render is not current (and has something to render), sorted by path. */
export async function foldersNeedingRender(host: Host): Promise<FolderNeedingRender[]> {
  const out: FolderNeedingRender[] = [];
  const renderVersion = await readRenderVersion(host);
  for (const folder of await findBlueprintFolders(host)) {
    try {
      const state = await folderRenderState(host, folder, renderVersion);
      if (state.counts.total > 0 && state.overall !== "current") out.push({ folder, state });
    } catch {
      // an unreadable blueprint.json is reported by the other commands
    }
  }
  return out;
}

/** One line describing a folder's state, e.g. "3 of 12 outdated". */
export function describeState(s: FolderRenderState): string {
  return renderStateLabel(s).replace(/^Render: /, "");
}

/** "Show blueprints needing a render": pick one to open, or render them all. */
export async function showFoldersNeedingRender(host: Host): Promise<void> {
  const progress = host.ui.progress("Checking render state of every blueprint…");
  let list: FolderNeedingRender[];
  try {
    list = await foldersNeedingRender(host);
  } finally {
    progress.close();
  }
  if (list.length === 0) {
    host.ui.notice("Every blueprint's render is current.");
    return;
  }
  const items = [
    { label: `Render all ${list.length} that need it`, detail: "one after another; Cancel render preview stops after the current one" },
    ...list.map((f) => ({ label: f.folder, detail: describeState(f.state) })),
  ];
  const chosen = await host.ui.pick(items, "Blueprints whose render is missing or outdated");
  if (chosen === undefined) return;
  if (chosen === 0) {
    await renderAll(host, list.map((f) => f.folder));
    return;
  }
  await host.ui.openNote?.(joinPath(list[chosen - 1]!.folder, NOTES_FILE));
}

let queueCancelled = false;

/** Stop "Render all" after the current render (which is cancelled too). */
export function cancelRenderAll(): boolean {
  const running = isRendering();
  queueCancelled = true;
  if (running) cancelRender();
  return running;
}

/** "Render all that need it". */
export async function renderAllNeeded(host: Host): Promise<void> {
  const progress = host.ui.progress("Checking render state of every blueprint…");
  let list: FolderNeedingRender[];
  try {
    list = await foldersNeedingRender(host);
  } finally {
    progress.close();
  }
  if (list.length === 0) {
    host.ui.notice("Every blueprint's render is current.");
    return;
  }
  await renderAll(host, list.map((f) => f.folder));
}

export interface RenderAllResult {
  rendered: string[];
  failed: { folder: string; reason: string }[];
  cancelled: boolean;
}

async function renderAll(host: Host, folders: string[]): Promise<RenderAllResult> {
  if (isRendering()) {
    host.ui.notice("A render is already running; wait for it or cancel it first.", "error");
    return { rendered: [], failed: [], cancelled: false };
  }
  queueCancelled = false;
  const result: RenderAllResult = { rendered: [], failed: [], cancelled: false };
  const overall = host.ui.progress(`Rendering ${folders.length} blueprints…`);
  try {
    for (const [i, folder] of folders.entries()) {
      if (queueCancelled) {
        result.cancelled = true;
        break;
      }
      overall.update(`Rendering ${i + 1} of ${folders.length}: ${folder}`);
      const out = await renderPreview(host, folder, { onlyNeeded: true });
      if (out.action === "rendered") result.rendered.push(folder);
      else if (out.action === "cancelled") result.cancelled = true;
      else if (out.action === "needs-settings") {
        result.failed.push({ folder, reason: "Factorio path not set" });
        break; // every other folder would fail the same way
      } else result.failed.push({ folder, reason: "reason" in out ? out.reason : out.action });
      if (result.cancelled) break;
    }
  } finally {
    overall.close();
    queueCancelled = false;
  }
  const lines = [
    `Render all: ${result.rendered.length} of ${folders.length} rendered` +
      (result.failed.length > 0 ? `, ${result.failed.length} failed` : "") +
      (result.cancelled ? ", cancelled" : "") +
      ".",
    ...result.failed.map((f) => `${f.folder}: ${f.reason.split("\n")[0]}`),
  ];
  host.ui.notice(lines.join("\n"), result.failed.length > 0 || result.cancelled ? "error" : "info");
  return result;
}
