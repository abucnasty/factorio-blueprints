// The blog index: blog/index.json in the factorio-blueprints-catalog R2
// bucket, served at https://vault.abucnasty.dev/blog/index.json. Built by
// build-blog.ts from the vault's blog/ folder, read by the link Worker and
// the owner's website. Self-contained (no imports), so the Worker can
// import it without pulling in the core. The blueprint catalog
// (catalog-index.ts) is separate and does not list posts.
//
// R2 keys in factorio-blueprints-catalog:
//   blog/index.json            this file
//   blog/<slug>/index.md       the post's README.md without its frontmatter
//   blog/<slug>/<file path>    every other file of the post folder that is
//                              in plain git (a Git LFS file is served from
//                              factorio-blueprints-lfs by its oid instead)
// Only posts in this index are served: objects of a post that left it (a
// draft again, or deleted) stay in the bucket but are not reachable.

export interface BlogIndex {
  /** Bumped on any change a reader must know about. */
  schema: 1;
  /** When the index was built, ISO 8601. */
  generatedAt: string;
  /** The repo commit it was built from (full SHA). */
  commit: string;
  /** Published posts (any status but draft), newest first (by date, then slug). */
  posts: BlogPost[];
}

export interface BlogPost {
  /** The post's folder name under blog/; its site address is /blog/<slug>. */
  slug: string;
  title: string;
  /** As written in the note: YYYY-MM-DD, or an ISO 8601 date and time. */
  date: string;
  description: string;
  /** May be empty. */
  tags: string[];
  /**
   * As for blueprints: public is listed; deprecated is listed and marked
   * outdated; unlisted is served and opens by its address, but is not
   * listed or found by search.
   */
  status: "public" | "deprecated" | "unlisted";
  /** The post folder's files other than README.md, sorted by path. */
  files: BlogFile[];
  /**
   * Present (true) when the post's current files are invalid: this is the
   * last entry published, carried over unchanged, until the post is fixed.
   */
  stale?: true;
}

export interface BlogFile {
  /** Path relative to the post folder, "/"-separated, e.g. "screenshots/a.jpg". */
  path: string;
  /** Bytes. */
  size: number;
  /** Git blob id of the file (of its LFS pointer, for an LFS file); readers may add ?v=<blob> to its URL to cache it for good. */
  blob: string;
  /** Git LFS object id (SHA-256 hex) when the file is stored with LFS: served from factorio-blueprints-lfs, not uploaded. */
  oid?: string;
}

/** Content-Type of a post file, by extension; anything else is application/octet-stream. */
export const BLOG_FILE_TYPES: Record<string, string> = {
  avif: "image/avif",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  pdf: "application/pdf",
  csv: "text/csv; charset=utf-8",
  json: "application/json; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};

export function blogFileType(path: string): string {
  const dot = path.lastIndexOf(".");
  return (dot === -1 ? undefined : BLOG_FILE_TYPES[path.slice(dot + 1).toLowerCase()]) ?? "application/octet-stream";
}
