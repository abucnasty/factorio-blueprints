// The index builder against temporary git repositories.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import {
  decodeBlueprintString,
  encodeFactorioVersion,
  expandBook,
  type ExpandedEntry,
  plainLabel,
  writeCanonicalJson,
} from "../../plugin/src/core/index.ts";
import { buildCatalog, carryOverStale, entryKey, type LiveIndex, produceStrings, selectStrings, stringKey } from "../build-catalog.ts";

process.env["GIT_CONFIG_GLOBAL"] = "/dev/null";
process.env["GIT_CONFIG_NOSYSTEM"] = "1";

const root = mkdtempSync(join(tmpdir(), "fbp-catalog-test-"));
after(() => rmSync(root, { recursive: true, force: true }));
let n = 0;

function repo() {
  const dir = join(root, `repo-${++n}`);
  mkdirSync(dir);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("config", "commit.gpgsign", "false");
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  const commit = (subject: string) => {
    git("add", "-A");
    git("commit", "-q", "-m", subject);
    return git("rev-parse", "HEAD");
  };
  return { dir, git, write, commit };
}

const bp = (label: string, entities = 1) =>
  writeCanonicalJson({
    blueprint: {
      item: "blueprint",
      label,
      entities: Array.from({ length: entities }, (_, i) => ({ entity_number: i + 1, name: "iron-chest", position: { x: i, y: 0 } })),
      version: encodeFactorioVersion("2.0.76"),
    },
  });
const bpBody = (label: string) => JSON.parse(bp(label)).blueprint;
const book = (label: string, blueprints: object[]) =>
  writeCanonicalJson({ blueprint_book: { item: "blueprint-book", label, blueprints, version: encodeFactorioVersion("2.0.76") } });
const notes = (fm: string) => `---\n${fm}\n---\n\nNotes.\n`;
const pointer = (oid: string, size = 1234) => `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${size}\n`;
const OID = "a".repeat(64);

test("builds the index: history, renames via previous_paths, renders, frontmatter", async () => {
  const r = repo();
  r.write("cat/a/blueprint.json", bp("A"));
  r.write("cat/a/README.md", notes("title: A\nauthors: [me]\nversion: 1\nposted: 2026-03-10\ncustom: dropped"));
  r.write("cat/b/blueprint.json", bp("B"));
  r.write("cat/b/README.md", notes("title: B\nauthors: []"));
  r.write("_tools/x/blueprint.json", "not scanned");
  r.write(".hidden/blueprint.json", "not scanned");
  const c1 = r.commit("add a and b");
  r.write("cat/a/blueprint.json", bp("A", 3));
  r.write("cat/a/renders/0.jpg", pointer(OID, 99));
  r.write("cat/a/renders/1.png", pointer("b".repeat(64)));
  const c2 = r.commit("grow a");
  mkdirSync(join(r.dir, "new"));
  r.git("mv", "cat/b", "new/b");
  r.write("new/b/README.md", notes("title: B\nauthors: []\nprevious_paths: [cat/b]"));
  const c3 = r.commit("move b");
  r.write("cat/a/README.md", notes("title: A2\nauthors: [me]"));
  const c4 = r.commit("retitle a");

  const { index, problems } = await buildCatalog(r.dir, { now: new Date("2026-01-01T00:00:00Z") });
  assert.deepEqual(problems, []);
  assert.equal(index.commit, c4);
  assert.equal(index.generatedAt, "2026-01-01T00:00:00.000Z");
  assert.deepEqual(index.blueprints.map((e) => e.path), ["cat/a", "new/b"]);

  const [a, b] = index.blueprints as [(typeof index.blueprints)[0], (typeof index.blueprints)[0]];
  assert.equal(a.title, "A2");
  assert.equal("custom" in a, false);
  assert.equal(a.commit, c2, "a notes-only commit is not a version");
  assert.deepEqual(a.history.map((h) => [h.sha, h.subject]), [[c2, "grow a"], [c1, "add a and b"]]);
  assert.match(a.history[0]!.date, /^\d{4}-\d\d-\d\dT/);
  assert.equal(a.blueprint.kind, "blueprint");
  assert.equal(a.blueprint.counts.entities, 3);
  assert.equal(a.blueprint.factorioVersion, "2.0.76");
  assert.deepEqual(a.renders, [
    { file: "0.jpg", oid: OID, size: 99 },
    { file: "1.png", oid: "b".repeat(64), size: 1234 },
  ]);
  assert.equal(a.cover, "0.jpg");
  assert.equal(a.nodes, undefined, "a single blueprint has no nodes");

  assert.deepEqual(b.previous_paths, ["cat/b"]);
  assert.equal(b.commit, c3);
  assert.deepEqual(b.history.map((h) => h.sha), [c3, c1], "history follows the old path");
});

test("history dates are author dates, in git log order", async () => {
  const r = repo();
  r.write("cat/a/blueprint.json", bp("A1"));
  r.write("cat/a/README.md", notes("title: A\nauthors: []"));
  r.git("add", "-A");
  r.git("commit", "-q", "-m", "posted long ago", "--date", "2024-03-10T12:00:00+01:00");
  const old = r.git("rev-parse", "HEAD");
  r.write("cat/a/blueprint.json", bp("A2"));
  r.git("add", "-A");
  // Authored earlier than the first commit, committed later: order stays git log's.
  r.git("commit", "-q", "-m", "back-dated", "--date", "2023-01-01T00:00:00Z");
  const newer = r.git("rev-parse", "HEAD");
  assert.notEqual(r.git("log", "-1", "--format=%cI", newer).slice(0, 4), "2023");

  const [a] = (await buildCatalog(r.dir)).index.blueprints;
  assert.deepEqual(
    a!.history.map((h) => [h.sha, h.date]),
    [
      [newer, "2023-01-01T00:00:00Z"],
      [old, "2024-03-10T12:00:00+01:00"],
    ],
  );
});

test("produces each version's string from that commit, under the current path", async () => {
  const r = repo();
  r.write("cat/a/blueprint.json", bp("A1"));
  r.write("cat/a/README.md", notes("title: A\nauthors: []"));
  const c1 = r.commit("one");
  r.write("cat/a/blueprint.json", bp("A2"));
  const c2 = r.commit("two");
  r.git("mv", "cat/a", "cat/z");
  r.write("cat/z/README.md", notes("title: A\nauthors: []\nprevious_paths: [cat/a]"));
  const c3 = r.commit("rename");

  const catalog = await buildCatalog(r.dir);
  const out = new Map<string, string>();
  await produceStrings(r.dir, catalog, selectStrings(catalog.index), (k, t) => out.set(k, t));
  assert.deepEqual([...out.keys()].sort(), [c1, c2, c3].map((s) => stringKey("cat/z", s)).sort());
  const label = (sha: string) => (decodeBlueprintString(out.get(stringKey("cat/z", sha))!).value as any).blueprint.label;
  assert.equal(label(c1), "A1");
  assert.equal(label(c2), "A2");
  assert.equal(label(c3), "A2");
});

