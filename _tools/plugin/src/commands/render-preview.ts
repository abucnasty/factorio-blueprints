// "Render preview": run the render tool (_tools/render) for a blueprint
// folder, writing its images to <folder>/renders/, then refresh the notes'
// generated block and commit the folder.
//
// The tool prints its report with --json: the images it wrote (renders/3/1.jpg,
// renders/0.jpg for a single blueprint), the blueprints that got none and
// why, and it writes renders/render.json itself. Log text is never parsed.

import {
  BLUEPRINT_FILE,
  findBlueprintFolder,
  joinPath,
  NOTES_FILE,
  parseRenderManifest,
  readCanonicalJson,
  readNotesMeta,
  RENDER_MANIFEST,
  renderState,
} from "../core/index.ts";
import { listRenderFiles, refreshGeneratedBlock } from "./generated-notes.ts";
import type { Host } from "./host.ts";
import { reportGit } from "./git-notice.ts";

export const RENDER_SCRIPT = "_tools/render/bin/render.js";
export const RENDER_MODULES = "_tools/render/node_modules";

export type RenderOutcome =
  | { action: "rendered"; folder: string; images: string[]; problems: string[]; committed: boolean }
  | { action: "cancelled" | "busy" | "needs-settings" }
  | { action: "rejected" | "failed"; reason: string };

let active: AbortController | undefined;

/** True while a render runs (only one at a time). */
export function isRendering(): boolean {
  return active !== undefined;
}

/** Stop the running render; the tool stops the game on SIGINT. */
export function cancelRender(): boolean {
  if (!active) return false;
  active.abort();
  return true;
}

export interface RenderOptions {
  /** Render only the entries whose image is missing or outdated (--only). */
  onlyNeeded?: boolean;
}

export async function renderPreview(host: Host, contextFolder: string, options: RenderOptions = {}): Promise<RenderOutcome> {
  if (active) {
    host.ui.notice("A render is already running; wait for it or cancel it first.", "error");
    return { action: "busy" };
  }
  const controller = new AbortController();
  active = controller;
  try {
    return await run(host, contextFolder, controller.signal, options);
  } finally {
    active = undefined;
  }
}

