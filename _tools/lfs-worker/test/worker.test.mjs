// Request-handling tests for the LFS Worker, run with Node's built-in test
// runner against an in-memory stand-in for the R2 binding. Node loads
// src/index.ts directly by stripping its types (Node >= 22.18).
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.ts";

const BASE = "https://lfs.test";
const LFS = "application/vnd.git-lfs+json";
// A stand-in value for tests only, not a real token.
const TOKEN = "test-only-upload-token";
const OID = "a".repeat(64);
const OTHER_OID = "b".repeat(64);

class FakeR2 {
  constructor() {
    this.objects = new Map();
  }
  async head(key) {
    const bytes = this.objects.get(key);
    return bytes ? { size: bytes.byteLength } : null;
  }
  async get(key) {
    const bytes = this.objects.get(key);
    return bytes ? { size: bytes.byteLength, body: bytes } : null;
  }
  async put(key, body) {
    const bytes = new Uint8Array(await new Response(body).arrayBuffer());
    this.objects.set(key, bytes);
    return { size: bytes.byteLength };
  }
}

function key(oid) {
  return `${oid.slice(0, 2)}/${oid.slice(2, 4)}/${oid}`;
}

function makeEnv({ token = TOKEN, objects = {} } = {}) {
  const bucket = new FakeR2();
  for (const [oid, text] of Object.entries(objects)) {
    bucket.objects.set(key(oid), new TextEncoder().encode(text));
  }
  return { R2_BUCKET: bucket, LFS_UPLOAD_TOKEN: token };
}

function basic(user, password) {
  return `Basic ${btoa(`${user}:${password}`)}`;
}

function batch(env, operation, objects, headers = {}) {
  return worker.fetch(
    new Request(`${BASE}/objects/batch`, {
      method: "POST",
      headers: { "Content-Type": LFS, Accept: LFS, ...headers },
      body: JSON.stringify({ operation, objects }),
    }),
    env
  );
}

function call(env, method, path, { headers = {}, body } = {}) {
  return worker.fetch(new Request(`${BASE}${path}`, { method, headers, body }), env);
}

// --- batch: download -------------------------------------------------------

test("download batch needs no credentials and points at the object", async () => {
  const env = makeEnv({ objects: { [OID]: "hello" } });
  const res = await batch(env, "download", [{ oid: OID, size: 5 }]);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Type"), /^application\/vnd\.git-lfs\+json/);
  const body = await res.json();
  assert.equal(body.transfer, "basic");
  assert.deepEqual(body.objects[0].actions.download, {
    href: `${BASE}/objects/${OID}`,
    expires_in: 3600,
  });
  assert.equal(body.objects[0].actions.download.header, undefined);
});

test("download batch reports a missing object per object", async () => {
  const res = await batch(makeEnv(), "download", [{ oid: OID, size: 5 }]);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.objects[0].error.code, 404);
});

test("batch rejects an invalid oid per object", async () => {
  const res = await batch(makeEnv(), "download", [{ oid: "not-an-oid", size: 1 }]);
  const body = await res.json();
  assert.equal(body.objects[0].error.code, 422);
});

test("batch rejects the wrong content type", async () => {
  const res = await batch(makeEnv(), "download", [], { "Content-Type": "application/json" });
  assert.equal(res.status, 415);
});

test("batch rejects a body without operation or objects", async () => {
  const res = await worker.fetch(
    new Request(`${BASE}/objects/batch`, {
      method: "POST",
      headers: { "Content-Type": LFS },
      body: JSON.stringify({ objects: [] }),
    }),
    makeEnv()
  );
  assert.equal(res.status, 422);
});

// --- batch: upload ---------------------------------------------------------

test("upload batch without credentials is 401", async () => {
  const res = await batch(makeEnv(), "upload", [{ oid: OID, size: 5 }]);
  assert.equal(res.status, 401);
});

test("upload batch with a wrong token is 401", async () => {
  const res = await batch(makeEnv(), "upload", [{ oid: OID, size: 5 }], {
    Authorization: basic("lfs", "wrong"),
  });
  assert.equal(res.status, 401);
});