test("an old version that was not a valid blueprint is dropped from the history", async () => {
  const r = repo();
  r.write("cat/a/blueprint.json", "{ broken");
  r.write("cat/a/README.md", notes("title: A\nauthors: []"));
  const bad = r.commit("broken");
  r.write("cat/a/blueprint.json", bp("A"));
  const good = r.commit("fixed");
  const catalog = await buildCatalog(r.dir);
  assert.deepEqual(catalog.index.blueprints[0]!.history.map((h) => h.sha), [good, bad]);
  const keys: string[] = [];
  const { warnings } = await produceStrings(r.dir, catalog, selectStrings(catalog.index), (k) => keys.push(k));
  assert.deepEqual(keys, [stringKey("cat/a", good)]);
  assert.equal(warnings.length, 1);
  assert.deepEqual(catalog.index.blueprints[0]!.history.map((h) => h.sha), [good]);
});

test("selects only strings the live index lacks", async () => {
  const r = repo();
  r.write("cat/a/blueprint.json", bp("A"));
  r.write("cat/a/README.md", notes("title: A\nauthors: []"));
  r.write("cat/b/blueprint.json", bp("B"));
  r.write("cat/b/README.md", notes("title: B\nauthors: []"));
  const c1 = r.commit("one");
  const live = (await buildCatalog(r.dir)).index;
  assert.equal(selectStrings(live).length, 2, "no live index: everything");
  assert.deepEqual(selectStrings(live, live), []);

  // Two pushes whose publish never ran: both are picked up.
  r.write("cat/a/blueprint.json", bp("A", 2));
  const c2 = r.commit("two");
  r.write("cat/a/blueprint.json", bp("A", 3));
  const c3 = r.commit("three");
  // A rename needs every old version again under the new path.
  r.git("mv", "cat/b", "cat/c");
  r.write("cat/c/README.md", notes("title: B\nauthors: []\nprevious_paths: [cat/b]"));
  const c4 = r.commit("rename b");
  const next = (await buildCatalog(r.dir)).index;
  assert.deepEqual(
    selectStrings(next, live).map((j) => j.key),
    [stringKey("cat/a", c3), stringKey("cat/a", c2), stringKey("cat/c", c4), stringKey("cat/c", c1)],
  );
});

test("book nodes: slot paths with and without index, nested books, planners, renders and cover", async () => {
  const inner = { item: "blueprint-book", label: "Inner [item=iron-plate]", blueprints: [{ blueprint: bpBody("Y") }, { index: 4, blueprint: bpBody("X") }] };
  const upgrade = { item: "upgrade-planner", label: "Up", settings: { mappers: [] } };
  const decon = { item: "deconstruction-planner", settings: {} };
  const r = repo();
  r.write(
    "cat/book/blueprint.json",
    book("Root", [{ index: 3, blueprint_book: inner }, { blueprint: bpBody("Z") }, { index: 0, upgrade_planner: upgrade }, { index: 5, deconstruction_planner: decon }]),
  );
  r.write("cat/book/README.md", notes("title: Book\nauthors: []"));
  r.write("cat/book/renders/0.jpg", pointer("0".repeat(64))); // slot 0 is a planner: no image
  r.write("cat/book/renders/3/4.jpg", pointer("4".repeat(64)));
  r.write("cat/book/renders/3/0.png", pointer("3".repeat(64)));
  const sha = r.commit("book");

  const catalog = await buildCatalog(r.dir);
  assert.deepEqual(catalog.problems, []);
  const e = catalog.index.blueprints[0]!;
  assert.equal(catalog.index.schema, 2);
  assert.deepEqual(e.nodes, [
    { slot: 0, path: "0", kind: "upgrade-planner", label: "Up" },
    { slot: 1, path: "1", kind: "blueprint", label: "Z" },
    {
      slot: 3,
      path: "3",
      kind: "blueprint-book",
      label: plainLabel("Inner [item=iron-plate]"),
      children: [
        { slot: 0, path: "3/0", kind: "blueprint", label: "Y", render: "3/0.png" },
        { slot: 4, path: "3/4", kind: "blueprint", label: "X", render: "3/4.jpg" },
      ],
    },
    { slot: 5, path: "5", kind: "deconstruction-planner", label: "" },
  ]);
  assert.equal(e.cover, "3/0.png", "the first blueprint with an image, depth first");
  assert.deepEqual(e.renders.map((x) => x.file), ["0.jpg", "3/0.png", "3/4.jpg"]);
  assert.equal(e.history[0]!.entries, true);

  const out = new Map<string, string>();
  const stats = await produceStrings(r.dir, catalog, selectStrings(catalog.index), (k, t) => out.set(k, t));
  assert.deepEqual(stats, { warnings: [], roots: 1, entries: 6 });
  const decoded = (slot: string) => decodeBlueprintString(out.get(entryKey("cat/book", sha, slot))!).value;
  assert.deepEqual(decoded("3"), { blueprint_book: inner }, "a nested book's own string");
  assert.deepEqual(decoded("3/4"), { blueprint: inner.blueprints[1]!.blueprint });
  assert.deepEqual(decoded("1"), { blueprint: bpBody("Z") });
  assert.deepEqual(decoded("0"), { upgrade_planner: upgrade });
  assert.deepEqual(decoded("5"), { deconstruction_planner: decon });
  assert.ok(out.has(stringKey("cat/book", sha)));
});

test("non-image files under renders/ are ignored; a shared slot goes to the first entry", async () => {
  const r = repo();
  r.write("cat/book/blueprint.json", book("B", [{ index: 0, blueprint: bpBody("first") }, { index: 0, blueprint: bpBody("second") }]));
  r.write("cat/book/README.md", notes("title: B\nauthors: []"));
  const old = r.commit("two entries in slot 0");
  r.write("cat/book/blueprint.json", book("B", [{ index: 0, blueprint: bpBody("first") }]));
  r.write("cat/book/renders/0.jpg", pointer(OID));
  r.write("cat/book/renders/render.json", '{"0": "current"}\n');
  r.write("cat/book/renders/notes.txt", "anything\n");
  r.commit("fix the book, add a render and its manifest");

  const catalog = await buildCatalog(r.dir);
  assert.deepEqual(catalog.problems, []);
  const e = catalog.index.blueprints[0]!;
  assert.deepEqual(e.renders.map((x) => x.file), ["0.jpg"]);
  assert.equal(e.cover, "0.jpg");

  const out = new Map<string, string>();
  const { warnings } = await produceStrings(r.dir, catalog, selectStrings(catalog.index), (k, t) => out.set(k, t));
  const label = (decodeBlueprintString(out.get(entryKey("cat/book", old, "0"))!).value as any).blueprint.label;
  assert.equal(label, "first");
  assert.match(warnings.join(), /second entry in slot 0/);
});

