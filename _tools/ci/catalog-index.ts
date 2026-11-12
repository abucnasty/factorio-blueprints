// The catalog index: index.json in the factorio-blueprints-catalog R2
// bucket, served at https://blueprints.abucnasty.dev/index.json. Built by
// build-catalog.ts, read by the link Worker and the owner's website.
// Types only and self-contained, so the Worker can import it without
// pulling in the core.
//
// R2 keys in factorio-blueprints-catalog:
//   index.json                         this file
//   strings/<path>/<sha>.txt           the blueprint string of <path> as of
//                                      <sha>, for every sha in its history
//   strings/<path>/<sha>/<slot>.txt    the string of one entry of a book as
//                                      of <sha> (slot path such as "3/1"),
//                                      for every version marked `entries`
//
// Slot path: the slot numbers from the root book down to an entry, each
// the entry's `index`, or its position in `blueprints` when it has none.

export interface CatalogIndex {
  /**
   * Bumped on any change a reader must know about. 2 added nodes, cover,
   * entry strings (CatalogVersion.entries) and nested render paths; a
   * schema 1 index has none of those and renders with a number `n`.
   */
  schema: 2;
  /** When the index was built, ISO 8601. */
  generatedAt: string;
  /** The repo commit it was built from (full SHA). */
  commit: string;
  /** Every blueprint folder and root book (an expanded book not inside another), sorted by path. */
  blueprints: CatalogEntry[];
}

export interface CatalogEntry {
  /** Blueprint folder or root book path from the repo root, e.g. "megabasing/modules/lead-follower-furnaces". */
  path: string;

  // README.md frontmatter, normalized by the core's readNotesMeta; unknown keys are dropped.
  title: string;
  authors: string[];
  version?: string;
  posted?: string;
  video?: string;
  factoriobin?: string;
  deprecated: boolean;
  /** Old folder paths; the Worker redirects them here. */
  previous_paths: string[];

  /** The current blueprint.json (for a root book, its assembled tree), as the core's describeBlueprint sees it. */
  blueprint: CatalogBlueprint;

  /** Full SHA of the last commit that changed the blueprint; history[0].sha. */
  commit: string;
  /**
   * Commits that changed blueprint.json at this path or a previous one, or
   * (for a root book) any book.json or blueprint.json under it, newest first.
   */
  history: CatalogVersion[];
  /** Every image file under renders/ (for a root book, each leaf's renders/0.jpg as <slot path>.jpg), sorted by file path. */
  renders: CatalogRender[];
  /** The book's entries, by slot ascending; absent for a single blueprint or planner. */
  nodes?: CatalogNode[];
  /** Render file used as the cover (/<path>/cover.jpg): the first blueprint with an image, depth first. */
  cover?: string;
  /**
   * Present (true) when the folder's current files are invalid: this is the
   * last valid entry published, carried over unchanged, and its links serve
   * that version until the files are fixed.
   */
  stale?: true;
}

/** Same shape as the core's BlueprintDescription (build-catalog.ts assigns one to the other, so tsc catches drift). */
export interface CatalogBlueprint {
  kind: "blueprint" | "blueprint-book" | "upgrade-planner" | "deconstruction-planner";
  label?: string;
  description?: string;
  /** Factorio version that saved it, e.g. "2.0.76". */
  factorioVersion?: string;
  counts: {
    blueprints: number;
    books: number;
    upgradePlanners: number;
    deconstructionPlanners: number;
    entities: number;
    tiles: number;
  };
}

export interface CatalogVersion {
  sha: string;
  /** Author date, ISO 8601 with offset, UTC written as "Z" (the import back-dates it to when the blueprint was posted). Order is git log's, not re-sorted by date. */
  date: string;
  /** First line of the commit message. */
  subject: string;
  /**
   * True once the strings of this version's book entries
   * (strings/<path>/<sha>/<slot>.txt) are published; a version without it
   * (any version in a schema 1 index) has only its root string. Set for
   * single blueprints too, which have no entries.
   */
  entries?: true;
}

export interface CatalogNode {
  /** Slot number in its book. */
  slot: number;
  /** Slot path from the root, e.g. "3/1". */
  path: string;
  kind: CatalogBlueprint["kind"];
  /** Plain-text label (rich text turned into words); may be empty. */
  label: string;
  /** Render file under renders/ (e.g. "3/1.jpg"), blueprints with an image only. */
  render?: string;
  /** Repo path of the entry's own folder, for entries of a root book (expanded book). */
  folder?: string;
  /** Entries of a nested book. */
  children?: CatalogNode[];
}

export interface CatalogRender {
  /** File path under renders/: "<slot path>.<ext>", e.g. "3/1.jpg"; "0.jpg" for a single blueprint. */
  file: string;
  /** Git LFS object id (SHA-256 hex); the object is at <oid[0:2]>/<oid[2:4]>/<oid> in factorio-blueprints-lfs. */
  oid: string;
  size: number;
  /** Pixel size, from the render tool's renders/render.json; absent when it does not record this image. */
  width?: number;
  height?: number;
}
