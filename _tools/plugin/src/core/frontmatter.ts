// Read and update the YAML frontmatter of a blueprint's README.md, per
// _tools/docs/conventions.md ("Notes file frontmatter").
//
// Updates are line edits: only the lines of the keys being changed are
// rewritten, so unknown keys, key order, comments, the body and the line
// endings all stay exactly as they were.

import { Document, isMap, isScalar, isSeq, parse, parseDocument } from "yaml";

/**
 * Where a blueprint is published (the root note's `status`; see the
 * conventions): draft is not published, public is listed, deprecated is
 * listed behind a switch, unlisted is served but not listed.
 */
export const BLUEPRINT_STATUSES = ["draft", "public", "deprecated", "unlisted"] as const;
export type BlueprintStatus = (typeof BLUEPRINT_STATUSES)[number];

export function isBlueprintStatus(v: unknown): v is BlueprintStatus {
  return typeof v === "string" && (BLUEPRINT_STATUSES as readonly string[]).includes(v);
}

export interface NotesMeta {
  title?: string;
  authors: string[];
  version?: string;
  posted?: string;
  video?: string;
  factoriobin?: string;
  /** Absent when the note has none or an unknown value. */
  status?: BlueprintStatus;
  previous_paths: string[];
}

export interface SplitNote {
  /** The YAML between the --- lines, or undefined if there is no frontmatter. */
  yaml: string | undefined;
  /** Text before the YAML: "---" plus its line ending. */
  open: string;
  /** Closing "---" line, including its line ending if any. */
  close: string;
  /** Everything after the frontmatter, byte for byte. */
  body: string;
  /** Line ending used in the frontmatter ("\n" or "\r\n"). */
  eol: string;
}

export class FrontmatterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrontmatterError";
  }
}

const OPEN = /^---[ \t]*(\r?\n)/;
const CLOSE = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m;

/** Split a note into frontmatter and body. */
export function splitFrontmatter(text: string): SplitNote {
  const open = OPEN.exec(text);
  if (open) {
    const rest = text.slice(open[0].length);
    // The closing line may come first (empty frontmatter).
    const close = CLOSE.exec(rest);
    if (close) {
      return {
        yaml: rest.slice(0, close.index),
        open: open[0],
        close: close[0],
        body: rest.slice(close.index + close[0].length),
        eol: open[1]!,
      };
    }
  }
  const eol = /\r\n/.test(text) ? "\r\n" : "\n";
  return { yaml: undefined, open: "", close: "", body: text, eol };
}

/** Parse the frontmatter into a plain object ({} if there is none). */
export function readFrontmatter(text: string): Record<string, unknown> {
  const { yaml } = splitFrontmatter(text);
  if (yaml === undefined || yaml.trim() === "") return {};
  let data: unknown;
  try {
    data = parse(yaml);
  } catch (e) {
    throw new FrontmatterError(`The frontmatter is not valid YAML: ${e instanceof Error ? e.message : e}`);
  }
  if (data === null || data === undefined) return {};
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new FrontmatterError("The frontmatter is not a list of keys and values.");
  }
  return data as Record<string, unknown>;
}

/**
 * The known fields, normalized: empty or null optional fields are absent,
 * numbers in string fields become strings, a single author becomes a list.
 */
export function readNotesMeta(text: string): NotesMeta {
  const fm = readFrontmatter(text);
  const meta: NotesMeta = {
    authors: stringList(fm["authors"]),
    previous_paths: stringList(fm["previous_paths"]),
  };
  for (const key of ["title", "version", "posted", "video", "factoriobin"] as const) {
    const v = optionalString(fm[key]);
    if (v !== undefined) meta[key] = v;
  }
  if (isBlueprintStatus(fm["status"])) meta.status = fm["status"];
  return meta;
}

/**
 * Set (or with undefined, remove) top-level frontmatter keys. Existing keys
 * keep their position; new keys are added at the end, or with `before`, in
 * front of the first of those keys the note has. A note without
 * frontmatter gets one.
 */
