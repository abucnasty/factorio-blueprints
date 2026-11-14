// "Import blueprint from clipboard": decode the clipboard and write
// blueprint.json, creating a new blueprint folder or updating the one the
// user is in, then commit, pull and push that folder.

import {
  BLUEPRINT_FILE,
  BLUEPRINTS_ROOT,
  BlueprintStringError,
  bumpVersion,
  decodeBlueprintString,
  describeBlueprint,
  fillNotesTemplate,
  findBlueprintFolder,
  findLossyNumbers,
  isScannedPath,
  isValidSlug,
  joinPath,
  baseName,
  KIND_NAMES,
  NOTES_FILE,
  plainLabel,
  readCanonicalJson,
  readNotesMeta,
  slugify,
  summarizeBlueprint,
  updateFrontmatter,
  writeCanonicalJson,
  DEFAULT_NOTES_TEMPLATE,
} from "../core/index.ts";
import type { BlueprintDescription } from "../core/index.ts";
import type { GitResult } from "../git/commit-and-sync.ts";
import { locate, locateBySlots } from "./expanded.ts";
import { addEntryToBook, updateExpandedBook } from "./expanded-import.ts";
import type { ExpandedImportOutcome } from "./expanded-import.ts";
import { noteWithBlock, refreshExpandedBook } from "./generated-notes.ts";
import type { Host } from "./host.ts";
import { publishAndReport } from "./publish.ts";
import { renderPreview } from "./render-preview.ts";
import { describeState, folderRenderState } from "./render-status.ts";

export type ImportOutcome =
  | { action: "created" | "updated"; folder: string; git: GitResult | undefined }
  | { action: "expanded-book"; result: ExpandedImportOutcome }
  | { action: "unchanged"; folder: string }
  | { action: "cancelled" }
  | { action: "rejected"; reason: string };

export type ImportTarget =
  | { mode: "update"; folder: string }
  | { mode: "create"; parent: string }
  | { mode: "refuse"; reason: string };

/**
 * Where an import from `contextFolder` goes: the blueprint folder that
 * contains it (update), or a new folder inside it (create). New blueprints
 * go under blueprints/ (from the vault root, straight into it), never under
 * another top-level folder or one starting with "_" or ".", as those are
 * never scanned.
 */
export async function chooseImportTarget(host: Host, contextFolder: string): Promise<ImportTarget> {
  const loc = await locate(host, contextFolder);
  if (loc?.kind === "blueprint") return { mode: "update", folder: loc.folder };
  const parent = joinPath(contextFolder);
  if (parent === "" || parent === BLUEPRINTS_ROOT) return { mode: "create", parent: BLUEPRINTS_ROOT };
  if (!isScannedPath(parent)) {
    return {
      mode: "refuse",
      reason: `Blueprints cannot be created in "${contextFolder}": they go in ${BLUEPRINTS_ROOT}/, outside folders starting with "_" or ".".`,
    };
  }
  return { mode: "create", parent };
}

