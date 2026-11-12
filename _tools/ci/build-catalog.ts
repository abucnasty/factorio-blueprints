// Build and validate the catalog index from a git commit, and produce the
// blueprint strings it points at. Reads only git objects (never the working
// tree), so render images are seen as their LFS pointers and nothing is
// downloaded. The CLI is catalog.ts.

import { execFileSync } from "node:child_process";

import {
  assembleBook,
  baseName,
  BLUEPRINT_FILE,
  type BlueprintKind,
  BOOK_FILE,
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
  RENDER_MANIFEST,
  selfAndAncestors,
  slotFolders,
  slugify,
} from "../plugin/src/core/index.ts";
import type { CatalogEntry, CatalogIndex, CatalogNode, CatalogRender, CatalogVersion } from "./catalog-index.ts";

/** A live index as read back from R2: this schema or the previous one (whose entries have no status). */
export type LiveIndex = Omit<CatalogIndex, "schema" | "blueprints"> & {
  schema: 1 | 2;
  blueprints: (Omit<CatalogEntry, "status"> & { status?: CatalogEntry["status"] })[];
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
  /** blueprint.json blob id for every (path, sha) in the index whose value is one file, keyed by stringKey. */
  blobs: Map<string, string>;
  /** For the other versions (of root books): the folder at that sha whose assembled tree is the value, keyed by stringKey. */
  trees: Map<string, string>;
  /**
   * Blueprint folders whose note says draft (or an unknown status), sorted.
   * They are validated but never taken from the live index: each is either
   * absent or, if it was published before, its entry as of then.
   */
  drafts: string[];
  /** Those of `drafts` that keep their last published entry (under the path it had then). */
  frozen: string[];
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

  run(args: string[], input?: string, literal = true): Buffer {
    return execFileSync("git", ["-C", this.repo, ...(literal ? ["--literal-pathspecs"] : []), ...args], {
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

  /** The commit's first parent; undefined for a root commit. */
  parent(commit: string): string | undefined {
    try {
      return this.resolve(`${commit}^1`);
    } catch {
      return undefined;
    }
  }

  /**
   * Commits that changed any of the paths, newest first, reachable from
   * `commit`; with `changed`, only those where it accepts a changed file
   * (merges, which list no files, are kept).
   */
  log(commit: string, paths: string[], changed?: (path: string) => boolean): CatalogVersion[] {
    const names = changed ? ["--name-only"] : [];
    const text = this.run(["log", "--format=%x1e%H%x1f%aI%x1f%s", ...names, commit, "--", ...paths]).toString();
    return text
      .split("\x1e")
      .slice(1)
      .filter((rec) => {
        const files = rec.split("\n").slice(1).filter((l) => l !== "");
        return !changed || files.length === 0 || files.some(changed);
      })
      .map((rec) => {
        const [sha, date, subject] = rec.split("\n")[0]!.split("\x1f");
        // git prints a UTC offset as "+00:00" or "Z" depending on its version; keep one form
        return { sha: sha!, date: date!.replace(/\+00:00$/, "Z"), subject: subject ?? "" };
      });
  }
}

// ---------------------------------------------------------------------------
// index

/** Validate every blueprint folder and root book at `commit` and build the index. */
export async function buildCatalog(repo: string, opts: { commit?: string; now?: Date } = {}): Promise<Catalog> {
  const git = new Git(repo);
  const commit = git.resolve(opts.commit ?? "HEAD");
  const ctx: Context = { git, era: statusEra(git, commit), blobs: new Map(), trees: new Map(), statuses: new Map() };
  const head = await buildAt(ctx, commit);
  const { entries, problems } = head;

  // A draft keeps the entry it had when it was last published, built from
  // that commit, so a rebuild from scratch gives the same index.
  const frozen: string[] = [];
  for (const d of head.drafts) {
    const entry = await lastPublished(ctx, commit, d);
    if (!entry) continue;
    if (entries.some((e) => e.path === entry.path) || (entry.path !== d.folder && head.folders.includes(entry.path))) {
      problems.push({
        folder: d.folder,
        path: `${d.folder}/${NOTES_FILE}`,
        message: `its last published version was at ${entry.path}, which is now another blueprint folder, so that version is no longer served`,
      });
      continue;
    }
    entries.push(entry);
    frozen.push(d.folder);
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return {
    index: {
      schema: 2,
      generatedAt: (opts.now ?? new Date()).toISOString(),
      commit,
      blueprints: entries,
    },
    problems,
    invalid: [...new Set(problems.map((p) => p.folder))].sort(),
    blobs: ctx.blobs,
    trees: ctx.trees,
    drafts: head.drafts.map((d) => d.folder).sort(),
    frozen: frozen.sort(),
  };
}

interface Context {
  git: Git;
  /** Commits in the status era (see statusEra). */
  era: Set<string>;
  blobs: Map<string, string>;
  trees: Map<string, string>;
  /** Status of a README.md blob in the status era, by blob id. */
  statuses: Map<string, BlueprintStatus | undefined>;
}

/** A blueprint folder whose note is not published at the commit built. */
interface Draft {
  folder: string;
  /** The folder and its previous paths. */
  paths: string[];
  isBook: boolean;
}

/**
 * Validate the blueprint folders and root books at `commit` (all of them,
 * or the ones in `only`) and build the entries of those whose note
 * publishes them; the others are listed as drafts.
 */
async function buildAt(
  ctx: Context,
  commit: string,
  only?: Set<string>,
): Promise<{ entries: CatalogEntry[]; problems: Problem[]; drafts: Draft[]; folders: string[] }> {
  const { git } = ctx;
  const files = git.tree(commit);
  const problems: Problem[] = [];
  const blobs = ctx.blobs;
  const trees = ctx.trees;
  const inEra = ctx.era.has(commit);
  const drafts: Draft[] = [];
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
  const included = (f: string) => !only || [...only].some((o) => f === o || f.startsWith(o + "/"));
  for (const f of new Set([...blueprintFolders, ...books])) {
    if (!included(f)) continue;
    for (const name of [BLUEPRINT_FILE, BOOK_FILE, NOTES_FILE]) {
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
    if (only && !only.has(folder)) continue;
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
        if (inEra) {
          if ("deprecated" in fm) problem(notesPath, "deprecated is replaced by status: write status: deprecated (or public) and remove deprecated");
        } else if (fm["deprecated"] != null && typeof fm["deprecated"] !== "boolean") {
          problem(notesPath, "deprecated must be true or false");
        }
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
    // Unreadable notes: a draft in the status era (it may have been published
    // before); before it, published as always (and invalid).
    const status = notes ? noteStatus(notes.fm, inEra) : inEra ? "draft" : "public";
    const published = status !== undefined && status !== "draft";
    if (!published) drafts.push({ folder, paths: [folder, ...(meta?.previous_paths.map((p) => joinPath(p)) ?? [])], isBook });
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

    // History: the published versions (see versions()).
    const paths = [folder, ...meta.previous_paths];
    const history = await versions(ctx, folder, timeline(ctx, commit, paths, isBook));
    const current = isBook
      ? history.find((h, i) => i === 0 && trees.get(stringKey(folder, h.sha)) === folder)
      : history.find((h) => blobs.get(stringKey(folder, h.sha)) === files.get(bpPath));
    if (!current) {
      problem(isBook ? `${folder}/${BOOK_FILE}` : bpPath, "has no commit in its history with the current content");
      continue;
    }

    const renderFor = new Map(renders.map((r) => [slotOf(r.file), r.file]));
    const nodes = toNodes(tree, renderFor, folderFor);
    const cover = description.kind === "blueprint" ? renderFor.get("0") : firstRender(nodes);
    const { title, authors, status: _, previous_paths, ...optional } = meta;
    entries.push({
      path: folder,
      title: title!,
      authors,
      ...optional,
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

  return { entries, problems, drafts, folders };
}

/**
 * A note's status at a commit, from its frontmatter. No status means draft
 * in the status era; before it (when no note had a status key yet) every
 * note is published, as `deprecated` when it says `deprecated: true`.
 * undefined for a value that is not a status.
 */
export function noteStatus(fm: Record<string, unknown>, inEra: boolean): BlueprintStatus | undefined {
  const s = fm["status"];
  if (s != null) return isBlueprintStatus(s) ? s : undefined;
  if (!inEra) return fm["deprecated"] === true ? "deprecated" : "public";
  return "draft";
}

/**
 * The status era: the commits reachable from `commit` that are, or come
 * after, a commit where some note has a `status` key in its frontmatter (the
 * migration to statuses, wherever it is in the history: found by content,
 * so rebasing or squashing it changes nothing). Commits outside it predate
 * statuses and are treated as published.
 */
export function statusEra(git: Git, commit: string): Set<string> {
  const era = new Set<string>();
  // Candidates: commits whose diff of some README.md adds or removes a line
  // starting "status:"; oldest first, so a later one is usually already in.
  const text = git
    .run(["log", "--format=%x1e%H", "--name-only", "--topo-order", "--reverse", "-G^status:", commit, "--", ":(glob)**/README.md"], undefined, false)
    .toString();
  for (const rec of text.split("\x1e").slice(1)) {
    const [sha, ...names] = rec.split("\n").filter((l) => l !== "");
    if (era.has(sha!)) continue;
    const notes = names.filter((n) => n.includes("/") && isScannedPath(n));
    const ids = git.blobIds(notes.map((n) => `${sha}:${n}`)).filter((id): id is string => id !== undefined);
    const hasStatus = [...git.readBlobs(ids).values()].some((b) => {
      try {
        return "status" in readFrontmatter(b.toString("utf8"));
      } catch {
        return false;
      }
    });
    if (!hasStatus) continue;
    era.add(sha!);
    for (const c of git.run(["rev-list", "--ancestry-path", `${sha}..${commit}`]).toString().split("\n")) if (c) era.add(c);
  }
  return era;
}

/** One commit in the life of a catalog entry. */
interface Step extends CatalogVersion {
  /** It changed the blueprint's files: a version, unless the note says draft. */
  changed: boolean;
  /** Its note publishes it at this commit. */
  published: boolean;
  /** The value at this commit: blueprint.json (its blob id), or the expanded book at `folder`; undefined for none. */
  value: { folder: string; blob?: string } | undefined;
}

const VALUE_NAMES = [BLUEPRINT_FILE, BOOK_FILE];

/**
 * The commits that changed an entry's blueprint files or its note, at its
 * path or a previous one, newest first, each with what its note said then.
 * The changes to the blueprint files are git log's, as they were before
 * statuses (for a root book: any book.json or blueprint.json under it).
 */
function timeline(ctx: Context, commit: string, paths: string[], isBook: boolean): Step[] {
  const { git } = ctx;
  const treeFile = (name: string) => paths.some((p) => name.startsWith(p + "/") && TREE_FILE.test(name));
  const changes = isBook ? git.log(commit, paths, treeFile) : git.log(commit, paths.map((p) => `${p}/${BLUEPRINT_FILE}`));
  const changed = new Set(changes.map((c) => c.sha));
  const notePaths = paths.map((p) => `${p}/${NOTES_FILE}`);
  // Before statuses, notes cannot make or hide a version: skip reading them.
  const all =
    ctx.era.size === 0
      ? changes
      : mergeLogs(
          isBook
            ? git.log(commit, paths, (name) => treeFile(name) || notePaths.includes(name))
            : git.log(commit, [...paths.map((p) => `${p}/${BLUEPRINT_FILE}`), ...notePaths]),
          changes,
        );
  const names = isBook ? VALUE_NAMES : [BLUEPRINT_FILE];
  const per = paths.length * names.length;
  const ids = git.blobIds(
    all.flatMap((c) => [...paths.flatMap((p) => names.map((n) => `${c.sha}:${p}/${n}`)), ...notePaths.map((n) => `${c.sha}:${n}`)]),
  );
  const stride = per + paths.length;
  const noteIds = all.map((_, i) => (ctx.era.has(all[i]!.sha) ? ids.slice(i * stride + per, (i + 1) * stride).find((x) => x !== undefined) : undefined));
  const unread = [...new Set(noteIds.filter((id): id is string => id !== undefined && !ctx.statuses.has(id)))];
  for (const [id, blob] of git.readBlobs(unread)) {
    try {
      ctx.statuses.set(id, noteStatus(readFrontmatter(blob.toString("utf8")), true));
    } catch {
      ctx.statuses.set(id, undefined);
    }
  }
  return all.map((c, i) => {
    // The first path holding blueprint.json or (for a root book) book.json.
    const found = ids.slice(i * stride, i * stride + per).findIndex((x) => x !== undefined);
    const folder = paths[Math.floor(found / names.length)]!;
    const value = found === -1 ? undefined : names[found % names.length] === BLUEPRINT_FILE ? { folder, blob: ids[i * stride + found]! } : { folder };
    const status = !ctx.era.has(c.sha) ? "public" : noteIds[i] === undefined ? "draft" : ctx.statuses.get(noteIds[i]!);
    return { ...c, changed: changed.has(c.sha), published: status !== undefined && status !== "draft", value };
  });
}

/**
 * `all` (newest first) with any commit of `changes` it lacks put back after
 * the one before it in `changes` (git log can simplify merges differently
 * for a wider set of paths).
 */
function mergeLogs(all: CatalogVersion[], changes: CatalogVersion[]): CatalogVersion[] {
  const out = [...all];
  const at = new Map(out.map((c, i) => [c.sha, i]));
  let prev = -1;
  for (const c of changes) {
    if (at.has(c.sha)) {
      prev = out.findIndex((o) => o.sha === c.sha);
      continue;
    }
    out.splice(++prev, 0, c);
    at.set(c.sha, prev);
  }
  return out;
}

/**
 * The published versions of an entry, newest first, from its timeline: a
 * commit that changed the blueprint while its note published it (as before
 * statuses), and a commit that publishes it again after a draft, when what
 * it publishes differs from the previous version. Changes made while a
 * draft are never versions. Records where each version's string comes from.
 */
async function versions(ctx: Context, folder: string, steps: Step[]): Promise<CatalogVersion[]> {
  const out: Step[] = [];
  let afterDraft = false;
  for (const s of [...steps].reverse()) {
    if (!s.published) {
      afterDraft = true;
      continue;
    }
    // A commit that only deleted the file at an old path has no version.
    if (s.value === undefined) continue;
    const last = out.at(-1);
    const version = afterDraft ? !(last && (await sameValue(ctx.git, last, s))) : s.changed;
    afterDraft = false;
    if (version) out.push(s);
  }
  return out.reverse().map((s) => {
    const key = stringKey(folder, s.sha);
    if (s.value!.blob !== undefined) ctx.blobs.set(key, s.value!.blob);
    else ctx.trees.set(key, s.value!.folder);
    return { sha: s.sha, date: s.date, subject: s.subject, entries: true };
  });
}

/** Whether two steps hold the same blueprint (the same file, or the same assembled book). */
async function sameValue(git: Git, a: Step, b: Step): Promise<boolean> {
  if (a.value?.blob !== undefined && a.value.blob === b.value?.blob) return true;
  const value = async ({ sha, value: v }: Step) =>
    v!.blob !== undefined ? readCanonicalJson(git.readBlobs([v!.blob]).get(v!.blob)!.toString("utf8")) : assembleAt(git, sha, v!.folder);
  try {
    return JSON.stringify(await value(a)) === JSON.stringify(await value(b));
  } catch {
    return false;
  }
}

/**
 * The entry a draft had when it was last published: built at the commit
 * before its note last became a draft (so renders and notes are as they were
 * then), or, if that does not give a valid published entry, at each earlier
 * published commit in turn. Undefined if it was never published.
 */
async function lastPublished(ctx: Context, commit: string, d: Draft): Promise<CatalogEntry | undefined> {
  const steps = timeline(ctx, commit, d.paths, d.isBook);
  const start = steps.findIndex((s) => s.published);
  if (start === -1) return undefined;
  const earlier = steps.slice(start).filter((s) => s.published && s.value !== undefined).map((s) => s.sha);
  const before = start > 0 ? ctx.git.parent(steps[start - 1]!.sha) : undefined;
  for (const sha of new Set([...(before ? [before] : []), ...earlier])) {
    const ids = ctx.git.blobIds(d.paths.flatMap((p) => VALUE_NAMES.map((n) => `${sha}:${p}/${n}`)));
    const at = ids.findIndex((x) => x !== undefined);
    if (at === -1) continue;
    const folder = d.paths[Math.floor(at / VALUE_NAMES.length)]!;
    const built = await buildAt(ctx, sha, new Set([folder]));
    const entry = built.entries.find((e) => e.path === folder);
    if (entry) return entry;
  }
  return undefined;
}

/** book.json and blueprint.json: the files whose changes make a version of a root book. */
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
 * Keep the live entry of each invalid blueprint, marked stale, so its links
 * go on serving the last valid version (its strings are already published).
 * A blueprint whose folder is gone is not invalid, so it is dropped. Drafts
 * never come from the live index (buildCatalog keeps what they had from the
 * history), nor does a path the index already has. Returns the paths
 * carried over.
 */
export function carryOverStale(catalog: Catalog, published: LiveIndex | undefined): string[] {
  const drafts = new Set(catalog.drafts);
  const has = new Set(catalog.index.blueprints.map((e) => e.path));
  const invalid = new Set(catalog.invalid.filter((f) => !drafts.has(f) && !has.has(f)));
  const carried = (published?.blueprints ?? [])
    .filter((e) => invalid.has(e.path))
    // A schema 1 entry's renders also carry a number "n"; the file is what links use.
    // An entry from before status gets the one its deprecated flag means.
    .map(({ status, ...e }): CatalogEntry => {
      const s = status ?? (e.deprecated ? "deprecated" : "public");
      return { ...e, status: s, deprecated: s === "deprecated", renders: e.renders.map(liveRender), stale: true };
    });
  const list = catalog.index.blueprints;
  list.push(...carried);
  list.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return carried.map((e) => e.path);
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
 * checked against its sub-tree. A version whose blueprint.json (or assembled
 * expanded book) was not a valid blueprint at that commit gets no strings;
 * it is removed from the index's history and reported.
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
      let value: unknown;
      const tree = catalog.trees.get(job.key);
      try {
        value =
          tree === undefined
            ? readCanonicalJson(data.get(catalog.blobs.get(job.key)!)!.toString("utf8"))
            : await assembleAt(git, job.sha, tree);
      } catch {
        value = undefined;
      }
      if (!isBlueprintValue(value)) {
        const what = tree === undefined ? BLUEPRINT_FILE : `the expanded book ${tree}`;
        warnings.push(`${job.path}@${job.sha}: ${what} was not a valid blueprint at that commit; left out of the history`);
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
