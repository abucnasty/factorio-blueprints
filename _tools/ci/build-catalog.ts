// Build and validate the catalog index from a git commit, and produce the
// blueprint strings it points at. Reads only git objects (never the working
// tree), so render images are seen as their LFS pointers and nothing is
// downloaded. The CLI is catalog.ts.

import { execFileSync } from "node:child_process";

import {
  BLUEPRINT_FILE,
  describeBlueprint,
  encodeBlueprintString,
  FrontmatterError,
  isBlueprintValue,
  isCanonicalJson,
  isScannedPath,
  joinPath,
  NOTES_FILE,
  parentFolder,
  readCanonicalJson,
  readFrontmatter,
  readNotesMeta,
} from "../plugin/src/core/index.ts";
import type { CatalogEntry, CatalogIndex, CatalogRender, CatalogVersion } from "./catalog-index.ts";

export interface Problem {
  /** Repo path of the file or folder at fault. */
  path: string;
  message: string;
}

export interface Catalog {
  index: CatalogIndex;
  /** Validation failures; blueprints with any are left out of the index. */
  problems: Problem[];
  /** blueprint.json blob id for every (path, sha) in the index, keyed by stringKey. */
  blobs: Map<string, string>;
}

export interface StringJob {
  path: string;
  sha: string;
  key: string;
}

/** R2 key of the blueprint string of `path` as of `sha`. */
export function stringKey(path: string, sha: string): string {
  return `strings/${path}/${sha}.txt`;
}

const RENDER_NAME = /^(0|[1-9][0-9]*)\.(jpg|jpeg|png|webp)$/;
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
        return { sha: sha!, date: date!, subject: subject ?? "" };
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

  // Render files belong to the blueprint folder that holds their renders/ directory.
  const renderFiles = new Map<string, { file: string; blob: string }[]>();
  for (const [path, blob] of files) {
    if (!isScannedPath(path)) continue;
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
    const problem = (path: string, message: string) => problems.push({ path, message });

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
      if (isBlueprintValue(value)) description = describeBlueprint(value);
      else problem(bpPath, "is not a blueprint, blueprint book, upgrade planner or deconstruction planner");
    }

    // renders/.
    const renders: CatalogRender[] = [];
    for (const { file, blob } of renderFiles.get(folder) ?? []) {
      const path = `${folder}/renders/${file}`;
      const name = RENDER_NAME.exec(file);
      if (!name) {
        problem(path, "renders/ may only hold <n>.jpg, .jpeg, .png or .webp, n counting from 0");
        continue;
      }
      const pointer = LFS_POINTER.exec(content.get(blob)!.toString("latin1"));
      if (!pointer) {
        problem(path, "is not a Git LFS pointer (commit it with git-lfs installed)");
        continue;
      }
      const n = Number(name[1]);
      if (renders.some((r) => r.n === n)) {
        problem(path, `there is more than one render ${n}`);
        continue;
      }
      renders.push({ n, file, oid: pointer[1]!, size: Number(pointer[2]) });
    }
    renders.sort((a, b) => a.n - b.n);

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
      history.push(c);
      blobs.set(stringKey(folder, c.sha), id);
    });
    const current = history.find((h) => blobs.get(stringKey(folder, h.sha)) === bpBlob);
    if (!current) {
      problem(bpPath, "has no commit in its history with the current content");
      continue;
    }

    const { title, authors, deprecated, previous_paths, ...optional } = meta;
    entries.push({
      path: folder,
      title: title!,
      authors,
      ...optional,
      deprecated,
      previous_paths,
      blueprint: description,
      commit: current.sha,
      history,
      renders,
    });
  }

  return {
    index: {
      schema: 1,
      generatedAt: (opts.now ?? new Date()).toISOString(),
      commit,
      blueprints: entries,
    },
    problems,
    blobs,
  };
}

// ---------------------------------------------------------------------------
// strings

/**
 * The strings to produce: every (path, sha) in the index that `published`
 * (the index currently live) does not already have; all of them without it.
 * Diffing against what is live, rather than taking the pushed commit range,
 * also covers pushes whose runs were skipped or failed, and renames (the
 * old versions are needed again under the new path).
 */
export function selectStrings(index: CatalogIndex, published?: CatalogIndex): StringJob[] {
  const have = new Set<string>();
  for (const e of published?.blueprints ?? []) for (const h of e.history) have.add(stringKey(e.path, h.sha));
  const jobs: StringJob[] = [];
  for (const e of index.blueprints) {
    for (const h of e.history) {
      const key = stringKey(e.path, h.sha);
      if (!have.has(key)) jobs.push({ path: e.path, sha: h.sha, key });
    }
  }
  return jobs;
}

/**
 * Encode the blueprint string for each job and hand it to `emit`. A version
 * whose blueprint.json was not a valid blueprint at that commit gets no
 * string; it is removed from the index's history and reported.
 */
export function produceStrings(
  repo: string,
  catalog: Catalog,
  jobs: StringJob[],
  emit: (key: string, text: string) => void,
): { warnings: string[] } {
  const git = new Git(repo);
  const warnings: string[] = [];
  const encoded = new Map<string, string | undefined>(); // by blob id, within a batch
  const BATCH = 16;
  for (let i = 0; i < jobs.length; i += BATCH) {
    encoded.clear();
    const batch = jobs.slice(i, i + BATCH);
    const ids = batch.map((j) => catalog.blobs.get(j.key)!);
    const data = git.readBlobs(ids.filter((id) => !encoded.has(id)));
    batch.forEach((job, k) => {
      const id = ids[k]!;
      if (!encoded.has(id)) {
        let text: string | undefined;
        try {
          const value = readCanonicalJson(data.get(id)!.toString("utf8"));
          if (isBlueprintValue(value)) text = encodeBlueprintString(value);
        } catch {
          // not JSON; text stays undefined
        }
        encoded.set(id, text);
      }
      const text = encoded.get(id);
      if (text !== undefined) {
        emit(job.key, text);
        return;
      }
      warnings.push(`${job.path}@${job.sha}: blueprint.json was not a valid blueprint at that commit; left out of the history`);
      const entry = catalog.index.blueprints.find((e) => e.path === job.path)!;
      entry.history = entry.history.filter((h) => h.sha !== job.sha);
    });
  }
  return { warnings };
}
