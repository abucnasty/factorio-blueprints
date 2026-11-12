// The index builder against temporary git repositories.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { decodeBlueprintString, encodeFactorioVersion, plainLabel, writeCanonicalJson } from "../../plugin/src/core/index.ts";
import { buildCatalog, entryKey, type LiveIndex, produceStrings, selectStrings, stringKey } from "../build-catalog.ts";

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

test("builds the index: history, renames via previous_paths, renders, frontmatter", () => {
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

  const { index, problems } = buildCatalog(r.dir, { now: new Date("2026-01-01T00:00:00Z") });
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

test("history dates are author dates, in git log order", () => {
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

  const [a] = buildCatalog(r.dir).index.blueprints;
  assert.deepEqual(
    a!.history.map((h) => [h.sha, h.date]),
    [
      [newer, "2023-01-01T00:00:00Z"],
      [old, "2024-03-10T12:00:00+01:00"],
    ],
  );
});

test("produces each version's string from that commit, under the current path", () => {
  const r = repo();
  r.write("cat/a/blueprint.json", bp("A1"));
  r.write("cat/a/README.md", notes("title: A\nauthors: []"));
  const c1 = r.commit("one");
  r.write("cat/a/blueprint.json", bp("A2"));
  const c2 = r.commit("two");
  r.git("mv", "cat/a", "cat/z");
  r.write("cat/z/README.md", notes("title: A\nauthors: []\nprevious_paths: [cat/a]"));
  const c3 = r.commit("rename");

  const catalog = buildCatalog(r.dir);
  const out = new Map<string, string>();
  produceStrings(r.dir, catalog, selectStrings(catalog.index), (k, t) => out.set(k, t));
  assert.deepEqual([...out.keys()].sort(), [c1, c2, c3].map((s) => stringKey("cat/z", s)).sort());
  const label = (sha: string) => (decodeBlueprintString(out.get(stringKey("cat/z", sha))!).value as any).blueprint.label;
  assert.equal(label(c1), "A1");
  assert.equal(label(c2), "A2");
  assert.equal(label(c3), "A2");
});

test("an old version that was not a valid blueprint is dropped from the history", () => {
  const r = repo();
  r.write("cat/a/blueprint.json", "{ broken");
  r.write("cat/a/README.md", notes("title: A\nauthors: []"));
  const bad = r.commit("broken");
  r.write("cat/a/blueprint.json", bp("A"));
  const good = r.commit("fixed");
  const catalog = buildCatalog(r.dir);
  assert.deepEqual(catalog.index.blueprints[0]!.history.map((h) => h.sha), [good, bad]);
  const keys: string[] = [];
  const { warnings } = produceStrings(r.dir, catalog, selectStrings(catalog.index), (k) => keys.push(k));
  assert.deepEqual(keys, [stringKey("cat/a", good)]);
  assert.equal(warnings.length, 1);
  assert.deepEqual(catalog.index.blueprints[0]!.history.map((h) => h.sha), [good]);
});

test("selects only strings the live index lacks", () => {
  const r = repo();
  r.write("cat/a/blueprint.json", bp("A"));
  r.write("cat/a/README.md", notes("title: A\nauthors: []"));
  r.write("cat/b/blueprint.json", bp("B"));
  r.write("cat/b/README.md", notes("title: B\nauthors: []"));
  const c1 = r.commit("one");
  const live = buildCatalog(r.dir).index;
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
  const next = buildCatalog(r.dir).index;
  assert.deepEqual(
    selectStrings(next, live).map((j) => j.key),
    [stringKey("cat/a", c3), stringKey("cat/a", c2), stringKey("cat/c", c4), stringKey("cat/c", c1)],
  );
});

test("book nodes: slot paths with and without index, nested books, planners, renders and cover", () => {
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

  const catalog = buildCatalog(r.dir);
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
  const stats = produceStrings(r.dir, catalog, selectStrings(catalog.index), (k, t) => out.set(k, t));
  assert.deepEqual(stats, { warnings: [], roots: 1, entries: 6 });
  const decoded = (slot: string) => decodeBlueprintString(out.get(entryKey("cat/book", sha, slot))!).value;
  assert.deepEqual(decoded("3"), { blueprint_book: inner }, "a nested book's own string");
  assert.deepEqual(decoded("3/4"), { blueprint: inner.blueprints[1]!.blueprint });
  assert.deepEqual(decoded("1"), { blueprint: bpBody("Z") });
  assert.deepEqual(decoded("0"), { upgrade_planner: upgrade });
  assert.deepEqual(decoded("5"), { deconstruction_planner: decon });
  assert.ok(out.has(stringKey("cat/book", sha)));
});

test("non-image files under renders/ are ignored; a shared slot goes to the first entry", () => {
  const r = repo();
  r.write("cat/book/blueprint.json", book("B", [{ index: 0, blueprint: bpBody("first") }, { index: 0, blueprint: bpBody("second") }]));
  r.write("cat/book/README.md", notes("title: B\nauthors: []"));
  const old = r.commit("two entries in slot 0");
  r.write("cat/book/blueprint.json", book("B", [{ index: 0, blueprint: bpBody("first") }]));
  r.write("cat/book/renders/0.jpg", pointer(OID));
  r.write("cat/book/renders/render.json", '{"0": "current"}\n');
  r.write("cat/book/renders/notes.txt", "anything\n");
  r.commit("fix the book, add a render and its manifest");

  const catalog = buildCatalog(r.dir);
  assert.deepEqual(catalog.problems, []);
  const e = catalog.index.blueprints[0]!;
  assert.deepEqual(e.renders.map((x) => x.file), ["0.jpg"]);
  assert.equal(e.cover, "0.jpg");

  const out = new Map<string, string>();
  const { warnings } = produceStrings(r.dir, catalog, selectStrings(catalog.index), (k, t) => out.set(k, t));
  const label = (decodeBlueprintString(out.get(entryKey("cat/book", old, "0"))!).value as any).blueprint.label;
  assert.equal(label, "first");
  assert.match(warnings.join(), /second entry in slot 0/);
});

test("an entry that a later version removes keeps its string for the older version only", () => {
  const r = repo();
  r.write("cat/book/blueprint.json", book("B", [{ index: 0, blueprint: bpBody("keep") }, { index: 1, blueprint: bpBody("gone") }]));
  r.write("cat/book/README.md", notes("title: B\nauthors: []"));
  const c1 = r.commit("two entries");
  r.write("cat/book/blueprint.json", book("B", [{ index: 0, blueprint: bpBody("keep") }]));
  const c2 = r.commit("one entry");
  const catalog = buildCatalog(r.dir);
  const keys = new Set<string>();
  produceStrings(r.dir, catalog, selectStrings(catalog.index), (k) => keys.add(k));
  assert.ok(keys.has(entryKey("cat/book", c1, "1")));
  assert.ok(keys.has(entryKey("cat/book", c2, "0")));
  assert.ok(!keys.has(entryKey("cat/book", c2, "1")));
  assert.deepEqual(catalog.index.blueprints[0]!.nodes!.map((n) => n.path), ["0"]);
});

test("entry strings: a schema 1 live index gets all of them once, then a second run has nothing to do", () => {
  const r = repo();
  r.write("cat/book/blueprint.json", book("B", [{ blueprint: bpBody("a") }, { blueprint: bpBody("b") }]));
  r.write("cat/book/README.md", notes("title: B\nauthors: []"));
  r.commit("one");
  r.write("cat/book/blueprint.json", book("B", [{ blueprint: bpBody("a") }, { blueprint: bpBody("c") }]));
  r.commit("two");
  const index = buildCatalog(r.dir).index;
  const v1: LiveIndex = JSON.parse(JSON.stringify(index));
  v1.schema = 1;
  for (const e of v1.blueprints) for (const h of e.history) delete h.entries;

  const jobs = selectStrings(index, v1);
  assert.equal(jobs.length, 2);
  assert.ok(jobs.every((j) => !j.root && j.entries), "roots exist, entries do not");
  const catalog = buildCatalog(r.dir);
  const keys: string[] = [];
  produceStrings(r.dir, catalog, jobs, (k) => keys.push(k));
  assert.equal(keys.length, 4);
  assert.ok(keys.every((k) => /\/[0-9a-f]{40}\/[01]\.txt$/.test(k)));

  assert.deepEqual(selectStrings(index, index), [], "the schema 2 index it published leaves nothing to do");
});

test("a blueprint folder inside another is rejected; the outer one is still published", () => {
  const r = repo();
  r.write("cat/outer/blueprint.json", bp("Outer"));
  r.write("cat/outer/README.md", notes("title: O\nauthors: []"));
  r.write("cat/outer/3/blueprint.json", bp("Inner"));
  r.write("cat/outer/3/README.md", notes("title: I\nauthors: []"));
  r.write("cat/dup/blueprint.json", book("D", [{ index: 1, blueprint: bpBody("a") }, { blueprint: bpBody("b") }]));
  r.write("cat/dup/README.md", notes("title: D\nauthors: []"));
  r.commit("nested");
  const { index, problems, invalid } = buildCatalog(r.dir);
  assert.deepEqual(index.blueprints.map((e) => e.path), ["cat/outer"]);
  assert.deepEqual(invalid, ["cat/dup", "cat/outer/3"]);
  assert.match(problems.find((p) => p.folder === "cat/outer/3")!.message, /inside the blueprint folder cat\/outer/);
  assert.match(problems.find((p) => p.folder === "cat/dup")!.message, /more than one entry in book slot 1/);
});

test("lists validation failures and leaves those blueprints out", () => {
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

  const { index, problems } = buildCatalog(r.dir);
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
