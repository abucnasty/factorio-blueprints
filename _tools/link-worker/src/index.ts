/**
 * Public vault links on vault.abucnasty.dev, served from R2. Read-only:
 * everything it serves is produced in CI by _tools/ci/catalog.ts; the
 * Worker encodes nothing. URLs mirror the vault: blueprints are under
 * /blueprints/, blog posts under /blog/ (other top-level folders are not
 * served).
 *
 *   GET /index.json                                 the catalog index
 *   GET /blueprints/<path>.txt                      latest blueprint string
 *   GET /blueprints/<path>@<version>.txt            string of a recorded version,
 *                                                   by its label (URL-encoded as needed)
 *   GET /blueprints/<path>/<slot>[/<slot>...].txt   one entry of a book, latest
 *   GET /blueprints/<path>/<slot>/...@<version>.txt one entry of a book at a version
 *   GET /blueprints/<path>/renders/<file path>      preview image, from the LFS bucket
 *   GET /blueprints/<path>/cover.jpg                the index's cover render
 *   GET /blog/index.json                            the blog index (published posts)
 *   GET /blog/<slug>/index.md                       a post's markdown, frontmatter removed
 *   GET /blog/<slug>/<file path>                    a file of the post folder (images...)
 *
 * Blog objects are served only for posts in the blog index, and files only
 * as it lists them, so a post that is a draft again (or deleted) is
 * offline although its objects stay in R2.
 *
 * <path> is the index's path (relative to blueprints/): the longest
 * blueprint folder that prefixes the request (folders never nest, so there
 * is one); what follows it is a slot path. A path listed in some
 * blueprint's previous_paths redirects (301) to the same request on its
 * current path. A schema 1 index (before the first schema 2 publish) has
 * root strings and renders only: entry links answer 503.
 *
 * The old host, blueprints.abucnasty.dev, served the same at the root
 * (/<path>.txt and so on); it now redirects there (see LEGACY_HOST).
 */

import { blogFileType, type BlogIndex, type BlogPost } from "../../ci/blog-index.ts";
import type { CatalogEntry, CatalogIndex, CatalogNode } from "../../ci/catalog-index.ts";

export interface Env {
  /** factorio-blueprints-catalog: index.json and blueprints/<path>/<commit>.txt (strings/... before 2026-11-14) */
  CATALOG: R2Bucket;
  /** factorio-blueprints-lfs: render images by LFS object id */
  LFS: R2Bucket;
}

const INDEX_KEY = "index.json";
/** The vault folder, URL prefix and R2 key prefix of blog posts. */
const BLOG = "blog";
const BLOG_INDEX_KEY = `${BLOG}/index.json`;
/** A post's markdown, next to its files. */
const BLOG_BODY = "index.md";
/** The vault folder, URL prefix and R2 key prefix of blueprints. */
const BLUEPRINTS = "blueprints";
/** Where strings were stored before they moved under blueprints/ on 2026-11-14; never rewritten, so still read. */
const LEGACY_STRINGS = "strings";

/** The host this Worker serves. */
export const HOST = "vault.abucnasty.dev";
/**
 * Compatibility host, added 2026-11-14 when the vault moved to HOST: the
 * old links (/<path>.txt, /<path>@<label>.txt, images, /index.json) answer
 * with a 301 to the same thing on HOST. Readers use fetch with CORS or
 * plain image and link loads, which follow it; the redirect carries the
 * CORS headers and preflights are answered here. Remove this, with its
 * route in wrangler.toml, a few weeks after the site uses HOST.
 */
const LEGACY_HOST = "blueprints.abucnasty.dev";
/** How long an isolate trusts its parsed index before asking R2 if it changed. */
const INDEX_TTL_MS = 5_000;

const CACHE_SHORT = "public, max-age=60";
const CACHE_IMMUTABLE = "public, max-age=31536000, immutable";
const CACHE_VERSION = "public, max-age=86400";
const CACHE_REDIRECT = "public, max-age=3600";
/** Post files (images): their URL is not content-addressed, unless it carries ?v=<blob> from the blog index. */
const CACHE_BLOG_FILE = "public, max-age=86400";

