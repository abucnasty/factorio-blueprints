// The index builder against temporary git repositories.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import {
  applyVersionDecision,
  assembleBook,
  contentHash,
  decideVersion,
  decodeBlueprintString,
  encodeFactorioVersion,
  expandBook,
  type ExpandedEntry,
  plainLabel,
  readCanonicalJson,
  readFrontmatter,
  readNotesMeta,
  readVersions,
  writeCanonicalJson,
  writeVersions,
} from "../../plugin/src/core/index.ts";
import { buildCatalog, carryOver, entryKey, type LiveIndex, produceStrings, selectStrings, stringKey } from "../build-catalog.ts";

process.env["GIT_CONFIG_GLOBAL"] = "/dev/null";
process.env["GIT_CONFIG_NOSYSTEM"] = "1";

const root = mkdtempSync(join(tmpdir(), "fbp-catalog-test-"));
after(() => rmSync(root, { recursive: true, force: true }));
let n = 0;

/**
 * A repo whose blueprints live in blueprints/, as in the vault: `write` and
 * `git` take paths inside it (`content`), or from the repo root with a
 * leading "/".
 */
function repo() {
  const dir = join(root, `repo-${++n}`);
  const content = join(dir, "blueprints");
  mkdirSync(content, { recursive: true });
  const git = (...args: string[]) => execFileSync("git", args, { cwd: content, encoding: "utf8" }).trim();
  execFileSync("git", ["init", "-q", "-b", "main", dir]);
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("config", "commit.gpgsign", "false");
  const write = (path: string, text: string) => {
    const file = path.startsWith("/") ? join(dir, path) : join(content, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  const commit = (subject: string) => {
    git("add", "-A");
    git("commit", "-q", "-m", subject);
    return git("rev-parse", "HEAD");
  };
  return { dir, content, git, write, commit };
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
/** A root note: published (status: public) at version "1" unless `fm` says otherwise. */
const notes = (fm: string) =>
  plain(`${fm}${/^status:/m.test(fm) ? "" : "\nstatus: public"}${/^version:/m.test(fm) ? "" : '\nversion: "1"'}`);
/** A note exactly as given (inside an expanded book, where only the root note has a status). */
const plain = (fm: string) => `---\n${fm}\n---\n\nNotes.\n`;
const pointer = (oid: string, size = 1234) => `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${size}\n`;
const OID = "a".repeat(64);


type Repo = ReturnType<typeof repo>;

/** The value a blueprint folder or expanded book holds in the working tree. */
function valueOf(r: Repo, folder: string): Promise<unknown> {
  const file = join(r.content, folder, "blueprint.json");
  if (existsSync(file)) return Promise.resolve(readCanonicalJson(readFileSync(file, "utf8")));
  return assembleBook(folder, {
    folders: async (f) => readdirSync(join(r.content, f), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name),
    read: async (p) => (existsSync(join(r.content, p)) ? readFileSync(join(r.content, p), "utf8") : undefined),
  });
}

/** Root blueprint folders and expanded books in the working tree. */
function roots(r: Repo, dir = ""): string[] {
  const out: string[] = [];
  for (const d of readdirSync(join(r.content, dir), { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith(".") || d.name.startsWith("_")) continue;
    const f = dir === "" ? d.name : `${dir}/${d.name}`;
    if (existsSync(join(r.content, f, "book.json")) || existsSync(join(r.content, f, "blueprint.json"))) out.push(f);
    else out.push(...roots(r, f));
  }
  return out;
}

/**
 * Commit, then record the version of every published blueprint as the
 * plugin does: a new label for new content is appended with that commit, a
 * new label for the same content renames the latest. Commits the ledgers.
 * Returns the content commit.
 */
async function publish(r: Repo, subject: string, only?: string[]): Promise<string> {
  // Nothing to commit: the version is the commit that last changed things, as with the plugin.
  const sha = r.git("status", "--porcelain") === "" ? r.git("rev-parse", "HEAD") : r.commit(subject);
  const date = r.git("log", "-1", "--format=%aI", sha).replace(/\+00:00$/, "Z");
  for (const folder of only ?? roots(r)) {
    const notePath = join(r.content, folder, "README.md");
    if (!existsSync(notePath)) continue;
    const note = readFileSync(notePath, "utf8");
    let fm: Record<string, unknown>;
    try {
      fm = readFrontmatter(note);
    } catch {
      continue;
    }
    const label = readNotesMeta(note).version;
    if (!["public", "deprecated", "unlisted"].includes(fm["status"] as string) || label === undefined) continue;
    const ledgerPath = join(r.content, folder, "versions.json");
    const ledger = existsSync(ledgerPath) ? readVersions(readFileSync(ledgerPath, "utf8")) : [];
    let value: unknown;
    try {
      value = await valueOf(r, folder);
    } catch {
      continue;
    }
    const d = decideVersion(ledger, contentHash(value), label);
    if (d.kind === "new" || d.kind === "rename") writeFileSync(ledgerPath, writeVersions(applyVersionDecision(ledger, d, { commit: sha, date })));
  }
  if (r.git("status", "--porcelain") !== "") r.commit(`record versions of ${subject}`);
  return sha;
}

test("builds the index from the files and the ledgers: frontmatter, renders, versions newest first", async () => {
  const r = repo();
  r.write("cat/a/blueprint.json", bp("A"));
  r.write("cat/a/README.md", notes("title: A\nauthors: [me]\nversion: 1\nposted: 2026-03-10\ncustom: dropped"));
  r.write("cat/b/blueprint.json", bp("B"));
  r.write("cat/b/README.md", notes("title: B\nauthors: []"));
  r.write("_tools/x/blueprint.json", "not scanned");
  r.write(".hidden/blueprint.json", "not scanned");
  r.write("/blog/post/blueprint.json", bp("Outside blueprints/"));
  r.write("/blog/post/README.md", notes("title: Not published\nauthors: []"));
  const c1 = await publish(r, "add a and b");
  r.write("cat/a/blueprint.json", bp("A", 3));
  r.write("cat/a/README.md", notes("title: A\nauthors: [me]\nversion: 1.1\nposted: 2026-03-10"));
  r.write("cat/a/renders/0.jpg", pointer(OID, 99));
  r.write("cat/a/renders/1.png", pointer("b".repeat(64)));
  const c2 = await publish(r, "grow a");
  r.write("cat/a/README.md", notes("title: A2\nauthors: [me]\nversion: 1.1"));
  const c3 = r.commit("retitle a");

  const { index, problems, held } = await buildCatalog(r.dir, { now: new Date("2026-01-01T00:00:00Z") });
  assert.deepEqual(problems, []);
  assert.deepEqual(held, []);
  assert.equal(index.schema, 3);
  assert.equal(index.commit, c3);
  assert.equal(index.generatedAt, "2026-01-01T00:00:00.000Z");
  assert.deepEqual(index.blueprints.map((e) => e.path), ["cat/a", "cat/b"]);

  const [a, b] = index.blueprints as [(typeof index.blueprints)[0], (typeof index.blueprints)[0]];
  assert.equal(a.title, "A2");
  assert.equal(a.version, "1.1");
  assert.equal("custom" in a, false);
  assert.equal(a.commit, c2, "a notes-only commit is not a version");
  const hashOf = async (label: string, entities = 1) => contentHash(readCanonicalJson(bp(label, entities)));
  assert.deepEqual(
    a.history.map(({ label, sha, hash, subject, entries }) => ({ label, sha, hash, subject, entries })),
    [
      { label: "1.1", sha: c2, hash: await hashOf("A", 3), subject: "1.1", entries: true },
      { label: "1", sha: c1, hash: await hashOf("A"), subject: "1", entries: true },
    ],
  );
  assert.equal(a.history[0]!.date, r.git("log", "-1", "--format=%aI", c2).replace(/\+00:00$/, "Z"));
  assert.equal(a.blueprint.kind, "blueprint");
  assert.equal(a.blueprint.counts.entities, 3);
  assert.equal(a.blueprint.factorioVersion, "2.0.76");
  assert.deepEqual(a.renders, [
    { file: "0.jpg", oid: OID, size: 99 },
    { file: "1.png", oid: "b".repeat(64), size: 1234 },
  ]);
  assert.equal(a.cover, "0.jpg");
  assert.equal(a.nodes, undefined, "a single blueprint has no nodes");
  assert.deepEqual(b.history.map((h) => [h.label, h.sha]), [["1", c1]]);
});

test("a moved blueprint keeps its ledger; previous_paths only redirect, and older versions are not made again under the new path", async () => {
  const r = repo();
  r.write("cat/b/blueprint.json", bp("B"));
  r.write("cat/b/README.md", notes("title: B\nauthors: []"));
  const c1 = await publish(r, "add b");
  r.write("cat/b/blueprint.json", bp("B", 2));
  r.write("cat/b/README.md", notes('title: B\nauthors: []\nversion: "2"'));
  const c2 = await publish(r, "grow b");
  const live = (await buildCatalog(r.dir)).index;
  mkdirSync(join(r.content, "new"));
  r.git("mv", "cat/b", "new/b");
  r.write("new/b/README.md", notes('title: B\nauthors: []\nversion: "2"\nprevious_paths: [cat/b]'));
  r.commit("move b");

  const catalog = await buildCatalog(r.dir);
  const b = catalog.index.blueprints[0]!;
  assert.deepEqual([b.path, b.previous_paths, b.history.map((h) => [h.label, h.sha])], ["new/b", ["cat/b"], [["2", c2], ["1", c1]]]);
  const jobs = selectStrings(catalog.index, live);
  assert.deepEqual(jobs.map((j) => j.key), [stringKey("new/b", c2), stringKey("new/b", c1)]);
  const out = new Map<string, string>();
  const { warnings } = await produceStrings(r.dir, catalog, jobs, (k, t) => out.set(k, t));
  assert.deepEqual([...out.keys()], [stringKey("new/b", c2)], "the current version is made from the files");
  assert.match(warnings.join("\n"), /^new\/b@1: not in the live index, and only the current version's strings can be made/);
});

test("only the current version's strings are made, and only those the live index lacks", async () => {
  const r = repo();
  r.write("cat/a/blueprint.json", bp("A"));
  r.write("cat/a/README.md", notes("title: A\nauthors: []"));
  r.write("cat/b/blueprint.json", bp("B"));
  r.write("cat/b/README.md", notes("title: B\nauthors: []"));
  const c1 = await publish(r, "one");
  const live = (await buildCatalog(r.dir)).index;
  assert.equal(selectStrings(live).length, 2, "no live index: everything");
  assert.deepEqual(selectStrings(live, live), []);

  r.write("cat/a/blueprint.json", bp("A", 2));
  r.write("cat/a/README.md", notes('title: A\nauthors: []\nversion: "2"'));
  const c2 = await publish(r, "two");
  const catalog = await buildCatalog(r.dir);
  assert.deepEqual(selectStrings(catalog.index, live).map((j) => [j.key, j.label]), [[stringKey("cat/a", c2), "2"]]);
  const out = new Map<string, string>();
  await produceStrings(r.dir, catalog, selectStrings(catalog.index, live), (k, t) => out.set(k, t));
  assert.equal((decodeBlueprintString(out.get(stringKey("cat/a", c2))!).value as any).blueprint.entities.length, 2);
  void c1;
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
  const sha = await publish(r, "book");

  const catalog = await buildCatalog(r.dir);
  assert.deepEqual(catalog.problems, []);
  const e = catalog.index.blueprints[0]!;
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

test("non-image files under renders/ are ignored", async () => {
  const r = repo();
  r.write("cat/book/blueprint.json", book("B", [{ index: 0, blueprint: bpBody("first") }]));
  r.write("cat/book/README.md", notes("title: B\nauthors: []"));
  r.write("cat/book/renders/0.jpg", pointer(OID));
  r.write("cat/book/renders/render.json", '{"0": "current"}\n');
  r.write("cat/book/renders/notes.txt", "anything\n");
  await publish(r, "a book with a render and its manifest");

  const catalog = await buildCatalog(r.dir);
  assert.deepEqual(catalog.problems, []);
  const e = catalog.index.blueprints[0]!;
  assert.deepEqual(e.renders.map((x) => x.file), ["0.jpg"]);
  assert.equal(e.cover, "0.jpg");
});

test("entry strings: a schema 1 live index gets all of them once, then a second run has nothing to do", async () => {
  const r = repo();
  r.write("cat/book/blueprint.json", book("B", [{ blueprint: bpBody("a") }, { blueprint: bpBody("b") }]));
  r.write("cat/book/README.md", notes("title: B\nauthors: []"));
  await publish(r, "one");
  r.write("cat/book/blueprint.json", book("B", [{ blueprint: bpBody("a") }, { blueprint: bpBody("c") }]));
  r.write("cat/book/README.md", notes('title: B\nauthors: []\nversion: "2"'));
  await publish(r, "two");
  const index = (await buildCatalog(r.dir)).index;
  const v1: LiveIndex = JSON.parse(JSON.stringify(index));
  v1.schema = 1;
  for (const e of v1.blueprints) for (const h of e.history) delete h.entries;

  const jobs = selectStrings(index, v1);
  assert.equal(jobs.length, 2);
  assert.ok(jobs.every((j) => !j.root && j.entries), "roots exist, entries do not");
  const catalog = await buildCatalog(r.dir);
  const keys: string[] = [];
  const { warnings } = await produceStrings(r.dir, catalog, jobs, (k) => keys.push(k));
  assert.equal(keys.length, 2, "the current version's two entries");
  assert.equal(warnings.length, 1, "the older version's cannot be made");
  assert.ok(keys.every((k) => /\/[0-9a-f]{40}\/[01]\.txt$/.test(k)));

  assert.deepEqual(selectStrings(index, index), [], "the index it published leaves nothing to do");
});

test("a blueprint folder inside another is rejected; the outer one is still published", async () => {
  const r = repo();
  r.write("cat/outer/blueprint.json", bp("Outer"));
  r.write("cat/outer/README.md", notes("title: O\nauthors: []"));
  r.write("cat/outer/3/blueprint.json", bp("Inner"));
  r.write("cat/outer/3/README.md", plain("title: I\nauthors: []"));
  r.write("cat/dup/blueprint.json", book("D", [{ index: 1, blueprint: bpBody("a") }, { blueprint: bpBody("b") }]));
  r.write("cat/dup/README.md", notes("title: D\nauthors: []"));
  await publish(r, "nested", ["cat/outer"]);
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
  r.write("bad/no-version/blueprint.json", bp("X"));
  r.write("bad/no-version/README.md", plain("title: X\nauthors: []\nstatus: public"));
  r.write("bad/label/blueprint.json", bp("X"));
  r.write("bad/label/README.md", notes('title: X\nauthors: []\nversion: "1/2"'));
  r.write("bad/ledger/blueprint.json", bp("X"));
  r.write("bad/ledger/README.md", notes("title: X\nauthors: []"));
  r.write("bad/ledger/versions.json", '[{"label": "1", "date": "2026-01-01", "hash": "x", "commit": "y"}]\n');
  await publish(r, "mixed", ["ok/a"]);

  const { index, problems } = await buildCatalog(r.dir);
  assert.deepEqual(index.blueprints.map((e) => e.path), ["ok/a"]);
  // Problems name repo paths (for annotations), blueprints by their catalog path.
  const byPath = (p: string) => problems.filter((x) => x.path.startsWith(`blueprints/${p}/`) || x.path === `blueprints/${p}`).map((x) => x.message);
  assert.match(byPath("bad/noncanonical").join(), /canonical/);
  assert.match(byPath("bad/invalid-json").join(), /not valid JSON/);
  assert.match(byPath("bad/not-blueprint").join(), /not a blueprint/);
  assert.match(byPath("bad/no-notes").join(), /has no README.md/);
  assert.match(byPath("bad/no-title").join(), /title/);
  assert.match(byPath("bad/authors").join(), /authors/);
  assert.match(byPath("bad/yaml").join(), /not valid YAML/);
  assert.match(byPath("bad/prev").join(), /current blueprint folder/);
  assert.deepEqual(problems.filter((p) => p.folder === "bad/render").map((p) => p.path).sort(), [
    "blueprints/bad/render/renders/0.jpg",
    "blueprints/bad/render/renders/cover.jpg",
  ]);
  assert.match(byPath("bad/no-version").join(), /frontmatter needs a version to be published/);
  assert.match(byPath("bad/label").join(), /version contains "\/"/);
  assert.match(byPath("bad/ledger").join(), /version 1: "2026-01-01" is not an ISO date and time/);
  assert.equal(byPath("ok/a").length, 0);
});

// Expanded books: a book stored as folders (book.json and slot folders).

/** Write `value` (a book) as an expanded book at `folder`, with a README.md in every folder. */
function writeExpanded(r: Repo, folder: string, value: unknown) {
  const { book, entries } = expandBook(value);
  const write = (dir: string, b: unknown, list: ExpandedEntry[]) => {
    r.write(`${dir}/book.json`, writeCanonicalJson(b));
    r.write(`${dir}/README.md`, dir === folder ? notes(`title: ${dir}\nauthors: []`) : plain(`title: ${dir}\nauthors: []`));
    for (const e of list) {
      const path = `${dir}/${e.folder}`;
      if (e.entries) write(path, e.book, e.entries);
      else {
        r.write(`${path}/blueprint.json`, writeCanonicalJson(e.value));
        r.write(`${path}/README.md`, plain(`title: ${e.label}\nauthors: []`));
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

test("expanding a book keeps its content, so it is no new version; a change to a leaf needs a new label", async () => {
  const r = repo();
  r.write("cat/book/blueprint.json", writeCanonicalJson(nestedBook()));
  r.write("cat/book/README.md", notes("title: Book\nauthors: []"));
  r.write("cat/book/renders/0.jpg", pointer("0".repeat(64)));
  r.write("cat/book/renders/1/3.jpg", pointer("3".repeat(64)));
  const c1 = await publish(r, "add book");
  const before = await buildCatalog(r.dir);
  const strings1 = new Map<string, string>();
  await produceStrings(r.dir, before, selectStrings(before.index), (k, t) => strings1.set(k, t));

  r.git("rm", "-r", "-q", "cat/book/blueprint.json", "cat/book/renders");
  writeExpanded(r, "cat/book", nestedBook());
  r.write("cat/book/README.md", notes("title: Book\nauthors: []"));
  r.write("cat/book/0-stone/renders/0.jpg", pointer("a".repeat(64), 10));
  r.write("cat/book/0-stone/renders/render.json", "{}\n");
  r.write("cat/book/1-inner/3-iron/renders/0.png", pointer("b".repeat(64), 20));
  await publish(r, "expand book");
  r.write("cat/book/1-inner/README.md", plain("title: Inner book\nauthors: [me]"));
  r.commit("notes only");

  const catalog = await buildCatalog(r.dir);
  assert.deepEqual(catalog.problems, []);
  assert.deepEqual(catalog.held, []);
  assert.deepEqual(catalog.index.blueprints.map((e) => e.path), ["cat/book"], "slot folders are not entries");
  const e = catalog.index.blueprints[0]!;
  assert.equal(e.title, "Book");
  assert.equal(e.commit, c1);
  assert.deepEqual(e.history.map((h) => h.sha), [c1], "the same content: still version 1");
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
  assert.deepEqual(stats, { warnings: [], roots: 1, entries: 5 });
  assert.equal(out.get(stringKey("cat/book", c1)), strings1.get(stringKey("cat/book", c1)), "the same root string before and after");
  assert.deepEqual(decodeBlueprintString(out.get(entryKey("cat/book", c1, "1/3"))!).value, { blueprint: bpBody("Iron") });

  // A change to one leaf changes the root book: held until the root note's version is bumped.
  r.write("cat/book/1-inner/0-bricks/blueprint.json", bp("Bricks", 2));
  await publish(r, "grow bricks");
  assert.match((await buildCatalog(r.dir)).held.map((h) => h.message).join(), /bump `version` to publish/);
  r.write("cat/book/README.md", notes('title: Book\nauthors: []\nversion: "2"'));
  const c3 = await publish(r, "version 2");
  const next = await buildCatalog(r.dir);
  assert.deepEqual(next.index.blueprints[0]!.history.map((h) => [h.label, h.sha]), [["2", c3], ["1", c1]]);
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
  await publish(r, "renders with manifests");

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
  carryOver(next, live);
  assert.deepEqual(next.index.blueprints[0]!.renders, [{ file: "0.jpg", oid: "1".repeat(64), size: 1234, width: 260, height: 288 }]);
});

test("expanded book rules: slot folders, both files, nesting, notes and renders", async () => {
  const r = repo();
  const value = () => JSON.parse(book("B", [{ index: 0, blueprint: bpBody("a") }, { index: 1, blueprint: bpBody("b") }]));
  writeExpanded(r, "ok/book", value());
  r.write("ok/book/notes/picture.txt", "a folder without blueprints may be anything");
  writeExpanded(r, "bad/name", value());
  renameSync(join(r.content, "bad/name/1-b"), join(r.content, "bad/name/misc"));
  writeExpanded(r, "bad/holder", value());
  r.write("bad/holder/stuff/0-x/blueprint.json", bp("x"));
  r.write("bad/holder/stuff/0-x/README.md", plain("title: x\nauthors: []"));
  writeExpanded(r, "bad/dup", value());
  r.write("bad/dup/1-other/blueprint.json", bp("c"));
  r.write("bad/dup/1-other/README.md", plain("title: c\nauthors: []"));
  writeExpanded(r, "bad/both", value());
  r.write("bad/both/0-a/book.json", writeCanonicalJson({ blueprint_book: { item: "blueprint-book" } }));
  writeExpanded(r, "bad/notes", value());
  r.write("bad/notes/1-b/README.md", plain("authors: []"));
  writeExpanded(r, "bad/renders", value());
  r.write("bad/renders/renders/0.jpg", pointer(OID));
  writeExpanded(r, "bad/leaf-render", value());
  r.write("bad/leaf-render/1-b/renders/1.jpg", pointer(OID));
  writeExpanded(r, "bad/entries", value());
  r.write("bad/entries/book.json", book("B", []));
  r.write("bad/inside/blueprint.json", bp("outer"));
  r.write("bad/inside/README.md", notes("title: o\nauthors: []"));
  writeExpanded(r, "bad/inside/sub", value());
  await publish(r, "books", ["ok/book", "bad/inside"]);
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
  const of = (folder: string) => problems.filter((p) => p.folder === folder).map((p) => `${p.path.replace(/^blueprints\//, "")}: ${p.message}`).join("\n");
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


test("publish: an invalid blueprint is reported and left out, the others are published, the run fails", async () => {
  const r = threeBlueprints();
  r.write("cat/b/blueprint.json", "{ broken");
  const sha = await publish(r, "one broken");
  const out = join(r.dir + "-r2");
  const res = cli("publish", r.dir, out);
  assert.equal(res.code, 1);
  assert.deepEqual(res.index.blueprints.map((e: any) => e.path), ["cat/a", "cat/c"]);
  assert.equal(stringKey("cat/a", sha), `blueprints/cat/a/${sha}.txt`, "R2 keys follow the link layout");
  assert.ok(existsSync(join(out, stringKey("cat/a", sha))));
  assert.ok(existsSync(join(out, stringKey("cat/c", sha))));
  assert.ok(!existsSync(join(out, "blueprints/cat/b")));
  assert.match(res.log, /  blueprints\/cat\/b\/blueprint\.json: is not valid JSON/, "problems name repo paths");
  assert.match(res.summary, /cat\/b\/blueprint\.json.*is not valid JSON/);
});

test("publish: an invalid blueprint keeps its live entry, marked stale; a deleted folder is removed", async () => {
  const r = threeBlueprints();
  const c1 = await publish(r, "three");
  const out = join(r.dir + "-r2");
  assert.equal(cli("publish", r.dir, out).code, 0);

  r.write("cat/a/blueprint.json", bp("a2"));
  r.write("cat/a/README.md", notes('title: a\nauthors: []\nversion: "2"'));
  r.write("cat/b/README.md", notes("authors: []"));
  r.write("cat/b/blueprint.json", bp("b2"));
  const c2 = await publish(r, "update a, break b");
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

test("validate (pull requests) still fails and publishes nothing", async () => {
  const r = threeBlueprints();
  r.write("cat/b/blueprint.json", "{ broken");
  await publish(r, "one broken");
  const out = join(r.dir + "-r2");
  const res = cli("validate", r.dir, out);
  assert.equal(res.code, 1);
  assert.equal(existsSync(out), false);
  assert.match(res.log, /cat\/b\/blueprint\.json: is not valid JSON/);
});

// The version rules as CI applies them: it reads the ledgers and never writes them.

test("publish: content changed without a new version is held: not published, not a failure, the last version stays live", async () => {
  const r = threeBlueprints();
  const c1 = await publish(r, "three");
  const out = join(r.dir + "-r2");
  assert.equal(cli("publish", r.dir, out).code, 0);

  r.write("cat/a/blueprint.json", bp("a changed"));
  r.write("cat/a/README.md", notes("title: a retitled\nauthors: []"));
  await publish(r, "change a, keep version 1");
  const res = cli("publish", r.dir, out);
  assert.equal(res.code, 0, res.log);
  const a = res.index.blueprints.find((e: any) => e.path === "cat/a");
  assert.equal(a.commit, c1, "the last recorded version stays live");
  assert.equal(a.title, "a", "as it was published");
  assert.equal(a.stale, true);
  assert.match(res.log, /cat\/a: content changed, bump `version` to publish: the note is still "1", so version "1" stays live/);
  assert.match(res.summary, /1 blueprint\(s\) with an unpublished change[\s\S]*`cat\/a`/);
  assert.equal(cli("validate", r.dir, out + "-v").code, 0, "nor does it fail validation");
});

test("CI never records: a hand-made rename is reported until recorded, a new version is held until recorded", async () => {
  const r = repo();
  r.write("cat/a/blueprint.json", bp("A"));
  r.write("cat/a/README.md", notes('title: A\nauthors: []\nversion: "1.0"'));
  const c1 = await publish(r, "one");
  const live = (await buildCatalog(r.dir)).index;

  r.write("cat/a/README.md", notes('title: A\nauthors: []\nversion: "1.0.1"'));
  r.commit("relabel by hand, ledger not updated yet");
  let catalog = await buildCatalog(r.dir);
  assert.deepEqual(catalog.index.blueprints[0]!.history.map((h) => [h.label, h.sha]), [["1.0", c1]], "served under the ledger's label");
  assert.equal(catalog.index.blueprints[0]!.version, "1.0");
  assert.match(catalog.renames[0]!.message, /renames version "1.0" to "1.0.1", which versions.json does not record yet/);
  assert.deepEqual(selectStrings(catalog.index, live), [], "the same string: nothing to upload");
  await publish(r, "record the rename");
  catalog = await buildCatalog(r.dir);
  assert.deepEqual(catalog.index.blueprints[0]!.history.map((h) => [h.label, h.sha]), [["1.0.1", c1]]);
  assert.deepEqual(catalog.renames, []);

  r.write("cat/a/blueprint.json", bp("A", 2));
  r.write("cat/a/README.md", notes('title: A\nauthors: []\nversion: "1.1"'));
  r.commit("new content and label, not recorded");
  catalog = await buildCatalog(r.dir);
  assert.deepEqual(catalog.index.blueprints, []);
  assert.deepEqual(catalog.problems, []);
  assert.match(catalog.held[0]!.message, /content changed and version "1.1" is not recorded in versions.json yet .*version "1.0.1" stays live/);
  await publish(r, "record it");
  catalog = await buildCatalog(r.dir);
  assert.deepEqual(catalog.index.blueprints[0]!.history.map((h) => h.label), ["1.1", "1.0.1"]);
});

// Statuses: the note's status says whether and how a blueprint is published.

/** Notes with a status (none for undefined). */
const noted = (title: string, status?: string, extra = "") =>
  plain(`title: ${title}\nauthors: []${status === undefined ? "" : `\nstatus: ${status}`}${/^version:/m.test(extra.trim()) ? "" : '\nversion: "1"'}${extra}`);
const entryOf = (catalog: { index: { blueprints: { path: string }[] } }, path: string) => catalog.index.blueprints.find((e) => e.path === path) as any;

test("no status is a draft; drafts are left out but validated; bad statuses are problems", async () => {
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
  r.write("bad/book/0-stone/README.md", plain("title: Stone\nauthors: []\nstatus: public"));
  await publish(r, "statuses");

  const catalog = await buildCatalog(r.dir);
  assert.deepEqual(catalog.index.blueprints.map((e) => [e.path, e.status, e.deprecated]), [
    ["cat/deprecated", "deprecated", true],
    ["cat/public", "public", false],
    ["cat/unlisted", "unlisted", false],
  ]);
  assert.deepEqual(catalog.drafts.map((d) => d.folder), ["bad/draft", "bad/value", "cat/draft", "cat/empty", "cat/none"]);
  const of = (folder: string) => catalog.problems.filter((p) => p.folder === folder).map((p) => `${p.path.replace(/^blueprints\//, "")}: ${p.message}`).join("\n");
  assert.match(of("bad/draft"), /bad\/draft\/blueprint\.json: is not valid JSON/, "a draft is still validated");
  assert.equal(of("bad/value"), "bad/value/README.md: status must be draft, public, deprecated or unlisted (none means draft)");
  assert.equal(of("bad/leftover"), "bad/leftover/README.md: deprecated is replaced by status: write status: deprecated (or public) and remove deprecated");
  assert.equal(of("bad/book"), "bad/book/0-stone/README.md: only the book's own note (bad/book/README.md) has a status; remove it here");
  assert.equal(of("cat/none") + of("cat/draft") + of("cat/empty"), "");

  // A draft keeps its live entry as it was (not marked stale), even when invalid.
  const live: LiveIndex = { ...catalog.index, blueprints: [{ ...entryOf(catalog, "cat/public"), path: "bad/draft" }] };
  assert.deepEqual(carryOver(catalog, live), { stale: [], frozen: ["bad/draft"] });
  assert.equal(entryOf(catalog, "bad/draft").stale, undefined);
});

test("a published blueprint that is invalid keeps its live entry, marked stale, with a status", async () => {
  const r = repo();
  r.write("cat/a/blueprint.json", bp("A1"));
  r.write("cat/a/README.md", noted("A", "deprecated"));
  await publish(r, "one");
  const live = JSON.parse(JSON.stringify((await buildCatalog(r.dir)).index)) as LiveIndex;
  delete live.blueprints[0]!.status; // a live index from before status
  r.write("cat/a/blueprint.json", "{ broken");
  r.commit("broken");
  const catalog = await buildCatalog(r.dir);
  assert.deepEqual(carryOver(catalog, live), { stale: ["cat/a"], frozen: [] });
  const a = entryOf(catalog, "cat/a");
  assert.equal(a.stale, true);
  assert.equal(a.status, "deprecated");
});

test("publish: a new draft gets no strings and no entry; a draft of a published blueprint keeps its live entry", async () => {
  const r = threeBlueprints();
  const c1 = await publish(r, "three");
  const out = join(r.dir + "-r2");
  assert.equal(cli("publish", r.dir, out).code, 0);
  r.write("cat/a/blueprint.json", bp("a2"));
  r.write("cat/a/README.md", noted("a", "draft", '\nversion: "2"'));
  r.write("cat/c/README.md", noted("c", "unlisted", '\nversion: "1"'));
  r.write("cat/new/blueprint.json", bp("new"));
  r.write("cat/new/README.md", noted("new"));
  const c2 = await publish(r, "draft a, unlist c, add new");
  let res = cli("publish", r.dir, out);
  assert.equal(res.code, 0, res.log);
  assert.deepEqual(res.index.blueprints.map((e: any) => [e.path, e.status, e.commit]), [
    ["cat/a", "public", c1],
    ["cat/b", "public", c1],
    ["cat/c", "unlisted", c1],
  ]);
  assert.ok(!existsSync(join(out, "blueprints/cat/new")));
  assert.ok(!existsSync(join(out, stringKey("cat/a", c2))));
  assert.match(res.log, /2 draft\(s\): 1 not published, 1 serving their last published version \(cat\/a\)/);

  // Public again with the new version: recorded when published, then live.
  r.write("cat/a/README.md", noted("a", "public", '\nversion: "2"'));
  const c3 = await publish(r, "publish a");
  res = cli("publish", r.dir, out);
  assert.deepEqual(res.index.blueprints[0].history.map((h: any) => [h.label, h.sha]), [["2", c3], ["1", c1]]);
  assert.ok(existsSync(join(out, stringKey("cat/a", c3))));
});