export function updateFrontmatter(text: string, updates: Record<string, unknown>, opts: { before?: readonly string[] } = {}): string {
  const note = splitFrontmatter(text);
  const yaml = note.yaml ?? "";
  const eol = note.eol;
  const lines = yaml === "" ? [] : yaml.replace(/\r?\n$/, "").split(/\r?\n/);
  const keyLines = topLevelKeyLines(yaml);

  // Edit from the bottom up so earlier line numbers stay valid.
  const edits: { key: string; start: number; end: number }[] = [];
  const appended: string[] = [];
  for (const [key, value] of Object.entries(updates)) {
    const i = keyLines.findIndex((k) => k.key === key);
    if (i === -1) {
      if (value !== undefined) appended.push(...renderPair(key, value));
      continue;
    }
    const start = keyLines[i]!.line;
    let end = i + 1 < keyLines.length ? keyLines[i + 1]!.line : lines.length;
    // Leave blank lines and column-0 comments before the next key alone.
    while (end > start + 1 && /^(?:\s*|#.*)$/.test(lines[end - 1]!)) end--;
    edits.push({ key, start, end });
  }
  const at = keyLines.find((k) => opts.before?.includes(k.key))?.line;
  // At one line, replace or remove the key there before inserting in front of it.
  const placed = at === undefined ? [] : [{ key: "", start: at, end: at }];
  for (const { key, start, end } of [...edits, ...placed].sort((a, b) => b.start - a.start || b.end - a.end)) {
    const value = updates[key];
    lines.splice(start, end - start, ...(key === "" ? appended : value === undefined ? [] : renderPair(key, value)));
  }
  if (at === undefined) lines.push(...appended);

  const open = note.yaml === undefined ? "---" + eol : note.open;
  const close = note.yaml === undefined ? "---" + eol : note.close || "---";
  const out = open + lines.map((l) => l + eol).join("") + close + note.body;

  // Never hand back something that does not say what was asked.
  const check = readFrontmatter(out);
  for (const [key, value] of Object.entries(updates)) {
    if (JSON.stringify(check[key]) !== JSON.stringify(value)) {
      throw new FrontmatterError(`Could not set "${key}" in the frontmatter.`);
    }
  }
  return out;
}

/**
 * Next version for "bump version": the last number in the string goes up by
 * one ("3" -> "4", "2.2" -> "2.3", "v1" -> "v2"). Absent becomes "2", as
 * the first import is version 1. Returns undefined if there is no number.
 */
export function bumpVersion(version: string | undefined): string | undefined {
  if (version === undefined || version.trim() === "") return "2";
  const m = /^(.*?)(\d+)(\D*)$/.exec(version.trim());
  if (!m) return undefined;
  return `${m[1]}${BigInt(m[2]!) + 1n}${m[3]}`;
}

function topLevelKeyLines(yaml: string): { key: string; line: number }[] {
  if (yaml.trim() === "") return [];
  const doc = parseDocument(yaml);
  if (doc.errors.length > 0) {
    throw new FrontmatterError(`The frontmatter is not valid YAML: ${doc.errors[0]!.message}`);
  }
  if (doc.contents === null) return [];
  if (!isMap(doc.contents) || doc.contents.flow) {
    throw new FrontmatterError("The frontmatter is not a list of keys and values.");
  }
  const lineStarts = [0];
  for (let i = 0; i < yaml.length; i++) if (yaml[i] === "\n") lineStarts.push(i + 1);
  const lineOf = (offset: number) => {
    let line = 0;
    while (line + 1 < lineStarts.length && lineStarts[line + 1]! <= offset) line++;
    return line;
  };
  const result: { key: string; line: number }[] = [];
  for (const pair of doc.contents.items) {
    if (!isScalar(pair.key) || !pair.key.range) {
      throw new FrontmatterError("The frontmatter has a key that is not plain text.");
    }
    const line = lineOf(pair.key.range[0]);
    if (result.some((r) => r.line === line)) {
      throw new FrontmatterError("The frontmatter has two keys on one line.");
    }
    result.push({ key: String(pair.key.value), line });
  }
  return result;
}

/** `key: value` as YAML lines, with lists written inline: `authors: [a, b]`. */
function renderPair(key: string, value: unknown): string[] {
  const doc = new Document({ [key]: value });
  const pair = isMap(doc.contents) ? doc.contents.items[0] : undefined;
  const node = pair?.value;
  if (isSeq(node) || isMap(node)) node.flow = true;
  // Multi-line text, and version-like text such as 2.1.24 (always quoted,
  // so it never reads as a number).
  if (isScalar(node) && typeof node.value === "string" && /[\r\n]|^[\d.]+$/.test(node.value)) {
    node.type = "QUOTE_DOUBLE";
  }
  return doc
    .toString({ lineWidth: 0, flowCollectionPadding: false })
    .replace(/\n$/, "")
    .split("\n");
}

function optionalString(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") return v.trim() === "" ? undefined : v;
  return undefined;
}

function stringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(optionalString).filter((s): s is string => s !== undefined);
  const one = optionalString(v);
  return one === undefined ? [] : [one];
}
