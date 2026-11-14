import assert from "node:assert/strict";
import { test } from "node:test";

import { copyBlueprintString } from "../../src/commands/copy-blueprint.ts";
import { decodeBlueprintString, writeCanonicalJson } from "../../src/core/index.ts";
import { fakeHost, fixture } from "./helpers.ts";

const value = decodeBlueprintString(fixture("book-nested.txt")).value;
const files = {
  "blueprints/mall/blueprint.json": writeCanonicalJson(value),
  "blueprints/mall/README.md": "---\ntitle: Mall\n---\n",
  "notes/plain.md": "x",
  "blueprints/broken/blueprint.json": "{ not json",
};

test("copies the folder's blueprint as a string", async () => {
  for (const folder of ["blueprints/mall", "blueprints/mall/renders"]) {
    const host = fakeHost({ files });
    const out = await copyBlueprintString(host, folder);
    assert.equal(out.action, "copied");
    assert.deepStrictEqual(decodeBlueprintString(host.clipboardText).value, value);
    assert.match(host.notices[0]!.message, /^Copied blueprint book "\[item=military-science-pack,quality=uncommon\] \(240\/s\) V3" \(2 blueprints.*\) from blueprints\/mall\./);
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
  assert.equal((await copyBlueprintString(host, "blueprints/broken")).action, "rejected");
  assert.equal(host.clipboardText, "keep");
  assert.match(host.notices[0]!.message, /^Could not read blueprints\/broken\/blueprint.json/);
});
