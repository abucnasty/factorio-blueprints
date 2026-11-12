/**
 * Public blueprint links, served from R2. Read-only: everything it serves is
 * produced in CI by _tools/ci/catalog.ts; the Worker encodes nothing.
 *
 *   GET /index.json                      the catalog index
 *   GET /<path>.txt                      latest blueprint string
 *   GET /<path>@<sha>.txt                string as of a commit that changed it
 *                                        (full SHA or unique prefix of 7+)
 *   GET /<path>/renders/<n>.<ext>        preview image, from the LFS bucket
 *
 * A path listed in some blueprint's previous_paths redirects (301) to the
 * same request on its current path.
 */

import type { CatalogEntry, CatalogIndex } from "../../ci/catalog-index.ts";

export interface Env {
  /** factorio-blueprints-catalog: index.json and strings/<path>/<sha>.txt */
  CATALOG: R2Bucket;
  /** factorio-blueprints-lfs: render images by LFS object id */
  LFS: R2Bucket;
}

const INDEX_KEY = "index.json";
/** How long an isolate trusts its parsed index before asking R2 if it changed. */
const INDEX_TTL_MS = 5_000;

const CACHE_SHORT = "public, max-age=60";
const CACHE_IMMUTABLE = "public, max-age=31536000, immutable";
const CACHE_PREFIX = "public, max-age=86400";
const CACHE_REDIRECT = "public, max-age=3600";

const TEXT = "text/plain; charset=utf-8";
const JSON_TYPE = "application/json; charset=utf-8";
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
  "Links look like /<path>.txt, /<path>@<commit>.txt, /<path>/renders/<n>.jpg; every blueprint is listed in /index.json.";

interface LoadedIndex {
  etag: string;
  checkedAt: number;
  byPath: Map<string, CatalogEntry>;
  /** previous path -> current path */
  moved: Map<string, string>;
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
    for (const e of index.blueprints) {
      byPath.set(e.path, e);
      for (const p of e.previous_paths) moved.set(p, e.path);
    }
    return (cached = { etag: obj.etag, checkedAt: now(), byPath, moved });
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
    let path: string;
    try {
      path = decodeURIComponent(url.pathname.slice(1));
    } catch {
      return notFound(`Not found. ${USAGE}`);
    }

    if (path === INDEX_KEY) {
      return (await serveObject(env.CATALOG, INDEX_KEY, request, JSON_TYPE, CACHE_SHORT)) ?? unavailable();
    }

    const render = /^(.+)\/renders\/([^/]+)$/.exec(path);
    const str = render ? null : /^([^@]+?)(?:@([^@/]*))?\.txt$/.exec(path);
    if (!render && !str) return notFound(`Not found. ${USAGE}`);

    const index = await loadIndex(env.CATALOG);
    if (!index) return unavailable();
    const bpPath = (render ?? str)![1]!;
    const entry = index.byPath.get(bpPath);
    if (!entry) {
      const to = index.moved.get(bpPath);
      if (to === undefined) return notFound(`No blueprint at "${bpPath}". ${USAGE}`);
      const rest = render ? `/renders/${render[2]}` : `${str![2] !== undefined ? "@" + str![2] : ""}.txt`;
      const location = new URL("/" + encodePath(to) + encodePath(rest) + url.search, url);
      return new Response(null, {
        status: 301,
        headers: { ...BASE_HEADERS, Location: location.href, "Cache-Control": CACHE_REDIRECT },
      });
    }

    if (render) {
      const file = render[2]!;
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

    // A blueprint string.
    const ref = str![2];
    let sha = entry.commit;
    let cache = CACHE_SHORT;
    if (ref !== undefined) {
      const prefix = ref.toLowerCase();
      if (!/^[0-9a-f]{7,40}$/.test(prefix)) {
        return notFound(`"${ref}" is not a commit SHA (use the full SHA or at least its first 7 characters).`);
      }
      const matches = entry.history.filter((h) => h.sha.startsWith(prefix));
      if (matches.length === 0) {
        return notFound(
          `"${entry.path}" has no version "${ref}". Its versions are the commits that changed its blueprint.json, listed in /index.json.`,
        );
      }
      if (matches.length > 1) {
        return notFound(
          `"${ref}" matches ${matches.length} versions of "${entry.path}" (${matches.map((m) => m.sha).join(", ")}); use a longer prefix.`,
        );
      }
      sha = matches[0]!.sha;
      cache = prefix.length === 40 ? CACHE_IMMUTABLE : CACHE_PREFIX;
    }
    return (
      (await serveObject(env.CATALOG, `strings/${entry.path}/${sha}.txt`, request, TEXT, cache, {
        "X-Blueprint-Commit": sha,
      })) ?? unavailable(`The string for "${entry.path}" at ${sha} is not published yet.`)
    );
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
