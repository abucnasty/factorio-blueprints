// "Expand book into folders": a blueprint folder whose blueprint.json is a
// book becomes an expanded book (book.json plus one slot folder per entry,
// all the way down), with its render images moved into the leaves.

import {
  BLUEPRINT_FILE,
  BOOK_FILE,
  describeBlueprint,
  expandBook,
  fillNotesTemplate,
  joinPath,
  KIND_NAMES,
  NOTES_FILE,
  parseRenderManifest,
  readCanonicalJson,
  readNotesMeta,
  RENDER_MANIFEST,
  writeCanonicalJson,
} from "../core/index.ts";
import type { ExpandedEntry, RenderManifest } from "../core/index.ts";
import { locate } from "./expanded.ts";
import { refreshExpandedBook } from "./generated-notes.ts";
import { reportGit } from "./git-notice.ts";
import type { Host } from "./host.ts";
import { readTemplate } from "./import-blueprint.ts";

export type ExpandOutcome =
  | { action: "expanded"; folder: string; folders: number; renders: number }
  | { action: "cancelled" }
  | { action: "rejected"; reason: string };

const UNLABELED: Record<ExpandedEntry["kind"], string> = {
  blueprint: "Blueprint",
  "blueprint-book": "Book",
  "upgrade-planner": "Upgrade planner",
  "deconstruction-planner": "Deconstruction planner",
};

/** Title of an entry's new note: its plain label, or e.g. "Blueprint (slot 3)". */
export const entryTitle = (e: ExpandedEntry) => (e.label !== "" ? e.label : `${UNLABELED[e.kind]} (slot ${e.slot})`);

export interface NoteDefaults {
  authors: string[];
  posted: string;
}

/**
 * Create an entry's slot folder under `parent`, with blueprint.json (a leaf)
 * or book.json and its own entries (a nested book), and a note from the
 * template in each. Returns the number of folders made.
 */
export async function writeEntryFolder(host: Host, parent: string, entry: ExpandedEntry, notes: NoteDefaults, template: string): Promise<number> {
  const folder = joinPath(parent, entry.folder);
  await host.files.mkdir(folder);
  if (entry.kind === "blueprint-book") await host.files.write(joinPath(folder, BOOK_FILE), writeCanonicalJson(entry.book));
  else await host.files.write(joinPath(folder, BLUEPRINT_FILE), writeCanonicalJson(entry.value));
  await host.files.write(
    joinPath(folder, NOTES_FILE),
    fillNotesTemplate(template, { title: entryTitle(entry), posted: notes.posted, authors: notes.authors, entry: true }),
  );
  let made = 1;
  for (const child of entry.entries ?? []) made += await writeEntryFolder(host, folder, child, notes, template);
  return made;
}

