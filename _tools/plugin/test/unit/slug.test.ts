import assert from "node:assert/strict";
import { test } from "node:test";

import { isValidSlug, plainLabel, slugify } from "../../src/core/index.ts";

test("conventions example", () => {
  assert.equal(slugify("Military Science (240/s)"), "military-science-240");
});

test("slugs", () => {
  assert.equal(slugify("  Ore Voiding Miners  "), "ore-voiding-miners");
  assert.equal(slugify("Chemical Science (240/s) V3"), "chemical-science-240-v3");
  assert.equal(slugify("Space Science 1920 SPS"), "space-science-1920-sps");
  assert.equal(slugify("Rate 60/min and 2/h"), "rate-60-and-2");
  assert.equal(slugify("A/B test"), "a-b-test");
  assert.equal(slugify("Fußgänger-Brücke — 日本語 🚀"), "fussganger-brucke");
  assert.equal(slugify("Crème brûlée v2.1"), "creme-brulee-v2-1");
  assert.equal(slugify("日本語"), "");
  assert.equal(slugify("[item=military-science-pack,quality=uncommon] (240/s) V3"), "military-science-pack-240-v3");
  assert.equal(slugify("[virtual-signal=signal-A][color=red]Red[/color] mall"), "signal-a-red-mall");
});

test("% is the word percent", () => {
  assert.equal(slugify("Expansion with %"), "expansion-with-percent");
  assert.equal(slugify("Resource (RYG) %"), "resource-ryg-percent");
  assert.equal(slugify("Any% Patch Sizes"), "any-percent-patch-sizes");
  assert.equal(slugify("100% Stone Patch Size"), "100-percent-stone-patch-size");
  assert.equal(slugify("%"), "percent");
});

test("plain labels for titles", () => {
  assert.equal(plainLabel("[item=military-science-pack,quality=uncommon] (240/s) V3"), "Military Science Pack (240/s) V3");
  assert.equal(plainLabel("[item=production-science-pack]960/s"), "Production Science Pack 960/s");
  assert.equal(plainLabel("[img=item/iron-plate] smelting [gps=10,20,nauvis]"), "Iron Plate smelting");
  assert.equal(plainLabel("[font=default-bold]Bold[/font] and [color=1,0,0]red[.color]"), "Bold and red");
  assert.equal(plainLabel("Plain (240/s)"), "Plain (240/s)");
});

test("valid slugs", () => {
  for (const s of ["a", "military-science-240", "v2"]) assert.ok(isValidSlug(s), s);
  for (const s of ["", "-a", "a-", "a--b", "A", "a_b", "a b", "é", "a/b", ".."]) assert.ok(!isValidSlug(s), s);
});
