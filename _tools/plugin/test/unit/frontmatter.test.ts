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
  setNoteStatus,
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
      previous_paths: [],
    });
  });

  test("empty and null optional fields are absent", () => {
    const meta = readNotesMeta(DEFAULT_NOTES_TEMPLATE);
    assert.deepStrictEqual(meta, { authors: [], version: "1", status: "draft", previous_paths: [] });
    assert.ok(!("title" in meta) && !("posted" in meta) && !("video" in meta));
    assert.deepStrictEqual(readNotesMeta('---\ntitle: X\nvideo:\nfactoriobin: ""\nstatus:\nprevious_paths:\n---\n'), {
      title: "X",
      authors: [],
      previous_paths: [],
    });
    assert.equal(readNotesMeta('---\ntitle: ""\nversion: 4\nauthors: solo\n---\n').version, "4");
    assert.deepStrictEqual(readNotesMeta("---\nauthors: solo\n---\n").authors, ["solo"]);
  });

  test("status: one of the four values, else absent", () => {
    for (const s of ["draft", "public", "deprecated", "unlisted"]) assert.equal(readNotesMeta(`---\nstatus: ${s}\n---\n`).status, s);
    for (const s of ["Public", "true", "[public]", "hidden"]) assert.equal(readNotesMeta(`---\nstatus: ${s}\n---\n`).status, undefined);
    assert.equal("deprecated" in readNotesMeta("---\ndeprecated: true\n---\n"), false, "deprecated is no longer read");
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
    assert.equal(out, '---\ntitle: Mall\nauthors: [a, b c]\nversion: "1"\nposted: 2026-11-12\nstatus: draft\n---\n');
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

  test("with before, new keys go in front of the first of those keys the note has", () => {
    const note = "---\ntitle: X\nversion: \"1\"\nentities: 3\nfactorio_version: \"2.0.76\"\n---\nbody\n";
    assert.equal(
      updateFrontmatter(note, { status: "public", posted: "2026-01-01" }, { before: ["factorio_version", "entities"] }),
      "---\ntitle: X\nversion: \"1\"\nstatus: public\nposted: 2026-01-01\nentities: 3\nfactorio_version: \"2.0.76\"\n---\nbody\n",
    );
    assert.equal(updateFrontmatter(note, { status: "public" }, { before: ["nothing"] }), note.replace("---\nbody", "status: public\n---\nbody"));
    // The key in front of which it goes may itself be removed.
    assert.equal(
      updateFrontmatter(note, { status: "public", version: undefined }, { before: ["version"] }),
      "---\ntitle: X\nstatus: public\nentities: 3\nfactorio_version: \"2.0.76\"\n---\nbody\n",
    );
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

test("the template has the five keys, starts as a draft and has an empty body", () => {
  assert.equal(DEFAULT_NOTES_TEMPLATE, '---\ntitle:\nauthors: []\nversion: "1"\nposted:\nstatus: draft\n---\n');
  assert.deepStrictEqual(Object.keys(readFrontmatter(DEFAULT_NOTES_TEMPLATE)), ["title", "authors", "version", "posted", "status"]);
  assert.equal(splitFrontmatter(DEFAULT_NOTES_TEMPLATE).body, "");
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
    status: "draft",
    previous_paths: [],
  });
  assert.equal(out, '---\ntitle: Mall\nauthors: []\nversion: "1"\nposted: 2026-11-12\nstatus: draft\n---\n');
});

test("fillNotesTemplate: a root note is a draft unless the template says otherwise; an entry note has no status", () => {
  const fields = { title: "Mall", posted: "2026-11-12", authors: [] };
  const old = '---\ntitle:\nauthors: []\nposted:\nentities: 0\n---\n';
  assert.equal(fillNotesTemplate(old, fields), "---\ntitle: Mall\nauthors: []\nposted: 2026-11-12\nstatus: draft\nentities: 0\n---\n");
  assert.equal(readNotesMeta(fillNotesTemplate(old.replace("posted:", "status: bogus\nposted:"), fields)).status, "draft");
  assert.equal(readNotesMeta(fillNotesTemplate(DEFAULT_NOTES_TEMPLATE.replace("draft", "public"), fields)).status, "public");
  const entry = fillNotesTemplate(DEFAULT_NOTES_TEMPLATE, { ...fields, entry: true });
  assert.equal(entry, '---\ntitle: Mall\nauthors: []\nversion: "1"\nposted: 2026-11-12\n---\n');
  assert.equal(fillNotesTemplate(old, { ...fields, entry: true }), "---\ntitle: Mall\nauthors: []\nposted: 2026-11-12\nentities: 0\n---\n");
});

test("setNoteStatus: takes the place of deprecated, else goes before the generated keys", () => {
  const note = (fm: string) => `---\n${fm}\n---\n\n![x](https://example.com/cover.jpg)\n\nNotes.\n`;
  const migrated = setNoteStatus(note("title: X\nauthors: []\nfactoriobin: https://f\ndeprecated: true\nprevious_paths: [a/b]\nentities: 3"), "deprecated");
  assert.equal(migrated, note("title: X\nauthors: []\nfactoriobin: https://f\nstatus: deprecated\nprevious_paths: [a/b]\nentities: 3"));
  assert.equal(
    setNoteStatus(note("title: X\nauthors:\n  - me\nversion: \"2\"\nentities: 3\ntiles: 4\nfactorio_version: \"2.0.76\""), "public"),
    note("title: X\nauthors:\n  - me\nversion: \"2\"\nstatus: public\nentities: 3\ntiles: 4\nfactorio_version: \"2.0.76\""),
  );
  assert.equal(setNoteStatus(note("title: X"), "unlisted"), note("title: X\nstatus: unlisted"));
  assert.equal(setNoteStatus(note("title: X\nstatus: draft\nentities: 1"), "public"), note("title: X\nstatus: public\nentities: 1"), "in place");
  const same = note("title: X\nstatus: public");
  assert.equal(setNoteStatus(same, "public"), same);
  assert.equal(setNoteStatus(note("title: X\nstatus: public\ndeprecated: false"), "public"), same, "a leftover deprecated goes");
});
