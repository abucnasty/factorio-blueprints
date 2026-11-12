// Request handling against an in-memory stand-in for R2.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { createHandler } from "../src/index.ts";

const enc = new TextEncoder();

class FakeBucket {
  objects = new Map<string, { data: Uint8Array; etag: string }>();
  reads: string[] = [];
  put(key: string, content: string): void {
    const data = enc.encode(content);
    this.objects.set(key, { data, etag: createHash("md5").update(data).digest("hex") });
  }
  meta(key: string) {
    const o = this.objects.get(key)!;
    return { key, etag: o.etag, httpEtag: `"${o.etag}"`, size: o.data.length };
  }
  async head(key: string) {
    this.reads.push(key);
    return this.objects.has(key) ? this.meta(key) : null;
  }
  async get(key: string, opts?: { onlyIf?: { etagDoesNotMatch?: string } }) {
    this.reads.push(key);
    const o = this.objects.get(key);
    if (!o) return null;
    if (opts?.onlyIf?.etagDoesNotMatch === o.etag) return this.meta(key);
    const text = new TextDecoder().decode(o.data);
    return { ...this.meta(key), body: new Response(o.data).body, text: async () => text, json: async () => JSON.parse(text) };
  }
}

const SHA1 = "1111111aaaa" + "0".repeat(29);
const SHA2 = "2222222bbbb" + "0".repeat(29);
const AMB1 = "abcdef1" + "1".repeat(33);
const AMB2 = "abcdef1" + "2".repeat(33);
const OID = "c".repeat(64);

function setup() {
  const catalog = new FakeBucket();
  const lfs = new FakeBucket();
  const entry = (path: string, shas: string[], extra = {}) => ({
    path,
    title: path,
    authors: [],
    deprecated: false,
    previous_paths: [],
    blueprint: { kind: "blueprint", counts: {} },
    commit: shas[0],
    history: shas.map((sha) => ({ sha, date: "2026-01-01T00:00:00Z", subject: "s" })),
    renders: [],
    ...extra,
  });
  const index = {
    schema: 1,
    generatedAt: "2026-01-01T00:00:00Z",
    commit: SHA2,
    blueprints: [
      entry("cat/a", [SHA2, SHA1], { renders: [{ n: 0, file: "0.jpg", oid: OID, size: 5 }] }),
      entry("cat/new", [AMB2, AMB1], { previous_paths: ["cat/old"] }),
    ],
  };
  catalog.put("index.json", JSON.stringify(index));
  catalog.put(`strings/cat/a/${SHA2}.txt`, "0latest");
  catalog.put(`strings/cat/a/${SHA1}.txt`, "0older");
  catalog.put(`strings/cat/new/${AMB1}.txt`, "0amb1");
  lfs.put(`cc/cc/${OID}`, "JFIF!");
  let clock = 0;
  const handle = createHandler(() => clock);
  const env = { CATALOG: catalog, LFS: lfs } as any;
  const req = (path: string, init: RequestInit = {}) => handle(new Request("https://blueprints.example" + path, init), env);
  return { catalog, lfs, req, tick: (ms: number) => (clock += ms) };
}

test("latest string", async () => {
  const { req } = setup();
  const res = await req("/cat/a.txt");
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "0latest");
  assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "public, max-age=60");
  assert.equal(res.headers.get("x-blueprint-commit"), SHA2);
  assert.match(res.headers.get("etag")!, /^"[0-9a-f]{32}"$/);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
});

test("@sha: full SHA is immutable, a prefix resolves, an ambiguous or unknown one is a 404", async () => {
  const { req } = setup();
  let res = await req(`/cat/a@${SHA1}.txt`);
  assert.equal(await res.text(), "0older");
  assert.equal(res.headers.get("cache-control"), "public, max-age=31536000, immutable");

  res = await req(`/cat/a@${SHA1.slice(0, 7).toUpperCase()}.txt`);
  assert.equal(await res.text(), "0older");
  assert.equal(res.headers.get("x-blueprint-commit"), SHA1);
  assert.equal(res.headers.get("cache-control"), "public, max-age=86400");

  res = await req(`/cat/new@abcdef1.txt`);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /matches 2 versions/);
  res = await req(`/cat/new@abcdef11.txt`);
  assert.equal(await res.text(), "0amb1");

  res = await req(`/cat/a@3333333.txt`);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /has no version "3333333"/);
  res = await req(`/cat/a@abc.txt`);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /not a commit SHA/);
});

test("a previous path redirects permanently, keeping the version, suffix and query", async () => {
  const { req } = setup();
  let res = await req(`/cat/old@abcdef11.txt?x=1`);
  assert.equal(res.status, 301);
  assert.equal(res.headers.get("location"), "https://blueprints.example/cat/new@abcdef11.txt?x=1");
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  res = await req(`/cat/old.txt`);
  assert.equal(res.headers.get("location"), "https://blueprints.example/cat/new.txt");
  res = await req(`/cat/old/renders/0.jpg`);
  assert.equal(res.headers.get("location"), "https://blueprints.example/cat/new/renders/0.jpg");
});