export async function expandBookIntoFolders(host: Host, contextFolder: string): Promise<ExpandOutcome> {
  const loc = await locate(host, contextFolder);
  if (!loc) return reject(host, "Run this in a blueprint folder whose blueprint.json is a book.");
  if (loc.kind === "book") return reject(host, `${loc.folder} is already an expanded book.`);
  const folder = loc.folder;
  let value: unknown;
  let kind: string;
  try {
    value = readCanonicalJson(await host.files.read(joinPath(folder, BLUEPRINT_FILE)));
    kind = describeBlueprint(value).kind;
  } catch (e) {
    return reject(host, `Could not read ${folder}/${BLUEPRINT_FILE}: ${errorText(e)}`);
  }
  if (kind !== "blueprint-book") {
    return reject(host, `${folder} holds a ${KIND_NAMES[kind as keyof typeof KIND_NAMES]}, not a book: there is nothing to expand.`);
  }
  let expanded: ReturnType<typeof expandBook>;
  try {
    expanded = expandBook(value);
  } catch (e) {
    return reject(host, `${folder}/${BLUEPRINT_FILE}: ${errorText(e)}`);
  }
  const { book, entries, dropped } = expanded;

  const notePath = joinPath(folder, NOTES_FILE);
  let title = folder.slice(folder.lastIndexOf("/") + 1);
  let notes: NoteDefaults = { authors: host.settings.authors, posted: host.today() };
  try {
    if (await host.files.exists(notePath)) {
      const meta = readNotesMeta(await host.files.read(notePath));
      title = meta.title ?? title;
      notes = { authors: meta.authors, posted: meta.posted ?? host.today() };
    }
  } catch {
    // keep the defaults
  }

  // Render images of the book, by slot path.
  const rendersDir = joinPath(folder, "renders");
  const manifestPath = joinPath(rendersDir, RENDER_MANIFEST);
  const manifest = (await host.files.exists(manifestPath)) ? parseRenderManifest(await host.files.read(manifestPath)) : undefined;
  const moves: { from: string; leaf: string; name: string; recorded: RenderManifest["entries"][string] | undefined }[] = [];
  let leafCount = 0;
  let bookCount = 0;
  const plan = async (list: ExpandedEntry[], parent: string, prefix: number[]) => {
    for (const e of list) {
      const slots = [...prefix, e.slot];
      const path = joinPath(parent, e.folder);
      if (e.kind === "blueprint-book") {
        bookCount++;
        await plan(e.entries ?? [], path, slots);
        continue;
      }
      leafCount++;
      const key = slots.join("/");
      const recorded = manifest?.entries[key];
      const file = recorded?.file ?? `${key}.jpg`;
      if (await host.files.exists(joinPath(rendersDir, file))) {
        moves.push({ from: joinPath(rendersDir, file), leaf: path, name: `0${/\.[^./]+$/.exec(file)?.[0] ?? ".jpg"}`, recorded });
      }
    }
  };
  await plan(entries, folder, []);

  const ok = await host.ui.confirm({
    title: `Expand "${title}" into folders`,
    lines: [
      `${folder}/blueprint.json becomes book.json, and every entry gets its own folder with a note: ` +
        `${leafCount} blueprint folder${leafCount === 1 ? "" : "s"}` +
        (bookCount > 0 ? ` and ${bookCount} nested book${bookCount === 1 ? "" : "s"}` : "") +
        ".",
      ...(moves.length > 0 ? [`${moves.length} render image${moves.length === 1 ? "" : "s"} move into their folders.`] : []),
      ...(dropped.length > 0
        ? ["Left out, because an earlier entry has the same slot:", ...dropped.map((d) => `- slot ${d.path}: ${d.label || "(no label)"}`)]
        : []),
    ],
    okText: "Expand",
  });
  if (!ok) return { action: "cancelled" };

  let made = 0;
  try {
    const template = await readTemplate(host);
    await host.files.write(joinPath(folder, BOOK_FILE), writeCanonicalJson(book));
    await host.files.remove(joinPath(folder, BLUEPRINT_FILE));
    for (const e of entries) made += await writeEntryFolder(host, folder, e, notes, template);
    for (const m of moves) {
      await host.files.mkdir(joinPath(m.leaf, "renders"));
      await host.files.rename(m.from, joinPath(m.leaf, "renders", m.name));
      if (m.recorded) {
        const leafManifest: RenderManifest = {
          schema: 1,
          rendered_at: manifest!.rendered_at,
          entries: { "0": { ...m.recorded, file: m.name } },
        };
        await host.files.write(joinPath(m.leaf, "renders", RENDER_MANIFEST), JSON.stringify(leafManifest, null, 2) + "\n");
      }
    }
    if (await host.files.exists(rendersDir)) await host.files.remove(rendersDir);
    await refreshExpandedBook(host, loc.root);
  } catch (e) {
    return reject(host, `Stopped while expanding ${folder}: ${errorText(e)}. Nothing was committed; check the folder before trying again.`);
  }

  const summary =
    `Expanded ${folder}: ${made} folder${made === 1 ? "" : "s"}` +
    (moves.length > 0 ? `, ${moves.length} render${moves.length === 1 ? "" : "s"} moved` : "") +
    (dropped.length > 0 ? `, ${dropped.length} duplicate-slot entr${dropped.length === 1 ? "y" : "ies"} left out` : "");
  const result: ExpandOutcome = { action: "expanded", folder, folders: made, renders: moves.length };
  if (!host.settings.commitAfterImport || host.git === undefined) {
    host.ui.notice(`${summary}.`);
    return result;
  }
  if (moves.length > 0 && !(await host.git.lfsAvailable())) {
    host.ui.notice(
      `${summary}, but git-lfs is not installed on this computer, so nothing was committed (the images must not go into plain git). Run _tools/setup/setup-machine.sh, then commit with the Git plugin.`,
      "error",
    );
    return result;
  }
  reportGit(host, summary, await host.git.commitAndSync(loc.root, `expand ${title} into folders`));
  return result;
}

function reject(host: Host, reason: string): ExpandOutcome {
  host.ui.notice(reason, "error");
  return { action: "rejected", reason };
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