export async function importFromClipboard(host: Host, contextFolder: string): Promise<ImportOutcome> {
  const { ui } = host;

  // 1. Read and check the clipboard before touching anything.
  let text: string;
  try {
    text = await host.clipboard.readText();
  } catch (e) {
    return reject(host, `Could not read the clipboard: ${errorText(e)}`);
  }
  let value: unknown;
  let json: string;
  let description: BlueprintDescription;
  try {
    ({ value, json } = decodeBlueprintString(text));
    description = describeBlueprint(value);
  } catch (e) {
    return reject(host, clipboardErrorMessage(e));
  }
  const lossy = findLossyNumbers(json);
  if (lossy.length > 0) {
    return reject(
      host,
      `This blueprint has numbers that cannot be stored exactly (${lossy.slice(0, 3).join(", ")}). Nothing was written.`,
    );
  }
  const canonical = writeCanonicalJson(value);
  const summary = summarizeBlueprint(description);

  // 2. Decide where it goes and ask the user, still without writing.
  // An expanded book: a book updates it slot by slot, anything else is added as a new entry.
  const loc = await locate(host, contextFolder);
  if (loc?.kind === "book") {
    const result =
      description.kind === "blueprint-book" ? await updateExpandedBook(host, loc, value) : await addEntryToBook(host, loc, value);
    return { action: "expanded-book", result };
  }

  const target = await chooseImportTarget(host, contextFolder);
  if (target.mode === "refuse") return reject(host, target.reason);
  const commit = host.settings.commitAfterImport && host.git !== undefined;

  let folder: string;
  let blockWarning = "";
  let commitMessage: string;
  let action: "created" | "updated";
  if (target.mode === "update") {
    folder = target.folder;
    const jsonPath = joinPath(folder, BLUEPRINT_FILE);
    const notesPath = joinPath(folder, NOTES_FILE);
    const previous = await host.files.read(jsonPath).catch(() => undefined);
    if (previous === canonical) {
      ui.notice(`${folder} already holds this ${KIND_NAMES[description.kind]}; nothing to do.`);
      return { action: "unchanged", folder };
    }
    const notes = (await host.files.exists(notesPath))
      ? await host.files.read(notesPath).catch(() => undefined)
      : undefined;
    let meta: ReturnType<typeof readNotesMeta> | undefined;
    try {
      meta = notes === undefined ? undefined : readNotesMeta(notes);
    } catch {
      meta = undefined; // unreadable frontmatter: still import, just no version bump
    }
    const title = meta?.title ?? baseName(folder);
    const answer = await ui.askUpdate({
      folder,
      title,
      summary,
      previousSummary: previous === undefined ? undefined : safeSummary(previous),
      currentVersion: meta?.version,
      suggestedVersion: bumpVersion(meta?.version),
      canBumpVersion: notes !== undefined && meta !== undefined,
      askChangeNote: commit,
    });
    if (!answer) return { action: "cancelled" };

    // 3a. Write.
    try {
      await host.files.write(jsonPath, canonical);
      if (notes !== undefined) {
        let next = notes;
        if (answer.newVersion !== undefined && answer.newVersion !== meta?.version) {
          next = updateFrontmatter(next, { version: answer.newVersion });
        }
        const block = await noteWithBlock(host, folder, next, value);
        if (block.status === "invalid") blockWarning = ` ${block.reason}`;
        else next = block.text;
        if (next !== notes) await host.files.write(notesPath, next);
      }
    } catch (e) {
      return reject(host, `Could not write ${folder}: ${errorText(e)}`);
    }
    commitMessage = oneLine(answer.changeNote) || `update ${title}`;
    action = "updated";
  } else {
    const title = plainLabel(description.label ?? "") || capitalize(KIND_NAMES[description.kind]);
    const slug = slugify(title) || slugify(KIND_NAMES[description.kind]);
    // A book whose folder already exists as an expanded book updates it.
    if (description.kind === "blueprint-book") {
      const existing = await locate(host, joinPath(target.parent, slug));
      if (existing?.kind === "book" && existing.folder === joinPath(target.parent, slug)) {
        return { action: "expanded-book", result: await updateExpandedBook(host, existing, value) };
      }
    }
    const checkSlug = (s: string) => checkNewSlug(host, target.parent, s);
    const answer = await ui.askCreate({
      parent: target.parent,
      summary,
      title,
      slug,
      askChangeNote: commit,
      checkSlug,
    });
    if (!answer) return { action: "cancelled" };
    const problem = await checkSlug(answer.slug);
    if (problem !== undefined) return reject(host, problem);
    const newTitle = oneLine(answer.title) || title;

    // 3b. Write.
    folder = joinPath(target.parent, answer.slug);
    try {
      await host.files.mkdir(folder);
      await host.files.write(joinPath(folder, BLUEPRINT_FILE), canonical);
      const template = await readTemplate(host);
      const notes = fillNotesTemplate(template, {
        title: newTitle,
        posted: host.today(),
        authors: host.settings.authors,
      });
      const block = await noteWithBlock(host, folder, notes, value);
      if (block.status === "invalid") blockWarning = ` ${block.reason}`;
      await host.files.write(joinPath(folder, NOTES_FILE), block.text);
    } catch (e) {
      return reject(host, `Could not write ${folder}: ${errorText(e)}`);
    }
    commitMessage = oneLine(answer.changeNote) || `add ${newTitle}`;
    action = "created";
    if (ui.openNote) await ui.openNote(joinPath(folder, NOTES_FILE)).catch(() => undefined);
  }

  // A leaf of an expanded book: its folder name follows its label, and the
  // book's notes list it; the commit covers the whole root book.
  let commitFolder = folder;
  if (action === "updated" && loc && loc.slots.length > 0) {
    try {
      await refreshExpandedBook(host, loc.root);
      folder = (await locateBySlots(host, loc.root, loc.slots)) ?? folder;
    } catch (e) {
      blockWarning += ` The book's notes were not refreshed: ${errorText(e)}`;
    }
    commitFolder = loc.root;
  }

  // 4. Commit, pull and push just this folder.
  const verb = action === "created" ? "Created" : "Updated";
  let renderNote = "";
  if (action === "updated") {
    try {
      const state = await folderRenderState(host, folder);
      if (state.overall === "outdated") {
        renderNote = ` (its render is now outdated: ${describeState(state)}; run Render preview)`;
      }
    } catch {
      // no render state to report
    }
  }
  let git: GitResult | undefined;
  if (!commit) {
    ui.notice(`${verb} ${folder} with ${summary}${renderNote}.${blockWarning}`);
  } else {
    git = await publishAndReport(host, commitFolder, commitMessage, `${verb} ${folder} with ${summary}${renderNote}`, blockWarning);
  }

  // 5. Optionally render previews (a separate commit).
  if (host.settings.render.afterImport) await renderPreview(host, folder);
  return { action, folder, git };
}

