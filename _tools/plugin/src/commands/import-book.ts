// "Import book into folders": turn a blueprint book into category folders
// (one per nested book) and blueprint folders (one per blueprint or
// planner), or update such a tree from a newer copy of the book.
//
// Source: the book folder the command runs in (which becomes a category
// folder, its renders moved to the new folders), or a book string on the
// clipboard with a target folder. The plan is the core's planBookImport;
// this applies it after one review and makes one commit.

import {
  applyGeneratedBlock,
  applyStatsToNote,
  baseName,
  BLUEPRINT_FILE,
  decodeBlueprintString,
  describeBlueprint,
  fillNotesTemplate,
  findBlueprintFolder,
  isScannedPath,
  joinPath,
  KIND_NAMES,
  NOTES_FILE,
  parseRenderManifest,
  plainLabel,
  planBookImport,
  readCanonicalJson,
  readNotesMeta,
  RENDER_MANIFEST,
  selfAndAncestors,
  slugify,
  updateFrontmatter,
  writeCanonicalJson,
} from "../core/index.ts";
import type { BookPlan, ExistingFolder, NotesMeta, PlanEntry, RenderManifest } from "../core/index.ts";
import { clipboardErrorMessage, readTemplate } from "./import-blueprint.ts";
import { findBlueprintFolders, noteWithBlock } from "./generated-notes.ts";
import { reportGit } from "./git-notice.ts";
import type { BookChoices, Host } from "./host.ts";

export type BookImportOutcome =
  | { action: "applied"; target: string; plan: BookPlan; written: string[] }
  | { action: "nothing-to-do" | "cancelled"; target?: string }
  | { action: "rejected"; reason: string };

export async function importBookIntoFolders(host: Host, contextFolder: string): Promise<BookImportOutcome> {
  const folder = await findBlueprintFolder(contextFolder, (f) => host.files.exists(joinPath(f, BLUEPRINT_FILE)));
  return folder !== undefined ? splitBookFolder(host, folder) : importBookFromClipboard(host, contextFolder);
}

/** Source: the book folder itself, which becomes a category folder. */
async function splitBookFolder(host: Host, folder: string): Promise<BookImportOutcome> {
  let value: unknown;
  try {
    value = readCanonicalJson(await host.files.read(joinPath(folder, BLUEPRINT_FILE)));
  } catch (e) {
    return reject(host, `Could not read ${folder}/${BLUEPRINT_FILE}: ${errorText(e)}`);
  }
  let kind: string;
  try {
    kind = describeBlueprint(value).kind;
  } catch (e) {
    return reject(host, `${folder}/${BLUEPRINT_FILE}: ${errorText(e)}`);
  }
  if (kind !== "blueprint-book") {
    return reject(host, `${folder} holds a ${KIND_NAMES[kind as keyof typeof KIND_NAMES]}, not a book, so there is nothing to split into folders.`);
  }
  const notesPath = joinPath(folder, NOTES_FILE);
  const note = (await host.files.exists(notesPath)) ? await host.files.read(notesPath) : undefined;
  let meta: NotesMeta | undefined;
  try {
    meta = note === undefined ? undefined : readNotesMeta(note);
  } catch {
    meta = undefined;
  }
  const bookTitle = meta?.title ?? baseName(folder);

  // A blueprint folder never holds another, so nothing under it can match.
  const plan = planBookImport(value, folder, [], await takenPaths(host, folder));
  const choices = await host.ui.reviewBookImport({ title: `Split "${bookTitle}" into folders`, plan });
  if (choices === undefined) return { action: "cancelled", target: folder };

  return apply(host, plan, choices, {
    message: `split ${bookTitle} into folders`,
    defaults: {
      authors: meta?.authors ?? host.settings.authors,
      posted: meta?.posted ?? host.today(),
      version: meta?.version,
    },
    book: { folder, note },
  });
}

/** Source: a book string on the clipboard, into a target folder. */
async function importBookFromClipboard(host: Host, contextFolder: string): Promise<BookImportOutcome> {
  let value: unknown;
  let label: string;
  try {
    ({ value } = decodeBlueprintString(await host.clipboard.readText()));
    const d = describeBlueprint(value);
    if (d.kind !== "blueprint-book") {
      return reject(host, `The clipboard holds a ${KIND_NAMES[d.kind]}, not a book. Use Import blueprint from clipboard for it.`);
    }
    label = plainLabel(d.label ?? "");
  } catch (e) {
    return reject(host, clipboardErrorMessage(e));
  }

  const proposed = joinPath(contextFolder, slugify(label) || "book");
  const target = await host.ui.askText({
    title: "Import book into folders",
    label: "Target folder",
    description: `Folders for "${label || "the book"}" go here, one per nested book and one per blueprint.`,
    value: proposed,
    okText: "Next",
    check: (t) => checkTarget(host, t),
  });
  if (target === undefined) return { action: "cancelled" };
  const t = joinPath(target.trim());
  const problem = await checkTarget(host, t);
  if (problem !== undefined) return reject(host, problem);

  const existing = (await host.files.exists(t)) ? await existingFolders(host, t) : [];
  const plan = planBookImport(value, t, existing, await takenPaths(host, t, new Set(existing.map((f) => f.path))));
  if (plan.counts.new + plan.counts.update + plan.counts.choose === 0) {
    host.ui.notice(`Nothing to write: all ${plan.entries.length} entries of the book are unchanged in ${t}.`);
    return { action: "nothing-to-do", target: t };
  }
  const choices = await host.ui.reviewBookImport({ title: `Import "${label || "book"}" into ${t}`, plan });
  if (choices === undefined) return { action: "cancelled", target: t };
  return apply(host, plan, choices, {
    message: `import book ${label || "book"} into ${t}`,
    defaults: { authors: host.settings.authors, posted: host.today(), version: undefined },
  });
}

