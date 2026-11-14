// Publishing a blueprint's version along with a commit. Every command that
// commits a blueprint folder goes through commitAndPublish: when the root
// note publishes the blueprint (any status but draft), the note's `version`
// label and the folder's content are checked against its ledger,
// versions.json (see the core's versions.ts and _tools/docs/conventions.md):
// - the same content and label: nothing to record;
// - the same content, a new label: the latest version is renamed (in the
//   same commit);
// - new content, a new label: a new version, recorded with the commit that
//   brings the content in (a second commit, pushed with it);
// - new content under a label already used: committed but not published;
//   the author is told to bump `version`.
// CI only reads the ledger, so this is the one place that writes it.

import {
  applyVersionDecision,
  baseName,
  contentHash,
  isBlueprintStatus,
  decideVersion,
  joinPath,
  NOTES_FILE,
  readFrontmatter,
  readNotesMeta,
  readVersions,
  versionHeldMessage,
  versionLabelProblem,
  VERSIONS_FILE,
  writeVersions,
} from "../core/index.ts";
import type { VersionDecision, VersionEntry } from "../core/index.ts";
import type { GitResult } from "../git/commit-and-sync.ts";
import { folderValue, locate } from "./expanded.ts";
import { reportGit } from "./git-notice.ts";
import type { Host } from "./host.ts";

/** What publishing means for a folder right now. */
export type VersionPlan =
  | { kind: "unpublished" }
  | { kind: "problem"; root: string; message: string }
  | { kind: "decided"; root: string; title: string; ledger: VersionEntry[]; decision: VersionDecision };

/** Read the root note, the ledger and the content of the blueprint that `folder` is in, and apply the version rules. */
export async function planVersion(host: Host, folder: string): Promise<VersionPlan> {
  const loc = await locate(host, folder);
  if (loc === undefined) return { kind: "unpublished" };
  const root = loc.root;
  const notesPath = joinPath(root, NOTES_FILE);
  if (!(await host.files.exists(notesPath))) return { kind: "unpublished" };
  const problem = (message: string): VersionPlan => ({ kind: "problem", root, message });
  let note: string;
  try {
    note = await host.files.read(notesPath);
    const status = readFrontmatter(note)["status"];
    if (!isBlueprintStatus(status) || status === "draft") return { kind: "unpublished" };
  } catch (e) {
    return problem(`${notesPath} cannot be read: ${errorText(e)}`);
  }
  const meta = readNotesMeta(note);
  const title = meta.title ?? baseName(root);
  const label = meta.version;
  if (label === undefined) return problem('set `version` in the note (a label such as "1.0") to publish');
  const bad = versionLabelProblem(label);
  if (bad !== undefined) return problem(`\`version\` ${bad}; change it to publish`);
  const ledgerPath = joinPath(root, VERSIONS_FILE);
  let ledger: VersionEntry[] = [];
  try {
    if (await host.files.exists(ledgerPath)) ledger = readVersions(await host.files.read(ledgerPath));
  } catch (e) {
    return problem(`${ledgerPath} ${errorText(e)}; fix it to publish`);
  }
  let hash: string;
  try {
    hash = contentHash(await folderValue(host, { folder: root, kind: root === loc.folder ? loc.kind : "book" }));
  } catch (e) {
    return problem(`the blueprint cannot be read: ${errorText(e)}`);
  }
  return { kind: "decided", root, title, ledger, decision: decideVersion(ledger, hash, label) };
}

export interface PublishResult {
  git: GitResult;
  /** Text for the notice about the version (empty when there is nothing to say). */
  note: string;
  /** The version was not published: show the notice as a warning. */
  warn: boolean;
}

/**
 * Commit, pull and push `folder` (host.git must be set), recording or
 * renaming the blueprint's version on the way.
 */
export async function commitAndPublish(host: Host, folder: string, message: string): Promise<PublishResult> {
  const plan = await planVersion(host, folder);
  if (plan.kind === "unpublished") return { git: await host.git!.commitAndSync(folder, message), note: "", warn: false };
  if (plan.kind === "problem") {
    return { git: await host.git!.commitAndSync(folder, message), note: ` Not published: ${plan.message}.`, warn: true };
  }
  const { root, title, ledger, decision: d } = plan;
  const ledgerPath = joinPath(root, VERSIONS_FILE);
  const held = versionHeldMessage(d);
  if (held !== undefined) {
    return { git: await host.git!.commitAndSync(folder, message), note: ` Not published: ${held}.`, warn: true };
  }
  if (d.kind === "current") return { git: await host.git!.commitAndSync(folder, message), note: "", warn: false };
  if (d.kind === "rename") {
    await host.files.write(ledgerPath, writeVersions(applyVersionDecision(ledger, d)));
    const git = await host.git!.commitAndSync(folder, message);
    return { git, note: ` Version "${d.latest.label}" is now "${d.label}".`, warn: false };
  }
  // A new version: recorded once the content is committed, with that commit.
  let recorded = false;
  const git = await host.git!.commitAndSync(folder, message, async (last) => {
    await host.files.write(ledgerPath, writeVersions(applyVersionDecision(ledger, d, last)));
    recorded = true;
    return `record ${title} version ${d.label}`;
  });
  return recorded
    ? { git, note: ` Published version "${d.label}".`, warn: false }
    : { git, note: ` Version "${d.label}" was not recorded; run "Publish version" once the commit went through.`, warn: true };
}

/** Commit, pull and push like commitAndPublish, then show the notice for it. */
export async function publishAndReport(host: Host, folder: string, message: string, done: string, extra = "", warn = extra !== ""): Promise<GitResult> {
  const r = await commitAndPublish(host, folder, message);
  reportGit(host, done, r.git, extra + r.note, warn || r.warn);
  return r.git;
}

/**
 * "Publish version": commit and push the blueprint the folder is in,
 * recording its `version` (or renaming the latest one); for a version label
 * edited by hand, or a change committed outside the plugin.
 */
export async function publishVersion(host: Host, contextFolder: string): Promise<PublishResult | undefined> {
  const plan = await planVersion(host, contextFolder);
  if (plan.kind === "unpublished") {
    host.ui.notice('This blueprint is not published: set its status (Set blueprint status) first.', "error");
    return undefined;
  }
  if (plan.kind === "problem") {
    host.ui.notice(`Not published: ${plan.message}.`, "error");
    return undefined;
  }
  if (host.git === undefined) {
    host.ui.notice("Publishing a version needs git, which is not available here.", "error");
    return undefined;
  }
  const d = plan.decision;
  if (d.kind === "current") {
    host.ui.notice(`${plan.title} is published as version "${d.latest.label}"; nothing new to publish.`);
    return undefined;
  }
  const held = versionHeldMessage(d);
  if (held !== undefined) {
    host.ui.notice(`${plan.title} was not published: ${held}.`, "error");
    return undefined;
  }
  const r = await commitAndPublish(host, plan.root, `publish ${plan.title}`);
  reportGit(host, `Published ${plan.title}`, r.git, r.note, r.warn);
  return r;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
