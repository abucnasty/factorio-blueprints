import assert from "node:assert/strict";
import { deflateSync, inflateSync } from "node:zlib";
import { describe, test } from "node:test";

import { BlueprintStringError, decodeBlueprintString, encodeBlueprintString } from "../../src/core/index.ts";
import { fixture } from "./fixtures.ts";

const NAMES = ["single-blueprint", "book-nested", "upgrade-planner", "tiles", "non-ascii-label", "wires-2.0"];

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof BlueprintStringError, `expected BlueprintStringError, got ${e}`);
    return e.code;
  }
  assert.fail("did not throw");
}

describe("decode and encode", () => {
  for (const name of NAMES) {
    test(`${name} round-trips`, () => {
      const { value, json } = decodeBlueprintString(fixture(`${name}.txt`));
      assert.deepStrictEqual(JSON.parse(json), value);
      const again = encodeBlueprintString(value);
      assert.equal(again[0], "0");
      assert.deepStrictEqual(decodeBlueprintString(again).value, value);
      // A second zlib implementation reads our output.
      const viaNode = JSON.parse(inflateSync(Buffer.from(again.slice(1), "base64")).toString("utf8"));
      assert.deepStrictEqual(viaNode, value);
    });
  }

  test("encode is compact JSON at deflate level 9 and deterministic", () => {
    const value = decodeBlueprintString(fixture("wires-2.0.txt")).value;
    const s = encodeBlueprintString(value);
    assert.equal(encodeBlueprintString(value), s);
    const raw = inflateSync(Buffer.from(s.slice(1), "base64")).toString("utf8");
    assert.equal(raw, JSON.stringify(value));
    assert.equal(Buffer.from(s.slice(1), "base64")[1], 0xda, "zlib header says maximum compression");
  });

  test("whitespace around and inside the string is ignored", () => {
    const s = fixture("tiles.txt").trim();
    const wrapped = `\n  ${s.slice(0, 40)}\r\n${s.slice(40)}  \n`;
    assert.deepStrictEqual(decodeBlueprintString(wrapped).value, decodeBlueprintString(s).value);
  });
});

describe("decode errors", () => {
  const good = fixture("tiles.txt").trim();
  test("empty", () => {
    assert.equal(code(() => decodeBlueprintString("")), "empty");
    assert.equal(code(() => decodeBlueprintString(" \n\t ")), "empty");
  });
  test("not a blueprint string", () => {
    assert.equal(code(() => decodeBlueprintString("hello world, this is a note")), "not-a-blueprint-string");
    assert.equal(code(() => decodeBlueprintString("https://factoriobin.com/post/90pg6z")), "not-a-blueprint-string");
    assert.equal(code(() => decodeBlueprintString('{"blueprint":{}}')), "not-a-blueprint-string");
    assert.equal(code(() => decodeBlueprintString("0eN")), "not-a-blueprint-string");
  });
  test("unsupported version byte", () => {
    assert.equal(code(() => decodeBlueprintString("1" + good.slice(1))), "unsupported-version");
  });
  test("corrupt: truncated", () => {
    assert.equal(code(() => decodeBlueprintString(good.slice(0, good.length - 12))), "corrupt");
  });
  test("corrupt: a changed character", () => {
    const i = Math.floor(good.length / 2);
    const changed = good.slice(0, i) + (good[i] === "A" ? "B" : "A") + good.slice(i + 1);
    assert.equal(code(() => decodeBlueprintString(changed)), "corrupt");
  });
  test("corrupt: bad base64 padding", () => {
    assert.equal(code(() => decodeBlueprintString("0eNqrVkrLz1eyUkpKLFKqBQAd")), "corrupt");
  });
  test("corrupt: valid zlib but not JSON", () => {
    const s = "0" + deflateSync(Buffer.from("not json"), { level: 9 }).toString("base64");
    assert.equal(code(() => decodeBlueprintString(s)), "corrupt");
  });
});

