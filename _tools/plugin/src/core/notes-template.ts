// The notes file for a new blueprint folder, and its status.

import { type BlueprintStatus, isBlueprintStatus, readFrontmatter, updateFrontmatter } from "./frontmatter.ts";
import { STATS_KEYS } from "./stats.ts";

/**
 * Built-in copy of _tools/templates/blueprint-notes.md, used when that file
 * cannot be read. A unit test keeps the two identical.
 */
export const DEFAULT_NOTES_TEMPLATE = `---
title:
authors: []
version: "1"
posted:
status: draft
---
`;

export interface NewNotesFields {
  title: string;
  /** ISO date, YYYY-MM-DD. */
  posted: string;
  /** Left as the template has it when empty. */
  authors: string[];
  /**
   * The note of a slot folder inside an expanded book: it has no status
   * (only the root book's counts), so the template's is removed.
   */
  entry?: boolean;
}

/**
 * Fill a template's frontmatter for a new blueprint. A new root note keeps
 * the template's status, or gets `status: draft` when the template has no
 * valid one, so nothing is published until the owner says so.
 */
export function fillNotesTemplate(template: string, fields: NewNotesFields): string {
  const updates: Record<string, unknown> = { title: fields.title, posted: fields.posted };
  if (fields.authors.length > 0) updates["authors"] = fields.authors;
  const status = readFrontmatter(template)["status"];
  if (fields.entry) updates["status"] = undefined;
  else if (!isBlueprintStatus(status)) updates["status"] = "draft";
  return updateFrontmatter(template, updates, { before: STATS_KEYS });
}

/**
 * Set a root note's status. A leftover `deprecated` key (the checkbox status
 * replaced) is removed and the status takes its place; otherwise it goes in
 * front of the generated stats keys, or at the end.
 */
export function setNoteStatus(note: string, status: BlueprintStatus): string {
  const fm = readFrontmatter(note);
  if (fm["status"] === status && !("deprecated" in fm)) return note;
  return updateFrontmatter(note, { status, deprecated: undefined }, { before: ["deprecated", ...STATS_KEYS] });
}
