import assert from "node:assert/strict";
import { test } from "node:test";

import { copyBlueprintString } from "../../src/commands/copy-blueprint.ts";
import { decodeBlueprintString, writeCanonicalJson } from "../../src/core/index.ts";
import { fakeHost, fixture } from "./helpers.ts";

const value = decodeBlueprintString(fixture("book-nested.txt")).value;
const files = {
  "mall/blueprint.json": writeCanonicalJson(value),
  "mall/README.md": "---\ntitle: Mall\n---\n",
  "notes/plain.md": "x",
  "broken/blueprint.json": "{ not json",
};

test("copies the folder's blueprint as a string", async () => {
  for (const folder of ["mall", "mall/renders"]) {
    const host = fakeHost({ files });
    const out = await copyBlueprintString(host, folder);
    assert.equal(out.action, "copied");
    assert.deepStrictEqual(decodeBlueprintString(host.clipboardText).value, value);
    assert.match(host.notices[0]!.message, /^Copied blueprint book "\[item=military-science-pack,quality=uncommon\] \(240\/s\) V3" \(2 blueprints.*\) from mall\./);
  }
});

test("outside a blueprint folder", async () => {
  const host = fakeHost({ files, clipboard: "keep" });
  assert.equal((await copyBlueprintString(host, "notes")).action, "rejected");
  assert.equal(host.clipboardText, "keep");
  assert.match(host.notices[0]!.message, /not inside a blueprint folder/);
});

test("unreadable blueprint.json", async () => {
  const host = fakeHost({ files, clipboard: "keep" });
  assert.equal((await copyBlueprintString(host, "broken")).action, "rejected");
  assert.equal(host.clipboardText, "keep");
  assert.match(host.notices[0]!.message, /^Could not read broken\/blueprint.json/);
});