/** Error for an unusable target folder, or undefined. */
export async function checkTarget(host: Host, target: string): Promise<string | undefined> {
  const t = joinPath(target.trim());
  if (t === "") return "Choose a folder inside the vault.";
  if (!isScannedPath(t)) return `"${t}" is inside a folder starting with "_" or ".", which is never scanned.`;
  for (const f of selfAndAncestors(t)) {
    if (f !== "" && (await host.files.exists(joinPath(f, BLUEPRINT_FILE)))) {
      return f === t
        ? `${t} is a blueprint folder. Run the command in it to split its own book, or choose another folder.`
        : `${t} is inside the blueprint folder ${f}; choose a folder outside it.`;
    }
  }
  if ((await host.files.exists(t)) && !(await isFolder(host, t))) return `${t} is a file.`;
  return undefined;
}

interface ApplyOptions {
  message: string;
  defaults: { authors: string[]; posted: string; version: string | undefined };
  /** Book-folder source: clean up the book folder and move its renders. */
  book?: { folder: string; note: string | undefined };
}

async function apply(host: Host, plan: BookPlan, choices: BookChoices, opts: ApplyOptions): Promise<BookImportOutcome> {
  const { files } = host;
  // Resolve the owner's choices, each existing folder at most once.
  const chosen = new Set<string>();
  const work: (PlanEntry & { action: "new" | "update" | "unchanged"; at: string })[] = [];
  for (const e of plan.entries) {
    if (e.status === "unchanged") work.push({ ...e, action: "unchanged", at: e.folder! });
    else if (e.status === "update") work.push({ ...e, action: "update", at: e.folder! });
    else if (e.status === "new") work.push({ ...e, action: "new", at: e.newPath! });
    else {
      const pick = choices[e.path] ?? null;
      if (pick !== null) {
        if (!e.candidates?.includes(pick) || chosen.has(pick)) {
          return reject(host, `${pick} cannot be updated by slot ${e.path}: it is not a free folder of this import, or it was chosen twice.`);
        }
        chosen.add(pick);
        work.push({ ...e, action: "update", at: pick });
      } else work.push({ ...e, action: "new", at: e.newPath! });
    }
  }
  const toWrite = work.filter((w) => w.action !== "unchanged");
  if (toWrite.length === 0 && !opts.book) {
    host.ui.notice(`Nothing to write: all ${plan.entries.length} entries are unchanged in ${plan.target}.`);
    return { action: "nothing-to-do", target: plan.target };
  }

  // Renders of a book folder, by slot path.
  const book = opts.book;
  let manifest: RenderManifest | undefined;
  if (book) {
    const m = joinPath(book.folder, "renders", RENDER_MANIFEST);
    manifest = (await files.exists(m)) ? parseRenderManifest(await files.read(m)) : undefined;
  }

  const written: string[] = [];
  let movedRenders = 0;
  try {
    if (!(await files.exists(plan.target))) await files.mkdir(plan.target);
    for (const c of plan.categories) if (!(await files.exists(c))) await files.mkdir(c);
    const template = await readTemplate(host);

    for (const w of toWrite) {
      if (w.action === "new") await files.mkdir(w.at);
      await files.write(joinPath(w.at, BLUEPRINT_FILE), writeCanonicalJson(w.value));

      if (book && w.kind === "blueprint") movedRenders += await moveRender(host, book.folder, manifest, w.path, w.at);

      const notesPath = joinPath(w.at, NOTES_FILE);
      let note: string | undefined;
      if (w.action === "new") {
        note = fillNotesTemplate(template, { title: w.title, posted: opts.defaults.posted, authors: opts.defaults.authors });
        if (opts.defaults.version !== undefined) note = updateFrontmatter(note, { version: opts.defaults.version });
      } else if (await files.exists(notesPath)) {
        note = await files.read(notesPath);
      }
      if (note !== undefined) {
        const generated = await noteWithBlock(host, w.at, note, w.value);
        const text = generated.status === "invalid" ? note : generated.text;
        if (w.action === "new" || text !== note) await files.write(notesPath, text);
      }
      written.push(w.at);
    }

    if (book) {
      // The book folder becomes a category folder with a plain note.
      await files.remove(joinPath(book.folder, BLUEPRINT_FILE));
      if (await files.exists(joinPath(book.folder, "renders"))) await files.remove(joinPath(book.folder, "renders"));
      if (book.note !== undefined) {
        const plain = applyStatsToNote(applyGeneratedBlock(book.note, undefined).text, {});
        if (plain !== book.note) await files.write(joinPath(book.folder, NOTES_FILE), plain);
      }
    }
  } catch (e) {
    return reject(
      host,
      `Stopped after writing ${written.length} folder${written.length === 1 ? "" : "s"}: ${errorText(e)}. Nothing was committed; check ${plan.target} and run the command again.`,
    );
  }

  const unmatched = plan.unmatched.filter((p) => !chosen.has(p));
  const count = (a: string) => work.filter((w) => w.action === a).length;
  const summary =
    `${book ? `Split ${book.folder} into folders` : `Imported the book into ${plan.target}`}: ` +
    `${count("new")} new, ${count("update")} updated, ${count("unchanged")} unchanged` +
    (movedRenders > 0 ? `, ${movedRenders} render${movedRenders === 1 ? "" : "s"} moved` : "") +
    (unmatched.length > 0 ? `; not in this book (left alone): ${unmatched.join(", ")}` : "");

  if (!host.settings.commitAfterImport || host.git === undefined) {
    host.ui.notice(`${summary}.`);
    return { action: "applied", target: plan.target, plan, written };
  }
  if (movedRenders > 0 && !(await host.git.lfsAvailable())) {
    host.ui.notice(
      `${summary}, but git-lfs is not installed on this computer, so nothing was committed (the images must not go into plain git). Run _tools/setup/setup-machine.sh, then commit with the Git plugin.`,
      "error",
    );
    return { action: "applied", target: plan.target, plan, written };
  }
  const git = await host.git.commitAndSync(plan.target, opts.message);
  reportGit(host, summary, git);
  return { action: "applied", target: plan.target, plan, written };
}

