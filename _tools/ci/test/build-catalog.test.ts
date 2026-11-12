// The index builder against temporary git repositories.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { decodeBlueprintString, encodeFactorioVersion, writeCanonicalJson } from "../../plugin/src/core/index.ts";
import { buildCatalog, produceStrings, selectStrings, stringKey } from "../build-catalog.ts";

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
    { n: 0, file: "0.jpg", oid: OID, size: 99 },
    { n: 1, file: "1.png", oid: "b".repeat(64), size: 1234 },
  ]);

  assert.deepEqual(b.previous_paths, ["cat/b"]);
  assert.equal(b.commit, c3);
  assert.deepEqual(b.history.map((h) => h.sha), [c3, c1], "history follows the old path");
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
