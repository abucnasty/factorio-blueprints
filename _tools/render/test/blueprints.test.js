import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { blueprintStringOf, listBlueprints, readInput } from "../src/blueprints.js";
import { decodeBlueprintString, encodeBlueprintString } from "../src/codec.js";
import { row, sampleBook, tempDir } from "./helpers.js";

test("a lone blueprint is image 0", () => {
    const { blueprints, skipped } = listBlueprints({ blueprint: row("solo", 2) });
    assert.deepEqual(blueprints.map(({ number, path: at, label, empty }) => ({ number, at, label, empty })), [{ number: 0, at: "", label: "solo", empty: false }]);
    assert.deepEqual(skipped, []);
});

test("a book is walked depth first in slot index order; only blueprints are numbered", () => {
    const { blueprints, skipped } = listBlueprints(sampleBook());
    assert.deepEqual(blueprints.map(entry => [entry.number, entry.path, entry.label, entry.empty]), [
        [0, "0", "A", false],
        [1, "2/0", "B", false],
        [2, "2/1", "C", false],
        [3, "3", "D", false],
        [4, "4", "tiles", false],
        [5, "5", "E (empty)", true],
    ]);
    assert.deepEqual(skipped, [{ path: "1", kind: "upgrade_planner" }, { path: "2/2", kind: "deconstruction_planner" }]);
});

test("slots without an index keep their listed order", () => {
    const { blueprints } = listBlueprints({ blueprint_book: { blueprints: [{ blueprint: row("x", 1) }, { blueprint: row("y", 1) }] } });
    assert.deepEqual(blueprints.map(entry => entry.label), ["x", "y"]);
});

test("a planner on its own renders nothing", () => {
    assert.deepEqual(listBlueprints({ upgrade_planner: {} }), { blueprints: [], skipped: [{ path: "", kind: "upgrade_planner" }] });
});

test("each blueprint is sent to the game as a string of that blueprint alone", () => {
    const [, b] = listBlueprints(sampleBook()).blueprints;
    assert.deepEqual(decodeBlueprintString(blueprintStringOf(b)), { blueprint: row("B", 2) });
});

test("input may be blueprint.json or a raw string", async () => {
    const dir = await tempDir("render-input-");
    try {
        const json = path.join(dir, "blueprint.json"), text = path.join(dir, "book.txt"), bad = path.join(dir, "bad.txt");
        await fs.writeFile(json, JSON.stringify(sampleBook(), null, 2) + "\n");
        await fs.writeFile(text, `${encodeBlueprintString(sampleBook())}\n`);
        await fs.writeFile(bad, "hello");
        assert.deepEqual(await readInput(json), { value: sampleBook(), format: "json" });
        assert.deepEqual(await readInput(text), { value: sampleBook(), format: "string" });
        await assert.rejects(readInput(bad), /neither blueprint JSON nor a blueprint string/);
        await assert.rejects(readInput(path.join(dir, "missing.json")), /Cannot read input/);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test("the smoke-test book in fixtures lists three blueprints and skips its planner", async () => {
    const { value } = await readInput(new URL("./fixtures/smoke-book.json", import.meta.url).pathname);
    const { blueprints, skipped } = listBlueprints(value);
    assert.deepEqual(blueprints.map(entry => [entry.number, entry.path, entry.empty]), [[0, "0", false], [1, "1", false], [2, "3", false]]);
    assert.deepEqual(skipped, [{ path: "2", kind: "upgrade_planner" }]);
    for (const entry of blueprints) assert.deepEqual(decodeBlueprintString(blueprintStringOf(entry)).blueprint, entry.blueprint);
});
