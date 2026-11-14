// Build and validate the catalog index from one commit's files (the
// checked-out tree) and the blueprints' version ledgers (versions.json), and
// produce the blueprint strings it points at. Reads that commit's git
// objects, not the files on disk, so render images are seen as their LFS
// pointers and nothing is downloaded. It never walks the git history: the
// versions are what the ledgers record (see the core's versions.ts). The
// CLI is catalog.ts.

import { execFileSync } from "node:child_process";

import {
  assembleBook,
  baseName,
  BLUEPRINT_FILE,
  type BlueprintKind,
  BOOK_FILE,
  contentHash,
  decideVersion,
  decodeBlueprintString,
  describeBlueprint,
  encodeBlueprintString,
  type FolderReader,
  type BlueprintStatus,
  FrontmatterError,
  isBlueprintStatus,
  isBlueprintValue,
  isCanonicalJson,
  isScannedPath,
  joinPath,
  NOTES_FILE,
  parentFolder,
  parseRenderManifest,
  parseSlotFolder,
  plainLabel,
  readCanonicalJson,
  readFrontmatter,
  readNotesMeta,
  readVersions,
  RENDER_MANIFEST,
  selfAndAncestors,
  slotFolders,
  slugify,
  versionHeldMessage,
  versionLabelProblem,
  VERSIONS_FILE,
  VersionsError,
  type VersionEntry,
} from "../plugin/src/core/index.ts";
import type { CatalogEntry, CatalogIndex, CatalogNode, CatalogRender, CatalogVersion } from "./catalog-index.ts";

/**
 * A live index as read back from R2: this schema or an earlier one (schema
 * 2 versions have no label or hash; older entries have no status).
 */
export type LiveIndex = Omit<CatalogIndex, "schema" | "blueprints"> & {
  schema: 1 | 2 | 3;
  blueprints: (Omit<CatalogEntry, "status" | "history"> & {
    status?: CatalogEntry["status"];
    history: (Omit<CatalogVersion, "label" | "hash"> & Partial<Pick<CatalogVersion, "label" | "hash">>)[];
  })[];
};

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
  /**
   * Published blueprints whose current content is not a recorded version
   * (changed without a new `version`, or not recorded in versions.json yet).
   * Not problems: they are left out of the index, and carryOver keeps their
   * live entry, so the last recorded version stays live. Sorted by folder.
   */
  held: Problem[];
  /**
   * Published blueprints whose note relabels the current version but whose
   * ledger does not record that yet: served under the ledger's label, and
   * reported, until the plugin records the rename ("Publish version").
   */
  renames: Problem[];
  /** blueprint.json blob id of the current version of each single-file entry, keyed by stringKey. */
  blobs: Map<string, string>;
  /** For the current version of a root book: its folder, whose assembled tree is the value, keyed by stringKey. */
  trees: Map<string, string>;
  /**
   * Blueprint folders whose note says draft (or an unknown status), sorted,
   * each with its previous paths. They are validated but not built: one
   * that was published before keeps its live entry (see carryOver).
   */
  drafts: { folder: string; paths: string[] }[];
}

export interface StringJob {
  path: string;
  /** The version's commit (CatalogVersion.sha). */
  sha: string;
  label: string;
  /** stringKey(path, sha), also the key of the version's blob in Catalog.blobs. */
  key: string;
  /** Produce the root string. */
  root: boolean;
  /** Produce the string of every book entry. */
  entries: boolean;
}

/** R2 key of the blueprint string of `path` at the version whose commit is `sha`. */
export function stringKey(path: string, sha: string): string {
  return `strings/${path}/${sha}.txt`;
}

/** R2 key of the string of the book entry at `slotPath` ("3/1") of `path` at the version whose commit is `sha`. */
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

  /** Every blob in the commit's tree (or under `folder` in it): path -> blob id. */
  tree(commit: string, folder?: string): Map<string, string> {
    const out = new Map<string, string>();
    const args = ["ls-tree", "-r", "-z", "--full-tree", commit, ...(folder === undefined ? [] : ["--", folder])];
    for (const rec of this.run(args).toString().split("\0")) {
      const m = /^\d+ blob ([0-9a-f]+)\t(.*)$/s.exec(rec);
      if (m) out.set(m[2]!, m[1]!);
    }
    return out;
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
}