const TEXT = "text/plain; charset=utf-8";
const JSON_TYPE = "application/json; charset=utf-8";
const MARKDOWN = "text/markdown; charset=utf-8";
/** Post files are the author's own, but an SVG or HTML one must not run script on this origin. */
const BLOG_FILE_CSP = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox";
const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const BASE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "ETag, X-Blueprint-Commit",
  "X-Content-Type-Options": "nosniff",
};

const USAGE =
  "Links look like /blueprints/<path>.txt, /blueprints/<path>@<version>.txt, /blueprints/<path>/<slot>.txt, /blueprints/<path>/cover.jpg, /blueprints/<path>/renders/<file>; every blueprint is listed in /index.json.";
const BLOG_USAGE = "Blog links look like /blog/<slug>/index.md and /blog/<slug>/<file>; every published post is listed in /blog/index.json.";
const SLOT = /^(0|[1-9][0-9]*)$/;

interface LoadedIndex {
  etag: string;
  checkedAt: number;
  byPath: Map<string, CatalogEntry>;
  /** previous path -> current path */
  moved: Map<string, string>;
  /** Slot paths of each folder's latest version. */
  slots: Map<string, Set<string>>;
}

type Found = { entry: CatalogEntry; to?: undefined } | { entry?: undefined; to: string };

function addSlots(nodes: CatalogNode[] | undefined, into: Set<string>): Set<string> {
  for (const n of nodes ?? []) {
    into.add(n.path);
    addSlots(n.children, into);
  }
  return into;
}

/** Same layout as the LFS Worker's r2Key. */
function lfsKey(oid: string): string {
  return `${oid.slice(0, 2)}/${oid.slice(2, 4)}/${oid}`;
}

