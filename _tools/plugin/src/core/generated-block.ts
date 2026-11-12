// The generated block at the top of a blueprint's notes, per
// _tools/docs/conventions.md ("Generated block"): a cover image when the
// folder has renders, and for books a nested list of links to every entry.
// It has no markers: the plugin recognises it by its shape at the top of the
// body, and never changes anything below it.

import { type BookNode, displayLabel } from "./book-tree.ts";
import { splitFrontmatter } from "./frontmatter.ts";
import { coverUrl, stringUrl } from "./links.ts";

export interface BlockInput {
  /** Link Worker base URL. */
  base: string;
  /** Vault path of the blueprint folder. */
  folder: string;
  /** Display title (frontmatter title, or the folder name). */
  title: string;
  tree: BookNode;
  /** True if the folder has at least one render file locally. */
  hasRenders: boolean;
}

/**
 * The block's lines (no line endings), or undefined when it would be
 * empty: a non-book without renders.
 */
export function generatedBlockLines(input: BlockInput): string[] | undefined {
  const inner: string[] = [];
  if (input.hasRenders) {
    inner.push(`![${escapeInline(input.title)}](${coverUrl(input.base, input.folder)})`);
  }
  if (input.tree.kind === "blueprint-book" && input.tree.children.length > 0) {
    if (inner.length > 0) inner.push("");
    const visit = (n: BookNode, depth: number) => {
      const indent = "  ".repeat(depth);
      const label = escapeInline(displayLabel(n));
      const url = stringUrl(input.base, input.folder, n.slots);
      inner.push(n.kind === "blueprint-book" ? `${indent}- ${label} ([book](${url}))` : `${indent}- [${label}](${url})`);
      for (const c of n.children) visit(c, depth + 1);
    };
    for (const c of input.tree.children) visit(c, 0);
  }
  return inner.length === 0 ? undefined : inner;
}

export type BlockUpdate =
  | { status: "unchanged" | "inserted" | "replaced" | "removed"; text: string }
  | { status: "invalid"; text: string; reason: string };

/** A line that is exactly one image of an http(s) URL ending in /cover.jpg. */
const COVER_LINE = /^!\[(?:[^\]\\]|\\.)*\]\(https?:\/\/[^\s()]+\/cover\.jpg\)[ \t]*$/;
/** A list item ending in a link to an http(s) URL ending in .txt: `- [label](url)` or `- label ([book](url))`. */
const LIST_ITEM =
  /^[ \t]*- (?:\[(?:[^\]\\]|\\.)*\]\(https?:\/\/[^\s()]+\.txt\)|.*\(\[book\]\(https?:\/\/[^\s()]+\.txt\)\))[ \t]*$/;

interface Line {
  /** Text without its line ending. */
  text: string;
  start: number;
  /** Offset after the line ending. */
  end: number;
}

function lines(body: string): Line[] {
  const out: Line[] = [];
  for (let start = 0; start < body.length; ) {
    const nl = body.indexOf("\n", start);
    const end = nl === -1 ? body.length : nl + 1;
    out.push({ text: body.slice(start, nl === -1 ? end : nl).replace(/\r$/, ""), start, end });
    start = end;
  }
  return out;
}

const blank = (l: Line) => l.text.trim() === "";

/** Offsets [start, end) of the generated block at the top of the body, or undefined. */
export function findGeneratedBlock(body: string): { start: number; end: number } | undefined {
  const ls = lines(body);
  let i = 0;
  while (i < ls.length && blank(ls[i]!)) i++;
  const first = i;
  let end: number | undefined;
  if (i < ls.length && COVER_LINE.test(ls[i]!.text)) {
    end = ls[i]!.end;
    i++;
    while (i < ls.length && blank(ls[i]!)) i++;
  }
  while (i < ls.length && LIST_ITEM.test(ls[i]!.text)) {
    end = ls[i]!.end;
    i++;
  }
  return end === undefined ? undefined : { start: ls[first]!.start, end };
}

/**
 * Put the block at the top of a note's body (or take it out, with `lines`
 * undefined): one blank line after the frontmatter, one blank line before
 * the owner's text. An existing block is recognised by its shape and
 * replaced. Line endings follow the note; text below the block is kept
 * byte for byte (only the blank lines between it and the block are
 * normalised to one); applying the same block twice changes nothing.
 */
export function applyGeneratedBlock(note: string, blockLines: string[] | undefined): BlockUpdate {
  const split = splitFrontmatter(note);
  const head = note.slice(0, note.length - split.body.length);
  const eol = split.yaml !== undefined ? split.eol : /\r\n/.test(note) ? "\r\n" : "\n";

  // Migration: notes from before the block lost its markers. Delete this once no note has markers.
  const legacy = removeLegacyMarkedBlock(split.body);
  if (legacy === "invalid") {
    return {
      status: "invalid",
      text: note,
      reason: "This note has an incomplete or repeated <!-- blueprint:generated --> marker; remove it by hand.",
    };
  }
  const body = legacy ?? split.body;

  const found = findGeneratedBlock(body);
  if (found === undefined && legacy === undefined && blockLines === undefined) return { status: "unchanged", text: note };
  const rest = (found ? body.slice(found.end) : body).replace(/^(?:[ \t]*\r?\n)+/, "");
  const lead = split.yaml !== undefined ? eol : "";
  const text =
    blockLines === undefined
      ? head + (rest === "" ? "" : lead + rest)
      : head + lead + blockLines.join(eol) + eol + (rest === "" ? "" : eol + rest);
  if (text === note) return { status: "unchanged", text };
  const existed = found !== undefined || legacy !== undefined;
  return { status: blockLines === undefined ? "removed" : existed ? "replaced" : "inserted", text };
}

// Legacy markers, written by the plugin before the block lost them.
const LEGACY_START = "<!-- blueprint:generated:start -->";
const LEGACY_END = "<!-- blueprint:generated:end -->";

/**
 * The body without a well-formed legacy marked block (wherever it is), or
 * undefined if there are no markers, or "invalid" for stray or repeated ones.
 */
function removeLegacyMarkedBlock(body: string): string | undefined | "invalid" {
  const count = (m: string) => body.split(m).length - 1;
  if (count(LEGACY_START) + count(LEGACY_END) === 0) return undefined;
  if (count(LEGACY_START) !== 1 || count(LEGACY_END) !== 1) return "invalid";
  const ls = lines(body);
  const s = ls.findIndex((l) => l.text.trim() === LEGACY_START);
  const e = ls.findIndex((l) => l.text.trim() === LEGACY_END);
  if (s === -1 || e === -1 || e < s) return "invalid";
  const before = body.slice(0, ls[s]!.start);
  let after = body.slice(ls[e]!.end);
  // Do not leave two blank lines where the block was.
  if (/(?:^|\n)[ \t]*\r?\n$/.test(before) || before === "") after = after.replace(/^[ \t]*\r?\n/, "");
  return before + after;
}

/**
 * Plain text made safe inside a Markdown list item, link text or image alt:
 * no markup, no HTML, no Obsidian syntax, one line.
 */
export function escapeInline(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  // Backslash-escape ASCII punctuation that Markdown or Obsidian can read as
  // syntax (CommonMark allows escaping any ASCII punctuation).
  let out = oneLine.replace(/[\\`*_[\]{}<>#!|~=$%^&]/g, "\\$&");
  // At the start of a list item, "-", "+" or "1." would open a nested list.
  out = out.replace(/^([-+])/, "\\$1").replace(/^(\d+)([.)])/, "$1\\$2");
  return out;
}