// ---------------------------------------------------------------------------
// index

/**
 * Validate every blueprint folder and root book at `commit` (the checked-out
 * tree) and build the index from those files and their ledgers.
 */
export async function buildCatalog(repo: string, opts: { commit?: string; now?: Date } = {}): Promise<Catalog> {
  const git = new Git(repo);
  const commit = git.resolve(opts.commit ?? "HEAD");
  const blobs = new Map<string, string>();
  const trees = new Map<string, string>();
  const { entries, problems, held, renames, drafts } = await buildAt(git, commit, blobs, trees);
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    index: {
      schema: 3,
      generatedAt: (opts.now ?? new Date()).toISOString(),
      commit,
      blueprints: entries,
    },
    problems,
    invalid: [...new Set(problems.map((p) => p.folder))].sort(),
    held: held.sort((a, b) => (a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0)),
    renames: renames.sort((a, b) => (a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0)),
    blobs,
    trees,
    drafts: drafts.sort((a, b) => (a.folder < b.folder ? -1 : 1)),
  };
}

/**
 * Validate the blueprint folders and root books at `commit` and build the
 * entries of those whose note publishes them and whose content is a
 * recorded version; the others are listed as drafts or held.
 */
async function buildAt(
  git: Git,
  commit: string,
  blobs: Map<string, string>,
  trees: Map<string, string>,
): Promise<{ entries: CatalogEntry[]; problems: Problem[]; held: Problem[]; renames: Problem[]; drafts: Catalog["drafts"] }> {
  const files = git.tree(commit);
  const problems: Problem[] = [];
  const held: Problem[] = [];
  const renames: Problem[] = [];
  const drafts: Catalog["drafts"] = [];
  const foldersWith = (name: string) =>
    new Set([...files.keys()].filter((p) => p.endsWith("/" + name) && isScannedPath(p)).map(parentFolder));
  const blueprintFolders = foldersWith(BLUEPRINT_FILE);
  const books = foldersWith(BOOK_FILE);
  /** The outermost expanded book that `f` is inside of, if any. */
  const rootBookOf = (f: string) => selfAndAncestors(parentFolder(f)).reverse().find((a) => books.has(a));

  // Catalog entries: blueprint folders and root books. Folders inside an
  // expanded book are part of its root book's entry.
  const folders = [...new Set([...blueprintFolders, ...books])].filter((f) => rootBookOf(f) === undefined).sort();
  const folderSet = new Set(folders);

  // Render images belong to the blueprint folder that holds their renders/
  // directory. Only the image types the LFS patterns track are renders;
  // the render tool's render.json only lends them their pixel size, and
  // anything else there is ignored.
  const renderFiles = new Map<string, { file: string; blob: string }[]>();
  /** Folders with a renders/ directory. */
  const renderDirs = new Set<string>();
  for (const [path, blob] of files) {
    if (!isScannedPath(path)) continue;
    const segs = path.split("/");
    segs.forEach((s, i) => s === "renders" && i > 0 && i < segs.length - 1 && renderDirs.add(segs.slice(0, i).join("/")));
    if (!RENDER_IMAGE.test(path)) continue;
    for (let i = segs.length - 2; i >= 1; i--) {
      const folder = segs.slice(0, i).join("/");
      if (segs[i] === "renders" && blueprintFolders.has(folder)) {
        const list = renderFiles.get(folder) ?? [];
        list.push({ file: segs.slice(i + 1).join("/"), blob });
        renderFiles.set(folder, list);
        break;
      }
    }
  }

  const wanted: string[] = [];
  for (const f of new Set([...blueprintFolders, ...books])) {
    for (const name of [BLUEPRINT_FILE, BOOK_FILE, NOTES_FILE, VERSIONS_FILE]) {
      const id = files.get(`${f}/${name}`);
      if (id) wanted.push(id);
    }
    for (const r of renderFiles.get(f) ?? []) wanted.push(r.blob);
    const manifest = files.get(`${f}/renders/${RENDER_MANIFEST}`);
    if (manifest && renderFiles.has(f)) wanted.push(manifest);
  }
  const content = git.readBlobs(wanted);
  const text = (path: string) => {
    const id = files.get(path);
    return id === undefined ? undefined : content.get(id)!.toString("utf8");
  };

  // Previous paths: each may be claimed once and must not be a current folder.
  const claimed = new Map<string, string>();
  const entries: CatalogEntry[] = [];

  for (const folder of folders) {
    const before = problems.length;
    const problem = (path: string, message: string) => problems.push({ folder, path, message });
    const isBook = books.has(folder);
    /** The folders inside this root book that hold blueprint.json or book.json. */
    const inner = isBook
      ? [...new Set([...blueprintFolders, ...books])].filter((f) => f.startsWith(folder + "/")).sort()
      : [];

    // Everything after a blueprint folder's path is a slot path, so folders cannot nest.
    const nestedIn = new Set<string>();
    for (const f of [folder, ...inner]) {
      const outer = [...blueprintFolders].find((b) => f.startsWith(b + "/"));
      if (!outer) continue;
      nestedIn.add(f);
      problem(f, `is inside the blueprint folder ${outer}; a blueprint folder cannot contain another blueprint folder or expanded book`);
    }

    // README.md frontmatter (title and authors also for every folder inside a root book).
    const readNotes = (f: string) => {
      const notesPath = `${f}/${NOTES_FILE}`;
      const notesText = text(notesPath);
      if (notesText === undefined) {
        problem(f, `has no ${NOTES_FILE}`);
        return undefined;
      }
      try {
        const fm = readFrontmatter(notesText);
        const meta = readNotesMeta(notesText);
        if (meta.title === undefined) problem(notesPath, "frontmatter needs a title");
        if (!Array.isArray(fm["authors"])) problem(notesPath, "frontmatter needs authors as a list (it may be empty: authors: [])");
        if (f !== folder) {
          if ("status" in fm) problem(notesPath, `only the book's own note (${folder}/${NOTES_FILE}) has a status; remove it here`);
        } else if (fm["status"] != null && !isBlueprintStatus(fm["status"])) {
          problem(notesPath, "status must be draft, public, deprecated or unlisted (none means draft)");
        }
        if ("deprecated" in fm) problem(notesPath, "deprecated is replaced by status: write status: deprecated (or public) and remove deprecated");
        if (fm["previous_paths"] != null && !Array.isArray(fm["previous_paths"])) {
          problem(notesPath, "previous_paths must be a list");
        }
        return { fm, meta, notesPath };
      } catch (e) {
        if (!(e instanceof FrontmatterError)) throw e;
        problem(notesPath, e.message);
        return undefined;
      }
    };
    const notes = readNotes(folder);
    const meta = notes?.meta;
    // Unreadable notes count as a draft (it may have been published before).
    const status = notes ? noteStatus(notes.fm) : "draft";
    const published = status !== undefined && status !== "draft";
    if (!published) drafts.push({ folder, paths: [folder, ...(meta?.previous_paths.map((p) => joinPath(p)) ?? [])] });
    // The version: a published blueprint needs a label, and its ledger must be readable.
    let ledger: VersionEntry[] = [];
    const versionsPath = `${folder}/${VERSIONS_FILE}`;
    const ledgerText = text(versionsPath);
    if (ledgerText !== undefined) {
      try {
        ledger = readVersions(ledgerText);
      } catch (e) {
        if (!(e instanceof VersionsError)) throw e;
        problem(versionsPath, e.message);
      }
    }
    if (notes && meta) {
      if (meta.version === undefined) {
        if (published) problem(notes.notesPath, 'frontmatter needs a version to be published: a label such as "1.0"');
      } else {
        const bad = versionLabelProblem(meta.version);
        if (bad) problem(notes.notesPath, `version ${bad}; it is used in links as <path>@<version>.txt`);
      }
    }
    if (notes && meta) {
      meta.previous_paths = meta.previous_paths.map((p) => joinPath(p));
      for (const prev of meta.previous_paths) {
        if (prev === "" || !isScannedPath(prev)) problem(notes.notesPath, `previous path "${prev}" is not a blueprint folder path`);
        else if (prev === folder || folderSet.has(prev)) problem(notes.notesPath, `previous path "${prev}" is a current blueprint folder`);
        else if (claimed.has(prev)) problem(notes.notesPath, `previous path "${prev}" is also claimed by ${claimed.get(prev)}`);
        else claimed.set(prev, folder);
      }
    }
    for (const f of inner) readNotes(f);

    // blueprint.json, or book.json and the tree under it.
    const readJson = (path: string): unknown => {
      const t = text(path)!;
      if (isCanonicalJson(t)) return readCanonicalJson(t);
      let parses = true;
      try {
        readCanonicalJson(t);
      } catch {
        parses = false;
      }
      problem(path, parses ? "is not in the canonical format (re-import it with the plugin)" : "is not valid JSON");
      return undefined;
    };
    let description: ReturnType<typeof describeBlueprint> | undefined;
    let tree: BookEntry[] = [];
    let value: unknown;
    const bpPath = `${folder}/${BLUEPRINT_FILE}`;
    const folderFor = new Map<string, string>();
    if (!isBook) {
      const json = readJson(bpPath);
      if (json !== undefined) {
        if (isBlueprintValue(json)) value = json;
        else problem(bpPath, "is not a blueprint, blueprint book, upgrade planner or deconstruction planner");
      }
    } else {
      const reported = new Set<string>();
      for (const f of [folder, ...inner]) {
        if (blueprintFolders.has(f) && books.has(f)) {
          problem(f, `has both ${BOOK_FILE} and ${BLUEPRINT_FILE}; keep ${BLUEPRINT_FILE} for one string or ${BOOK_FILE} for a book stored as folders`);
          continue;
        }
        if (books.has(f) && renderDirs.has(f)) {
          problem(`${f}/renders`, "an expanded book has no renders of its own; images live in renders/ of its blueprint folders");
        }
        const json = readJson(`${f}/${books.has(f) ? BOOK_FILE : BLUEPRINT_FILE}`);
        if (json === undefined) continue;
        if (!books.has(f)) {
          if (!isBlueprintValue(json)) problem(`${f}/${BLUEPRINT_FILE}`, "is not a blueprint, blueprint book, upgrade planner or deconstruction planner");
        } else if (!isObject(json) || !isObject(json["blueprint_book"])) {
          problem(`${f}/${BOOK_FILE}`, "must hold a blueprint_book object");
        } else if ("blueprints" in json["blueprint_book"]) {
          problem(`${f}/${BOOK_FILE}`, "must not list the book's entries: each entry is a slot folder next to it");
        }
        if (f === folder || nestedIn.has(f)) continue;
        // Inside an expanded book, every folder that holds blueprints is a slot folder of a book.
        const owner = selfAndAncestors(parentFolder(f)).find((a) => books.has(a))!;
        const child = joinPath(owner, f.slice(owner.length + 1).split("/")[0]!);
        if (child !== f) {
          if (reported.has(child)) continue;
          reported.add(child);
          problem(
            child,
            `holds blueprints inside the expanded book ${owner}, so it must be a slot folder with ${BOOK_FILE} or ${BLUEPRINT_FILE}; move what is inside up or into a slot folder`,
          );
        } else if (parseSlotFolder(baseName(f)) === undefined) {
          problem(f, `is in the expanded book ${owner} but is not named by slot: rename it <slot> or <slot>-<name>, such as 0 or 0-${slugify(baseName(f)) || "name"}`);
        }
      }
      if (problems.length === before) {
        const reader = treeReader(files, text);
        try {
          value = await assembleBook(folder, reader);
          await walkSlots(folder, "", reader, books, folderFor);
        } catch (e) {
          problem(folder, (e as Error).message);
        }
      }
    }
    if (value !== undefined) {
      description = describeBlueprint(value);
      const book = bookEntries(value);
      tree = book.entries;
      for (const d of book.duplicates) problem(isBook ? folder : bpPath, `has more than one entry in book slot ${d}`);
    }

    // renders/: a blueprint folder's own, or each leaf's of a root book, as <slot path>.<ext>.
    const renders: CatalogRender[] = [];
    const kindAt = new Map([...flatten(tree)].map((e) => [e.path, e.kind]));
    const sources: [string, string | undefined][] = isBook
      ? [...folderFor].filter(([, f]) => blueprintFolders.has(f)).map(([slotPath, f]) => [f, slotPath])
      : [[folder, undefined]];
    for (const [owner, slotPath] of sources) {
      const sizes = renderSizes(renderFiles.has(owner) ? text(`${owner}/renders/${RENDER_MANIFEST}`) : undefined);
      for (const { file, blob } of renderFiles.get(owner) ?? []) {
        const path = `${owner}/renders/${file}`;
        const name = RENDER_FILE.exec(file);
        if (!name) {
          problem(path, "render images must be named <slot path>.jpg, .jpeg, .png or .webp, such as 0.jpg or 3/1.jpg");
          continue;
        }
        let slot = name[1]!;
        if (slotPath !== undefined) {
          if (kindAt.get(slotPath) === "blueprint-book") slot = `${slotPath}/${slot}`;
          else if (slot === "0") slot = slotPath;
          else {
            problem(path, "a blueprint in an expanded book has one image, renders/0.jpg (or .jpeg, .png, .webp)");
            continue;
          }
        }
        const pointer = LFS_POINTER.exec(content.get(blob)!.toString("latin1"));
        if (!pointer) {
          problem(path, "is not a Git LFS pointer (commit it with git-lfs installed)");
          continue;
        }
        if (renders.some((r) => slotOf(r.file) === slot)) {
          problem(path, `there is more than one render for slot ${slot}`);
          continue;
        }
        renders.push({ file: `${slot}.${name[2]}`, oid: pointer[1]!, size: Number(pointer[2]), ...sizes.get(file) });
      }
    }
    renders.sort((a, b) => compareSlotPaths(slotOf(a.file), slotOf(b.file)));

    if (problems.length > before || !meta || !description || !published) continue;

    // The version: the current content must be the ledger's latest; anything
    // else keeps the last recorded version live (carryOver) and is
    // reported, not failed. CI never writes the ledger: a new label for the
    // same content is a rename the plugin has not recorded yet, so the
    // ledger's label is served until it does.
    const hash = contentHash(value);
    const label = meta.version!;
    const decision = decideVersion(ledger, hash, label);
    if (decision.kind !== "current" && decision.kind !== "rename") {
      const message =
        versionHeldMessage(decision) ??
        (decision.latest
          ? `content changed and version "${label}" is not recorded in ${VERSIONS_FILE} yet (the plugin records it when it publishes: run "Publish version"); version "${decision.latest.label}" stays live`
          : `version "${label}" is not recorded in ${VERSIONS_FILE} yet (the plugin records it when it publishes: run "Publish version"); nothing is live yet`);
      held.push({ folder, path: decision.kind === "new" ? versionsPath : notes!.notesPath, message });
      continue;
    }
    if (decision.kind === "rename") {
      renames.push({
        folder,
        path: notes!.notesPath,
        message: `the note renames version "${decision.latest.label}" to "${label}", which ${VERSIONS_FILE} does not record yet (run "Publish version" in the plugin); it stays "${decision.latest.label}" until then`,
      });
    }
    const history: CatalogVersion[] = [...ledger]
      .reverse()
      .map((v) => ({ label: v.label, hash: v.hash, sha: v.commit, date: v.date, subject: v.label, entries: true }));
    const current = history[0]!;
    const key = stringKey(folder, current.sha);
    if (isBook) trees.set(key, folder);
    else blobs.set(key, files.get(bpPath)!);

    const renderFor = new Map(renders.map((r) => [slotOf(r.file), r.file]));
    const nodes = toNodes(tree, renderFor, folderFor);
    const cover = description.kind === "blueprint" ? renderFor.get("0") : firstRender(nodes);
    const { title, authors, status: _, previous_paths, ...optional } = meta;
    entries.push({
      path: folder,
      title: title!,
      authors,
      ...optional,
      version: current.label,
      status,
      deprecated: status === "deprecated",
      previous_paths,
      blueprint: description,
      commit: current.sha,
      history,
      renders,
      ...(nodes.length > 0 ? { nodes } : {}),
      ...(cover !== undefined ? { cover } : {}),
    });
  }

  return { entries, problems, held, renames, drafts };
}

