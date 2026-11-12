import assert from "node:assert/strict";
import { test } from "node:test";

import { findLossyNumbers, jsonNumberLiterals, normalizeDecimal } from "../../src/core/index.ts";

test("finds number literals outside strings", () => {
  assert.deepStrictEqual(jsonNumberLiterals('{"a1":[1,-2.5,3e4],"s":"9 and \\"7\\"","b":0}'), ["1", "-2.5", "3e4", "0"]);
});

test("normalizeDecimal gives one form per value", () => {
  assert.equal(normalizeDecimal("1.50"), normalizeDecimal("15e-1"));
  assert.equal(normalizeDecimal("100"), "1e2");
  assert.equal(normalizeDecimal("-0.0"), "0");
});

test("reports numbers a double cannot hold", () => {
  assert.deepStrictEqual(findLossyNumbers("[1, 0.1, 0.2509804069995880126953125, 9007199254740992, 1e300]"), []);
  assert.deepStrictEqual(findLossyNumbers("[9007199254740993, 18446744073709551615, 1e400, 1e-400, 0e5]"), [
    "9007199254740993",
    "18446744073709551615",
    "1e400",
    "1e-400",
  ]);
});