export function createHandler(now: () => number = Date.now) {
  let cached: LoadedIndex | undefined;

  async function loadIndex(bucket: R2Bucket): Promise<LoadedIndex | undefined> {
    if (cached && now() - cached.checkedAt < INDEX_TTL_MS) return cached;
    const obj = await bucket.get(INDEX_KEY, cached ? { onlyIf: { etagDoesNotMatch: cached.etag } } : undefined);
    if (obj === null) return (cached = undefined);
    if (!("body" in obj)) {
      // Unchanged since we parsed it.
      cached!.checkedAt = now();
      return cached;
    }
    const index = (await obj.json()) as CatalogIndex;
    const byPath = new Map<string, CatalogEntry>();
    const moved = new Map<string, string>();
    const slots = new Map<string, Set<string>>();
    for (const e of index.blueprints) {
      byPath.set(e.path, e);
      slots.set(e.path, addSlots(e.nodes, new Set()));
      for (const p of e.previous_paths) moved.set(p, e.path);
    }
    return (cached = { etag: obj.etag, checkedAt: now(), byPath, moved, slots });
  }

  let blogCached: { etag: string; checkedAt: number; bySlug: Map<string, BlogPost> } | undefined;

  /** The blog index by slug, cached like the catalog index; undefined while there is none. */
  async function loadBlog(bucket: R2Bucket): Promise<Map<string, BlogPost> | undefined> {
    if (blogCached && now() - blogCached.checkedAt < INDEX_TTL_MS) return blogCached.bySlug;
    const obj = await bucket.get(BLOG_INDEX_KEY, blogCached ? { onlyIf: { etagDoesNotMatch: blogCached.etag } } : undefined);
    if (obj === null) return (blogCached = undefined);
    if (!("body" in obj)) {
      blogCached!.checkedAt = now();
      return blogCached!.bySlug;
    }
    const index = (await obj.json()) as BlogIndex;
    blogCached = { etag: obj.etag, checkedAt: now(), bySlug: new Map(index.posts.map((p) => [p.slug, p])) };
    return blogCached.bySlug;
  }

  /** /blog/...: `path` is what follows "blog/". */
  async function blogRoute(path: string, url: URL, request: Request, env: Env): Promise<Response> {
    if (path === "index.json") {
      return (await serveObject(env.CATALOG, BLOG_INDEX_KEY, request, JSON_TYPE, CACHE_SHORT)) ?? unavailable("The blog is not published yet.");
    }
    const slash = path.indexOf("/");
    const slug = slash === -1 ? path : path.slice(0, slash);
    const file = slash === -1 ? "" : path.slice(slash + 1);
    const posts = await loadBlog(env.CATALOG);
    if (!posts) return unavailable("The blog is not published yet.");
    const post = posts.get(slug);
    if (!post) return notFound(`No blog post "${slug}". ${BLOG_USAGE}`);
    if (file === BLOG_BODY) {
      return (
        (await serveObject(env.CATALOG, `${BLOG}/${slug}/${BLOG_BODY}`, request, MARKDOWN, CACHE_SHORT)) ??
        unavailable(`The markdown of "${slug}" is missing from storage.`)
      );
    }
    const f = post.files.find((x) => x.path === file);
    if (!f) return notFound(`The post "${slug}" has no file "${file}". ${BLOG_USAGE}`);
    const cache = url.searchParams.get("v") === f.blob ? CACHE_IMMUTABLE : CACHE_BLOG_FILE;
    const extra = { "Content-Security-Policy": BLOG_FILE_CSP };
    const type = blogFileType(f.path);
    return (
      (f.oid !== undefined
        ? await serveObject(env.LFS, lfsKey(f.oid), request, type, cache, extra)
        : await serveObject(env.CATALOG, `${BLOG}/${slug}/${f.path}`, request, type, cache, extra)) ??
      unavailable(`The file "${f.path}" of "${slug}" is missing from storage.`)
    );
  }

  async function route(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...BASE_HEADERS,
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") ?? "*",
          "Access-Control-Max-Age": "86400",
        },
      });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return textResponse(405, `Method ${request.method} is not allowed; this site is read-only.`, {
        Allow: "GET, HEAD, OPTIONS",
      });
    }

    const url = new URL(request.url);
    if (url.hostname === LEGACY_HOST) return legacyRedirect(url);
    let path: string;
    try {
      path = decodeURIComponent(url.pathname.slice(1));
    } catch {
      return notFound(`Not found. ${USAGE}`);
    }

    if (path === INDEX_KEY) {
      return (await serveObject(env.CATALOG, INDEX_KEY, request, JSON_TYPE, CACHE_SHORT)) ?? unavailable();
    }
    if (path.startsWith(BLOG + "/") && path.length > BLOG.length + 1) return blogRoute(path.slice(BLOG.length + 1), url, request, env);
    if (!path.startsWith(BLUEPRINTS + "/")) return notFound(`Not found. ${USAGE} ${BLOG_USAGE}`);
    path = path.slice(BLUEPRINTS.length + 1);

    const index = await loadIndex(env.CATALOG);
    if (!index) return unavailable();
    const find = (folder: string): Found | undefined => {
      const entry = index.byPath.get(folder);
      if (entry) return { entry };
      const to = index.moved.get(folder);
      return to === undefined ? undefined : { to };
    };
    const segs = path.split("/");

    // Work out the form and the blueprint folder it is under.
    let folder: string | undefined;
    let found: Found | undefined;
    let form: { kind: "render"; file: string } | { kind: "cover" } | { kind: "string"; slot: string; ref?: string } | undefined;
    for (let i = segs.length - 2; i >= 1 && !found; i--) {
      if (segs[i] !== "renders") continue;
      folder = segs.slice(0, i).join("/");
      found = find(folder);
      if (found) form = { kind: "render", file: segs.slice(i + 1).join("/") };
    }
    if (!found && segs.length > 1 && segs[segs.length - 1] === "cover.jpg") {
      folder = segs.slice(0, -1).join("/");
      found = find(folder);
      if (found) form = { kind: "cover" };
    }
    // The version label is everything after the first "@" (it may hold another "@", never a "/").
    const txt = !found ? /^([^@/]+)(?:@([^/]*))?\.txt$/.exec(segs[segs.length - 1]!) : null;
    if (txt) {
      const parts = [...segs.slice(0, -1), txt[1]!];
      // The longest folder followed only by slot numbers.
      for (let k = parts.length; k >= 1 && !found; k--) {
        if (k < parts.length && !SLOT.test(parts[k]!)) break;
        folder = parts.slice(0, k).join("/");
        found = find(folder);
        if (found) form = { kind: "string", slot: parts.slice(k).join("/"), ...(txt[2] !== undefined ? { ref: txt[2] } : {}) };
      }
    }
    if (!found || !form || folder === undefined) {
      const shown = txt ? [...segs.slice(0, -1), txt[1]!].join("/") : path;
      const what = txt || /\/(renders\/|cover\.jpg$)/.test(path) ? `No blueprint at "${shown}". ` : "Not found. ";
      return notFound(what + USAGE);
    }

    if (found.to !== undefined) {
      const location = new URL(`/${BLUEPRINTS}/` + encodePath(found.to + path.slice(folder.length)) + url.search, url);
      return new Response(null, {
        status: 301,
        headers: { ...BASE_HEADERS, Location: location.href, "Cache-Control": CACHE_REDIRECT },
      });
    }
    const entry = found.entry;

    if (form.kind !== "string") {
      const file = form.kind === "cover" ? entry.cover : form.file;
      if (file === undefined) return notFound(`"${entry.path}" has no render images, so no cover.`);
      const r = entry.renders.find((x) => x.file === file);
      if (!r) return notFound(`"${entry.path}" has no render "${file}".`);
      const type = IMAGE_TYPES[file.slice(file.lastIndexOf(".") + 1)] ?? "application/octet-stream";
      // The URL is not content-addressed; ?v=<oid> (from index.json) makes it so.
      const cache = url.searchParams.get("v") === r.oid ? CACHE_IMMUTABLE : CACHE_SHORT;
      return (
        (await serveObject(env.LFS, lfsKey(r.oid), request, type, cache)) ??
        unavailable(`The image for "${entry.path}/renders/${file}" is missing from storage.`)
      );
    }

    // A blueprint string: the whole thing, or one entry of a book.
    const { slot, ref } = form;
    let sha = entry.commit;
    let cache = CACHE_SHORT;
    if (ref !== undefined) {
      const version = entry.history.find((h) => h.label === ref);
      if (version === undefined) {
        const labels = entry.history.map((h) => h.label).filter((l) => l !== undefined);
        return notFound(
          `"${entry.path}" has no version "${ref}". ${labels.length > 0 ? `Its versions are ${labels.map((l) => `"${l}"`).join(", ")}.` : "It has no named versions yet."}`,
        );
      }
      sha = version.sha;
      // A label names one content for good, but the latest one can be renamed: cache it for a day, not forever.
      cache = CACHE_VERSION;
    }
    const headers = { "X-Blueprint-Commit": sha };
    const serveString = (name: string) => serveStringObject(env.CATALOG, `${entry.path}/${name}.txt`, request, cache, headers);
    if (slot === "") {
      return (await serveString(sha)) ?? unavailable(`The string for "${entry.path}" at ${sha} is not published yet.`);
    }

    if (entry.history.find((h) => h.sha === sha)?.entries !== true) {
      return unavailable(
        `Links to single entries of "${entry.path}" are not published yet for ${sha}; the whole thing is at /${BLUEPRINTS}/${encodePath(entry.path)}.txt.`,
      );
    }
    if (ref === undefined && !index.slots.get(entry.path)?.has(slot)) {
      return notFound(
        index.slots.get(entry.path)!.size === 0
          ? `"${entry.path}" is not a book, so it has no entry ${slot}.`
          : `"${entry.path}" has no entry at slot ${slot} in its latest version.`,
      );
    }
    const res = await serveString(`${sha}/${slot}`);
    if (res) return res;
    return ref === undefined
      ? unavailable(`The string for "${entry.path}" slot ${slot} at ${sha} is not published yet.`)
      : notFound(`"${entry.path}" has no entry at slot ${slot} in version "${ref}".`);
  }

  return async function handle(request: Request, env: Env): Promise<Response> {
    const response = await route(request, env);
    if (request.method === "HEAD" && response.body) {
      await response.body.cancel();
      return new Response(null, response);
    }
    return response;
  };
}

