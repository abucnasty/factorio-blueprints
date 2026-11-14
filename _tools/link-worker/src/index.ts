/**
 * Public blueprint links, served from R2. Read-only: everything it serves is
 * produced in CI by _tools/ci/catalog.ts; the Worker encodes nothing.
 *
 *   GET /index.json                      the catalog index
 *   GET /<path>.txt                      latest blueprint string
 *   GET /<path>@<version>.txt            string of a recorded version, by its
 *                                        label (URL-encoded as needed)
 *   GET /<path>/<slot>[/<slot>...].txt   one entry of a book, latest
 *   GET /<path>/<slot>/...@<version>.txt one entry of a book at a version
 *   GET /<path>/renders/<file path>      preview image, from the LFS bucket
 *   GET /<path>/cover.jpg                the index's cover render
 *
 * <path> is the longest blueprint folder that prefixes the request (folders
 * never nest, so there is one); what follows it is a slot path. A path
 * listed in some blueprint's previous_paths redirects (301) to the same
 * request on its current path. A schema 1 index (before the first schema 2
 * publish) has root strings and renders only: entry links answer 503.
 */

import type { CatalogEntry, CatalogIndex, CatalogNode } from "../../ci/catalog-index.ts";

export interface Env {
  /** factorio-blueprints-catalog: index.json and strings/<path>/<commit>.txt */
  CATALOG: R2Bucket;
  /** factorio-blueprints-lfs: render images by LFS object id */
  LFS: R2Bucket;
}

const INDEX_KEY = "index.json";
/** How long an isolate trusts its parsed index before asking R2 if it changed. */
const INDEX_TTL_MS = 5_000;

const CACHE_SHORT = "public, max-age=60";
const CACHE_IMMUTABLE = "public, max-age=31536000, immutable";
const CACHE_VERSION = "public, max-age=86400";
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
  "Links look like /<path>.txt, /<path>@<version>.txt, /<path>/<slot>.txt, /<path>/cover.jpg, /<path>/renders/<file>; every blueprint is listed in /index.json.";
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
      const location = new URL("/" + encodePath(found.to + path.slice(folder.length)) + url.search, url);
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
    if (slot === "") {
      return (
        (await serveObject(env.CATALOG, `strings/${entry.path}/${sha}.txt`, request, TEXT, cache, headers)) ??
        unavailable(`The string for "${entry.path}" at ${sha} is not published yet.`)
      );
    }

    if (entry.history.find((h) => h.sha === sha)?.entries !== true) {
      return unavailable(
        `Links to single entries of "${entry.path}" are not published yet for ${sha}; the whole thing is at /${encodePath(entry.path)}.txt.`,
      );
    }
    if (ref === undefined && !index.slots.get(entry.path)?.has(slot)) {
      return notFound(
        index.slots.get(entry.path)!.size === 0
          ? `"${entry.path}" is not a book, so it has no entry ${slot}.`
          : `"${entry.path}" has no entry at slot ${slot} in its latest version.`,
      );
    }
    const res = await serveObject(env.CATALOG, `strings/${entry.path}/${sha}/${slot}.txt`, request, TEXT, cache, headers);
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
