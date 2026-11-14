// Build and validate the blog index (blog-index.ts) from one commit's
// blog/ folder, and pick the R2 objects a publish writes. Like
// build-catalog.ts it reads the commit's git objects, not the files on
// disk: post files in plain git are read as they are, and a file stored
// with Git LFS is seen as its pointer and served from the LFS bucket by its
// oid, as renders are (nothing is downloaded). The CLI is catalog.ts.
//
// Only published posts (any status but draft, as for blueprints) are in
// the index; drafts never reach R2. A draft needs only a readable status;
// a published post with problems is left out, but one already in the live
// index keeps its last published entry, marked stale.

import {
  BLOG_BODY_FILE,
  BLOG_ROOT,
  blogPostFolderName,
  isBlogSlug,
  NOTES_FILE,
  readBlogPost,
} from "../plugin/src/core/index.ts";
import { blogFileType, type BlogFile, type BlogIndex, type BlogPost } from "./blog-index.ts";
import { Git, LFS_POINTER, type Problem } from "./build-catalog.ts";

export const BLOG_INDEX_KEY = `${BLOG_ROOT}/index.json`;
export const MARKDOWN_TYPE = "text/markdown; charset=utf-8";

export interface Blog {
  index: BlogIndex;
  /** Validation failures (`folder` is the post's slug); a post with any is left out of the index. */
  problems: Problem[];
  /** Post folders with problems, sorted. */
  invalid: string[];
  /** Slugs of the drafts, sorted: not published. */
  drafts: string[];
  /** Each published post's markdown (index.md), by slug. */
  bodies: Map<string, string>;
  /** The content of each published post's plain-git files, by blob id. */
  contents: Map<string, Buffer>;
}

/** One R2 object a publish writes. */
export interface BlogObject {
  key: string;
  contentType: string;
  body: Buffer | string;
}

/** Validate every post folder under blog/ at `commit` and build the index of the published ones. */
export function buildBlog(repo: string, opts: { commit?: string; now?: Date } = {}): Blog {
  const git = new Git(repo);
  const commit = git.resolve(opts.commit ?? "HEAD");
  const prefix = BLOG_ROOT + "/";
  /** slug -> (path inside the post folder -> blob id) */
  const folders = new Map<string, Map<string, string>>();
  for (const [path, blob] of git.tree(commit, BLOG_ROOT)) {
    if (!path.startsWith(prefix)) continue;
    const slug = blogPostFolderName(path);
    const rest = path.slice(prefix.length + (slug?.length ?? 0) + 1);
    // Files directly in blog/, and folders starting with "_" or ".", are not posts.
    if (slug === undefined || !path.startsWith(prefix + slug + "/")) continue;
    // Nor are files or folders inside a post that start with "_" or ".".
    if (rest.split("/").some((s) => /^[_.]/.test(s))) continue;
    let files = folders.get(slug);
    if (!files) folders.set(slug, (files = new Map()));
    files.set(rest, blob);
  }

  const content = git.readBlobs([...folders.values()].flatMap((f) => [...f.values()]));
  const problems: Problem[] = [];
  const drafts: string[] = [];
  const posts: BlogPost[] = [];
  const bodies = new Map<string, string>();
  const contents = new Map<string, Buffer>();

  for (const slug of [...folders.keys()].sort()) {
    const files = folders.get(slug)!;
    const dir = `${BLOG_ROOT}/${slug}`;
    const before = problems.length;
    const problem = (path: string, message: string) => problems.push({ folder: slug, path, message });
    const noteBlob = files.get(NOTES_FILE);
    if (noteBlob === undefined) {
      problem(dir, `has no ${NOTES_FILE}; a post is blog/<slug>/${NOTES_FILE} with its files beside it`);
      continue;
    }
    const notePath = `${dir}/${NOTES_FILE}`;
    const read = readBlogPost(content.get(noteBlob)!.toString("utf8"));
    if (read.status === "draft" && read.problems.length === 0) {
      drafts.push(slug);
      continue;
    }
    for (const p of read.problems) problem(notePath, p);
    if (!isBlogSlug(slug)) {
      problem(dir, "the folder name is the post's address (/blog/<name>): use lowercase letters, digits and single hyphens, e.g. fps-limit-and-ups");
    }
    const list: BlogFile[] = [];
    for (const [path, blob] of [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      if (path === NOTES_FILE) continue;
      if (path === BLOG_BODY_FILE) {
        problem(`${dir}/${path}`, `the post's markdown is published as ${BLOG_BODY_FILE}: rename this file`);
        continue;
      }
      const data = content.get(blob)!;
      const pointer = LFS_POINTER.exec(data.toString("latin1"));
      if (pointer) list.push({ path, size: Number(pointer[2]), blob, oid: pointer[1]! });
      else {
        list.push({ path, size: data.length, blob });
        contents.set(blob, data);
      }
    }
    if (problems.length > before || !read.meta) continue;
    const { status, title, date, description, tags } = read.meta;
    if (status === "draft") continue; // handled above; narrows the type
    posts.push({ slug, title, date, description, tags, status, files: list });
    bodies.set(slug, read.body);
  }

  sortPosts(posts);
  return {
    index: { schema: 1, generatedAt: (opts.now ?? new Date()).toISOString(), commit, posts },
    problems,
    invalid: [...new Set(problems.map((p) => p.folder))].sort(),
    drafts,
    bodies,
    contents,
  };
}

/** Newest first: by date (as written; ISO sorts as text), then slug. */
export function sortPosts(posts: BlogPost[]): BlogPost[] {
  return posts.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/**
 * Keep the live entry of each invalid post that is still in the blog
 * folder, marked stale (its objects are already in R2). A draft or a
 * deleted post is not kept: it goes offline. Returns the slugs kept.
 */
export function carryOverPosts(blog: Blog, live: BlogIndex | undefined): string[] {
  const kept: string[] = [];
  const have = new Set(blog.index.posts.map((p) => p.slug));
  for (const old of live?.posts ?? []) {
    if (have.has(old.slug) || !blog.invalid.includes(old.slug)) continue;
    blog.index.posts.push({ ...old, stale: true });
    kept.push(old.slug);
  }
  sortPosts(blog.index.posts);
  return kept;
}

/**
 * The objects a publish writes, in order: the posts' plain-git files that
 * the live index does not list with the same blob (all of them without
 * `live`), then each post's index.md, then blog/index.json last, so the
 * live index never names an object that is not there. Stale (carried
 * over) posts write nothing.
 */
export function blogObjects(blog: Blog, live: BlogIndex | undefined): BlogObject[] {
  const liveBlobs = new Map((live?.posts ?? []).map((p) => [p.slug, new Map(p.files.map((f) => [f.path, f.blob]))]));
  const files: BlogObject[] = [];
  const bodies: BlogObject[] = [];
  for (const post of blog.index.posts) {
    if (post.stale) continue;
    for (const f of post.files) {
      if (f.oid !== undefined || liveBlobs.get(post.slug)?.get(f.path) === f.blob) continue;
      files.push({ key: `${BLOG_ROOT}/${post.slug}/${f.path}`, contentType: blogFileType(f.path), body: blog.contents.get(f.blob)! });
    }
    bodies.push({ key: `${BLOG_ROOT}/${post.slug}/${BLOG_BODY_FILE}`, contentType: MARKDOWN_TYPE, body: blog.bodies.get(post.slug)! });
  }
  return [...files, ...bodies, { key: BLOG_INDEX_KEY, contentType: "application/json; charset=utf-8", body: JSON.stringify(blog.index) }];
}
