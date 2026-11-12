// "Import book into folders": the plan that turns a blueprint book into a
// tree of category folders (one per nested book) and blueprint folders (one
// per blueprint or planner), matched against the blueprint folders already
// under the target so the same book can be imported again to update it.
// Pure: the command reads the vault and applies the plan.

import { writeCompactSortedJson } from "./canonical-json.ts";
import { type BookNode, bookTree, displayLabel } from "./book-tree.ts";
import type { BlueprintKind } from "./describe.ts";
import { slugify } from "./slug.ts";

/** A blueprint folder that already exists under the target. */
export interface ExistingFolder {
  path: string;
  /** Its blueprint.json value. */
  value: unknown;
  /** Its note's title, or its blueprint's label, for ranking candidates. */
  label: string;
}

export type PlanStatus = "unchanged" | "update" | "new" | "choose";

export interface PlanEntry {
  /** Slot path in the book, e.g. "3/1". */
  path: string;
  slots: number[];
  kind: BlueprintKind;
  /** Plain label as written; "" when the entry has none. */
  label: string;
  /** Title for a new note: the plain label, or e.g. "Blueprint (slot 3)". */
  title: string;
  /** The entry's own value, as its blueprint.json holds it ({"blueprint": …}). */
  value: unknown;
  /** Folder path the book's names give it. */
  derivedPath: string;
  status: PlanStatus;
  /** unchanged and update: the existing folder. */
  folder?: string;
  /** new and choose: where "create new" puts it (derivedPath, or with a suffix if that is taken). */
  newPath?: string;
  /** choose: existing folders no entry matched, closest label first. */
  candidates?: string[];
}

export interface BookPlan {
  target: string;
  /** Category folders, one per nested book, parents first. */
  categories: string[];
  /** Blueprints and planners, depth first in slot order. */
  entries: PlanEntry[];
  /** Existing blueprint folders that no entry matched ("not in this book"). */
  unmatched: string[];
  counts: Record<PlanStatus, number>;
}

const UNLABELED_SLUG: Record<BlueprintKind, string> = {
  blueprint: "blueprint",
  "blueprint-book": "book",
  "upgrade-planner": "upgrade-planner",
  "deconstruction-planner": "deconstruction-planner",
};

/**
 * Plan importing `book` (a decoded blueprint book) into `target`.
 * `existing` are the blueprint folders under the target (any depth, the
 * target itself excluded); `taken` lists every other path under it. A new
 * blueprint folder never reuses a taken path; a category folder may reuse
 * an existing folder but not a file.
 */