test("an entry that a later version removes keeps its string for the older version only", async () => {
  const r = repo();
  r.write("cat/book/blueprint.json", book("B", [{ index: 0, blueprint: bpBody("keep") }, { index: 1, blueprint: bpBody("gone") }]));
  r.write("cat/book/README.md", notes("title: B\nauthors: []"));
  const c1 = r.commit("two entries");
  r.write("cat/book/blueprint.json", book("B", [{ index: 0, blueprint: bpBody("keep") }]));
  const c2 = r.commit("one entry");
  const catalog = await buildCatalog(r.dir);
  const keys = new Set<string>();
  await produceStrings(r.dir, catalog, selectStrings(catalog.index), (k) => keys.add(k));
  assert.ok(keys.has(entryKey("cat/book", c1, "1")));
  assert.ok(keys.has(entryKey("cat/book", c2, "0")));
  assert.ok(!keys.has(entryKey("cat/book", c2, "1")));
  assert.deepEqual(catalog.index.blueprints[0]!.nodes!.map((n) => n.path), ["0"]);
});

test("entry strings: a schema 1 live index gets all of them once, then a second run has nothing to do", async () => {
  const r = repo();
  r.write("cat/book/blueprint.json", book("B", [{ blueprint: bpBody("a") }, { blueprint: bpBody("b") }]));
  r.write("cat/book/README.md", notes("title: B\nauthors: []"));
  r.commit("one");
  r.write("cat/book/blueprint.json", book("B", [{ blueprint: bpBody("a") }, { blueprint: bpBody("c") }]));
  r.commit("two");
  const index = (await buildCatalog(r.dir)).index;
  const v1: LiveIndex = JSON.parse(JSON.stringify(index));
  v1.schema = 1;
  for (const e of v1.blueprints) for (const h of e.history) delete h.entries;

  const jobs = selectStrings(index, v1);
  assert.equal(jobs.length, 2);
  assert.ok(jobs.every((j) => !j.root && j.entries), "roots exist, entries do not");
  const catalog = await buildCatalog(r.dir);
  const keys: string[] = [];
  await produceStrings(r.dir, catalog, jobs, (k) => keys.push(k));
  assert.equal(keys.length, 4);
  assert.ok(keys.every((k) => /\/[0-9a-f]{40}\/[01]\.txt$/.test(k)));

  assert.deepEqual(selectStrings(index, index), [], "the schema 2 index it published leaves nothing to do");
});

test("a blueprint folder inside another is rejected; the outer one is still published", async () => {
  const r = repo();
  r.write("cat/outer/blueprint.json", bp("Outer"));
  r.write("cat/outer/README.md", notes("title: O\nauthors: []"));
  r.write("cat/outer/3/blueprint.json", bp("Inner"));
  r.write("cat/outer/3/README.md", notes("title: I\nauthors: []"));
  r.write("cat/dup/blueprint.json", book("D", [{ index: 1, blueprint: bpBody("a") }, { blueprint: bpBody("b") }]));
  r.write("cat/dup/README.md", notes("title: D\nauthors: []"));
  r.commit("nested");
  const { index, problems, invalid } = await buildCatalog(r.dir);
  assert.deepEqual(index.blueprints.map((e) => e.path), ["cat/outer"]);
  assert.deepEqual(invalid, ["cat/dup", "cat/outer/3"]);
  assert.match(problems.find((p) => p.folder === "cat/outer/3")!.message, /inside the blueprint folder cat\/outer/);
  assert.match(problems.find((p) => p.folder === "cat/dup")!.message, /more than one entry in book slot 1/);
});

test("lists validation failures and leaves those blueprints out", async () => {
  const r = repo();
  r.write("ok/a/blueprint.json", bp("A"));
  r.write("ok/a/README.md", notes("title: A\nauthors: []"));
  r.write("bad/noncanonical/blueprint.json", JSON.stringify({ blueprint: { item: "blueprint" } }));
  r.write("bad/noncanonical/README.md", notes("title: X\nauthors: []"));
  r.write("bad/invalid-json/blueprint.json", "{");
  r.write("bad/invalid-json/README.md", notes("title: X\nauthors: []"));
  r.write("bad/not-blueprint/blueprint.json", writeCanonicalJson({ hello: 1 }));
  r.write("bad/not-blueprint/README.md", notes("title: X\nauthors: []"));
  r.write("bad/no-notes/blueprint.json", bp("X"));
  r.write("bad/no-title/blueprint.json", bp("X"));
  r.write("bad/no-title/README.md", notes("authors: []"));
  r.write("bad/authors/blueprint.json", bp("X"));
  r.write("bad/authors/README.md", notes("title: X"));
  r.write("bad/yaml/blueprint.json", bp("X"));
  r.write("bad/yaml/README.md", notes("title: [unclosed"));
  r.write("bad/prev/blueprint.json", bp("X"));
  r.write("bad/prev/README.md", notes("title: X\nauthors: []\nprevious_paths: [ok/a]"));
  r.write("bad/render/blueprint.json", bp("X"));
  r.write("bad/render/README.md", notes("title: X\nauthors: []"));
  r.write("bad/render/renders/0.jpg", "real image bytes, not a pointer");
  r.write("bad/render/renders/cover.jpg", pointer(OID));
  r.commit("mixed");

  const { index, problems } = await buildCatalog(r.dir);
  assert.deepEqual(index.blueprints.map((e) => e.path), ["ok/a"]);
  const byPath = (p: string) => problems.filter((x) => x.path.startsWith(p + "/") || x.path === p).map((x) => x.message);
  assert.match(byPath("bad/noncanonical").join(), /canonical/);
  assert.match(byPath("bad/invalid-json").join(), /not valid JSON/);
  assert.match(byPath("bad/not-blueprint").join(), /not a blueprint/);
  assert.match(byPath("bad/no-notes").join(), /has no README.md/);
  assert.match(byPath("bad/no-title").join(), /title/);
  assert.match(byPath("bad/authors").join(), /authors/);
  assert.match(byPath("bad/yaml").join(), /not valid YAML/);
  assert.match(byPath("bad/prev").join(), /current blueprint folder/);
  assert.deepEqual(problems.filter((p) => p.path.startsWith("bad/render/")).map((p) => p.path).sort(), [
    "bad/render/renders/0.jpg",
    "bad/render/renders/cover.jpg",
  ]);
  assert.equal(byPath("ok/a").length, 0);
});

// Expanded books: a book stored as folders (book.json and slot folders).

type Repo = ReturnType<typeof repo>;

/** Write `value` (a book) as an expanded book at `folder`, with a README.md in every folder. */
function writeExpanded(r: Repo, folder: string, value: unknown) {
  const { book, entries } = expandBook(value);
  const write = (dir: string, b: unknown, list: ExpandedEntry[]) => {
    r.write(`${dir}/book.json`, writeCanonicalJson(b));
    r.write(`${dir}/README.md`, notes(`title: ${dir}\nauthors: []`));
    for (const e of list) {
      const path = `${dir}/${e.folder}`;
      if (e.entries) write(path, e.book, e.entries);
      else {
        r.write(`${path}/blueprint.json`, writeCanonicalJson(e.value));
        r.write(`${path}/README.md`, notes(`title: ${e.label}\nauthors: []`));
      }
    }
  };
  write(folder, book, entries);
}

