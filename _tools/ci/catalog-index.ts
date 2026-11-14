// The catalog index: index.json in the factorio-blueprints-catalog R2
// bucket, served at https://blueprints.abucnasty.dev/index.json. Built by
// build-catalog.ts, read by the link Worker and the owner's website.
// Types only and self-contained, so the Worker can import it without
// pulling in the core.
//
// R2 keys in factorio-blueprints-catalog:
//   index.json                         this file
//   strings/<path>/<sha>.txt           the blueprint string of <path> at the
//                                      version whose commit is <sha>, for
//                                      every version in its history
//   strings/<path>/<sha>/<slot>.txt    the string of one entry of a book at
//                                      that version (slot path such as
//                                      "3/1"), for every version marked
//                                      `entries`
//
// Slot path: the slot numbers from the root book down to an entry, each
// the entry's `index`, or its position in `blueprints` when it has none.

export interface CatalogIndex {
  /**
   * Bumped on any change a reader must know about. 3: versions are the ones
   * recorded in each blueprint's versions.json, named by `label` (links are
   * <path>@<label>.txt, no longer @<sha>), with a content `hash`; `subject`
   * is the label. 2 added nodes, cover, entry strings
   * (CatalogVersion.entries) and nested render paths; a schema 1 index has
   * none of those and renders with a number `n`. (status was added within
   * schema 2: an entry without one is public, or deprecated when
   * `deprecated` is true.)
   */
  schema: 3;
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
  /** The current version's label (history[0].label, from the ledger); always present once built in schema 3. */
  version?: string;
  posted?: string;
  video?: string;
  factoriobin?: string;
  /**
   * The note's status. public: listed; deprecated: listed behind a "Show
   * deprecated" switch; unlisted: served and opened by its address, but
   * not listed or found by search. Drafts are not in the index: a draft
   * that was published before keeps its live entry, with that status
   * (history and all).
   */
  status: "public" | "deprecated" | "unlisted";
  /** status === "deprecated", for readers from before status. */
  deprecated: boolean;
  /** Old folder paths; the Worker redirects them here (versions are not followed across them). */
  previous_paths: string[];

  /** The current blueprint.json (for a root book, its assembled tree), as the core's describeBlueprint sees it. */
  blueprint: CatalogBlueprint;

  /** The current version's commit; history[0].sha. */
  commit: string;
  /**
   * The versions recorded in the folder's versions.json, newest first. The
   * current one is the folder's content. Labels are the ledger's: a new
   * `version` in the note for the same content renames the current version
   * once the plugin records that.
   */
  history: CatalogVersion[];
  /** Every image file under renders/ (for a root book, each leaf's renders/0.jpg as <slot path>.jpg), sorted by file path. */
  renders: CatalogRender[];
  /** The book's entries, by slot ascending; absent for a single blueprint or planner. */
  nodes?: CatalogNode[];
  /** Render file used as the cover (/<path>/cover.jpg): the first blueprint with an image, depth first. */
  cover?: string;
  /**
   * Present (true) when the folder's current files are invalid, or hold a
   * change that is not a recorded version (changed without a new
   * `version`): this is the last entry published, carried over unchanged,
   * and its links serve that version until the folder is fixed or the
   * change is recorded.
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
  /** The version's name, the note's `version` when it was recorded; unique per blueprint. Links: <path>@<label>.txt. */
  label: string;
  /** Content hash: the render tool's blueprintHash of the blueprint value (for a root book, the assembled book). */
  hash: string;
  /** Full SHA of the commit that introduced this content (the R2 keys use it). */
  sha: string;
  /** That commit's author date, ISO 8601 with offset, UTC written as "Z". Order is the ledger's, not re-sorted by date. */
  date: string;
  /** The label again, for readers from before labels (it was the commit's subject line). */
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
