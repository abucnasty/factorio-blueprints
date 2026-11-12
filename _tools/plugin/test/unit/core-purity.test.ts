// The core must run in Obsidian, Node and Cloudflare Workers, so it may
// import only its own files and the two pure-JS libraries. (The type check
// with tsconfig.core.json additionally rejects DOM and Node globals.)

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ALLOWED_PACKAGES = new Set(["fflate", "yaml"]);
const coreDir = join(import.meta.dirname, "..", "..", "src", "core");

test("core imports only relative files, fflate and yaml", () => {
  for (const file of readdirSync(coreDir)) {
    const text = readFileSync(join(coreDir, file), "utf8");
    for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)[^"'`;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g)) {
      const spec = m[1] ?? m[2] ?? m[3]!;
      assert.ok(spec.startsWith("./") || ALLOWED_PACKAGES.has(spec), `${file} imports ${spec}`);
    }
  }
});
