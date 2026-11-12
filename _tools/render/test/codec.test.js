import assert from "node:assert/strict";
import test from "node:test";
import zlib from "node:zlib";
import { decodeBlueprintString, encodeBlueprintString } from "../src/codec.js";

const sample = { blueprint: { item: "blueprint", label: "Smelting ⚙", entities: [{ entity_number: 1, name: "stone-furnace", position: { x: 1, y: -2.5 } }], version: 562949958139904 } };

test("decode, encode, decode gives identical JSON", () => {
    const encoded = encodeBlueprintString(sample);
    assert.equal(encoded[0], "0");
    assert.deepEqual(decodeBlueprintString(encoded), sample);
    assert.deepEqual(decodeBlueprintString(encodeBlueprintString(decodeBlueprintString(encoded))), sample);
});

test("encode is compact JSON deflated at level 9", () => {
    const encoded = encodeBlueprintString(sample);
    assert.equal(zlib.inflateSync(Buffer.from(encoded.slice(1), "base64")).toString("utf8"), JSON.stringify(sample));
});

test("whitespace and line breaks in a pasted string are ignored", () => {
    const encoded = encodeBlueprintString(sample);
    const wrapped = `  ${encoded.slice(0, 10)}\n${encoded.slice(10, 30)}\r\n${encoded.slice(30)}\n`;
    assert.deepEqual(decodeBlueprintString(wrapped), sample);
});

test("bad strings fail with a clear message", () => {
    assert.throws(() => decodeBlueprintString(""), /empty/);
    assert.throws(() => decodeBlueprintString("1abc"), /version byte/);
    assert.throws(() => decodeBlueprintString("0not*base64"), /base64/);
    assert.throws(() => decodeBlueprintString("0aGVsbG8="), /inflate/);
});