test("renders stream from the LFS bucket by object id", async () => {
  const { req, lfs } = setup();
  let res = await req("/cat/a/renders/0.jpg");
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "JFIF!");
  assert.equal(res.headers.get("content-type"), "image/jpeg");
  assert.equal(res.headers.get("cache-control"), "public, max-age=60");
  assert.ok(lfs.reads.includes(`cc/cc/${OID}`));
  res = await req(`/cat/a/renders/0.jpg?v=${OID}`);
  assert.equal(res.headers.get("cache-control"), "public, max-age=31536000, immutable");
  res = await req("/cat/a/renders/1.jpg");
  assert.equal(res.status, 404);
  assert.match(await res.text(), /has no render "1.jpg"/);
});

test("404s are plain text and say what was not found", async () => {
  const { req } = setup();
  for (const path of ["/", "/cat/a", "/nope.txt", "/nope/renders/0.jpg", "/%E0%A4%A.txt"]) {
    const res = await req(path);
    assert.equal(res.status, 404, path);
    assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.equal(res.headers.get("cache-control"), "no-store");
  }
  assert.match(await (await req("/nope.txt")).text(), /No blueprint at "nope"/);
});

test("index.json, conditional requests and HEAD", async () => {
  const { req } = setup();
  let res = await req("/index.json");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "public, max-age=60");
  assert.equal(((await res.json()) as any).blueprints.length, 2);
  const etag = res.headers.get("etag")!;

  res = await req("/index.json", { headers: { "If-None-Match": etag } });
  assert.equal(res.status, 304);
  assert.equal(res.headers.get("etag"), etag);

  res = await req("/cat/a.txt", { method: "HEAD" });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-length"), "7");
  assert.equal(await res.text(), "");
  res = await req("/nope.txt", { method: "HEAD" });
  assert.equal(res.status, 404);
  assert.equal(await res.text(), "");
});

test("CORS preflight and other methods", async () => {
  const { req } = setup();
  let res = await req("/cat/a.txt", { method: "OPTIONS", headers: { "Access-Control-Request-Headers": "if-none-match" } });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.equal(res.headers.get("access-control-allow-methods"), "GET, HEAD, OPTIONS");
  assert.equal(res.headers.get("access-control-allow-headers"), "if-none-match");
  res = await req("/cat/a.txt", { method: "POST", body: "x" });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get("allow"), "GET, HEAD, OPTIONS");
});

test("the index is read once per request at most and kept in the isolate briefly", async () => {
  const { req, catalog, tick } = setup();
  const indexReads = () => catalog.reads.filter((k) => k === "index.json").length;
  await req("/cat/a.txt");
  await req("/cat/a@1111111.txt");
  assert.equal(indexReads(), 1);
  tick(6_000);
  await req("/cat/a.txt"); // revalidated, unchanged
  assert.equal(indexReads(), 2);
  catalog.put("index.json", JSON.stringify({ schema: 1, generatedAt: "", commit: "", blueprints: [] }));
  tick(6_000);
  assert.equal((await req("/cat/a.txt")).status, 404, "a changed index is picked up");
});

test("before the first publish: 503", async () => {
  const { req, catalog } = setup();
  catalog.objects.clear();
  assert.equal((await req("/cat/a.txt")).status, 503);
  assert.equal((await req("/index.json")).status, 503);
});

// Schema 2: entry links inside books, covers and nested renders.

const OLD = "01d0000" + "1".repeat(33);
const NEW = "ae70000" + "2".repeat(33);
const PNG = "d".repeat(64);

function bookSetup() {
  const catalog = new FakeBucket();
  const lfs = new FakeBucket();
  const history = [NEW, OLD].map((sha) => ({ sha, date: "2026-01-01T00:00:00Z", subject: "s", entries: true }));
  const index = {
    schema: 2,
    generatedAt: "2026-01-01T00:00:00Z",
    commit: NEW,
    blueprints: [
      {
        path: "cat/book",
        title: "Book",
        authors: [],
        deprecated: false,
        previous_paths: ["old/book"],
        blueprint: { kind: "blueprint-book", counts: {} },
        commit: NEW,
        history,
        renders: [{ file: "3/1.png", oid: PNG, size: 4 }],
        nodes: [
          { slot: 0, path: "0", kind: "upgrade-planner", label: "Up" },
          { slot: 3, path: "3", kind: "blueprint-book", label: "Inner", children: [{ slot: 1, path: "3/1", kind: "blueprint", label: "X", render: "3/1.png" }] },
        ],
        cover: "3/1.png",
      },
      {
        path: "cat/single",
        title: "Single",
        authors: [],
        deprecated: false,
        previous_paths: [],
        blueprint: { kind: "blueprint", counts: {} },
        commit: NEW,
        history: [history[0]],
        renders: [],
      },
    ],
  };
  catalog.put("index.json", JSON.stringify(index));
  catalog.put(`strings/cat/book/${NEW}.txt`, "0root");
  for (const [sha, slots] of [[NEW, ["0", "3", "3/1"]], [OLD, ["0", "2", "3", "3/1"]]] as const) {
    for (const slot of slots) catalog.put(`strings/cat/book/${sha}/${slot}.txt`, `0${sha === NEW ? "new" : "old"}-${slot}`);
  }
  lfs.put(`dd/dd/${PNG}`, "PNG!");
  const handle = createHandler(() => 0);
  const env = { CATALOG: catalog, LFS: lfs } as any;
  return (path: string, init: RequestInit = {}) => handle(new Request("https://blueprints.example" + path, init), env);
}

