import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { blueprintStringOf, listBlueprints, readInput, renderFileOf, selectBlueprints } from "../src/blueprints.js";
import { decodeBlueprintString, encodeBlueprintString } from "../src/codec.js";
import { row, sampleBook, tempDir } from "./helpers.js";

test("a lone blueprint has the root slot path and renders to 0.jpg", () => {
    const { blueprints, skipped, entries } = listBlueprints({ blueprint: row("solo", 2) });
    assert.deepEqual(blueprints.map(({ path: at, file, key, label, empty }) => ({ at, file, key, label, empty })),
        [{ at: "", file: "0.jpg", key: "0", label: "solo", empty: false }]);
    assert.deepEqual(skipped, []);
    assert.deepEqual(entries.map(entry => [entry.path, entry.kind, entry.file]), [["", "blueprint", "0.jpg"]]);
});

test("a book is walked depth first in slot order; each blueprint renders to its slot path", () => {
    const { blueprints, skipped, entries, problems } = listBlueprints(sampleBook());
    assert.deepEqual(blueprints.map(entry => [entry.path, entry.file, entry.key, entry.label, entry.empty]), [
        ["0", "0.jpg", "0", "A", false],
        ["2/0", "2/0.jpg", "2-0", "B", false],
        ["2/1", "2/1.jpg", "2-1", "C", false],
        ["3", "3.jpg", "3", "D", false],
        ["4", "4.jpg", "4", "tiles", false],
        ["5", "5.jpg", "5", "E (empty)", true],
    ]);
    assert.deepEqual(skipped, [{ path: "1", kind: "upgrade-planner" }, { path: "2/2", kind: "deconstruction-planner" }]);
    assert.deepEqual(entries.map(entry => [entry.path, entry.kind, entry.file]), [
        ["", "blueprint-book", null], ["0", "blueprint", "0.jpg"], ["1", "upgrade-planner", null],
        ["2", "blueprint-book", null], ["2/0", "blueprint", "2/0.jpg"], ["2/1", "blueprint", "2/1.jpg"],
        ["2/2", "deconstruction-planner", null], ["3", "blueprint", "3.jpg"], ["4", "blueprint", "4.jpg"], ["5", "blueprint", "5.jpg"],
    ]);
    assert.deepEqual(problems, []);
});

test("slots without an index use their array position, also in nested books", () => {
    const { blueprints } = listBlueprints({ blueprint_book: { blueprints: [
        { blueprint: row("x", 1) },
        { blueprint_book: { blueprints: [{ upgrade_planner: {} }, { blueprint: row("deep", 1) }] } },
        { index: 7, blueprint: row("y", 1) },
    ] } });
    assert.deepEqual(blueprints.map(entry => [entry.path, entry.file, entry.label]), [["0", "0.jpg", "x"], ["1/1", "1/1.jpg", "deep"], ["7", "7.jpg", "y"]]);
    assert.equal(renderFileOf(""), "0.jpg");
    assert.equal(renderFileOf("3/1"), "3/1.jpg");
});

test("a duplicate slot number keeps the first entry and reports the others", () => {
    const { blueprints, skipped, problems, entries } = listBlueprints({ blueprint_book: { blueprints: [
        { index: 2, blueprint: row("first", 1) }, { index: 2, blueprint: row("second", 1) },
        { index: 1, blueprint: row("third", 1) }, { blueprint: row("by position", 1) }, { index: -4, blueprint: row("bad index", 1) },
    ] } });
    // "by position" is at array position 3; "bad index" falls back to its position 4
    assert.deepEqual(blueprints.map(entry => [entry.path, entry.label]), [["1", "third"], ["2", "first"], ["3", "by position"], ["4", "bad index"]]);
    assert.deepEqual(skipped, [{ path: "2", kind: "blueprint", reason: "duplicate slot 2 in book (root): only the first entry with it is used" }]);
    assert.equal(problems.length, 2);
    assert.match(problems[0], /slot index -4 is not a whole number/);
    assert.match(problems[1], /^2: duplicate slot 2/);
    assert.equal(entries.filter(entry => entry.problem).length, 1);
});

test("a planner on its own renders nothing", () => {
    const { blueprints, skipped } = listBlueprints({ upgrade_planner: { label: "up" } });
    assert.deepEqual(blueprints, []);
    assert.deepEqual(skipped, [{ path: "", kind: "upgrade-planner" }]);
});

test("--only selects an entry by slot path, everything in a selected book, or a lone blueprint by 0", () => {
    const { blueprints } = listBlueprints(sampleBook());
    assert.deepEqual(selectBlueprints(blueprints, ["2/1"]).map(entry => entry.path), ["2/1"]);
    assert.deepEqual(selectBlueprints(blueprints, ["2", "4"]).map(entry => entry.path), ["2/0", "2/1", "4"]);
    assert.throws(() => selectBlueprints(blueprints, ["9", "2/7"]), /--only 9, 2\/7: no blueprint at these slot paths/);
    assert.throws(() => selectBlueprints(blueprints, ["1"]), /no blueprint/); // the planner
    const lone = listBlueprints({ blueprint: row("solo", 1) }).blueprints;
    assert.deepEqual(selectBlueprints(lone, ["0"]).map(entry => entry.file), ["0.jpg"]);
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
    assert.deepEqual(blueprints.map(entry => [entry.path, entry.file, entry.empty]), [["0", "0.jpg", false], ["1", "1.jpg", false], ["3", "3.jpg", false]]);
    assert.deepEqual(skipped, [{ path: "2", kind: "upgrade-planner" }]);
    for (const entry of blueprints) assert.deepEqual(decodeBlueprintString(blueprintStringOf(entry)).blueprint, entry.blueprint);
});

test("the platform ship fixture is one blueprint with a hub, foundation and platform-only entities", async () => {
    const { value } = await readInput(new URL("./fixtures/platform-ship.json", import.meta.url).pathname);
    const { blueprints } = listBlueprints(value);
    assert.equal(blueprints.length, 1);
    const names = blueprints[0].blueprint.entities.map(entity => entity.name);
    assert.deepEqual(names, ["space-platform-hub", "thruster", "asteroid-collector", "constant-combinator"]);
    assert.ok(blueprints[0].blueprint.tiles.every(tile => tile.name === "space-platform-foundation"));
});

test("the real ship fixture (Heisenberg MK3A, exported from the game) decodes to one blueprint with a hub", async () => {
    const { value, format } = await readInput(new URL("./fixtures/heisenberg-ship.txt", import.meta.url).pathname);
    assert.equal(format, "string");
    const { blueprints } = listBlueprints(value);
    assert.equal(blueprints.length, 1);
    const { entities, tiles } = blueprints[0].blueprint;
    assert.equal(entities.length, 2550);
    assert.equal(tiles.length, 6991);
    assert.deepEqual(entities.find(entity => entity.name === "space-platform-hub").position, { x: 0, y: 0 });
});