export function planBookImport(
  book: unknown,
  target: string,
  existing: readonly ExistingFolder[],
  taken: ReadonlyMap<string, "file" | "folder"> = new Map(),
): BookPlan {
  const tree = bookTree(book);
  if (!tree || tree.kind !== "blueprint-book") throw new Error("This is not a blueprint book.");
  const existingByPath = new Map(existing.map((f) => [f.path, f]));
  const categories: string[] = [];
  const entries: PlanEntry[] = [];

  // Names: game labels as slugs, unlabeled as <kind>-<slot>, -2/-3 for
  // siblings that share one (slot order). A nested book whose path is an
  // existing blueprint folder or another path in use gets a suffix too.
  const visit = (node: BookNode, parentPath: string) => {
    const used = new Set<string>();
    for (const child of node.children) {
      const base = slugify(child.label) || `${UNLABELED_SLUG[child.kind]}-${child.slot}`;
      const free = (name: string) =>
        !used.has(name) &&
        (child.kind !== "blueprint-book" || (!existingByPath.has(`${parentPath}/${name}`) && taken.get(`${parentPath}/${name}`) !== "file"));
      let name = base;
      for (let n = 2; !free(name); n++) name = `${base}-${n}`;
      used.add(name);
      const path = `${parentPath}/${name}`;
      if (child.kind === "blueprint-book") {
        categories.push(path);
        visit(child, path);
        continue;
      }
      entries.push({
        path: child.path,
        slots: child.slots,
        kind: child.kind,
        label: child.label,
        title: displayLabel(child),
        value: child.value,
        derivedPath: path,
        status: "new",
      });
    }
  };
  visit(tree, target);

  // Matching, each existing folder used by at most one entry.
  const claimed = new Set<string>();
  const key = (v: unknown) => writeCompactSortedJson(v);
  const existingKeys = new Map(existing.map((f) => [f.path, key(f.value)]));
  const open = new Set(entries);
  const claim = (e: PlanEntry, folder: string, status: "unchanged" | "update") => {
    e.status = status;
    e.folder = folder;
    claimed.add(folder);
    open.delete(e);
  };
  // 1a. Identical content at the derived path.
  for (const e of entries) {
    if (existingKeys.get(e.derivedPath) === key(e.value)) claim(e, e.derivedPath, "unchanged");
  }
  // 1b. Identical content anywhere else (a renamed or moved folder).
  for (const e of [...open]) {
    const k = key(e.value);
    const twin = existing.find((f) => !claimed.has(f.path) && existingKeys.get(f.path) === k);
    if (twin) claim(e, twin.path, "unchanged");
  }
  // 2. Different content at the derived path.
  for (const e of [...open]) {
    if (existingByPath.has(e.derivedPath) && !claimed.has(e.derivedPath)) claim(e, e.derivedPath, "update");
  }
  // 3. The rest: create new, or update a folder the owner picks.
  const unmatched = existing.map((f) => f.path).filter((p) => !claimed.has(p)).sort();
  const newPaths = new Set<string>();
  for (const e of open) {
    const parent = e.derivedPath.slice(0, e.derivedPath.lastIndexOf("/"));
    const base = e.derivedPath.slice(parent.length + 1);
    const siblings = new Set([...entries.filter((x) => x !== e).map((x) => x.derivedPath), ...categories]);
    let path = e.derivedPath;
    for (let n = 2; existingByPath.has(path) || taken.has(path) || newPaths.has(path) || (path !== e.derivedPath && siblings.has(path)); n++) {
      path = `${parent}/${base}-${n}`;
    }
    newPaths.add(path);
    e.newPath = path;
    if (unmatched.length > 0) {
      e.status = "choose";
      e.candidates = rankCandidates(e.label || e.title, unmatched, existingByPath);
    } else e.status = "new";
  }

  const counts = { unchanged: 0, update: 0, new: 0, choose: 0 };
  for (const e of entries) counts[e.status]++;
  return { target, categories, entries, unmatched, counts };
}

/** Existing folders closest to a label first (bigram similarity of labels, then path). */
function rankCandidates(label: string, paths: string[], byPath: Map<string, ExistingFolder>): string[] {
  const score = (p: string) => similarity(label, byPath.get(p)?.label || p.slice(p.lastIndexOf("/") + 1));
  return [...paths].sort((a, b) => score(b) - score(a) || (a < b ? -1 : a > b ? 1 : 0));
}

/** Dice coefficient of character bigrams, case-insensitive. */
export function similarity(a: string, b: string): number {
  const grams = (s: string) => {
    const t = s.toLowerCase().replace(/\s+/g, " ").trim();
    const out = new Map<string, number>();
    for (let i = 0; i < t.length - 1; i++) out.set(t.slice(i, i + 2), (out.get(t.slice(i, i + 2)) ?? 0) + 1);
    return out;
  };
  const x = grams(a);
  const y = grams(b);
  let both = 0;
  for (const [g, n] of x) both += Math.min(n, y.get(g) ?? 0);
  const total = [...x.values()].reduce((s, n) => s + n, 0) + [...y.values()].reduce((s, n) => s + n, 0);
  return total === 0 ? (a.toLowerCase() === b.toLowerCase() ? 1 : 0) : (2 * both) / total;
}

/** The body under "blueprint_book", or undefined if the value is not a book. */
export function bookBody(value: unknown): Record<string, unknown> | undefined {
  if (!isObject(value)) return undefined;
  const body = value["blueprint_book"];
  return isObject(body) ? body : undefined;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