/** A note's status, from its frontmatter: none means draft; undefined for a value that is not a status. */
export function noteStatus(fm: Record<string, unknown>): BlueprintStatus | undefined {
  const s = fm["status"];
  if (s != null) return isBlueprintStatus(s) ? s : undefined;
  return "draft";
}

/** book.json and blueprint.json: the files an expanded book is assembled from. */
const TREE_FILE = /\/(book|blueprint)\.json$/;

/** A FolderReader over a git tree listing (path -> blob id) and a way to read a path's text. */
function treeReader(files: Map<string, string>, text: (path: string) => string | undefined): FolderReader {
  return {
    async folders(folder) {
      const names = new Set<string>();
      for (const path of files.keys()) {
        if (!path.startsWith(folder + "/")) continue;
        const rest = path.slice(folder.length + 1).split("/");
        if (rest.length > 1) names.add(rest[0]!);
      }
      return [...names];
    },
    async read(path) {
      return text(path);
    },
  };
}

/** Record the folder of every entry under an expanded book, by slot path. */
async function walkSlots(folder: string, prefix: string, reader: FolderReader, books: Set<string>, out: Map<string, string>) {
  for (const s of await slotFolders(folder, reader)) {
    const slotPath = prefix === "" ? String(s.slot) : `${prefix}/${s.slot}`;
    out.set(slotPath, s.path);
    if (books.has(s.path)) await walkSlots(s.path, slotPath, reader, books, out);
  }
}

