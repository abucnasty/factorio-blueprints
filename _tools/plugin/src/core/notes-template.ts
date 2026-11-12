// The notes file for a new blueprint folder.

import { updateFrontmatter } from "./frontmatter.ts";

/**
 * Built-in copy of _tools/templates/blueprint-notes.md, used when that file
 * cannot be read. A unit test keeps the two identical.
 */
export const DEFAULT_NOTES_TEMPLATE = `---
title:
authors: []
version: "1"
posted:
video:
factoriobin:
deprecated: false
previous_paths: []
---

## Overview

What this blueprint builds, its rate, and what it needs (inputs, power,
beacons, research, mods).

## How to use

Where to place it, what to connect, and anything that must be set by hand
after pasting.

## Changelog

- v1: first version.
`;

export interface NewNotesFields {
  title: string;
  /** ISO date, YYYY-MM-DD. */
  posted: string;
  /** Left as the template has it when empty. */
  authors: string[];
}

/** Fill a template's frontmatter for a new blueprint. */
export function fillNotesTemplate(template: string, fields: NewNotesFields): string {
  const updates: Record<string, unknown> = { title: fields.title, posted: fields.posted };
  if (fields.authors.length > 0) updates["authors"] = fields.authors;
  return updateFrontmatter(template, updates);
}