test("upload batch accepts Basic auth with the token as password, any username", async () => {
  for (const user of ["lfs", "someone-else", ""]) {
    const res = await batch(makeEnv(), "upload", [{ oid: OID, size: 5 }], {
      Authorization: basic(user, TOKEN),
    });
    assert.equal(res.status, 200, `username ${JSON.stringify(user)}`);
    const body = await res.json();
    assert.equal(body.objects[0].actions.upload.href, `${BASE}/objects/${OID}`);
    assert.equal(body.objects[0].actions.verify.href, `${BASE}/objects/${OID}/verify`);
  }
});

test("upload batch accepts a Bearer token", async () => {
  const res = await batch(makeEnv(), "upload", [{ oid: OID, size: 5 }], {
    Authorization: `Bearer ${TOKEN}`,
  });
  assert.equal(res.status, 200);
});

test("upload batch skips objects already in the bucket", async () => {
  const env = makeEnv({ objects: { [OID]: "hello" } });
  const res = await batch(env, "upload", [{ oid: OID, size: 5 }, { oid: OTHER_OID, size: 3 }], {
    Authorization: basic("lfs", TOKEN),
  });
  const body = await res.json();
  assert.equal(body.objects[0].actions, undefined);
  assert.ok(body.objects[1].actions.upload);
});

test("uploads are refused while the Worker has no LFS_UPLOAD_TOKEN secret", async () => {
  const env = makeEnv({ token: undefined });
  for (const auth of [basic("lfs", ""), "Bearer undefined", basic("lfs", "undefined")]) {
    const res = await batch(env, "upload", [{ oid: OID, size: 5 }], { Authorization: auth });
    assert.equal(res.status, 401, auth);
  }
});

// --- object transfer -------------------------------------------------------

test("PUT without the token is 401 and stores nothing", async () => {
  const env = makeEnv();
  const res = await call(env, "PUT", `/objects/${OID}`, { body: "hello" });
  assert.equal(res.status, 401);
  assert.equal(env.R2_BUCKET.objects.size, 0);
});

test("PUT with the token stores the object under ab/cd/<oid>, then GET returns it", async () => {
  const env = makeEnv();
  const put = await call(env, "PUT", `/objects/${OID}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: "hello",
  });
  assert.equal(put.status, 200);
  assert.ok(env.R2_BUCKET.objects.has(`aa/aa/${OID}`));

  const get = await call(env, "GET", `/objects/${OID}`);
  assert.equal(get.status, 200);
  assert.equal(await get.text(), "hello");
  assert.equal(get.headers.get("Content-Type"), "application/octet-stream");
});

test("HEAD returns size without a body; GET of a missing object is 404", async () => {
  const env = makeEnv({ objects: { [OID]: "hello" } });
  const head = await call(env, "HEAD", `/objects/${OID}`);
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("Content-Length"), "5");
  assert.equal((await call(env, "GET", `/objects/${OTHER_OID}`)).status, 404);
});

test("GET with a filename suffix sets Content-Disposition", async () => {
  const env = makeEnv({ objects: { [OID]: "hello" } });
  const res = await call(env, "GET", `/objects/${OID}/0.jpg`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Disposition"), 'attachment; filename="0.jpg"');
});

test("verify needs the token and reports presence", async () => {
  const env = makeEnv({ objects: { [OID]: "hello" } });
  const auth = { Authorization: `Bearer ${TOKEN}` };
  assert.equal((await call(env, "POST", `/objects/${OID}/verify`)).status, 401);
  assert.equal((await call(env, "POST", `/objects/${OID}/verify`, { headers: auth })).status, 200);
  assert.equal(
    (await call(env, "POST", `/objects/${OTHER_OID}/verify`, { headers: auth })).status,
    404
  );
});

test("unknown routes are 404", async () => {
  const env = makeEnv();
  assert.equal((await call(env, "GET", "/")).status, 404);
  assert.equal((await call(env, "DELETE", `/objects/${OID}`)).status, 404);
  assert.equal((await call(env, "GET", "/objects/short")).status, 404);
});
