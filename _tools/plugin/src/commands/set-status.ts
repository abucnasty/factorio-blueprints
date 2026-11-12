// "Set blueprint status": choose where a blueprint is published (draft,
// public, deprecated, unlisted) and write it to the status key of its note,
// then commit and push like an import. Inside an expanded book this is the
// root book's note: only that status counts.

import { BLUEPRINT_STATUSES, joinPath, NOTES_FILE, readFrontmatter, setNoteStatus } from "../core/index.ts";
import type { BlueprintStatus } from "../core/index.ts";
import type { GitResult } from "../git/commit-and-sync.ts";
import { locate } from "./expanded.ts";
import { reportGit } from "./git-notice.ts";
import type { Host, PickItem } from "./host.ts";

export type SetStatusOutcome =
  | { action: "set"; folder: string; status: BlueprintStatus; git: GitResult | undefined }
  | { action: "unchanged"; folder: string; status: BlueprintStatus }
  | { action: "cancelled" }
  | { action: "rejected"; reason: string };

const DETAILS: Record<BlueprintStatus, string> = {
  draft: "Not on the website, and no new version goes live; if it was published before, that version stays live",
  public: "Listed on the website; the live link works",
  deprecated: 'Listed behind "Show deprecated"; the live link works',
  unlisted: "Not listed or found by search, but opens by its direct address; the live link works",
};

export async function setBlueprintStatus(host: Host, contextFolder: string): Promise<SetStatusOutcome> {
  const loc = await locate(host, contextFolder);
  if (loc === undefined) return reject(host, "This is not inside a blueprint folder (a folder with a blueprint.json) or an expanded book.");
  const folder = loc.root;
  const notesPath = joinPath(folder, NOTES_FILE);
  if (!(await host.files.exists(notesPath))) return reject(host, `${folder} has no ${NOTES_FILE} to hold its status.`);

  let note: string;
  let fm: Record<string, unknown>;
  try {
    note = await host.files.read(notesPath);
    fm = readFrontmatter(note);
  } catch (e) {
    return reject(host, `Could not read ${notesPath}: ${errorText(e)}`);
  }
  const current = fm["status"];
  const title = typeof fm["title"] === "string" && fm["title"].trim() !== "" ? fm["title"] : folder;

  const items: PickItem[] = BLUEPRINT_STATUSES.map((s) => ({
    label: s === current ? `${capitalize(s)} (now)` : capitalize(s),
    detail: DETAILS[s],
  }));
  const where = loc.slots.length > 0 ? ` (the whole book ${folder})` : "";
  const index = await host.ui.pick(items, `Status of ${title}${where}`);
  if (index === undefined) return { action: "cancelled" };
  const status = BLUEPRINT_STATUSES[index]!;

  let next: string;
  try {
    next = setNoteStatus(note, status);
  } catch (e) {
    return reject(host, `Could not set the status in ${notesPath}: ${errorText(e)}`);
  }
  if (next === note) {
    host.ui.notice(`${title} is already ${status}.`);
    return { action: "unchanged", folder, status };
  }
  try {
    await host.files.write(notesPath, next);
  } catch (e) {
    return reject(host, `Could not write ${notesPath}: ${errorText(e)}`);
  }

  const done = `Set ${title} to ${status}`;
  if (!host.settings.commitAfterImport || host.git === undefined) {
    host.ui.notice(`${done}.`);
    return { action: "set", folder, status, git: undefined };
  }
  const git = await host.git.commitAndSync(folder, `set ${title} to ${status}`);
  reportGit(host, done, git);
  return { action: "set", folder, status, git };
}

function reject(host: Host, reason: string): SetStatusOutcome {
  host.ui.notice(reason, "error");
  return { action: "rejected", reason };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