async function run(host: Host, contextFolder: string, signal: AbortSignal, options: RenderOptions): Promise<RenderOutcome> {
  const { files, ui } = host;
  const folder = await findBlueprintFolder(contextFolder, (f) => files.exists(joinPath(f, BLUEPRINT_FILE)));
  if (folder === undefined) return reject(host, "This is not inside a blueprint folder (a folder with a blueprint.json).");
  if (host.processes === undefined || host.vaultPath === undefined) {
    return reject(host, "Rendering needs the desktop app with the vault on this computer's disk.");
  }
  const settings = host.settings.render;
  if (settings.factorioPath.trim() === "") {
    ui.notice(
      "Set the Factorio path for this computer (Settings, Factorio Blueprints, Factorio path), then render again.",
      "error",
    );
    ui.openSettings?.();
    return { action: "needs-settings" };
  }
  if (!(await files.exists(RENDER_SCRIPT))) {
    return reject(host, `The render tool is missing (${RENDER_SCRIPT}). Pull the latest vault and try again.`);
  }
  if (!(await files.exists(RENDER_MODULES))) {
    return reject(
      host,
      `The render tool's dependencies are not installed. In a terminal, run:\ncd "${absolute(host.vaultPath, "_tools/render")}" && npm ci\nthen render again.`,
    );
  }

  const abs = (p: string) => absolute(host.vaultPath!, p);
  const node = settings.nodePath.trim() || "node";

  // Only the entries that need it, when asked.
  let only: string[] = [];
  if (options.onlyNeeded) {
    let value: unknown;
    try {
      value = readCanonicalJson(await files.read(joinPath(folder, BLUEPRINT_FILE)));
    } catch (e) {
      return reject(host, `Could not read ${folder}/${BLUEPRINT_FILE}: ${e instanceof Error ? e.message : String(e)}`);
    }
    const manifestPath = joinPath(folder, "renders", RENDER_MANIFEST);
    const manifest = (await files.exists(manifestPath)) ? parseRenderManifest(await files.read(manifestPath)) : undefined;
    const state = renderState(value, manifest, await listRenderFiles(host, folder));
    const needed = state.entries.filter((e) => e.state !== "current").map((e) => e.path);
    if (needed.length === 0 && state.counts.total > 0) {
      ui.notice(`The render of ${folder} is already current.`);
      return { action: "rendered", folder, images: [], problems: [], committed: false };
    }
    // A single blueprint (slot path "") or everything needed: a whole run.
    if (needed.length < state.counts.total && !needed.includes("")) only = needed;
  }

  const args = [
    abs(RENDER_SCRIPT),
    "--factorio",
    settings.factorioPath.trim(),
    "--input",
    abs(joinPath(folder, BLUEPRINT_FILE)),
    "--out",
    abs(joinPath(folder, "renders")),
    "--json",
    ...(only.length > 0 ? ["--only", only.join(",")] : []),
    ...settings.extraArgs,
  ];
  const progress = ui.progress(`Rendering ${folder}: starting Factorio…`);
  let result;
  try {
    result = await host.processes.run(node, args, {
      cwd: host.vaultPath,
      signal,
      onStderrLine: (line) => {
        const text = line.trim();
        if (text !== "") progress.update(`Rendering ${folder}: ${text.length > 120 ? text.slice(0, 117) + "…" : text}`);
      },
    });
  } finally {
    progress.close();
  }

  if (signal.aborted) {
    ui.notice(`Render of ${folder} cancelled. Nothing was committed.`);
    return { action: "cancelled" };
  }
  const sandbox = result.sandbox;
  if (sandbox?.failure === "no-permission") {
    return fail(
      host,
      "Obsidian runs as a Flatpak, so the render has to start outside its sandbox, which it is not allowed to do yet. In a terminal, run:\n" +
        `flatpak override --user --talk-name=org.freedesktop.Flatpak ${sandbox.appId}\n` +
        "then quit and reopen Obsidian and render again.",
    );
  }
  if (sandbox?.failure === "launcher-missing") {
    return fail(
      host,
      "Obsidian runs as a Flatpak, but flatpak-spawn, which starts the render outside its sandbox, is not available in it, so the render cannot run.",
    );
  }
  if (result.code === -1 || sandbox?.failure === "command-not-found") {
    const why = result.code === -1 ? (result.error ?? "unknown error") : lastErrorLine(result.stderr);
    return fail(
      host,
      `Could not start Node.js (${node}): ${why}. Set "Node path" in the plugin settings.` +
        (sandbox ? " Obsidian runs as a Flatpak, so it must be the full path to node on the computer itself (what `which node` prints in a terminal)." : ""),
    );
  }
  if (result.code !== 0 && result.code !== 2) {
    return fail(host, `Render of ${folder} failed: ${lastErrorLine(result.stderr)}. Nothing was committed.`);
  }

  // Exit 0: every blueprint has an image; 2: some have none (see the report).
  // Without a parsable report (it should always be there), count what is in renders/.
  const report = parseReport(result.stdout);
  const images = report ? reportedFiles(report) : await listRenderFiles(host, folder);
  const problems = report ? reportedProblems(report) : result.code === 2 ? ["some blueprints got no image (no report)"] : [];
  const summary =
    `Rendered ${images.length} image${images.length === 1 ? "" : "s"} for ${folder}` +
    (problems.length > 0 ? ` (${problems.length} problem${problems.length === 1 ? "" : "s"}: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? "; …" : ""})` : "");
  if (images.length === 0) {
    ui.notice(`${summary}. Nothing to commit.`, "error");
    return { action: "rendered", folder, images, problems, committed: false };
  }

  const block = await refreshGeneratedBlock(host, folder);
  const blockNote = block.status === "skipped" && block.reason !== "no README.md" ? ` Notes not updated: ${block.reason}` : "";

  if (!host.settings.commitAfterImport || host.git === undefined) {
    ui.notice(`${summary}.${blockNote}`, problems.length > 0 ? "error" : "info");
    return { action: "rendered", folder, images, problems, committed: false };
  }
  if (!(await host.git.lfsAvailable())) {
    ui.notice(
      `${summary}, but git-lfs is not installed on this computer, so the images were not committed (they must not go into plain git). Run _tools/setup/setup-machine.sh, then commit with the Git plugin.${blockNote}`,
      "error",
    );
    return { action: "rendered", folder, images, problems, committed: false };
  }
  const git = await host.git.commitAndSync(folder, await commitMessage(host, folder));
  reportGit(host, summary, git, blockNote, blockNote !== "" || problems.length > 0);
  return {
    action: "rendered",
    folder,
    images,
    problems,
    committed: git.status === "pushed" || (git.status === "failed" && git.committed),
  };
}

