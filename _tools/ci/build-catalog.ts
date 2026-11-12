// Build and validate the catalog index from a git commit, and produce the
// blueprint strings it points at. Reads only git objects (never the working
// tree), so render images are seen as their LFS pointers and nothing is
// downloaded. The CLI is catalog.ts.

import { execFileSync } from "node:child_process";

import {
  BLUEPRINT_FILE,
  type BlueprintKind,
  blueprintStats,
  decodeBlueprintString,
  describeBlueprint,
  encodeBlueprintString,
  FrontmatterError,
  isBlueprintValue,
  isCanonicalJson,
  isScannedPath,
  joinPath,
  NOTES_FILE,
  parentFolder,
  plainLabel,
  readCanonicalJson,
  readFrontmatter,
  readNotesMeta,
} from "../plugin/src/core/index.ts";
import type { CatalogEntry, CatalogIndex, CatalogNode, CatalogRender, CatalogVersion } from "./catalog-index.ts";

/** A live index as read back from R2: this schema or the previous one. */
export type LiveIndex = Omit<CatalogIndex, "schema"> & { schema: 1 | 2 };

export interface Problem {
  /** The blueprint folder this problem makes invalid. */
  folder: string;
  /** Repo path of the file or folder at fault. */
  path: string;
  message: string;
}

export interface Catalog {
  index: CatalogIndex;
  /** Validation failures; blueprints with any are left out of the index. */
  problems: Problem[];
  /** Blueprint folders that exist at the commit but have problems, sorted. */
  invalid: string[];
  /** blueprint.json blob id for every (path, sha) in the index, keyed by stringKey. */
  blobs: Map<string, string>;
}

export interface StringJob {
  path: string;
  sha: string;
  /** stringKey(path, sha), also the key of the version's blob in Catalog.blobs. */
  key: string;
  /** Produce the root string. */
  root: boolean;
  /** Produce the string of every book entry. */
  entries: boolean;
}

/** R2 key of the blueprint string of `path` as of `sha`. */
export function stringKey(path: string, sha: string): string {
  return `strings/${path}/${sha}.txt`;
}

/** R2 key of the string of the book entry at `slotPath` ("3/1") of `path` as of `sha`. */
export function entryKey(path: string, sha: string, slotPath: string): string {
  return `strings/${path}/${sha}/${slotPath}.txt`;
}

/** Files under renders/ that are images (the extensions .gitattributes stores in LFS). */
const RENDER_IMAGE = /\.(jpg|jpeg|png|webp)$/;
/** A render image's name: "<slot path>.<ext>", e.g. "0.jpg" or "3/1.png". */
const RENDER_FILE = /^((?:0|[1-9][0-9]*)(?:\/(?:0|[1-9][0-9]*))*)\.(jpg|jpeg|png|webp)$/;
const LFS_POINTER = /^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid sha256:([0-9a-f]{64})\nsize ([0-9]+)\n$/;

// ---------------------------------------------------------------------------
// git plumbing

export class Git {
  readonly repo: string;
  constructor(repo: string) {
    this.repo = repo;
  }

