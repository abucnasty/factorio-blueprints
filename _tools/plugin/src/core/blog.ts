// Blog posts, per _tools/docs/conventions.md ("Blog posts"): the vault's
// blog/ folder holds one folder per post, blog/<slug>/README.md (frontmatter
// and the post's markdown) with the post's images and other files beside it.
// The folder name is the slug, and the site address is /blog/<slug>. Blog
// folders are never blueprint folders (only blueprints/ is scanned for
// those). Shared by the plugin and CI (_tools/ci/build-blog.ts).

import { joinPath, NOTES_FILE } from "./blueprint-folder.ts";
import { FrontmatterError, isBlueprintStatus, readFrontmatter, splitFrontmatter } from "./frontmatter.ts";
import type { BlueprintStatus } from "./frontmatter.ts";

/** The vault folder that holds the blog posts. */
export const BLOG_ROOT = "blog";
/**
 * The name the post's markdown (README.md without its frontmatter) is
 * published under, next to the post's files; so no file at the top of a post
 * folder may have this name.
 */
export const BLOG_BODY_FILE = "index.md";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** A post folder name: lowercase letters and digits in words joined by single hyphens. */
export function isBlogSlug(slug: string): boolean {
  return SLUG.test(slug);
}

/**
 * The post folder a vault path is in: "blog/<name>/..." gives "<name>";
 * anything else, and a name starting with "_" or "." (kept out of the
 * blog), gives undefined. The name is not checked against isBlogSlug.
 */
export function blogPostFolderName(path: string): string | undefined {
  const segs = joinPath(path).split("/");
  if (segs.length < 2 || segs[0] !== BLOG_ROOT || /^[_.]/.test(segs[1]!)) return undefined;
  return segs[1]!;
}

/** The vault path of a post's note. */
export function blogNotePath(slug: string): string {
  return joinPath(BLOG_ROOT, slug, NOTES_FILE);
}

/** A post's frontmatter, normalized. */
export interface BlogPostMeta {
  /** None in the note means draft. Published: any status but draft (as for blueprints). */
  status: BlueprintStatus;
  title: string;
  /** As written: YYYY-MM-DD, or an ISO 8601 date and time. */
  date: string;
  description: string;
  tags: string[];
}

export interface BlogPostRead {
  /** Undefined when the frontmatter cannot be read, or a published post's fields are not valid. */
  meta: BlogPostMeta | undefined;
  /** The status, when it can be read (also for an invalid post). */
  status: BlueprintStatus | undefined;
  /** The markdown after the frontmatter, leading blank lines removed. */
  body: string;
  /** What is wrong, one sentence each; empty when the post is fine. */
  problems: string[];
}

/**
 * Read a post's README.md. A draft only needs a readable frontmatter and
 * status; a published post (public, deprecated or unlisted) also needs a
 * title, an ISO date, a description, and tags as a list of words (it may
 * be empty).
 */
export function readBlogPost(text: string): BlogPostRead {
  const body = splitFrontmatter(text).body.replace(/^(?:[ \t]*\r?\n)+/, "");
  let fm: Record<string, unknown>;
  try {
    fm = readFrontmatter(text);
  } catch (e) {
    if (!(e instanceof FrontmatterError)) throw e;
    return { meta: undefined, status: undefined, body, problems: [e.message] };
  }
  const problems: string[] = [];
  const rawStatus = fm["status"];
  let status: BlueprintStatus | undefined = "draft";
  if (rawStatus != null) {
    status = isBlueprintStatus(rawStatus) ? rawStatus : undefined;
    if (status === undefined) problems.push("status must be draft, public, deprecated or unlisted (none means draft)");
  }
  const str = (key: string) => (typeof fm[key] === "string" ? (fm[key] as string).trim() : "");
  const title = str("title");
  const date = typeof fm["date"] === "string" ? fm["date"].trim() : "";
  const description = str("description");
  const rawTags = fm["tags"] ?? [];
  const tags = Array.isArray(rawTags) ? rawTags.map((t) => (typeof t === "string" ? t.trim() : "")) : [];
  if (status !== "draft") {
    if (title === "") problems.push("frontmatter needs a title");
    if (!isIsoDate(date)) {
      problems.push(
        fm["date"] instanceof Date || typeof fm["date"] === "number"
          ? "date must be written as text, e.g. date: \"2026-05-13\""
          : "frontmatter needs a date, as YYYY-MM-DD (or an ISO 8601 date and time)",
      );
    }
    if (description === "") problems.push("frontmatter needs a description (one line, shown in lists and link previews)");
    if (!Array.isArray(rawTags) || tags.some((t) => t === "")) problems.push("tags must be a list of words, e.g. tags: [performance, ups] (it may be empty: tags: [])");
  }
  const ok = problems.length === 0 && status !== undefined;
  return {
    meta: ok ? { status: status!, title, date, description, tags: [...new Set(tags)] } : undefined,
    status,
    body,
    problems,
  };
}

/** YYYY-MM-DD (optionally with a time) that names a real day. */
export function isIsoDate(s: string): boolean {
  const m = DATE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const day = new Date(Date.UTC(y, mo - 1, d));
  return day.getUTCFullYear() === y && day.getUTCMonth() === mo - 1 && day.getUTCDate() === d && !Number.isNaN(Date.parse(s.replace(" ", "T")));
}