/** `render <title>` or `render <title> <version>`. */
async function commitMessage(host: Host, folder: string): Promise<string> {
  let title = folder.slice(folder.lastIndexOf("/") + 1);
  let version: string | undefined;
  try {
    const meta = readNotesMeta(await host.files.read(joinPath(folder, NOTES_FILE)));
    title = meta.title ?? title;
    version = meta.version;
  } catch {
    // no or unreadable notes: the folder name will do
  }
  return `render ${title}${version !== undefined ? ` ${version}` : ""}`.replace(/\s+/g, " ").trim();
}

type Report = Record<string, unknown>;

function parseReport(stdout: string): Report | undefined {
  const text = stdout.trim();
  if (text === "") return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Report) : undefined;
  } catch {
    return undefined;
  }
}

/** The files the tool wrote this run, relative to renders/, sorted. */
function reportedFiles(report: Report): string[] {
  const images = Array.isArray(report["images"]) ? report["images"] : [];
  return images
    .map((i) => (typeof i === "object" && i !== null ? (i as Record<string, unknown>)["file"] : undefined))
    .filter((f): f is string => typeof f === "string" && f !== "")
    .sort();
}

/**
 * Problems worth a look: problems with the input, blueprints without an
 * image (except empty ones, which never get one), and entities that were
 * not built ("failed" and "missing" map entity names to counts).
 */
function reportedProblems(report: Report): string[] {
  const out: string[] = [];
  const name = (r: Record<string, unknown>) => {
    const label = typeof r["label"] === "string" && r["label"] !== "" ? ` "${r["label"]}"` : "";
    const path = typeof r["path"] === "string" && r["path"] !== "" ? `slot ${r["path"]}` : "the blueprint";
    return path + label;
  };
  const count = (v: unknown) =>
    typeof v === "object" && v !== null && !Array.isArray(v)
      ? Object.values(v).reduce((sum: number, n) => sum + (typeof n === "number" ? n : 0), 0)
      : 0;
  const list = (key: string) => (Array.isArray(report[key]) ? (report[key] as unknown[]) : []);
  for (const p of list("problems")) if (typeof p === "string" && p !== "") out.push(p);
  for (const m of list("without_image")) {
    if (typeof m !== "object" || m === null) continue;
    const r = m as Record<string, unknown>;
    if (r["reason"] === "empty blueprint") continue;
    out.push(`${name(r)}: no image${typeof r["reason"] === "string" ? ` (${r["reason"]})` : ""}`);
  }
  for (const i of list("images")) {
    if (typeof i !== "object" || i === null) continue;
    const r = i as Record<string, unknown>;
    const n = count(r["failed"]) + count(r["missing"]);
    if (n > 0) out.push(`${name(r)}: ${n} entit${n === 1 ? "y" : "ies"} not built`);
  }
  return out;
}

function lastErrorLine(stderr: string): string {
  const lines = stderr.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
  const line = [...lines].reverse().find((l) => /^render: /.test(l)) ?? lines.at(-1) ?? "no output";
  return line.length > 300 ? line.slice(0, 297) + "…" : line;
}

function absolute(vaultPath: string, path: string): string {
  return `${vaultPath.replace(/[\\/]+$/, "")}/${path}`;
}

function reject(host: Host, reason: string): RenderOutcome {
  host.ui.notice(reason, "error");
  return { action: "rejected", reason };
}

function fail(host: Host, reason: string): RenderOutcome {
  host.ui.notice(reason, "error");
  return { action: "failed", reason };
}
