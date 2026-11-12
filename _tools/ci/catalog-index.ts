// The catalog index: index.json in the factorio-blueprints-catalog R2
// bucket, served at https://blueprints.abucnasty.dev/index.json. Built by
// build-catalog.ts, read by the link Worker and the owner's website.
// Types only and self-contained, so the Worker can import it without
// pulling in the core.
//
// R2 keys in factorio-blueprints-catalog:
//   index.json                  this file
//   strings/<path>/<sha>.txt    the blueprint string of <path> as of <sha>,
//                               for every sha in that entry's history

export interface CatalogIndex {
  /** Bumped on any change a reader must know about. */
  schema: 1;
  /** When the index was built, ISO 8601. */
  generatedAt: string;
  /** The repo commit it was built from (full SHA). */
  commit: string;
  /** Every blueprint folder, sorted by path. */
  blueprints: CatalogEntry[];
}

export interface CatalogEntry {
  /** Blueprint folder path from the repo root, e.g. "megabasing/modules/lead-follower-furnaces". */
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

  /** The current blueprint.json, as the core's describeBlueprint sees it. */
  blueprint: CatalogBlueprint;

  /** Full SHA of the last commit that changed blueprint.json; history[0].sha. */
  commit: string;
  /** Commits that changed blueprint.json (at this path or a previous one), newest first. */
  history: CatalogVersion[];
  /** renders/<n>.<ext>, sorted by n. */
  renders: CatalogRender[];
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
  /** Committer date, ISO 8601 with offset. */
  date: string;
  /** First line of the commit message. */
  subject: string;
}

export interface CatalogRender {
  n: number;
  /** File name in renders/, e.g. "0.jpg". */
  file: string;
  /** Git LFS object id (SHA-256 hex); the object is at <oid[0:2]>/<oid[2:4]>/<oid> in factorio-blueprints-lfs. */
  oid: string;
  size: number;
}