const nestedBook = () =>
  JSON.parse(
    book("Root", [
      { index: 0, blueprint: bpBody("Stone") },
      { index: 1, blueprint_book: { item: "blueprint-book", label: "Inner", blueprints: [{ index: 0, blueprint: bpBody("Bricks") }, { index: 3, blueprint: bpBody("Iron") }] } },
      { index: 2, upgrade_planner: { item: "upgrade-planner", label: "Up", settings: {} } },
    ]),
  );

test("expanding a book keeps its path, history, root string and entry strings", async () => {
  const r = repo();
  r.write("cat/book/blueprint.json", writeCanonicalJson(nestedBook()));
  r.write("cat/book/README.md", notes("title: Book\nauthors: []"));
  r.write("cat/book/renders/0.jpg", pointer("0".repeat(64)));
  r.write("cat/book/renders/1/3.jpg", pointer("3".repeat(64)));
  const c1 = r.commit("add book");

  r.git("rm", "-r", "-q", "cat/book/blueprint.json", "cat/book/renders");
  writeExpanded(r, "cat/book", nestedBook());
  r.write("cat/book/README.md", notes("title: Book\nauthors: []"));
  r.write("cat/book/0-stone/renders/0.jpg", pointer("a".repeat(64), 10));
  r.write("cat/book/0-stone/renders/render.json", "{}\n");
  r.write("cat/book/1-inner/3-iron/renders/0.png", pointer("b".repeat(64), 20));
  const c2 = r.commit("expand book");
  r.write("cat/book/1-inner/README.md", notes("title: Inner book\nauthors: [me]"));
  r.commit("notes only");

  const catalog = await buildCatalog(r.dir);
  assert.deepEqual(catalog.problems, []);
  assert.deepEqual(catalog.index.blueprints.map((e) => e.path), ["cat/book"], "slot folders are not entries");
  const e = catalog.index.blueprints[0]!;
  assert.equal(e.title, "Book");
  assert.equal(e.commit, c2);
  assert.deepEqual(e.history.map((h) => h.sha), [c2, c1], "a notes-only commit is not a version");
  assert.equal(e.blueprint.kind, "blueprint-book");
  assert.equal(e.blueprint.counts.blueprints, 3);
  assert.deepEqual(e.renders, [
    { file: "0.jpg", oid: "a".repeat(64), size: 10 },
    { file: "1/3.png", oid: "b".repeat(64), size: 20 },
  ]);
  assert.equal(e.cover, "0.jpg");
  assert.deepEqual(e.nodes, [
    { slot: 0, path: "0", kind: "blueprint", label: "Stone", render: "0.jpg", folder: "cat/book/0-stone" },
    {
      slot: 1,
      path: "1",
      kind: "blueprint-book",
      label: "Inner",
      folder: "cat/book/1-inner",
      children: [
        { slot: 0, path: "1/0", kind: "blueprint", label: "Bricks", folder: "cat/book/1-inner/0-bricks" },
        { slot: 3, path: "1/3", kind: "blueprint", label: "Iron", render: "1/3.png", folder: "cat/book/1-inner/3-iron" },
      ],
    },
    { slot: 2, path: "2", kind: "upgrade-planner", label: "Up", folder: "cat/book/2-up" },
  ]);

  const out = new Map<string, string>();
  const stats = await produceStrings(r.dir, catalog, selectStrings(catalog.index), (k, t) => out.set(k, t));
  assert.deepEqual(stats, { warnings: [], roots: 2, entries: 10 });
  assert.equal(out.get(stringKey("cat/book", c2)), out.get(stringKey("cat/book", c1)), "the same root string before and after");
  for (const sha of [c1, c2]) {
    for (const slot of ["0", "1", "1/0", "1/3", "2"]) assert.ok(out.has(entryKey("cat/book", sha, slot)), `${slot}@${sha}`);
  }
  assert.deepEqual(decodeBlueprintString(out.get(entryKey("cat/book", c2, "1/3"))!).value, { blueprint: bpBody("Iron") });

  // A change to one leaf is a new version of the root book.
  r.write("cat/book/1-inner/0-bricks/blueprint.json", bp("Bricks", 2));
  const c3 = r.commit("grow bricks");
  const next = await buildCatalog(r.dir);
  assert.deepEqual(next.index.blueprints[0]!.history.map((h) => h.sha), [c3, c2, c1]);
  assert.deepEqual(selectStrings(next.index, catalog.index).map((j) => j.sha), [c3]);
});

const manifest = (entries: Record<string, object>) =>
  JSON.stringify({ schema: 1, rendered_at: "2026-01-01T00:00:00Z", entries: Object.fromEntries(Object.entries(entries).map(([k, e]) => [k, { sha256: "0".repeat(64), ...e }])) });

