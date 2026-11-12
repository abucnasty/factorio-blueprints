// "Render preview": run the render tool (_tools/render) for a blueprint
// folder, writing its images to <folder>/renders/, then refresh the notes'
// generated block and commit the folder.
//
// The tool reports what it wrote in its --json report. Its naming moves to
// slot paths (renders/3/1.jpg) and each image gains its output file; until
// then images are found by scanning renders/. Log text is never parsed.

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
  renderTargets,
  writeRenderManifest,
} from "../core/index.ts";
import type { RenderManifest } from "../core/index.ts";
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
  /**
   * Render only the entries whose image is missing or outdated, when the
   * render tool supports --only; otherwise (or if every entry needs it)
   * the whole folder.
   */
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
  const manifestPath = joinPath(folder, "renders", RENDER_MANIFEST);
  const manifestBefore = (await files.exists(manifestPath)) ? await files.read(manifestPath) : undefined;
  let value: unknown;
  try {
    value = readCanonicalJson(await files.read(joinPath(folder, BLUEPRINT_FILE)));
  } catch (e) {
    return reject(host, `Could not read ${folder}/${BLUEPRINT_FILE}: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Only the entries that need it, when asked and the tool can.
  let only: string[] = [];
  if (options.onlyNeeded) {
    const state = renderState(value, parseRenderManifest(manifestBefore), await listRenderFiles(host, folder));
    const needed = state.entries.filter((e) => e.state !== "current").map((e) => e.path);
    if (needed.length === 0 && state.counts.total > 0) {
      ui.notice(`The render of ${folder} is already current.`);
      return { action: "rendered", folder, images: [], problems: [], committed: false };
    }
    if (needed.length > 0 && needed.length < state.counts.total && !needed.includes("") && (await supportsOnly(host, node, abs(RENDER_SCRIPT)))) {
      only = needed;
    }
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
  if (result.code === -1) {
    return fail(
      host,
      `Could not start Node.js (${settings.nodePath || "node"}): ${result.error ?? "unknown error"}. Set "Node path" in the plugin settings.`,
    );
  }
  if (result.code !== 0 && result.code !== 2) {
    return fail(host, `Render of ${folder} failed: ${lastErrorLine(result.stderr)}. Nothing was committed.`);
  }

  // Exit 0: every blueprint has an image; 2: some have none (see the report).
  const report = parseReport(result.stdout);
  const fromReport = report ? reportedFiles(report, abs(joinPath(folder, "renders"))) : undefined;
  const present = await listRenderFiles(host, folder);
  const images = fromReport && fromReport.length > 0 ? [...fromReport].sort() : present;
  const problems = report ? reportedProblems(report) : result.code === 2 ? ["some blueprints got no image (no report)"] : [];
  const summary =
    `Rendered ${images.length} image${images.length === 1 ? "" : "s"} for ${folder}` +
    (problems.length > 0 ? ` (${problems.length} problem${problems.length === 1 ? "" : "s"}: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? "; …" : ""})` : "");
  if (images.length === 0) {
    ui.notice(`${summary}. Nothing to commit.`, "error");
    return { action: "rendered", folder, images, problems, committed: false };
  }

  // A tool that writes no render.json leaves it to us, from its report.
  const manifestAfter = (await files.exists(manifestPath)) ? await files.read(manifestPath) : undefined;
  if (manifestAfter === undefined || manifestAfter === manifestBefore) {
    const written = manifestFromReport(value, parseRenderManifest(manifestBefore), report, fromReport, present, new Date().toISOString());
    if (written !== undefined) await files.write(manifestPath, writeRenderManifest(written));
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

/** Output files named in the report (in report order), relative to renders/; undefined if it names none. */
function reportedFiles(report: Report, rendersAbs: string): string[] | undefined {
  const images = Array.isArray(report["images"]) ? report["images"] : [];
  const out: string[] = [];
  for (const image of images) {
    if (typeof image !== "object" || image === null) continue;
    const r = image as Record<string, unknown>;
    const file = [r["output"], r["out"], r["file"]].find((f): f is string => typeof f === "string" && f !== "");
    if (file === undefined) return undefined;
    const norm = file.replace(/\\/g, "/");
    const base = rendersAbs.replace(/\\/g, "/").replace(/\/+$/, "") + "/";
    out.push(norm.startsWith(base) ? norm.slice(base.length) : norm.replace(/^(?:\.\/)?renders\//, ""));
  }
  return out.length > 0 ? out : undefined;
}

/** One line per blueprint without an image, or with entities it could not place. */
function reportedProblems(report: Report): string[] {
  const out: string[] = [];
  const name = (r: Record<string, unknown>) => {
    const label = typeof r["label"] === "string" && r["label"] !== "" ? ` "${r["label"]}"` : "";
    const path = typeof r["path"] === "string" && r["path"] !== "" ? `slot ${r["path"]}` : `blueprint ${String(r["number"] ?? "?")}`;
    return path + label;
  };
  const count = (v: unknown) => (Array.isArray(v) ? v.length : typeof v === "number" ? v : 0);
  for (const m of Array.isArray(report["without_image"]) ? report["without_image"] : []) {
    if (typeof m !== "object" || m === null) continue;
    const r = m as Record<string, unknown>;
    out.push(`${name(r)}: no image${typeof r["reason"] === "string" ? ` (${r["reason"]})` : ""}`);
  }
  for (const i of Array.isArray(report["images"]) ? report["images"] : []) {
    if (typeof i !== "object" || i === null) continue;
    const r = i as Record<string, unknown>;
    const failed = count(r["failed"]);
    const missing = count(r["missing"]);
    if (failed + missing > 0) out.push(`${name(r)}: ${failed + missing} entit${failed + missing === 1 ? "y" : "ies"} not built`);
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

let onlySupport: { script: string; supported: boolean } | undefined;

/** Whether the render tool takes --only (asked once per script via --help). */
async function supportsOnly(host: Host, node: string, script: string): Promise<boolean> {
  if (onlySupport?.script === script) return onlySupport.supported;
  const out = await host.processes!.run(node, [script, "--help"], { cwd: host.vaultPath! });
  const supported = out.code === 0 && /--only\b/.test(out.stdout + out.stderr);
  onlySupport = { script, supported };
  return supported;
}

/** Forget what --help said (for tests). */
export function resetRenderToolCache(): void {
  onlySupport = undefined;
}

/**
 * The manifest after a run, from the tool's report: entries rendered this
 * run get the current blueprint's hash, others are kept. Without a report,
 * every blueprint whose image exists by the naming rule is recorded.
 */
export function manifestFromReport(
  value: unknown,
  previous: RenderManifest | undefined,
  report: Report | undefined,
  reportedFiles: string[] | undefined,
  images: string[],
  now: string,
): RenderManifest | undefined {
  const targets = renderTargets(value);
  const byKey = new Map(targets.map((t) => [t.key, t]));
  const present = new Set(images);
  const entries = { ...(previous?.entries ?? {}) };
  let changed = false;
  const reported = report && Array.isArray(report["images"]) ? (report["images"] as unknown[]) : undefined;
  if (reported) {
    reported.forEach((item, i) => {
      if (typeof item !== "object" || item === null) return;
      const r = item as Record<string, unknown>;
      const path = typeof r["path"] === "string" ? r["path"] : undefined;
      const key = path === undefined ? undefined : path === "" ? "0" : path;
      const target = key === undefined ? undefined : byKey.get(key);
      if (!target) return;
      // The file: as reported, else by the naming rule, else an older tool's number.
      const numbered = typeof r["number"] === "number" ? `${r["number"]}.jpg` : undefined;
      const file = [reportedFiles?.[i], target.file, numbered].find((f): f is string => f !== undefined && present.has(f));
      if (file === undefined) return;
      entries[target.key] = {
        file,
        sha256: target.hash,
        ...(typeof r["width"] === "number" ? { width: r["width"] } : {}),
        ...(typeof r["height"] === "number" ? { height: r["height"] } : {}),
      };
      changed = true;
    });
  } else {
    for (const t of targets) {
      if (!present.has(t.file)) continue;
      entries[t.key] = { file: t.file, sha256: t.hash };
      changed = true;
    }
  }
  return changed ? { schema: 1, rendered_at: now, entries } : undefined;
}