/**
 * Move the image of the book entry at `slotPath` to <folder>/renders/0.<ext>
 * and record it in that folder's render.json with the book's hash and size.
 */
async function moveRender(
  host: Host,
  bookFolder: string,
  manifest: RenderManifest | undefined,
  slotPath: string,
  folder: string,
): Promise<number> {
  const recorded = manifest?.entries[slotPath];
  const file = [recorded?.file, `${slotPath}.jpg`].find((f): f is string => f !== undefined);
  if (file === undefined) return 0;
  const from = joinPath(bookFolder, "renders", file);
  if (!(await host.files.exists(from))) return 0;
  const ext = /\.[^./]+$/.exec(file)?.[0] ?? ".jpg";
  const name = `0${ext}`;
  await host.files.mkdir(joinPath(folder, "renders"));
  await host.files.rename(from, joinPath(folder, "renders", name));
  if (recorded) {
    const m: RenderManifest = {
      schema: 1,
      rendered_at: manifest!.rendered_at,
      entries: { "0": { ...recorded, file: name } },
    };
    await host.files.write(joinPath(folder, "renders", RENDER_MANIFEST), JSON.stringify(m, null, 2) + "\n");
  }
  return 1;
}

/** Blueprint folders under a target, with their content and a label to rank by. */
async function existingFolders(host: Host, target: string): Promise<ExistingFolder[]> {
  const out: ExistingFolder[] = [];
  for (const path of await findBlueprintFolders(host, target)) {
    if (path === target) continue;
    try {
      const value = readCanonicalJson(await host.files.read(joinPath(path, BLUEPRINT_FILE)));
      let label = "";
      try {
        const notes = joinPath(path, NOTES_FILE);
        if (await host.files.exists(notes)) label = readNotesMeta(await host.files.read(notes)).title ?? "";
      } catch {
        // fall back to the blueprint's own label
      }
      if (label === "") {
        try {
          label = plainLabel(describeBlueprint(value).label ?? "");
        } catch {
          label = "";
        }
      }
      out.push({ path, value, label });
    } catch {
      // an unreadable blueprint.json cannot match anything; it is left alone
    }
  }
  return out;
}

/** Every path under a folder (not inside blueprint folders), files and folders. */
async function takenPaths(host: Host, root: string, skipInside: ReadonlySet<string> = new Set()): Promise<Map<string, "file" | "folder">> {
  const out = new Map<string, "file" | "folder">();
  if (!(await host.files.exists(root))) return out;
  const walk = async (dir: string) => {
    const { files, folders } = await host.files.list(dir);
    for (const f of files) out.set(f, "file");
    for (const d of folders) {
      out.set(d, "folder");
      if (!skipInside.has(d)) await walk(d);
    }
  };
  await walk(root);
  return out;
}

async function isFolder(host: Host, path: string): Promise<boolean> {
  const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  return (await host.files.list(parent)).folders.includes(path);
}

function reject(host: Host, reason: string): BookImportOutcome {
  host.ui.notice(reason, "error");
  return { action: "rejected", reason };
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
