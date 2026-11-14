// The version ledger of a published blueprint: versions.json next to its
// README.md (in an expanded book, the root book's folder), per
// _tools/docs/conventions.md ("Versions").
//
// A version is made on purpose: the note's `version` label names the
// content the folder holds. The ledger lists every version recorded, oldest
// first, each with the content hash it had (blueprintHash of the whole
// blueprint.json value, or of the assembled expanded book) and the commit
// that brought that content in. The plugin writes it when it publishes; CI
// only reads it (decideVersion is the rule both apply).

import { blueprintHash } from "./render-state.ts";

export const VERSIONS_FILE = "versions.json";

export interface VersionEntry {
  /** The note's `version` when it was recorded; unique in the ledger. */
  label: string;
  /** Author date of `commit`, ISO 8601 with offset (UTC as "Z"). */
  date: string;
  /** blueprintHash of the content. */
  hash: string;
  /** Full SHA of the commit that introduced the content. */
  commit: string;
}

export class VersionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VersionsError";
  }
}

/** The content hash of a blueprint value: the render tool's blueprintHash of the whole value. */
export function contentHash(value: unknown): string {
  return blueprintHash(value);
}

/** Why a `version` label cannot be used, or undefined when it can. Labels go into links as `@<label>`. */
export function versionLabelProblem(label: string): string | undefined {
  if (label.trim() === "") return "is empty";
  if (label !== label.trim()) return "starts or ends with a space";
  if (label.includes("/")) return 'contains "/"';
  if (/[\u0000-\u001f\u007f]/.test(label)) return "contains a control character";
  return undefined;
}

const HASH = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const DATE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;
const KEYS = ["label", "date", "hash", "commit"] as const;

/** Parse and check a versions.json; throws VersionsError saying what is wrong. */
export function readVersions(text: string): VersionEntry[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new VersionsError("is not valid JSON");
  }
  if (!Array.isArray(data)) throw new VersionsError("must be a list of versions");
  const out: VersionEntry[] = [];
  data.forEach((v, i) => {
    const at = `version ${i + 1}`;
    if (typeof v !== "object" || v === null || Array.isArray(v)) throw new VersionsError(`${at} is not an object`);
    const rec = v as Record<string, unknown>;
    for (const k of Object.keys(rec)) if (!(KEYS as readonly string[]).includes(k)) throw new VersionsError(`${at} has an unknown key "${k}"`);
    for (const k of KEYS) if (typeof rec[k] !== "string") throw new VersionsError(`${at} needs "${k}" as text`);
    const e = rec as unknown as VersionEntry;
    const bad = versionLabelProblem(e.label);
    if (bad) throw new VersionsError(`${at}: the label ${bad}`);
    if (!DATE.test(e.date)) throw new VersionsError(`${at}: "${e.date}" is not an ISO date and time`);
    if (!HASH.test(e.hash)) throw new VersionsError(`${at}: "${e.hash}" is not a content hash (64 lowercase hex digits)`);
    if (!COMMIT.test(e.commit)) throw new VersionsError(`${at}: "${e.commit}" is not a full commit SHA`);
    if (out.some((o) => o.label === e.label)) throw new VersionsError(`the label "${e.label}" is used twice`);
    if (out.some((o) => o.commit === e.commit)) throw new VersionsError(`${at} ("${e.label}") has the commit of another version`);
    if (out.at(-1)?.hash === e.hash) throw new VersionsError(`${at} ("${e.label}") has the same content as the version before it`);
    out.push({ label: e.label, date: e.date, hash: e.hash, commit: e.commit });
  });
  return out;
}

/** versions.json text: the entries oldest first, two-space indented, keys in a fixed order. */
export function writeVersions(entries: readonly VersionEntry[]): string {
  return JSON.stringify(entries.map(({ label, date, hash, commit }) => ({ label, date, hash, commit })), null, 2) + "\n";
}

/**
 * What the folder's current content and label mean for its ledger:
 * - current: the latest version, unchanged;
 * - rename: the same content under a new label: the latest version is renamed;
 * - new: new content under a label the ledger does not use: a new version;
 * - unbumped: new content under a label the ledger already uses (the
 *   latest's or an older one's): not published, the latest stays live;
 * - label-taken: the same content, relabelled to an older version's label:
 *   not allowed, the latest stays as it is.
 * Identical content never makes a new version.
 */
export type VersionDecision =
  | { kind: "current"; latest: VersionEntry }
  | { kind: "rename"; latest: VersionEntry; label: string }
  | { kind: "new"; label: string; hash: string; latest?: VersionEntry }
  | { kind: "unbumped"; label: string; latest: VersionEntry }
  | { kind: "label-taken"; label: string; latest: VersionEntry };

export function decideVersion(ledger: readonly VersionEntry[], hash: string, label: string): VersionDecision {
  const latest = ledger.at(-1);
  if (latest === undefined) return { kind: "new", label, hash };
  const used = ledger.some((v) => v.label === label);
  if (latest.hash === hash) {
    if (latest.label === label) return { kind: "current", latest };
    return used ? { kind: "label-taken", label, latest } : { kind: "rename", latest, label };
  }
  return used ? { kind: "unbumped", label, latest } : { kind: "new", label, hash, latest };
}

/** The ledger after a rename, or after recording a new version at `at`. Other decisions leave it as it is. */
export function applyVersionDecision(
  ledger: readonly VersionEntry[],
  d: VersionDecision,
  at?: { commit: string; date: string },
): VersionEntry[] {
  if (d.kind === "rename") return ledger.map((v, i) => (i === ledger.length - 1 ? { ...v, label: d.label } : v));
  if (d.kind === "new") {
    if (!at) throw new Error("a new version needs its commit");
    return [...ledger, { label: d.label, date: at.date, hash: d.hash, commit: at.commit }];
  }
  return [...ledger];
}

/** One line for the author about a decision that does not publish, or undefined when it publishes. */
export function versionHeldMessage(d: VersionDecision): string | undefined {
  if (d.kind === "unbumped") {
    const which = d.latest.label === d.label ? "is still" : "reuses the older version";
    return `content changed, bump \`version\` to publish: the note ${which} "${d.label}", so version "${d.latest.label}" stays live`;
  }
  if (d.kind === "label-taken") {
    return `\`version\` "${d.label}" is an older version's label; the content is that of version "${d.latest.label}", which stays live under its label`;
  }
  return undefined;
}