test("render pixel sizes come from render.json, matched by file; without a usable entry they are left out", async () => {
  const r = repo();
  r.write("cat/single/blueprint.json", bp("S"));
  r.write("cat/single/README.md", notes("title: S\nauthors: []"));
  r.write("cat/single/renders/0.jpg", pointer("1".repeat(64)));
  r.write("cat/single/renders/render.json", manifest({ "0": { file: "0.jpg", width: 260, height: 288 } }));

  r.write("cat/book/blueprint.json", book("B", [{ blueprint: bpBody("a") }, { blueprint: bpBody("b") }, { blueprint_book: { item: "blueprint-book", blueprints: [{ blueprint: bpBody("c") }, { blueprint: bpBody("d") }] } }, { blueprint: bpBody("e") }]));
  r.write("cat/book/README.md", notes("title: B\nauthors: []"));
  for (const f of ["0.jpg", "1.jpg", "2/0.jpg", "2/1.png", "3.jpg"]) r.write(`cat/book/renders/${f}`, pointer("2".repeat(64)));
  r.write(
    "cat/book/renders/render.json",
    manifest({
      "0": { file: "0.jpg", width: 1920, height: 1080 },
      "1": { file: "1.jpg", width: 0, height: 1080 }, // not a size
      "2/0": { file: "2/0.jpg", width: 300, height: 600 },
      "2/1": { file: "2/1.jpg", width: 300, height: 600 }, // describes another file than 2/1.png
      "3": { file: "3.jpg", width: 10.5, height: 20 }, // not integers
      "4": { file: "4.jpg", width: 100, height: 100 }, // no such image
    }),
  );

  writeExpanded(r, "cat/expanded", nestedBook());
  r.write("cat/expanded/README.md", notes("title: E\nauthors: []"));
  r.write("cat/expanded/0-stone/renders/0.jpg", pointer("3".repeat(64)));
  r.write("cat/expanded/0-stone/renders/render.json", manifest({ "0": { file: "0.jpg", width: 100, height: 50 } }));
  r.write("cat/expanded/1-inner/0-bricks/renders/0.jpg", pointer("4".repeat(64))); // no manifest
  r.write("cat/expanded/1-inner/3-iron/renders/0.jpg", pointer("5".repeat(64)));
  r.write("cat/expanded/1-inner/3-iron/renders/render.json", manifest({ "0": { file: "0.jpg", width: 640, height: 480 } }));

  r.write("cat/broken/blueprint.json", bp("X"));
  r.write("cat/broken/README.md", notes("title: X\nauthors: []"));
  r.write("cat/broken/renders/0.jpg", pointer("6".repeat(64)));
  r.write("cat/broken/renders/render.json", "not json\n");
  r.write("cat/other/blueprint.json", bp("Y"));
  r.write("cat/other/README.md", notes("title: Y\nauthors: []"));
  r.write("cat/other/renders/0.jpg", pointer("7".repeat(64)));
  r.write("cat/other/renders/render.json", JSON.stringify({ schema: 2, entries: { "0": { file: "0.jpg", sha256: "", width: 1, height: 1 } } }));
  r.commit("renders with manifests");

  const catalog = await buildCatalog(r.dir);
  assert.deepEqual(catalog.problems, [], "a manifest never makes a blueprint invalid");
  const sizes = (path: string) =>
    catalog.index.blueprints.find((e) => e.path === path)!.renders.map(({ file, width, height }) => [file, width, height]);
  assert.deepEqual(sizes("cat/single"), [["0.jpg", 260, 288]]);
  assert.deepEqual(sizes("cat/book"), [
    ["0.jpg", 1920, 1080],
    ["1.jpg", undefined, undefined],
    ["2/0.jpg", 300, 600],
    ["2/1.png", undefined, undefined],
    ["3.jpg", undefined, undefined],
  ]);
  assert.deepEqual(sizes("cat/expanded"), [
    ["0.jpg", 100, 50],
    ["1/0.jpg", undefined, undefined],
    ["1/3.jpg", 640, 480],
  ]);
  assert.deepEqual(sizes("cat/broken"), [["0.jpg", undefined, undefined]]);
  assert.deepEqual(sizes("cat/other"), [["0.jpg", undefined, undefined]]);
  const book1 = catalog.index.blueprints.find((e) => e.path === "cat/book")!.renders[1]!;
  assert.deepEqual(Object.keys(book1), ["file", "oid", "size"], "no width or height keys at all");

  // A stale entry carried over from the live index keeps its sizes.
  const live = { ...catalog.index, blueprints: catalog.index.blueprints.filter((e) => e.path === "cat/single") };
  const next = { ...catalog, index: { ...catalog.index, blueprints: [] as typeof catalog.index.blueprints }, invalid: ["cat/single"] };
  carryOverStale(next, live);
  assert.deepEqual(next.index.blueprints[0]!.renders, [{ file: "0.jpg", oid: "1".repeat(64), size: 1234, width: 260, height: 288 }]);
});