/**
 * A blueprint string, `<path>/<sha>[/<slot>].txt`: stored under blueprints/
 * since 2026-11-14, under strings/ before; the old objects are kept, so a
 * missing blueprints/ key is looked up there. Null if neither exists.
 */
async function serveStringObject(
  bucket: R2Bucket,
  name: string,
  request: Request,
  cacheControl: string,
  extra: Record<string, string>,
): Promise<Response | null> {
  return (
    (await serveObject(bucket, `${BLUEPRINTS}/${name}`, request, TEXT, cacheControl, extra)) ??
    (await serveObject(bucket, `${LEGACY_STRINGS}/${name}`, request, TEXT, cacheControl, extra))
  );
}

/** The same request on HOST: /index.json stays, anything else moves under /blueprints/ (path still encoded, query kept). */
function legacyRedirect(url: URL): Response {
  const target = new URL(url.pathname === `/${INDEX_KEY}` ? url.pathname : `/${BLUEPRINTS}${url.pathname}`, `https://${HOST}`);
  target.search = url.search;
  return new Response(null, {
    status: 301,
    headers: { ...BASE_HEADERS, Location: target.href, "Cache-Control": CACHE_REDIRECT },
  });
}

/** Stream an R2 object with conditional GET support; null if it does not exist. */
async function serveObject(
  bucket: R2Bucket,
  key: string,
  request: Request,
  contentType: string,
  cacheControl: string,
  extra: Record<string, string> = {},
): Promise<Response | null> {
  const tags = (request.headers.get("If-None-Match") ?? "")
    .split(",")
    .map((t) => t.trim().replace(/^W\//, "").replace(/^"(.*)"$/, "$1"))
    .filter((t) => t !== "");
  const obj =
    request.method === "HEAD"
      ? await bucket.head(key)
      : await bucket.get(key, tags.length > 0 && tags[0] !== "*" ? { onlyIf: { etagDoesNotMatch: tags[0]! } } : undefined);
  if (obj === null) return null;
  const headers = {
    ...BASE_HEADERS,
    "Content-Type": contentType,
    "Cache-Control": cacheControl,
    ETag: obj.httpEtag,
    ...extra,
  };
  const body = "body" in obj ? (obj as R2ObjectBody).body : null;
  if (tags.includes("*") || tags.includes(obj.etag) || (request.method === "GET" && body === null)) {
    await body?.cancel();
    return new Response(null, { status: 304, headers });
  }
  if (request.method === "HEAD") return new Response(null, { headers: { ...headers, "Content-Length": String(obj.size) } });
  return new Response(body, { headers });
}

function textResponse(status: number, message: string, extra: Record<string, string> = {}): Response {
  return new Response(message + "\n", {
    status,
    headers: { ...BASE_HEADERS, "Content-Type": TEXT, "Cache-Control": "no-store", ...extra },
  });
}

function notFound(message: string): Response {
  return textResponse(404, message);
}

function unavailable(message = "The catalog is not published yet."): Response {
  return textResponse(503, message, { "Retry-After": "60" });
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((s) => encodeURIComponent(s).replace(/%40/g, "@"))
    .join("/");
}

const handle = createHandler();

export default {
  fetch: (request, env) => handle(request, env),
} satisfies ExportedHandler<Env>;