/** The assembled value of the expanded book at `folder` as of `commit`. */
async function assembleAt(git: Git, commit: string, folder: string): Promise<unknown> {
  const files = git.tree(commit, folder);
  const json = [...files].filter(([p]) => TREE_FILE.test(p));
  const data = git.readBlobs(json.map(([, id]) => id));
  const text = (path: string) => {
    const id = files.get(path);
    return id === undefined ? undefined : data.get(id)?.toString("utf8");
  };
  return assembleBook(folder, treeReader(files, text));
}

/**
 * Keep the live entry of the blueprints the index leaves out but whose links
 * must go on serving their last recorded version (its strings are already
 * published):
 * - an invalid blueprint, and a held one (its content is not a recorded
 *   version), marked stale;
 * - a draft that was published before, as it was (at its folder or a
 *   previous path), unless that path is in the index.
 * A blueprint whose folder is gone is in none of these lists, so it is
 * dropped. Returns the paths carried over of each kind.
 */
export function carryOver(catalog: Catalog, published: LiveIndex | undefined): { stale: string[]; frozen: string[] } {
  const draftOf = new Map<string, string>();
  for (const d of catalog.drafts) for (const p of d.paths) if (!draftOf.has(p)) draftOf.set(p, d.folder);
  const has = new Set(catalog.index.blueprints.map((e) => e.path));
  const stale = new Set([...catalog.invalid, ...catalog.held.map((h) => h.folder)].filter((f) => !draftOf.has(f) && !has.has(f)));
  const out = { stale: [] as string[], frozen: [] as string[] };
  for (const { status, ...e } of published?.blueprints ?? []) {
    if (has.has(e.path)) continue;
    const isStale = stale.has(e.path);
    if (!isStale && !draftOf.has(e.path)) continue;
    // A schema 1 entry's renders also carry a number "n"; the file is what links use.
    // An entry from before status gets the one its deprecated flag means. One from
    // before schema 3 has versions without label and hash until it is built again.
    const s = status ?? (e.deprecated ? "deprecated" : "public");
    const entry: CatalogEntry = {
      ...e,
      history: e.history as CatalogVersion[],
      status: s,
      deprecated: s === "deprecated",
      renders: e.renders.map(liveRender),
      ...(isStale ? { stale: true as const } : {}),
    };
    catalog.index.blueprints.push(entry);
    has.add(e.path);
    (isStale ? out.stale : out.frozen).push(e.path);
  }
  catalog.index.blueprints.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}

