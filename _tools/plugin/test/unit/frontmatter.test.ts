import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import {
  bumpVersion,
  DEFAULT_NOTES_TEMPLATE,
  fillNotesTemplate,
  readFrontmatter,
  readNotesMeta,
  splitFrontmatter,
  updateFrontmatter,
} from "../../src/core/index.ts";

const NOTE = `---
title: Military Science (240/s)
# a comment the owner wrote
authors:
  - abucnasty
  - yuu
custom_key: keep me
version: "3"
posted: 2026-03-10
video:
nested:
  deep: [1, 2]
deprecated: false
---

## Overview

Body text with --- a rule below.

---

The end.
`;

describe("readNotesMeta", () => {
  test("known fields, normalized", () => {
    assert.deepStrictEqual(readNotesMeta(NOTE), {
      title: "Military Science (240/s)",
      authors: ["abucnasty", "yuu"],
      version: "3",
      posted: "2026-03-10",
      deprecated: false,
      previous_paths: [],
    });
  });

  test("empty and null optional fields are absent", () => {
    const meta = readNotesMeta(DEFAULT_NOTES_TEMPLATE);
    assert.deepStrictEqual(meta, { authors: [], version: "1", deprecated: false, previous_paths: [] });
    assert.ok(!("title" in meta) && !("posted" in meta) && !("video" in meta));
    assert.equal(readNotesMeta('---\ntitle: ""\nversion: 4\nauthors: solo\n---\n').version, "4");
    assert.deepStrictEqual(readNotesMeta("---\nauthors: solo\n---\n").authors, ["solo"]);
  });

  test("no frontmatter", () => {
    assert.deepStrictEqual(readFrontmatter("# Just a note\n"), {});
    assert.deepStrictEqual(readNotesMeta("").authors, []);
  });
});

describe("updateFrontmatter", () => {
  test("changes one key in place and keeps everything else byte for byte", () => {
    const out = updateFrontmatter(NOTE, { version: "4" });
    assert.equal(out, NOTE.replace('version: "3"', 'version: "4"'));
  });

  test("replaces a multi-line value and keeps comments, unknown keys and order", () => {
    const out = updateFrontmatter(NOTE, { authors: ["abucnasty"], title: "New: title" });
    const fm = readFrontmatter(out);
    assert.deepStrictEqual(Object.keys(fm), ["title", "authors", "custom_key", "version", "posted", "video", "nested", "deprecated"]);
    assert.equal(fm["custom_key"], "keep me");
    assert.deepStrictEqual(fm["nested"], { deep: [1, 2] });
    assert.ok(out.includes("# a comment the owner wrote\nauthors: [abucnasty]\ncustom_key: keep me\n"));
    assert.ok(out.includes('title: "New: title"\n'));
    assert.equal(splitFrontmatter(out).body, splitFrontmatter(NOTE).body);
  });

  test("adds new keys at the end and removes keys set to undefined", () => {
    const out = updateFrontmatter(NOTE, { factoriobin: "https://factoriobin.com/post/90pg6z", video: undefined });
    const keys = Object.keys(readFrontmatter(out));
    assert.equal(keys.at(-1), "factoriobin");
    assert.ok(!keys.includes("video"));
  });

  test("fills empty template fields", () => {
    const out = updateFrontmatter(DEFAULT_NOTES_TEMPLATE, { title: "Mall", posted: "2026-11-12", authors: ["a", "b c"] });
    assert.ok(out.startsWith('---\ntitle: Mall\nauthors: [a, b c]\nversion: "1"\nposted: 2026-11-12\nvideo:\n'));
    assert.equal(readNotesMeta(out).posted, "2026-11-12");
  });

  test("quotes values YAML would misread", () => {
    const out = updateFrontmatter(DEFAULT_NOTES_TEMPLATE, { title: "[item=iron-plate] #1: yes", version: "10" });
    assert.equal(readNotesMeta(out).title, "[item=iron-plate] #1: yes");
    assert.equal(readNotesMeta(out).version, "10");
    const multi = updateFrontmatter(DEFAULT_NOTES_TEMPLATE, { title: "two\nlines" });
    assert.equal(readNotesMeta(multi).title, "two\nlines");
  });

  test("keeps CRLF line endings", () => {
    const crlf = NOTE.replace(/\n/g, "\r\n");
    const out = updateFrontmatter(crlf, { version: "4", added: true });
    assert.ok(!/[^\r]\n/.test(out), "every newline is CRLF");
    assert.equal(readNotesMeta(out).version, "4");
  });

  test("creates frontmatter when there is none", () => {
    assert.equal(updateFrontmatter("# Notes\n", { title: "X" }), "---\ntitle: X\n---\n# Notes\n");
    assert.equal(updateFrontmatter("---\n---\nbody\n", { title: "X" }), "---\ntitle: X\n---\nbody\n");
  });

  test("refuses frontmatter it cannot edit safely", () => {
    assert.throws(() => updateFrontmatter("---\n{a: 1, b: 2}\n---\n", { a: 3 }));
    assert.throws(() => updateFrontmatter("---\ntitle: [unclosed\n---\n", { title: "x" }));
  });
});

test("bumpVersion", () => {
  assert.equal(bumpVersion("3"), "4");
  assert.equal(bumpVersion("2.2"), "2.3");
  assert.equal(bumpVersion("v9"), "v10");
  assert.equal(bumpVersion("1.0-beta"), "1.1-beta");
  assert.equal(bumpVersion(undefined), "2");
  assert.equal(bumpVersion("beta"), undefined);
});

test("built-in template matches _tools/templates/blueprint-notes.md", () => {
  const repoTemplate = readFileSync(join(import.meta.dirname, "..", "..", "..", "templates", "blueprint-notes.md"), "utf8");
  assert.equal(DEFAULT_NOTES_TEMPLATE, repoTemplate);
});

test("fillNotesTemplate", () => {
  const out = fillNotesTemplate(DEFAULT_NOTES_TEMPLATE, { title: "Mall", posted: "2026-11-12", authors: [] });
  assert.deepStrictEqual(readNotesMeta(out), {
    title: "Mall",
    authors: [],
    version: "1",
    posted: "2026-11-12",
    deprecated: false,
    previous_paths: [],
  });
  assert.ok(out.endsWith("- v1: first version.\n"));
});