test("expanded book rules: slot folders, both files, nesting, notes and renders", async () => {
  const r = repo();
  const value = () => JSON.parse(book("B", [{ index: 0, blueprint: bpBody("a") }, { index: 1, blueprint: bpBody("b") }]));
  writeExpanded(r, "ok/book", value());
  r.write("ok/book/notes/picture.txt", "a folder without blueprints may be anything");
  writeExpanded(r, "bad/name", value());
  renameSync(join(r.dir, "bad/name/1-b"), join(r.dir, "bad/name/misc"));
  writeExpanded(r, "bad/holder", value());
  r.write("bad/holder/stuff/0-x/blueprint.json", bp("x"));
  r.write("bad/holder/stuff/0-x/README.md", notes("title: x\nauthors: []"));
  writeExpanded(r, "bad/dup", value());
  r.write("bad/dup/1-other/blueprint.json", bp("c"));
  r.write("bad/dup/1-other/README.md", notes("title: c\nauthors: []"));
  writeExpanded(r, "bad/both", value());
  r.write("bad/both/0-a/book.json", writeCanonicalJson({ blueprint_book: { item: "blueprint-book" } }));
  writeExpanded(r, "bad/notes", value());
  r.write("bad/notes/1-b/README.md", notes("authors: []"));
  writeExpanded(r, "bad/renders", value());
  r.write("bad/renders/renders/0.jpg", pointer(OID));
  writeExpanded(r, "bad/leaf-render", value());
  r.write("bad/leaf-render/1-b/renders/1.jpg", pointer(OID));
  writeExpanded(r, "bad/entries", value());
  r.write("bad/entries/book.json", book("B", []));
  r.write("bad/inside/blueprint.json", bp("outer"));
  r.write("bad/inside/README.md", notes("title: o\nauthors: []"));
  writeExpanded(r, "bad/inside/sub", value());
  r.commit("books");
  // A README.md missing from a nested folder is found too.
  writeExpanded(r, "bad/nonotes", value());
  r.git("add", "-A");
  r.git("rm", "-q", "--cached", "bad/nonotes/0-a/README.md");
  r.git("commit", "-q", "-m", "no notes");

  const { index, problems, invalid } = await buildCatalog(r.dir);
  assert.deepEqual(index.blueprints.map((e) => e.path), ["bad/inside", "ok/book"]);
  assert.deepEqual(invalid, [
    "bad/both",
    "bad/dup",
    "bad/entries",
    "bad/holder",
    "bad/inside/sub",
    "bad/leaf-render",
    "bad/name",
    "bad/nonotes",
    "bad/notes",
    "bad/renders",
  ]);
  const of = (folder: string) => problems.filter((p) => p.folder === folder).map((p) => `${p.path}: ${p.message}`).join("\n");
  assert.match(of("bad/name"), /^bad\/name\/misc: is in the expanded book bad\/name but is not named by slot: rename it <slot> or <slot>-<name>, such as 0 or 0-misc$/);
  assert.match(of("bad/holder"), /^bad\/holder\/stuff: holds blueprints inside the expanded book bad\/holder, so it must be a slot folder/);
  assert.match(of("bad/dup"), /^bad\/dup: bad\/dup has two folders for slot 1 \(1-b, 1-other\)/);
  assert.match(of("bad/both"), /^bad\/both\/0-a: has both book\.json and blueprint\.json/);
  assert.match(of("bad/notes"), /^bad\/notes\/1-b\/README\.md: frontmatter needs a title$/);
  assert.match(of("bad/nonotes"), /^bad\/nonotes\/0-a: has no README\.md$/);
  assert.equal(of("bad/renders"), "bad/renders/renders: an expanded book has no renders of its own; images live in renders/ of its blueprint folders");
  assert.equal(of("bad/leaf-render"), "bad/leaf-render/1-b/renders/1.jpg: a blueprint in an expanded book has one image, renders/0.jpg (or .jpeg, .png, .webp)");
  assert.match(of("bad/entries"), /^bad\/entries\/book\.json: must not list the book's entries/);
  assert.match(of("bad/inside/sub"), /^bad\/inside\/sub: is inside the blueprint folder bad\/inside/);
  assert.equal(of("bad/inside"), "", "the outer blueprint folder is still valid");
});

// The CLI's publish path, as a dry run into a directory standing in for R2.

const CLI = new URL("../catalog.ts", import.meta.url).pathname;

function cli(mode: string, repoDir: string, out: string) {
  const summary = join(out + "-summary.md");
  writeFileSync(summary, "");
  const env = { ...process.env, GITHUB_STEP_SUMMARY: summary, GITHUB_ACTIONS: "" };
  const r = spawnSync(process.execPath, [CLI, mode, "--repo", repoDir, "--out", out], { encoding: "utf8", env });
  const index = existsSync(join(out, "index.json")) ? JSON.parse(readFileSync(join(out, "index.json"), "utf8")) : undefined;
  return { code: r.status, log: r.stdout + r.stderr, summary: readFileSync(summary, "utf8"), index };
}

function threeBlueprints() {
  const r = repo();
  for (const name of ["a", "b", "c"]) {
    r.write(`cat/${name}/blueprint.json`, bp(name));
    r.write(`cat/${name}/README.md`, notes(`title: ${name}\nauthors: []`));
  }
  return r;
}

test("publish: an invalid blueprint is reported and left out, the others are published, the run fails", () => {
  const r = threeBlueprints();
  r.write("cat/b/blueprint.json", "{ broken");
  const sha = r.commit("one broken");
  const out = join(r.dir + "-r2");
  const res = cli("publish", r.dir, out);
  assert.equal(res.code, 1);
  assert.deepEqual(res.index.blueprints.map((e: any) => e.path), ["cat/a", "cat/c"]);
  assert.ok(existsSync(join(out, stringKey("cat/a", sha))));
  assert.ok(existsSync(join(out, stringKey("cat/c", sha))));
  assert.ok(!existsSync(join(out, "strings/cat/b")));
  assert.match(res.log, /cat\/b\/blueprint\.json: is not valid JSON/);
  assert.match(res.summary, /cat\/b\/blueprint\.json.*is not valid JSON/);
});

test("publish: an invalid blueprint keeps its live entry, marked stale; a deleted folder is removed", () => {
  const r = threeBlueprints();
  const c1 = r.commit("three");
  const out = join(r.dir + "-r2");
  assert.equal(cli("publish", r.dir, out).code, 0);

  r.write("cat/a/blueprint.json", bp("a2"));
  r.write("cat/b/README.md", notes("authors: []"));
  r.write("cat/b/blueprint.json", bp("b2"));
  const c2 = r.commit("update a, break b");
  let res = cli("publish", r.dir, out);
  assert.equal(res.code, 1);
  const byPath = (p: string) => res.index.blueprints.find((e: any) => e.path === p);
  assert.equal(byPath("cat/a").commit, c2);
  assert.equal(byPath("cat/a").stale, undefined);
  assert.equal(byPath("cat/b").stale, true);
  assert.equal(byPath("cat/b").commit, c1, "serves the last valid version");
  assert.ok(!existsSync(join(out, stringKey("cat/b", c2))));
  assert.match(res.summary, /cat\/b\/README\.md.*title/);

  r.git("rm", "-r", "-q", "cat/b");
  r.commit("delete b");
  res = cli("publish", r.dir, out);
  assert.equal(res.code, 0);
  assert.deepEqual(res.index.blueprints.map((e: any) => e.path), ["cat/a", "cat/c"]);
});

test("validate (pull requests) still fails and publishes nothing", () => {
  const r = threeBlueprints();
  r.write("cat/b/blueprint.json", "{ broken");
  r.commit("one broken");
  const out = join(r.dir + "-r2");
  const res = cli("validate", r.dir, out);
  assert.equal(res.code, 1);
  assert.equal(existsSync(out), false);
  assert.match(res.log, /cat\/b\/blueprint\.json: is not valid JSON/);
});

// Statuses: the note's status says whether and how a blueprint is published.

/** Notes with a status (none for undefined). */
const noted = (title: string, status?: string, extra = "") => notes(`title: ${title}\nauthors: []${status === undefined ? "" : `\nstatus: ${status}`}${extra}`);
const strings = async (dir: string) => {
  const catalog = await buildCatalog(dir);
  const out = new Map<string, string>();
  await produceStrings(dir, catalog, selectStrings(catalog.index), (k, t) => out.set(k, t));
  return { catalog, out };
};
const labelOf = (text: string | undefined) => (decodeBlueprintString(text!).value as any).blueprint.label;
const entryOf = (catalog: { index: { blueprints: { path: string }[] } }, path: string) => catalog.index.blueprints.find((e) => e.path === path) as any;

test("status era: starts at the first commit where a note has a status key, found by content", async () => {
  const r = repo();
  r.write("cat/a/blueprint.json", bp("A"));
  r.write("cat/a/README.md", notes("title: A\nauthors: []") + "status: in the body is not a key\n");
  const c1 = r.commit("one");
  r.write("cat/b/blueprint.json", bp("B"));
  r.write("cat/b/README.md", noted("B", "public"));
  const c2 = r.commit("two");
  r.write("cat/a/blueprint.json", bp("A2"));
  const c3 = r.commit("three");
  const { Git, statusEra } = await import("../build-catalog.ts");
  assert.deepEqual([...statusEra(new Git(r.dir), c3)].sort(), [c2, c3].sort());
  assert.deepEqual([...statusEra(new Git(r.dir), c1)], []);
});

test("before the status era every note is published; deprecated: true means deprecated", async () => {
  const r = repo();
  r.write("cat/a/blueprint.json", bp("A"));
  r.write("cat/a/README.md", notes("title: A\nauthors: []\ndeprecated: true"));
  r.write("cat/b/blueprint.json", bp("B"));
  r.write("cat/b/README.md", notes("title: B\nauthors: []"));
  r.commit("no statuses yet");
  const { index, problems } = await buildCatalog(r.dir);
  assert.deepEqual(problems, []);
  assert.deepEqual(index.blueprints.map((e) => [e.path, e.status, e.deprecated]), [
    ["cat/a", "deprecated", true],
    ["cat/b", "public", false],
  ]);
  assert.deepEqual(Object.keys(index.blueprints[1]!).slice(3, 6), ["status", "deprecated", "previous_paths"]);
});

test("in the status era: no status is a draft, drafts never published are left out but validated, bad statuses are problems", async () => {
  const r = repo();
  r.write("cat/public/blueprint.json", bp("P"));
  r.write("cat/public/README.md", noted("P", "public"));
  r.write("cat/deprecated/blueprint.json", bp("D"));
  r.write("cat/deprecated/README.md", noted("D", "deprecated"));
  r.write("cat/unlisted/blueprint.json", bp("U"));
  r.write("cat/unlisted/README.md", noted("U", "unlisted"));
  r.write("cat/draft/blueprint.json", bp("Dr"));
  r.write("cat/draft/README.md", noted("Dr", "draft"));
  r.write("cat/none/blueprint.json", bp("N"));
  r.write("cat/none/README.md", noted("N"));
  r.write("cat/empty/blueprint.json", bp("E"));
  r.write("cat/empty/README.md", noted("E", ""));
  r.write("bad/draft/blueprint.json", "{ broken");
  r.write("bad/draft/README.md", noted("X", "draft"));
  r.write("bad/value/blueprint.json", bp("X"));
  r.write("bad/value/README.md", noted("X", "Public"));
  r.write("bad/leftover/blueprint.json", bp("X"));
  r.write("bad/leftover/README.md", noted("X", "public", "\ndeprecated: false"));
  writeExpanded(r, "bad/book", nestedBook());
  r.write("bad/book/README.md", noted("Book", "public"));
  r.write("bad/book/0-stone/README.md", noted("Stone", "public"));
  r.commit("statuses");

  const catalog = await buildCatalog(r.dir);
  assert.deepEqual(catalog.index.blueprints.map((e) => [e.path, e.status, e.deprecated]), [
    ["cat/deprecated", "deprecated", true],
    ["cat/public", "public", false],
    ["cat/unlisted", "unlisted", false],
  ]);
  assert.deepEqual(catalog.drafts, ["bad/draft", "bad/value", "cat/draft", "cat/empty", "cat/none"]);
  assert.deepEqual(catalog.frozen, []);
  const of = (folder: string) => catalog.problems.filter((p) => p.folder === folder).map((p) => `${p.path}: ${p.message}`).join("\n");
  assert.match(of("bad/draft"), /bad\/draft\/blueprint\.json: is not valid JSON/, "a draft is still validated");
  assert.equal(of("bad/value"), "bad/value/README.md: status must be draft, public, deprecated or unlisted (none means draft)");
  assert.equal(of("bad/leftover"), "bad/leftover/README.md: deprecated is replaced by status: write status: deprecated (or public) and remove deprecated");
  assert.equal(of("bad/book"), "bad/book/0-stone/README.md: only the book's own note (bad/book/README.md) has a status; remove it here");
  assert.equal(of("cat/none") + of("cat/draft") + of("cat/empty"), "");

  // A draft is never carried over from the live index, even when invalid.
  const live: LiveIndex = { ...catalog.index, blueprints: [{ ...entryOf(catalog, "cat/public"), path: "bad/draft" }] };
  assert.deepEqual(carryOverStale(catalog, live), []);
});

test("a draft keeps its last published entry; saves made as a draft never become versions", async () => {
  const r = repo();
  r.write("cat/a/blueprint.json", bp("A1"));
  r.write("cat/a/README.md", notes("title: A\nauthors: []\nversion: 1"));
  r.write("cat/a/renders/0.jpg", pointer(OID));
  r.write("cat/other/blueprint.json", bp("O"));
  r.write("cat/other/README.md", notes("title: O\nauthors: []"));
  const c1 = r.commit("before statuses");
  r.write("cat/a/README.md", notes("title: A\nauthors: []\nversion: 1\nstatus: public"));
  r.write("cat/other/README.md", noted("O", "public"));
  const c2 = r.commit("set status on all blueprints");
  const published = (await buildCatalog(r.dir)).index;
  const at = (i: typeof published) => i.blueprints.find((e) => e.path === "cat/a")!;
  assert.deepEqual(at(published).history.map((h) => h.sha), [c1], "the migration is not a version");

  // A new version, saved as a draft: title, version, render and string all stay.
  r.write("cat/a/blueprint.json", bp("A2", 2));
  r.write("cat/a/README.md", notes("title: A new\nauthors: []\nversion: 2\nstatus: draft"));
  r.write("cat/a/renders/0.jpg", pointer("b".repeat(64)));
  r.commit("work in progress");
  r.write("cat/a/blueprint.json", bp("A3", 3));
  const c4 = r.commit("more work in progress");
  let { catalog, out } = await strings(r.dir);
  assert.deepEqual(catalog.problems, []);
  assert.deepEqual(catalog.frozen, ["cat/a"]);
  assert.deepEqual(at(catalog.index), at(published), "exactly the entry it had when last published");
  assert.equal(labelOf(out.get(stringKey("cat/a", c1))), "A1", "and its string");
  assert.deepEqual([...out.keys()].filter((k) => k.startsWith("strings/cat/a/")), [stringKey("cat/a", c1)]);
  assert.deepEqual(selectStrings(catalog.index, published), [], "nothing new to upload");

  // Public again: the current string is the one new version.
  r.write("cat/a/README.md", notes("title: A new\nauthors: []\nversion: 2\nstatus: public"));
  const c5 = r.commit("publish version 2");
  ({ catalog, out } = await strings(r.dir));
  let a = at(catalog.index);
  assert.deepEqual(a.history.map((h) => h.sha), [c5, c1]);
  assert.equal(a.commit, c5);
  assert.equal(a.title, "A new");
  assert.equal(a.renders[0]!.oid, "b".repeat(64));
  assert.equal(a.blueprint.counts.entities, 3);
  assert.equal(labelOf(out.get(stringKey("cat/a", c5))), "A3");
  assert.deepEqual(selectStrings(catalog.index, published).map((j) => j.sha), [c5]);

  // Draft and back without a change, or with a change undone: no new version.
  r.write("cat/a/README.md", noted("A new", "draft"));
  r.commit("hide");
  r.write("cat/a/blueprint.json", bp("A4"));
  r.commit("try something");
  r.write("cat/a/blueprint.json", bp("A3", 3));
  r.commit("undo it");
  r.write("cat/a/README.md", noted("A new", "unlisted"));
  r.commit("unlist");
  a = at((await buildCatalog(r.dir)).index);
  assert.deepEqual(a.history.map((h) => h.sha), [c5, c1]);
  assert.equal(a.status, "unlisted");
  // While published, every change is a version, as before.
  r.write("cat/a/blueprint.json", bp("A5"));
  const c10 = r.commit("tweak");
  assert.deepEqual(at((await buildCatalog(r.dir)).index).history.map((h) => h.sha), [c10, c5, c1]);
  assert.notEqual(c4, c10);
  void c2;
});

test("a draft that changes and turns public in one commit, and a draft whose current files are invalid", async () => {
  const r = repo();
  r.write("cat/a/blueprint.json", bp("A1"));
  r.write("cat/a/README.md", noted("A", "public"));
  const c1 = r.commit("one");
  r.write("cat/a/blueprint.json", "{ broken");
  r.write("cat/a/README.md", noted("A", "draft"));
  r.commit("broken draft");
  let catalog = await buildCatalog(r.dir);
  assert.match(catalog.problems.map((p) => p.message).join(), /not valid JSON/, "the problem is reported");
  assert.deepEqual(catalog.invalid, ["cat/a"]);
  const a = entryOf(catalog, "cat/a");
  assert.equal(a.commit, c1, "the published version stays live");
  assert.equal(a.stale, undefined, "built from the history, not carried over");
  assert.deepEqual(carryOverStale(catalog, catalog.index), [], "and not doubled from the live index");

  r.write("cat/a/blueprint.json", bp("A2"));
  r.write("cat/a/README.md", noted("A", "public"));
  const c3 = r.commit("fixed and public");
  catalog = await buildCatalog(r.dir);
  assert.deepEqual(catalog.problems, []);
  assert.deepEqual(entryOf(catalog, "cat/a").history.map((h: any) => h.sha), [c3, c1]);
});

test("a published blueprint that is invalid keeps its live entry, marked stale, with a status", async () => {
  const r = repo();
  r.write("cat/a/blueprint.json", bp("A1"));
  r.write("cat/a/README.md", noted("A", "deprecated"));
  r.commit("one");
  const live = JSON.parse(JSON.stringify((await buildCatalog(r.dir)).index)) as LiveIndex;
  delete live.blueprints[0]!.status; // a live index from before status
  r.write("cat/a/blueprint.json", "{ broken");
  r.commit("broken");
  const catalog = await buildCatalog(r.dir);
  assert.deepEqual(carryOverStale(catalog, live), ["cat/a"]);
  const a = entryOf(catalog, "cat/a");
  assert.equal(a.stale, true);
  assert.equal(a.status, "deprecated");
});

test("a draft moved to a new path keeps its last published entry at the old path until it is public", async () => {
  const r = repo();
  r.write("cat/a/blueprint.json", bp("A1"));
  r.write("cat/a/README.md", noted("A", "public"));
  const c1 = r.commit("one");
  mkdirSync(join(r.dir, "new"));
  r.git("mv", "cat/a", "new/a");
  r.write("new/a/blueprint.json", bp("A2"));
  r.write("new/a/README.md", noted("A", "draft", "\nprevious_paths: [cat/a]"));
  r.commit("move and rework as a draft");
  let catalog = await buildCatalog(r.dir);
  assert.deepEqual(catalog.problems, []);
  assert.deepEqual(catalog.index.blueprints.map((e) => [e.path, e.commit, e.previous_paths]), [["cat/a", c1, []]]);

  r.write("new/a/README.md", noted("A", "public", "\nprevious_paths: [cat/a]"));
  const c3 = r.commit("publish at the new path");
  const { out, catalog: next } = await strings(r.dir);
  catalog = next;
  assert.deepEqual(catalog.index.blueprints.map((e) => [e.path, e.history.map((h) => h.sha), e.previous_paths]), [["new/a", [c3, c1], ["cat/a"]]]);
  assert.equal(labelOf(out.get(stringKey("new/a", c1))), "A1");
  assert.equal(labelOf(out.get(stringKey("new/a", c3))), "A2");

  // Its old path taken by another folder: the frozen entry cannot be served there.
  const s = repo();
  s.write("cat/a/blueprint.json", bp("A1"));
  s.write("cat/a/README.md", noted("A", "public"));
  s.commit("one");
  mkdirSync(join(s.dir, "new"));
  s.git("mv", "cat/a", "new/a");
  s.write("new/a/README.md", noted("A", "draft"));
  s.write("cat/a/blueprint.json", bp("Other"));
  s.write("cat/a/README.md", noted("Other", "public"));
  s.commit("move a as a draft, another takes its place");
  catalog = await buildCatalog(s.dir);
  assert.deepEqual(catalog.index.blueprints.map((e) => [e.path, e.title]), [["cat/a", "Other"]]);
  assert.deepEqual(catalog.problems, [], "without previous_paths the draft has no published history");
  s.write("new/a/README.md", noted("A", "draft", "\nprevious_paths: [cat/a]"));
  s.commit("claim the old path");
  catalog = await buildCatalog(s.dir);
  assert.deepEqual(catalog.index.blueprints.map((e) => [e.path, e.title]), [["cat/a", "Other"]]);
  assert.deepEqual(catalog.problems.map((p) => p.message), [
    'previous path "cat/a" is a current blueprint folder',
    "its last published version was at cat/a, which is now another blueprint folder, so that version is no longer served",
  ]);
});

test("an expanded book as a draft keeps its nodes, renders and strings; only the root note's status counts", async () => {
  const r = repo();
  writeExpanded(r, "cat/book", nestedBook());
  r.write("cat/book/README.md", noted("Book", "public"));
  r.write("cat/book/0-stone/renders/0.jpg", pointer("a".repeat(64)));
  const c1 = r.commit("book");
  const before = (await buildCatalog(r.dir)).index.blueprints[0]!;
  assert.equal(before.status, "public", "entry notes have no status and need none");

  r.write("cat/book/1-inner/0-bricks/blueprint.json", bp("Bricks", 5));
  r.write("cat/book/1-inner/0-bricks/renders/0.jpg", pointer("c".repeat(64)));
  r.write("cat/book/README.md", noted("Book", "draft"));
  r.commit("rework as a draft");
  r.write("cat/book/1-inner/3-iron/blueprint.json", bp("Iron", 4));
  r.commit("more");
  const { catalog, out } = await strings(r.dir);
  assert.deepEqual(catalog.problems, []);
  assert.deepEqual(catalog.index.blueprints[0], before);
  assert.deepEqual(decodeBlueprintString(out.get(entryKey("cat/book", c1, "1/0"))!).value, { blueprint: bpBody("Bricks") });

  r.write("cat/book/README.md", noted("Book", "public"));
  const c4 = r.commit("publish");
  const after = (await strings(r.dir));
  const e = after.catalog.index.blueprints[0]!;
  assert.deepEqual(e.history.map((h) => h.sha), [c4, c1]);
  assert.equal(e.renders.length, 2);
  assert.equal((decodeBlueprintString(after.out.get(entryKey("cat/book", c4, "1/3"))!).value as any).blueprint.entities.length, 4);
});

test("publish: a new draft gets no strings and no entry; a draft of a published blueprint keeps serving the old string", () => {
  const r = threeBlueprints();
  const c1 = r.commit("three");
  const out = join(r.dir + "-r2");
  assert.equal(cli("publish", r.dir, out).code, 0);
  for (const name of ["a", "b", "c"]) r.write(`cat/${name}/README.md`, noted(name, name === "c" ? "unlisted" : "public"));
  r.commit("statuses");
  r.write("cat/a/blueprint.json", bp("a2"));
  r.write("cat/a/README.md", noted("a", "draft"));
  r.write("cat/new/blueprint.json", bp("new"));
  r.write("cat/new/README.md", noted("new"));
  const c3 = r.commit("draft a, add new");
  const res = cli("publish", r.dir, out);
  assert.equal(res.code, 0, res.log);
  assert.deepEqual(res.index.blueprints.map((e: any) => [e.path, e.status, e.commit]), [
    ["cat/a", "public", c1],
    ["cat/b", "public", c1],
    ["cat/c", "unlisted", c1],
  ]);
  assert.ok(!existsSync(join(out, "strings/cat/new")));
  assert.ok(!existsSync(join(out, stringKey("cat/a", c3))));
  assert.match(res.log, /2 draft\(s\): 1 not published, 1 serving their last published version \(cat\/a\)/);
});