/** A live render as this schema has it: without schema 1's "n", with a pixel size only when it has both numbers. */
function liveRender({ file, oid, size, width, height }: CatalogRender): CatalogRender {
  return { file, oid, size, ...(width !== undefined && height !== undefined ? { width, height } : {}) };
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

function toNodes(entries: BookEntry[], renderFor: Map<string, string>, folderFor: Map<string, string>): CatalogNode[] {
  return entries.map((e) => {
    const node: CatalogNode = { slot: e.slot, path: e.path, kind: e.kind, label: e.label };
    const render = e.kind === "blueprint" ? renderFor.get(e.path) : undefined;
    if (render !== undefined) node.render = render;
    const folder = folderFor.get(e.path);
    if (folder !== undefined) node.folder = folder;
    if (e.children) node.children = toNodes(e.children, renderFor, folderFor);
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

/**
 * Pixel sizes from a renders/render.json, by image file name under that
 * renders/: only entries naming one file with positive integer width and
 * height. A missing or unreadable manifest gives none; it is not a problem.
 */
function renderSizes(manifestText: string | undefined): Map<string, { width: number; height: number }> {
  const out = new Map<string, { width: number; height: number }>();
  const ambiguous = new Set<string>();
  for (const { file, width, height } of Object.values(parseRenderManifest(manifestText)?.entries ?? {})) {
    if (!isPixels(width) || !isPixels(height)) continue;
    const seen = out.get(file);
    if (seen && (seen.width !== width || seen.height !== height)) ambiguous.add(file);
    out.set(file, { width, height });
  }
  for (const f of ambiguous) out.delete(f);
  return out;
}

function isPixels(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
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
 * The strings to publish, diffed against `published` (the live index):
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
      const job = { path: e.path, sha: h.sha, label: h.label, key, root: !roots.has(key), entries: !entries.has(key) };
      if (job.root || job.entries) jobs.push(job);
    }
  }
  return jobs;
}

/**
 * Encode the strings for each job and hand them to `emit`: the root string
 * and, for a book, one per entry at every depth, each the entry alone in
 * the shape the game exports it. Every entry string is decoded again and
 * checked against its sub-tree. Only a current version can be encoded (from
 * the tree built); an older one is published when it is current, so a job
 * for one means its strings were never published (or the live index could
 * not be read): it is reported and stays listed.
 */
export async function produceStrings(
  repo: string,
  catalog: Catalog,
  jobs: StringJob[],
  emit: (key: string, text: string) => void,
): Promise<{ warnings: string[]; roots: number; entries: number }> {
  const git = new Git(repo);
  const warnings: string[] = [];
  let roots = 0;
  let entries = 0;
  const BATCH = 16;
  for (let i = 0; i < jobs.length; i += BATCH) {
    const batch = jobs.slice(i, i + BATCH);
    const data = git.readBlobs(batch.flatMap((j) => catalog.blobs.get(j.key) ?? []));
    for (const job of batch) {
      const tree = catalog.trees.get(job.key);
      const blob = catalog.blobs.get(job.key);
      if (tree === undefined && blob === undefined) {
        warnings.push(
          `${job.path}@${job.label}: not in the live index, and only the current version's strings can be made (from the files); this older version's links answer 503 until its strings are uploaded`,
        );
        continue;
      }
      const value = tree === undefined ? readCanonicalJson(data.get(blob!)!.toString("utf8")) : await assembleAt(git, catalog.index.commit, tree);
      if (!isBlueprintValue(value)) throw new Error(`${job.path}: the current version is not a blueprint value`);
      if (job.root) {
        emit(job.key, encodeBlueprintString(value));
        roots++;
      }
      if (job.entries) {
        const book = bookEntries(value);
        for (const d of book.duplicates) warnings.push(`${job.path}@${job.label}: a second entry in slot ${d} has no link`);
        for (const e of flatten(book.entries)) {
          const text = encodeBlueprintString(e.value);
          if (JSON.stringify(decodeBlueprintString(text).value) !== JSON.stringify(e.value)) {
            throw new Error(`${job.path}@${job.label} slot ${e.path}: the string does not decode to the entry`);
          }
          emit(entryKey(job.path, job.sha, e.path), text);
          entries++;
        }
      }
    }
  }
  return { warnings, roots, entries };
}