/** Error message for an unusable folder name, or undefined if it is fine. */
export async function checkNewSlug(host: Host, parent: string, slug: string): Promise<string | undefined> {
  if (!isValidSlug(slug)) {
    return "Use lowercase letters, digits and single dashes only, for example military-science-240.";
  }
  if (await host.files.exists(joinPath(parent, slug))) {
    return `${joinPath(parent, slug)} already exists; choose another name.`;
  }
  return undefined;
}

/** The notes template from the vault, or the built-in copy. */
export async function readTemplate(host: Host): Promise<string> {
  const path = host.settings.templatePath.trim();
  if (path !== "") {
    try {
      if (await host.files.exists(path)) return await host.files.read(path);
    } catch {
      // fall through to the built-in copy
    }
  }
  return DEFAULT_NOTES_TEMPLATE;
}

export function clipboardErrorMessage(e: unknown): string {
  if (e instanceof BlueprintStringError) {
    switch (e.code) {
      case "empty":
        return "The clipboard is empty. Copy a blueprint string in Factorio first.";
      case "not-a-blueprint-string":
        return "The clipboard does not hold a blueprint string. In Factorio, open the blueprint and choose Export to string.";
      case "unsupported-version":
        return `${e.message} This string is from a newer Factorio format that this plugin cannot read.`;
      case "corrupt":
        return `${e.message} Copy the string again; it may have been cut short.`;
      case "not-a-blueprint":
        return e.message;
    }
  }
  return `Could not read the blueprint string: ${errorText(e)}`;
}

function safeSummary(text: string): string | undefined {
  try {
    return summarizeBlueprint(describeBlueprint(readCanonicalJson(text)));
  } catch {
    return undefined;
  }
}

function reject(host: Host, reason: string): ImportOutcome {
  host.ui.notice(reason, "error");
  return { action: "rejected", reason };
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
