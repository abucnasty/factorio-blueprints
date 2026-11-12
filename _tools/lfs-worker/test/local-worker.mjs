// Serves the real Worker handler over plain HTTP on 127.0.0.1, backed by the
// in-memory R2 stand-in. Used by the setup script tests; not deployed.
//
//   LFS_UPLOAD_TOKEN=... node test/local-worker.mjs   # prints "port <n>"
//
// Leave LFS_UPLOAD_TOKEN unset to act like a Worker whose secret was never
// set. GET /__test/objects lists the stored object keys; PUT /__test/secret
// replaces the token, standing in for "wrangler secret put".

import http from "node:http";
import { Readable } from "node:stream";
import worker from "../src/index.ts";
import { FakeR2 } from "./fake-r2.mjs";

const env = { R2_BUCKET: new FakeR2(), LFS_UPLOAD_TOKEN: process.env.LFS_UPLOAD_TOKEN };

const server = http.createServer(async (req, res) => {
  try {
    const url = `http://${req.headers.host}${req.url}`;
    if (req.url === "/__test/objects") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify([...env.R2_BUCKET.objects.keys()]));
      return;
    }
    if (req.url === "/__test/secret" && req.method === "PUT") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      env.LFS_UPLOAD_TOKEN = Buffer.concat(chunks).toString("utf8");
      res.writeHead(204);
      res.end();
      return;
    }
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: hasBody ? Readable.toWeb(req) : undefined,
      duplex: "half",
    });
    const response = await worker.fetch(request, env);
    const body = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (err) {
    res.writeHead(500);
    res.end(String(err));
  }
});

server.listen(0, "127.0.0.1", () => {
  console.log(`port ${server.address().port}`);
});
