// The generated block at the top of a blueprint's notes, per
// _tools/docs/conventions.md ("Generated block"): a cover image when the
// folder has renders, and for books a nested list of links to every entry.
// Everything outside the markers belongs to the owner and is never touched.

import { type BookNode, displayLabel } from "./book-tree.ts";
import { splitFrontmatter } from "./frontmatter.ts";
import { coverUrl, stringUrl } from "./links.ts";

export const BLOCK_START = "<!-- blueprint:generated:start -->";
export const BLOCK_END = "<!-- blueprint:generated:end -->";

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
 * The block's lines (markers included, no line endings), or undefined when
 * it would be empty: a non-book without renders.
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
  return inner.length === 0 ? undefined : [BLOCK_START, ...inner, BLOCK_END];
}

export type BlockUpdate =
  | { status: "unchanged" | "inserted" | "replaced" | "removed"; text: string }
  | { status: "invalid"; text: string; reason: string };

/**
 * Put the block into a note (or take it out, with `lines` undefined).
 * - An existing block is replaced in place, wherever it is.
 * - A new block goes at the top of the body, right after the frontmatter,
 *   followed by a blank line before any text.
 * - Removing a block at the top also removes the blank line before it.
 * Line endings follow the note. Text outside the markers is not changed,
 * and applying the same block twice changes nothing. Markers that are
 * unpaired, repeated or not on their own lines leave the note alone.
 */
export function applyGeneratedBlock(note: string, lines: string[] | undefined): BlockUpdate {
  const split = splitFrontmatter(note);
  const head = note.slice(0, note.length - split.body.length);
  const body = split.body;
  const eol = split.yaml !== undefined ? split.eol : /\r\n/.test(note) ? "\r\n" : "\n";
  const block = lines === undefined ? undefined : lines.join(eol);

  const found = findBlock(body);
  if (found === "invalid") {
    return {
      status: "invalid",
      text: note,
      reason: "The generated block markers in this note are incomplete or repeated; fix them by hand.",
    };
  }

  if (found === undefined) {
    if (block === undefined) return { status: "unchanged", text: note };
    const after = body === "" || body.startsWith("\n") || body.startsWith("\r\n") ? body : eol + body;
    // After frontmatter, a blank line separates it from the block.
    const lead = split.yaml !== undefined ? eol : "";
    return { status: "inserted", text: head + lead + block + eol + after };
  }

  const before = body.slice(0, found.start);
  const after = body.slice(found.end);
  if (block === undefined) {
    // At the top of the body: also drop the line break we put before it.
    const atTop = /^(\r?\n)?$/.test(before);
    const rest = after.replace(/^\r?\n/, "");
    return { status: "removed", text: head + (atTop ? "" : before) + rest };
  }
  const current = body.slice(found.start, found.end);
  if (current === block) return { status: "unchanged", text: note };
  return { status: "replaced", text: head + before + block + after };
}

/** Offsets of the block in the body, from the start marker to the end of the end marker. */
function findBlock(body: string): { start: number; end: number } | undefined | "invalid" {
  const starts = markerLines(body, BLOCK_START);
  const ends = markerLines(body, BLOCK_END);
  const anywhere = (m: string) => body.split(m).length - 1;
  if (starts.length === 0 && ends.length === 0) {
    return anywhere(BLOCK_START) + anywhere(BLOCK_END) === 0 ? undefined : "invalid";
  }
  if (starts.length !== 1 || ends.length !== 1 || anywhere(BLOCK_START) !== 1 || anywhere(BLOCK_END) !== 1) {
    return "invalid";
  }
  const start = starts[0]!;
  const end = ends[0]! + BLOCK_END.length;
  return start < end - BLOCK_END.length ? { start, end } : "invalid";
}

/** Offsets where a marker stands alone on a line. */
function markerLines(body: string, marker: string): number[] {
  const out: number[] = [];
  for (let i = body.indexOf(marker); i !== -1; i = body.indexOf(marker, i + 1)) {
    const lineStart = i === 0 || body[i - 1] === "\n";
    const next = body.slice(i + marker.length, i + marker.length + 2);
    const lineEnd = next === "" || next[0] === "\n" || next === "\r\n";
    if (lineStart && lineEnd) out.push(i);
  }
  return out;
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