  run(args: string[], input?: string): Buffer {
    return execFileSync("git", ["-C", this.repo, "--literal-pathspecs", ...args], {
      input,
      maxBuffer: 1 << 30,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }

  /** Full SHA of a commit-ish. */
  resolve(ref: string): string {
    return this.run(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]).toString().trim();
  }

  /** Every blob in the commit's tree: path -> blob id. */
  tree(commit: string): Map<string, string> {
    const out = new Map<string, string>();
    for (const rec of this.run(["ls-tree", "-r", "-z", "--full-tree", commit]).toString().split("\0")) {
      const m = /^\d+ blob ([0-9a-f]+)\t(.*)$/s.exec(rec);
      if (m) out.set(m[2]!, m[1]!);
    }
    return out;
  }

  /** Blob ids for "<rev>:<path>" names; undefined where there is none. */
  blobIds(names: string[]): (string | undefined)[] {
    if (names.length === 0) return [];
    const lines = this.run(["cat-file", "--batch-check"], names.join("\n") + "\n").toString().split("\n");
    return names.map((_, i) => {
      const m = /^([0-9a-f]+) blob \d+$/.exec(lines[i] ?? "");
      return m ? m[1] : undefined;
    });
  }

  /** Contents of blobs by id. */
  readBlobs(ids: string[]): Map<string, Buffer> {
    const unique = [...new Set(ids)];
    const out = new Map<string, Buffer>();
    if (unique.length === 0) return out;
    const buf = this.run(["cat-file", "--batch"], unique.join("\n") + "\n");
    let pos = 0;
    for (const id of unique) {
      const nl = buf.indexOf(0x0a, pos);
      const header = buf.subarray(pos, nl).toString();
      const m = /^([0-9a-f]+) \w+ (\d+)$/.exec(header);
      if (!m) throw new Error(`git cat-file: no object ${id} (${header})`);
      const size = Number(m[2]);
      out.set(id, buf.subarray(nl + 1, nl + 1 + size));
      pos = nl + 1 + size + 1;
    }
    return out;
  }

  /** Commits that changed any of the paths, newest first, reachable from `commit`. */
  log(commit: string, paths: string[]): CatalogVersion[] {
    const text = this.run(["log", "--format=%x1e%H%x1f%aI%x1f%s", commit, "--", ...paths]).toString();
    return text
      .split("\x1e")
      .slice(1)
      .map((rec) => {
        const [sha, date, subject] = rec.replace(/\n+$/, "").split("\x1f");
        // git prints a UTC offset as "+00:00" or "Z" depending on its version; keep one form
        return { sha: sha!, date: date!.replace(/\+00:00$/, "Z"), subject: subject ?? "" };
      });
  }
}

// ---------------------------------------------------------------------------
// index

/** Validate every blueprint folder at `commit` and build the index. */
export function buildCatalog(repo: string, opts: { commit?: string; now?: Date } = {}): Catalog {
  const git = new Git(repo);
  const commit = git.resolve(opts.commit ?? "HEAD");
  const files = git.tree(commit);
  const problems: Problem[] = [];
  const blobs = new Map<string, string>();

  const folders = [...files.keys()]
    .filter((p) => p.endsWith("/" + BLUEPRINT_FILE) && isScannedPath(p))
    .map(parentFolder)
    .sort();
  const folderSet = new Set(folders);

  // Render images belong to the blueprint folder that holds their renders/
  // directory. Only the image types the LFS patterns track are renders;
  // anything else there (the render tool's render.json) is ignored.
  const renderFiles = new Map<string, { file: string; blob: string }[]>();
  for (const [path, blob] of files) {
    if (!isScannedPath(path) || !RENDER_IMAGE.test(path)) continue;
    const segs = path.split("/");
    for (let i = segs.length - 2; i >= 1; i--) {
      const folder = segs.slice(0, i).join("/");
      if (segs[i] === "renders" && folderSet.has(folder)) {
        const list = renderFiles.get(folder) ?? [];
        list.push({ file: segs.slice(i + 1).join("/"), blob });
        renderFiles.set(folder, list);
        break;
      }
    }
  }

  const wanted: string[] = [];
  for (const f of folders) {
    wanted.push(files.get(`${f}/${BLUEPRINT_FILE}`)!);
    const notes = files.get(`${f}/${NOTES_FILE}`);
    if (notes) wanted.push(notes);
    for (const r of renderFiles.get(f) ?? []) wanted.push(r.blob);
  }
  const content = git.readBlobs(wanted);

  // Previous paths: each may be claimed once and must not be a current folder.
  const claimed = new Map<string, string>();
  const entries: CatalogEntry[] = [];

  for (const folder of folders) {
    const before = problems.length;
    const problem = (path: string, message: string) => problems.push({ folder, path, message });

    // Everything after a blueprint folder's path is a slot path, so folders cannot nest.
    const outer = folders.find((f) => folder.startsWith(f + "/"));
    if (outer) problem(folder, `is inside the blueprint folder ${outer}; a blueprint folder cannot contain another`);

    // README.md frontmatter.
    const notesBlob = files.get(`${folder}/${NOTES_FILE}`);
    let meta: ReturnType<typeof readNotesMeta> | undefined;
    if (!notesBlob) {
      problem(folder, `has no ${NOTES_FILE}`);
    } else {
      const notesPath = `${folder}/${NOTES_FILE}`;
      const text = content.get(notesBlob)!.toString("utf8");
      try {
        const fm = readFrontmatter(text);
        meta = readNotesMeta(text);
        if (meta.title === undefined) problem(notesPath, "frontmatter needs a title");
        if (!Array.isArray(fm["authors"])) problem(notesPath, "frontmatter needs authors as a list (it may be empty: authors: [])");
        if (fm["deprecated"] != null && typeof fm["deprecated"] !== "boolean") {
          problem(notesPath, "deprecated must be true or false");
        }
        if (fm["previous_paths"] != null && !Array.isArray(fm["previous_paths"])) {
          problem(notesPath, "previous_paths must be a list");
        }
        meta.previous_paths = meta.previous_paths.map((p) => joinPath(p));
        for (const prev of meta.previous_paths) {
          if (prev === "" || !isScannedPath(prev)) problem(notesPath, `previous path "${prev}" is not a blueprint folder path`);
          else if (prev === folder || folderSet.has(prev)) problem(notesPath, `previous path "${prev}" is a current blueprint folder`);
          else if (claimed.has(prev)) problem(notesPath, `previous path "${prev}" is also claimed by ${claimed.get(prev)}`);
          else claimed.set(prev, folder);
        }
      } catch (e) {
        if (!(e instanceof FrontmatterError)) throw e;
        problem(notesPath, e.message);
      }
    }

    // blueprint.json.
    const bpPath = `${folder}/${BLUEPRINT_FILE}`;
    const bpBlob = files.get(bpPath)!;
    const bpText = content.get(bpBlob)!.toString("utf8");
    let description: ReturnType<typeof describeBlueprint> | undefined;
    let stats: ReturnType<typeof blueprintStats> = {};
    let tree: BookEntry[] = [];
    if (!isCanonicalJson(bpText)) {
      let parses = true;
      try {
        readCanonicalJson(bpText);
      } catch {
        parses = false;
      }
      problem(bpPath, parses ? "is not in the canonical format (re-import it with the plugin)" : "is not valid JSON");
    } else {
      const value = readCanonicalJson(bpText);
      if (isBlueprintValue(value)) {
        description = describeBlueprint(value);
        // From blueprint.json, never from the note: its copy may be stale.
        stats = blueprintStats(value);
        const book = bookEntries(value);
        tree = book.entries;
        for (const d of book.duplicates) problem(bpPath, `has more than one entry in book slot ${d}`);
      } else problem(bpPath, "is not a blueprint, blueprint book, upgrade planner or deconstruction planner");
    }

    // renders/.
    const renders: CatalogRender[] = [];
    for (const { file, blob } of renderFiles.get(folder) ?? []) {
      const path = `${folder}/renders/${file}`;
      const name = RENDER_FILE.exec(file);
      if (!name) {
        problem(path, "render images must be named <slot path>.jpg, .jpeg, .png or .webp, such as 0.jpg or 3/1.jpg");
        continue;
      }
      const pointer = LFS_POINTER.exec(content.get(blob)!.toString("latin1"));
      if (!pointer) {
        problem(path, "is not a Git LFS pointer (commit it with git-lfs installed)");
        continue;
      }
      if (renders.some((r) => slotOf(r.file) === name[1])) {
        problem(path, `there is more than one render for slot ${name[1]}`);
        continue;
      }
      renders.push({ file, oid: pointer[1]!, size: Number(pointer[2]) });
    }
    renders.sort((a, b) => compareSlotPaths(slotOf(a.file), slotOf(b.file)));

    if (problems.length > before || !meta || !description) continue;

    // History: commits that changed blueprint.json here or at a previous path.
    const paths = [folder, ...meta.previous_paths];
    const candidates = git.log(commit, paths.map((p) => `${p}/${BLUEPRINT_FILE}`));
    const ids = git.blobIds(candidates.flatMap((c) => paths.map((p) => `${c.sha}:${p}/${BLUEPRINT_FILE}`)));
    const history: CatalogVersion[] = [];
    candidates.forEach((c, i) => {
      // A commit that only deleted the file at an old path has no version.
      const id = ids.slice(i * paths.length, (i + 1) * paths.length).find((x) => x !== undefined);
      if (id === undefined) return;
      history.push({ ...c, entries: true });
      blobs.set(stringKey(folder, c.sha), id);
    });
    const current = history.find((h) => blobs.get(stringKey(folder, h.sha)) === bpBlob);
    if (!current) {
      problem(bpPath, "has no commit in its history with the current content");
      continue;
    }

    const renderFor = new Map(renders.map((r) => [slotOf(r.file), r.file]));
    const nodes = toNodes(tree, renderFor);
    const cover = description.kind === "blueprint" ? renderFor.get("0") : firstRender(nodes);
    const { title, authors, deprecated, previous_paths, ...optional } = meta;
    entries.push({
      path: folder,
      title: title!,
      authors,
      ...optional,
      deprecated,
      previous_paths,
      ...stats,
      blueprint: description,
      commit: current.sha,
      history,
      renders,
      ...(nodes.length > 0 ? { nodes } : {}),
      ...(cover !== undefined ? { cover } : {}),
    });
  }

  return {
    index: {
      schema: 2,
      generatedAt: (opts.now ?? new Date()).toISOString(),
      commit,
      blueprints: entries,
    },
    problems,
    invalid: [...new Set(problems.map((p) => p.folder))].sort(),
    blobs,
  };
}

/**
 * Keep the live entry of each invalid blueprint, marked stale, so its links
 * go on serving the last valid version (its strings are already published).
 * A blueprint whose folder is gone is not invalid, so it is dropped.
 * Returns the paths carried over.
 */
export function carryOverStale(catalog: Catalog, published: LiveIndex | undefined): string[] {
  const invalid = new Set(catalog.invalid);
  const carried = (published?.blueprints ?? [])
    .filter((e) => invalid.has(e.path))
    // A schema 1 entry's renders also carry a number "n"; the file is what links use.
    .map((e): CatalogEntry => ({ ...e, renders: e.renders.map(({ file, oid, size }) => ({ file, oid, size })), stale: true }));
  const list = catalog.index.blueprints;
  list.push(...carried);
  list.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return carried.map((e) => e.path);
}

// ---------------------------------------------------------------------------
// book entries

export interface BookEntry {
  slot: number;
  /** Slot path from the root, e.g. "3/1". */
  path: string;
  kind: BlueprintKind;
  label: string;
  /** The entry as the game exports it on its own: {"blueprint": …}, {"blueprint_book": …}, … */
  value: Record<string, unknown>;
  children?: BookEntry[];
}

const ITEM_KEYS = ["blueprint", "blueprint_book", "upgrade_planner", "deconstruction_planner"] as const;

/**
 * The entries of a blueprint book value, by slot ascending, nested like the
 * book (none for anything else). An entry's slot is its `index`, or its
 * position in `blueprints` without one. When several entries share a slot,
 * the first in the array keeps it and the later ones are left out (no
 * string, no node, no render), the rule the render tool follows too; their
 * slot paths are listed in `duplicates`. The current version of a folder
 * with duplicates fails validation; older versions are published with the
 * first entry winning.
 */
export function bookEntries(value: unknown): { entries: BookEntry[]; duplicates: string[] } {
  const duplicates: string[] = [];
  const walk = (book: unknown, prefix: string): BookEntry[] => {
    const list = isObject(book) && Array.isArray(book["blueprints"]) ? (book["blueprints"] as unknown[]) : [];
    const out: BookEntry[] = [];
    list.forEach((child, i) => {
      if (!isObject(child)) return;
      const key = ITEM_KEYS.find((k) => isObject(child[k]));
      if (key === undefined) return;
      const index = child["index"];
      const slot = typeof index === "number" && Number.isSafeInteger(index) && index >= 0 ? index : i;
      const path = prefix === "" ? String(slot) : `${prefix}/${slot}`;
      if (out.some((e) => e.slot === slot)) {
        duplicates.push(path);
        return;
      }
      const entryValue = { [key]: child[key] };
      const d = describeBlueprint(entryValue);
      const entry: BookEntry = { slot, path, kind: d.kind, label: plainLabel(d.label ?? ""), value: entryValue };
      if (key === "blueprint_book") entry.children = walk(child[key], path);
      out.push(entry);
    });
    return out.sort((a, b) => a.slot - b.slot);
  };
  const entries = isObject(value) && isObject(value["blueprint_book"]) ? walk(value["blueprint_book"], "") : [];
  return { entries, duplicates };
}

function* flatten(entries: BookEntry[]): Generator<BookEntry> {
  for (const e of entries) {
    yield e;
    if (e.children) yield* flatten(e.children);
  }
}

function toNodes(entries: BookEntry[], renderFor: Map<string, string>): CatalogNode[] {
  return entries.map((e) => {
    const node: CatalogNode = { slot: e.slot, path: e.path, kind: e.kind, label: e.label };
    const render = e.kind === "blueprint" ? renderFor.get(e.path) : undefined;
    if (render !== undefined) node.render = render;
    if (e.children) node.children = toNodes(e.children, renderFor);
    return node;
  });
}

/** The first blueprint with an image, depth first, slots ascending. */
function firstRender(nodes: CatalogNode[]): string | undefined {
  for (const n of nodes) {
    const found = n.render ?? (n.children ? firstRender(n.children) : undefined);
    if (found !== undefined) return found;
  }
  return undefined;
}

function slotOf(renderFile: string): string {
  return renderFile.slice(0, renderFile.lastIndexOf("."));
}

function compareSlotPaths(a: string, b: string): number {
  const x = a.split("/").map(Number);
  const y = b.split("/").map(Number);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return x.length - y.length;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// strings

/**
 * The strings to produce, diffed against `published` (the live index):
 * - a version's root string, unless the live index lists that version
 *   under the same path;
 * - its book entry strings, unless the live index lists that version under
 *   the same path with `entries: true`. A schema 1 live index has no such
 *   flag, so the first schema 2 publish produces every entry string once.
 * Without a live index, everything. Diffing against what is live, rather
 * than the pushed commit range, also covers pushes whose runs were skipped
 * or failed, and renames (old versions are needed again under the new path).
 */
export function selectStrings(index: CatalogIndex, published?: LiveIndex): StringJob[] {
  const roots = new Set<string>();
  const entries = new Set<string>();
  for (const e of published?.blueprints ?? []) {
    for (const h of e.history) {
      roots.add(stringKey(e.path, h.sha));
      if (published!.schema >= 2 && h.entries === true) entries.add(stringKey(e.path, h.sha));
    }
  }
  const jobs: StringJob[] = [];
  for (const e of index.blueprints) {
    for (const h of e.history) {
      const key = stringKey(e.path, h.sha);
      const job = { path: e.path, sha: h.sha, key, root: !roots.has(key), entries: !entries.has(key) };
      if (job.root || job.entries) jobs.push(job);
    }
  }
  return jobs;
}

/**
 * Encode the strings for each job and hand them to `emit`: the root string
 * and, for a book, one per entry at every depth, each the entry alone in
 * the shape the game exports it. Every entry string is decoded again and
 * checked against its sub-tree. A version whose blueprint.json was not a
 * valid blueprint at that commit gets no strings; it is removed from the
 * index's history and reported.
 */
export function produceStrings(
  repo: string,
  catalog: Catalog,
  jobs: StringJob[],
  emit: (key: string, text: string) => void,
): { warnings: string[]; roots: number; entries: number } {
  const git = new Git(repo);
  const warnings: string[] = [];
  let roots = 0;
  let entries = 0;
  const BATCH = 16;
  for (let i = 0; i < jobs.length; i += BATCH) {
    const batch = jobs.slice(i, i + BATCH);
    const data = git.readBlobs(batch.map((j) => catalog.blobs.get(j.key)!));
    for (const job of batch) {
      let value: unknown;
      try {
        value = readCanonicalJson(data.get(catalog.blobs.get(job.key)!)!.toString("utf8"));
      } catch {
        value = undefined;
      }
      if (!isBlueprintValue(value)) {
        warnings.push(`${job.path}@${job.sha}: blueprint.json was not a valid blueprint at that commit; left out of the history`);
        const entry = catalog.index.blueprints.find((e) => e.path === job.path)!;
        entry.history = entry.history.filter((h) => h.sha !== job.sha);
        continue;
      }
      if (job.root) {
        emit(job.key, encodeBlueprintString(value));
        roots++;
      }
      if (job.entries) {
        const book = bookEntries(value);
        for (const d of book.duplicates) warnings.push(`${job.path}@${job.sha}: a second entry in slot ${d} has no link`);
        for (const e of flatten(book.entries)) {
          const text = encodeBlueprintString(e.value);
          if (JSON.stringify(decodeBlueprintString(text).value) !== JSON.stringify(e.value)) {
            throw new Error(`${job.path}@${job.sha} slot ${e.path}: the string does not decode to the entry`);
          }
          emit(entryKey(job.path, job.sha, e.path), text);
          entries++;
        }
      }
    }
  }
  return { warnings, roots, entries };
}
