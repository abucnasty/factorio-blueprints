import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BlueprintStringError,
  decodeBlueprintString,
  decodeFactorioVersion,
  describeBlueprint,
  encodeFactorioVersion,
  summarizeBlueprint,
} from "../../src/core/index.ts";
import { fixture } from "./fixtures.ts";

const describeFixture = (name: string) => describeBlueprint(decodeBlueprintString(fixture(`${name}.txt`)).value);

test("single blueprint", () => {
  const d = describeFixture("single-blueprint");
  assert.equal(d.kind, "blueprint");
  assert.equal(d.counts.blueprints, 1);
  assert.ok(d.counts.entities > 0);
  assert.match(d.factorioVersion ?? "", /^2\.\d+\.\d+/);
});

test("book with a nested book and planners", () => {
  const d = describeFixture("book-nested");
  assert.equal(d.kind, "blueprint-book");
  assert.equal(d.label, "[item=military-science-pack,quality=uncommon] (240/s) V3");
  assert.equal(d.description, "- designed by abucnasty");
  assert.equal(d.factorioVersion, "2.0.76");
  assert.deepStrictEqual(d.counts, {
    blueprints: 2,
    books: 1,
    upgradePlanners: 1,
    deconstructionPlanners: 1,
    entities: 5,
    tiles: 9,
  });
  assert.equal(
    summarizeBlueprint(d),
    'blueprint book "[item=military-science-pack,quality=uncommon] (240/s) V3" (2 blueprints, 1 book, 2 planners, 5 entities, 9 tiles)',
  );
});

test("planners and tiles", () => {
  assert.equal(describeFixture("upgrade-planner").kind, "upgrade-planner");
  assert.equal(summarizeBlueprint(describeFixture("upgrade-planner")), 'upgrade planner "Belts to turbo"');
  assert.equal(describeFixture("tiles").counts.tiles, 9);
  assert.equal(describeFixture("non-ascii-label").label, "Fußgänger-Brücke — 日本語 🚀");
  assert.equal(describeFixture("wires-2.0").counts.entities, 4);
});

test("anything else is not a blueprint", () => {
  for (const v of [null, 3, [], {}, { foo: {} }, { blueprint: [] }]) {
    assert.throws(() => describeBlueprint(v), (e) => e instanceof BlueprintStringError && e.code === "not-a-blueprint");
  }
});

test("Factorio version numbers", () => {
  assert.equal(decodeFactorioVersion(562949958402048), "2.0.76");
  assert.equal(decodeFactorioVersion(encodeFactorioVersion("1.1.110")), "1.1.110");
  assert.equal(decodeFactorioVersion(encodeFactorioVersion("2.0.66.1")), "2.0.66.1");
  assert.throws(() => decodeFactorioVersion(-1));
});