test("entry links: latest and @sha, nested books, entries only an old version has", async () => {
  const req = bookSetup();
  let res = await req("/cat/book/3/1.txt");
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "0new-3/1");
  assert.equal(res.headers.get("cache-control"), "public, max-age=60");
  assert.equal(res.headers.get("x-blueprint-commit"), NEW);
  assert.equal(await (await req("/cat/book/3.txt")).text(), "0new-3", "a nested book's own string");
  assert.equal(await (await req("/cat/book.txt")).text(), "0root", "the root is unchanged");

  res = await req(`/cat/book/3/1@${OLD}.txt`);
  assert.equal(await res.text(), "0old-3/1");
  assert.equal(res.headers.get("cache-control"), "public, max-age=31536000, immutable");
  res = await req(`/cat/book/2@${OLD.slice(0, 7)}.txt`);
  assert.equal(await res.text(), "0old-2");
  assert.equal(res.headers.get("cache-control"), "public, max-age=86400");

  res = await req("/cat/book/2.txt");
  assert.equal(res.status, 404);
  assert.match(await res.text(), /no entry at slot 2 in its latest version/);
  res = await req(`/cat/book/9/9@${NEW}.txt`);
  assert.equal(res.status, 404);
  assert.match(await res.text(), new RegExp(`no entry at slot 9/9 in version ${NEW}`));
  res = await req("/cat/single/0.txt");
  assert.equal(res.status, 404);
  assert.match(await res.text(), /is not a book/);
  assert.equal((await req("/cat/book/03.txt")).status, 404, "slots are plain numbers");

  res = await req("/cat/book/3/1.txt", { method: "HEAD" });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-length"), "8");
  assert.equal(await res.text(), "");
});

test("cover and nested renders", async () => {
  const req = bookSetup();
  let res = await req("/cat/book/cover.jpg");
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "PNG!");
  assert.equal(res.headers.get("content-type"), "image/png", "typed by the file actually used");
  assert.equal(res.headers.get("cache-control"), "public, max-age=60");
  const etag = res.headers.get("etag")!;
  assert.equal((await req("/cat/book/cover.jpg", { headers: { "If-None-Match": etag } })).status, 304);
  assert.equal((await req(`/cat/book/cover.jpg?v=${PNG}`)).headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(await (await req("/cat/book/renders/3/1.png")).text(), "PNG!");
  assert.equal((await req("/cat/book/renders/3/2.png")).status, 404);
  res = await req("/cat/single/cover.jpg");
  assert.equal(res.status, 404);
  assert.match(await res.text(), /no render images/);
});

test("previous paths redirect every form", async () => {
  const req = bookSetup();
  for (const [from, to] of [
    ["/old/book/3/1@01d0000.txt?x=1", "/cat/book/3/1@01d0000.txt?x=1"],
    ["/old/book/3/1.txt", "/cat/book/3/1.txt"],
    ["/old/book/cover.jpg", "/cat/book/cover.jpg"],
    ["/old/book/renders/3/1.png", "/cat/book/renders/3/1.png"],
  ]) {
    const res = await req(from!);
    assert.equal(res.status, 301, from);
    assert.equal(res.headers.get("location"), "https://blueprints.example" + to);
  }
});

test("schema 1 index: root links and renders work, entry links say they are not published, no cover", async () => {
  const { req } = setup(); // the fixture above is schema 1 shaped: no entries flags, nodes or cover
  assert.equal(await (await req("/cat/a.txt")).text(), "0latest");
  assert.equal((await req("/cat/a/renders/0.jpg")).status, 200);
  let res = await req("/cat/a/0.txt");
  assert.equal(res.status, 503);
  assert.match(await res.text(), /not published yet/);
  res = await req(`/cat/old/0@abcdef11.txt`);
  assert.equal(res.status, 301);
  res = await req("/cat/a/cover.jpg");
  assert.equal(res.status, 404);
});
