// The launcher against a fake Factorio (fake-factorio.js): start, RCON, join, build, screenshot, stitch, publish,
// and above all that no game process is ever left running.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { encodeBlueprintString } from "../src/codec.js";
import { FRAMING_DEFAULTS } from "../src/framing.js";
import { blueprintHash } from "../src/manifest.js";
import { render } from "../src/render.js";
import { alive, fakeInstall, fakePids, row, sampleBook, tempDir } from "./helpers.js";

const BIN = new URL("../bin/render.js", import.meta.url).pathname;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function setup(t) {
    const dir = await tempDir("render-launch-");
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    const { root } = await fakeInstall(dir);
    return { dir, root, work: path.join(dir, "work"), out: path.join(dir, "renders") };
}

function options(env, overrides = {}) {
    return {
        factorio: env.root, out: env.out, framing: { ...FRAMING_DEFAULTS }, workDir: env.work, keepWork: false,
        backdrop: ["lab-dark-1", "black-refined-concrete"],
        hideStatusIcons: true, timeoutSeconds: 20, ...overrides,
    };
}

async function assertNothingRunning(work) {
    const pids = await fakePids(work);
    assert.ok(pids.length > 0, "the fake game wrote no pid");
    for (const pid of pids) assert.equal(alive(pid), false, `process ${pid} is still running`);
}

test("a book renders one image per blueprint at its slot path, and the game is closed", async t => {
    const env = await setup(t);
    const input = path.join(env.dir, "blueprint.json");
    const book = sampleBook();
    book.blueprint_book.blueprints.push({ index: 6, blueprint: row("unplaceable", 2, 0, "fake-unplaceable-thing") });
    await fs.writeFile(input, JSON.stringify(book, null, 2));
    await fs.mkdir(env.out, { recursive: true });
    // stale render images (also nested), and files that are not render images and must stay
    for (const file of ["9.jpg", "5.jpg", "7/1.jpg", "7/2/0.jpg", "notes.txt", "cover.jpg", "extra/0.jpg", "2/notes.md"]) {
        await fs.mkdir(path.dirname(path.join(env.out, file)), { recursive: true });
        await fs.writeFile(path.join(env.out, file), "old");
    }
    const messages = [];
    const report = await render({ ...options(env), input }, message => messages.push(message));

    // A, B, C, D render; 4 is tiles only (the fake builds no tiles), 5 is empty, 6 cannot be placed
    assert.equal(report.schema, 2);
    assert.equal(report.only, null);
    assert.deepEqual(report.images.map(image => [image.path, image.file, image.label]), [["0", "0.jpg", "A"], ["2/0", "2/0.jpg", "B"], ["2/1", "2/1.jpg", "C"], ["3", "3.jpg", "D"]]);
    assert.deepEqual(report.without_image.map(item => [item.path, item.file, item.reason]), [
        ["4", "4.jpg", "nothing of it could be built (tried ordinary, platform)"], ["5", "5.jpg", "empty blueprint"],
        ["6", "6.jpg", "nothing of it could be built (tried ordinary, platform)"],
    ]);
    assert.deepEqual(report.without_image.find(item => item.path === "6").attempts.map(attempt => attempt.strategy), ["ordinary", "platform"]);
    assert.ok(report.images.every(image => image.strategy === "ordinary"));
    // the plain log has the counts and every problem, not only --json
    assert.ok(messages.includes("  [ordinary] built 0 entities, 0 tiles; failed: none; missing: 2× fake-unplaceable-thing"), messages.join("\n"));
    assert.ok(messages.some(line => line.startsWith("  [ordinary] built 3 entities, 0 tiles; failed: none; missing: none")));
    assert.deepEqual(report.without_image.find(item => item.path === "6").missing, { "fake-unplaceable-thing": 2 });
    assert.deepEqual(report.skipped.map(item => item.kind), ["upgrade-planner", "deconstruction-planner"]);
    assert.deepEqual((await fs.readdir(env.out, { recursive: true })).sort(),
        ["0.jpg", "2", "2/0.jpg", "2/1.jpg", "2/notes.md", "3.jpg", "cover.jpg", "extra", "extra/0.jpg", "notes.txt", "render.json"]);
    // the manifest lists exactly the images produced, keyed by slot path, with the blueprint's hash
    const manifest = JSON.parse(await fs.readFile(path.join(env.out, "render.json"), "utf8"));
    assert.equal(report.manifest, path.join(env.out, "render.json"));
    assert.equal(manifest.schema, 1);
    assert.ok(new Date(manifest.rendered_at).toISOString() === manifest.rendered_at);
    assert.deepEqual(Object.keys(manifest.entries).sort(), ["0", "2/0", "2/1", "3"]);
    // written with keys in code-point order, so the file diffs cleanly
    const raw = await fs.readFile(path.join(env.out, "render.json"), "utf8");
    assert.deepEqual([...raw.matchAll(/^    "([^"]+)": \{$/gm)].map(match => match[1]), ["0", "2/0", "2/1", "3"]);
    assert.deepEqual(manifest.entries["2/1"], { file: "2/1.jpg", height: report.images[2].height, sha256: blueprintHash(row("C", 3)), width: report.images[2].width });
    assert.equal(report.images[2].sha256, blueprintHash(row("C", 3)));
    // stale render images are gone, nested ones too, and the slot folders they leave empty
    assert.deepEqual(report.removed, ["5.jpg", "7/1.jpg", "7/2/0.jpg", "9.jpg"]);
    assert.ok(messages.includes(`Removed stale ${path.join(env.out, "7", "1.jpg")}`));
    assert.ok(messages.includes(`Wrote ${path.join(env.out, "2", "1.jpg")} (${report.images[2].width}×${report.images[2].height})`));
    assert.ok(messages.some(line => line.startsWith('Blueprint 2/1 "C"')), messages.join("\n"));
    const meta = await sharp(path.join(env.out, "2", "1.jpg")).metadata();
    assert.equal(meta.format, "jpeg");
    assert.equal(meta.width, report.images[2].width);
    // C is 3 machines in a row, which the fake reports as a 7 × 1 tile area; plus 2 tiles of margin each side
    assert.equal(report.images[2].pixels_per_tile, 48);
    assert.ok(meta.width >= 11 * 48 && meta.height >= 5 * 48 && meta.width < 12 * 48, `${meta.width}×${meta.height}`);
    await assertNothingRunning(env.work);
    // all technologies are researched once, before building, and the backdrop goes with every build
    assert.equal(await fs.readFile(path.join(env.work, "server", "setup.done"), "utf8"), "researched");
    assert.deepEqual(report.setup, { technologies_researched: 250, recipes_still_disabled: 0 });
    assert.ok(messages.includes("Researched all technologies (250); recipes still disabled: 0"));
    const builds = (await fs.readFile(path.join(env.work, "server", "builds.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
    assert.ok(builds.every(job => JSON.stringify(job.backdrop) === JSON.stringify(["lab-dark-1", "black-refined-concrete"])));
    // the work directory was chosen, so it is kept, with the logs
    await fs.access(path.join(env.work, "server-output.log"));
    const shots = (await fs.readFile(path.join(env.work, "server", "screenshots.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
    assert.equal(shots.length, 4);
    assert.ok(shots.every(shot => shot.show_entity_info === true && shot.show_gui === false && shot.surface.startsWith("blueprint-render-")));
});

test("a space platform blueprint is built on a platform first; others fall back to it", async t => {
    const env = await setup(t);
    const input = path.join(env.dir, "blueprint.json");
    const ship = row("ship", 2, 0, "steel-chest");
    ship.entities.push({ entity_number: 9, name: "thruster", position: { x: 3, y: 3.5 } });
    ship.tiles = [{ name: "space-platform-foundation", position: { x: 0, y: 0 } }];
    await fs.writeFile(input, JSON.stringify({ blueprint_book: { blueprints: [{ index: 0, blueprint: ship }, { index: 1, blueprint: row("plain", 1) }] } }));
    const messages = [];
    const report = await render({ ...options(env), input }, message => messages.push(message));
    assert.deepEqual(report.images.map(image => [image.path, image.strategy, image.attempts.length]), [["0", "platform", 1], ["1", "ordinary", 1]]);
    assert.ok(messages.some(line => line.startsWith("  space platform blueprint: thruster is platform only; foundation tiles; trying platform, then ordinary")), messages.join("\n"));
    assert.deepEqual(report.images[0].missing, { "steel-chest": 2 });
    assert.ok(messages.some(line => line.startsWith("  [platform] problem: steel-chest cannot be built here: it needs gravity")), messages.join("\n"));
    const shots = (await fs.readFile(path.join(env.work, "server", "screenshots.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
    // no hub: a starfield surface under the launcher's own name, not a platform
    assert.deepEqual(shots.map(shot => shot.surface), ["blueprint-render-0-platform", "blueprint-render-1-ordinary"]);
    assert.deepEqual((await fs.readFile(path.join(env.work, "server", "prepared.log"), "utf8")).trim().split("\n"), ["blueprint-render-0-platform", "blueprint-render-1-ordinary"]);
    assert.deepEqual((await fs.readFile(path.join(env.work, "server", "deleted.log"), "utf8")).trim().split("\n"), ["blueprint-render-0-platform", "blueprint-render-1-ordinary"]);
    await assertNothingRunning(env.work);
});

test("the platform ship fixture renders on a platform", async t => {
    const env = await setup(t);
    const input = new URL("./fixtures/platform-ship.json", import.meta.url).pathname;
    const report = await render({ ...options(env), input }, () => {});
    assert.deepEqual(report.images.map(image => [image.path, image.file, image.strategy]), [["", "0.jpg", "platform"]]);
    // a ship with a hub is built on a real space platform
    const shots = (await fs.readFile(path.join(env.work, "server", "screenshots.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(shots.map(shot => shot.surface), ["platform-1"]);
    await assertNothingRunning(env.work);
});

test("without Space Age a platform blueprint gets an ordinary attempt that says why it failed", async t => {
    const env = await setup(t);
    const input = path.join(env.dir, "bp.txt");
    const ship = row("ship", 1, 0, "thruster");
    await fs.writeFile(input, encodeBlueprintString({ blueprint: ship }));
    process.env.FAKE_NO_SPACE_AGE = "1";
    t.after(() => { delete process.env.FAKE_NO_SPACE_AGE; });
    const messages = [];
    const report = await render({ ...options(env), input }, message => messages.push(message));
    assert.equal(report.images.length, 0);
    const [missing] = report.without_image;
    assert.equal(missing.reason, "nothing of it could be built (tried ordinary)");
    assert.deepEqual(missing.problems, ["build_blueprint placed no ghosts at all on a lab-tile surface"]);
    assert.ok(messages.includes("  [ordinary] problem: build_blueprint placed no ghosts at all on a lab-tile surface"));
    assert.ok(messages.some(line => line.startsWith("  [ordinary] diagnostics: ")));
});

test("a car over a heat pipe, which build_blueprint gives no ghost, is created directly and counted as built, not missing", async t => {
    const env = await setup(t);
    const input = path.join(env.dir, "bp.txt");
    // a car used as a chest: over a heat pipe and between two inserters, as in Quantum Blade
    const entities = [
        { entity_number: 1, name: "car", position: { x: 146.953125, y: 5.05078125 }, orientation: 0.90625,
            items: [{ id: { name: "rocket-fuel" }, items: { in_inventory: [{ inventory: 1, stack: 0, count: 20 }] } }] },
        { entity_number: 2, name: "heat-pipe", position: { x: 147.5, y: 5.5 } },
        { entity_number: 3, name: "stack-inserter", position: { x: 146.5, y: 2.5 } },
        { entity_number: 4, name: "stack-inserter", position: { x: 146.5, y: 7.5 } },
    ];
    await fs.writeFile(input, encodeBlueprintString({ blueprint: { item: "blueprint", label: "wedged", entities, version: 562949958139904 } }));
    const messages = [];
    const report = await render({ ...options(env), input }, message => messages.push(message));
    assert.deepEqual(report.images.map(image => [image.strategy, image.built, image.failed]), [["ordinary", 4, {}]]);
    const fallback = "created 1 car directly with create_entity: the game built none from the blueprint (no ghost, or its ghost would not revive)";
    assert.deepEqual(report.images[0].problems, [fallback]);
    assert.ok(messages.includes("  [ordinary] built 4 entities, 0 tiles; failed: none; missing: none"), messages.join("\n"));
    assert.ok(messages.includes(`  [ordinary] problem: ${fallback}`));
    assert.ok(messages.includes('  [ordinary] diagnostics: {"surface_kind":"ordinary","ghosts":3}'), messages.join("\n"));
    // the line the owner looks for in render.log
    const log = await fs.readFile(path.join(env.work, "render.log"), "utf8");
    assert.ok(log.includes(`[ordinary] problem: ${fallback}`), log);
    assert.match(log, /\[ordinary\] built 4 entities, 0 tiles; failed: none; missing: none/);
    await assertNothingRunning(env.work);
});

test("a blueprint the game refuses completely gets the diagnosis matrix, and the run's log and report are kept", async t => {
    const env = await setup(t);
    const input = path.join(env.dir, "bp.txt");
    await fs.writeFile(input, encodeBlueprintString({ blueprint: row("x", 1) }));
    process.env.FAKE_FACTORIO_MODE = "refuse-all";
    t.after(() => { delete process.env.FAKE_FACTORIO_MODE; });
    const messages = [];
    const report = await render({ ...options(env), input, workDir: undefined }, message => messages.push(message));
    assert.equal(report.images.length, 0);
    const [missing] = report.without_image;
    assert.deepEqual(missing.diagnosis.lines.length, 2);
    assert.ok(messages.includes("  [diagnose] full (1 entities, 0 tiles) | lab tiles: 0 entity ghosts, 0 tile ghosts"));
    // a temporary work directory is kept because a blueprint got no image, with render.log and report.json
    const log = await fs.readFile(path.join(report.work_dir, "render.log"), "utf8");
    assert.match(log, /\[ordinary\] problem: build_blueprint placed no ghosts/);
    assert.match(log, /\[diagnose\] can_place_entity thruster/);
    assert.match(log, /No image for blueprint \(single blueprint\) "x"/);
    const saved = JSON.parse(await fs.readFile(path.join(report.work_dir, "report.json"), "utf8"));
    assert.equal(saved.without_image[0].diagnosis.experiments[0].entity_ghosts, 0);
    assert.ok(messages.includes(`Run log: ${path.join(report.work_dir, "render.log")}`));
    assert.equal((await fs.readFile(path.join(report.work_dir, "server", "diagnose.log"), "utf8")).trim(), "blueprint-render-0-diagnose");
    await fs.rm(report.work_dir, { recursive: true, force: true });
});

test("--diagnose runs the matrix for a blueprint that renders fine", async t => {
    const env = await setup(t);
    const input = path.join(env.dir, "bp.txt");
    await fs.writeFile(input, encodeBlueprintString({ blueprint: row("x", 1) }));
    const report = await render({ ...options(env), input, diagnose: true }, () => {});
    assert.equal(report.images.length, 1);
    assert.equal(report.images[0].diagnosis.lines.length, 2);
    await assertNothingRunning(env.work);
});

test("a failed run writes its log and report into the work directory", async t => {
    const env = await setup(t);
    const input = path.join(env.dir, "bp.txt");
    await fs.writeFile(input, encodeBlueprintString({ blueprint: row("x", 1) }));
    process.env.FAKE_FACTORIO_MODE = "client-crash";
    t.after(() => { delete process.env.FAKE_FACTORIO_MODE; });
    await assert.rejects(render({ ...options(env), input }, () => {}), /game window closed/);
    assert.match(await fs.readFile(path.join(env.work, "render.log"), "utf8"), /Failed: The Factorio game window closed/);
    assert.match(JSON.parse(await fs.readFile(path.join(env.work, "report.json"), "utf8")).error, /game window closed/);
});

test("the render manifest: empty blueprints absent, --only drops removed images, a failed run leaves it alone", async t => {
    const env = await setup(t);
    const input = path.join(env.dir, "blueprint.json");
    const book = { blueprint_book: { blueprints: [
        { index: 0, blueprint: row("A", 1) }, { index: 1, blueprint: row("B", 1) }, { index: 2, blueprint: { item: "blueprint", label: "empty" } },
    ] } };
    await fs.writeFile(input, JSON.stringify(book));
    await render({ ...options(env), input }, () => {});
    const manifestFile = path.join(env.out, "render.json");
    const first = JSON.parse(await fs.readFile(manifestFile, "utf8"));
    assert.deepEqual(Object.keys(first.entries), ["0", "1"]);
    const text = await fs.readFile(manifestFile, "utf8");
    assert.ok(text.endsWith("}\n") && !text.includes("\r"));
    assert.deepEqual([...text.matchAll(/^  "(\w+)":/gm)].map(match => match[1]), ["entries", "rendered_at", "schema"]);

    // slot 1 becomes unplaceable: an --only run removes its image and its manifest entry, and keeps slot 0's
    book.blueprint_book.blueprints[1].blueprint = row("B", 1, 0, "fake-unplaceable-thing");
    await fs.writeFile(input, JSON.stringify(book));
    const onlyRun = await render({ ...options(env), input, only: ["1"], workDir: path.join(env.dir, "work-2") }, () => {});
    assert.deepEqual(onlyRun.removed, ["1.jpg"]);
    const second = JSON.parse(await fs.readFile(manifestFile, "utf8"));
    assert.deepEqual(second.entries, { 0: first.entries[0] });

    // --only for slot 0 again with a changed blueprint updates its hash
    book.blueprint_book.blueprints[0].blueprint = row("A changed", 1);
    await fs.writeFile(input, JSON.stringify(book));
    await render({ ...options(env), input, only: ["0"], workDir: path.join(env.dir, "work-3") }, () => {});
    assert.equal(JSON.parse(await fs.readFile(manifestFile, "utf8")).entries[0].sha256, blueprintHash(row("A changed", 1)));

    // a failed run touches neither the images nor the manifest
    const before = await fs.readFile(manifestFile, "utf8");
    process.env.FAKE_FACTORIO_MODE = "client-crash";
    t.after(() => { delete process.env.FAKE_FACTORIO_MODE; });
    await assert.rejects(render({ ...options(env), input, workDir: path.join(env.dir, "work-4") }, () => {}), /game window closed/);
    assert.equal(await fs.readFile(manifestFile, "utf8"), before);
    assert.deepEqual((await fs.readdir(env.out)).sort(), ["0.jpg", "render.json"]);
});

test("without --work-dir, a temporary work directory is used and removed after success", async t => {
    const env = await setup(t);
    const input = path.join(env.dir, "bp.txt");
    await fs.writeFile(input, encodeBlueprintString({ blueprint: row("x", 2) }));
    const report = await render({ ...options(env), input, workDir: undefined }, () => {});
    assert.deepEqual((await fs.readdir(env.out)).sort(), ["0.jpg", "render.json"]);
    // a single blueprint's manifest key is "0"
    assert.deepEqual(Object.keys(JSON.parse(await fs.readFile(path.join(env.out, "render.json"), "utf8")).entries), ["0"]);
    await assert.rejects(fs.access(report.work_dir));
});

test("a large build is captured as a grid and stitched", async t => {
    const env = await setup(t);
    const input = path.join(env.dir, "big.txt");
    await fs.writeFile(input, encodeBlueprintString({ blueprint: row("long", 60) }));
    const framing = { ...FRAMING_DEFAULTS, maxSize: 256, minPixelsPerTile: 8, maxOutputSize: 4096 };
    const report = await render({ ...options(env), input, framing }, () => {});
    const [image] = report.images;
    assert.ok(image.screenshots > 1);
    assert.equal(image.pixels_per_tile, 8);
    const meta = await sharp(path.join(env.out, "0.jpg")).metadata();
    assert.ok(meta.width > 256);
    assert.equal(meta.width, image.width);
    await assertNothingRunning(env.work);
});

test("a server that dies at start fails the run with its output, and leaves nothing running", async t => {
    const env = await setup(t);
    const input = path.join(env.dir, "bp.txt");
    await fs.writeFile(input, encodeBlueprintString({ blueprint: row("x", 1) }));
    process.env.FAKE_FACTORIO_MODE = "exit-early";
    t.after(() => { delete process.env.FAKE_FACTORIO_MODE; });
    await assert.rejects(render({ ...options(env), input }, () => {}), /server exited \(code 1[\s\S]*fake server failed to start/);
    await assertNothingRunning(env.work);
    await assert.rejects(fs.access(env.out));
});

test("an executable that cannot be started fails clearly", async t => {
    const env = await setup(t);
    const input = path.join(env.dir, "bp.txt");
    await fs.writeFile(input, encodeBlueprintString({ blueprint: row("x", 1) }));
    await fs.chmod(path.join(env.root, "bin", "x64", "factorio"), 0o644);
    await assert.rejects(render({ ...options(env), input }, () => {}), /Could not start Factorio: .*EACCES/);
});

test("a server that never opens RCON times out and is killed", async t => {
    const env = await setup(t);
    const input = path.join(env.dir, "bp.txt");
    await fs.writeFile(input, encodeBlueprintString({ blueprint: row("x", 1) }));
    process.env.FAKE_FACTORIO_MODE = "hang";
    t.after(() => { delete process.env.FAKE_FACTORIO_MODE; });
    await assert.rejects(render({ ...options(env), input, timeoutSeconds: 2 }, () => {}), /did not open its RCON port in time/);
    await assertNothingRunning(env.work);
});

test("a game window that closes fails the run and the server is stopped", async t => {
    const env = await setup(t);
    const input = path.join(env.dir, "bp.txt");
    await fs.writeFile(input, encodeBlueprintString({ blueprint: row("x", 1) }));
    process.env.FAKE_FACTORIO_MODE = "client-crash";
    t.after(() => { delete process.env.FAKE_FACTORIO_MODE; });
    await assert.rejects(render({ ...options(env), input }, () => {}), /game window closed/);
    await assertNothingRunning(env.work);
});

test("a screenshot that never arrives times out without leaving the game running", async t => {
    const env = await setup(t);
    const input = path.join(env.dir, "bp.txt");
    await fs.writeFile(input, encodeBlueprintString({ blueprint: row("x", 1) }));
    process.env.FAKE_FACTORIO_MODE = "no-screenshot";
    t.after(() => { delete process.env.FAKE_FACTORIO_MODE; });
    const { Session } = await import("../src/factorio.js");
    const original = Session.prototype.takeScreenshot;
    Session.prototype.takeScreenshot = function (args) { return original.call(this, { ...args, timeoutMs: 1000 }); };
    t.after(() => { Session.prototype.takeScreenshot = original; });
    await assert.rejects(render({ ...options(env), input }, () => {}), /Timed out .* waiting for the screenshot/);
    await assertNothingRunning(env.work);
});

test("a game that stops answering is stopped", async t => {
    const env = await setup(t);
    const input = path.join(env.dir, "bp.txt");
    await fs.writeFile(input, encodeBlueprintString({ blueprint: row("x", 1) }));
    process.env.FAKE_FACTORIO_MODE = "stall-build";
    const { Session } = await import("../src/factorio.js");
    const original = Session.commandTimeoutMs;
    Session.commandTimeoutMs = 1000;
    t.after(() => { delete process.env.FAKE_FACTORIO_MODE; Session.commandTimeoutMs = original; });
    await assert.rejects(render({ ...options(env), input }, () => {}), /did not answer within 1 s/);
    await assertNothingRunning(env.work);
});

test("the command line: exit codes, --json report, --list", async t => {
    const env = await setup(t);
    const input = path.join(env.dir, "blueprint.json");
    await fs.writeFile(input, JSON.stringify(sampleBook()));
    const run = (args, extraEnv = {}) => new Promise(resolve => {
        const child = spawn(process.execPath, [BIN, ...args], { env: { ...process.env, FACTORIO_RENDER_CONFIG: "", ...extraEnv } });
        let stdout = "", stderr = "";
        child.stdout.on("data", chunk => { stdout += chunk; });
        child.stderr.on("data", chunk => { stderr += chunk; });
        child.on("exit", code => resolve({ code, stdout, stderr }));
    });
    const config = path.join(env.dir, "render.json");
    await fs.writeFile(config, JSON.stringify({ factorio: env.root }));

    const listed = await run(["--input", input, "--list", "--json", "--config", config]);
    assert.equal(listed.code, 0, listed.stderr);
    const listing = JSON.parse(listed.stdout);
    assert.deepEqual(listing.blueprints.map(entry => entry.file), ["0.jpg", "2/0.jpg", "2/1.jpg", "3.jpg", "4.jpg", "5.jpg"]);
    assert.deepEqual(listing.entries.map(entry => [entry.path, entry.kind]).slice(0, 4), [["", "blueprint-book"], ["0", "blueprint"], ["1", "upgrade-planner"], ["2", "blueprint-book"]]);
    const plain = await run(["--input", input, "--list", "--config", config]);
    assert.equal(plain.code, 0, plain.stderr);
    assert.match(plain.stdout, /^\(root\)  blueprint-book  Main$/m);
    assert.match(plain.stdout, /^  2\/1  blueprint  C  -> 2\/1\.jpg$/m);
    assert.match(plain.stdout, /^1  upgrade-planner  \(no label\)$/m);
    assert.match(plain.stdout, /^5  blueprint  E \(empty\)  -> 5\.jpg \[empty: no image\]$/m);

    const rendered = await run(["--input", input, "--out", env.out, "--json", "--config", config, "--work-dir", env.work]);
    assert.equal(rendered.code, 2, rendered.stderr); // the empty and tiles-only blueprints have no image
    const json = JSON.parse(rendered.stdout);
    assert.deepEqual(json.images.map(image => [image.path, image.file]), [["0", "0.jpg"], ["2/0", "2/0.jpg"], ["2/1", "2/1.jpg"], ["3", "3.jpg"]]);
    for (const image of json.images) {
        for (const key of ["label", "width", "height", "failed", "missing", "problems"]) assert.ok(key in image, `${key} in image`);
    }
    assert.match(rendered.stderr, /No image for blueprint 5 "E \(empty\)": empty blueprint/);

    // --only renders just that entry and leaves the other images alone
    const before = await fs.stat(path.join(env.out, "0.jpg"));
    await fs.writeFile(path.join(env.out, "2", "9.jpg"), "stale inside the selection");
    const only = await run(["--input", input, "--out", env.out, "--json", "--config", config, "--only", "2/1,4", "--only", "2", "--work-dir", path.join(env.dir, "work-only")]);
    assert.equal(only.code, 2, only.stderr); // 4 is tiles only and gets no image
    const onlyReport = JSON.parse(only.stdout);
    assert.deepEqual(onlyReport.only, ["2/1", "4", "2"]);
    assert.deepEqual(onlyReport.images.map(image => image.file), ["2/0.jpg", "2/1.jpg"]);
    assert.deepEqual(onlyReport.removed, ["2/9.jpg"]);
    // the manifest keeps the entries outside the selection and updates the ones rendered
    const merged = JSON.parse(await fs.readFile(path.join(env.out, "render.json"), "utf8"));
    assert.deepEqual(Object.keys(merged.entries).sort(), ["0", "2/0", "2/1", "3"]);
    assert.equal(merged.entries["2/1"].sha256, onlyReport.images[1].sha256);
    assert.equal((await fs.stat(path.join(env.out, "0.jpg"))).mtimeMs, before.mtimeMs);
    assert.deepEqual((await fs.readdir(env.out, { recursive: true })).filter(file => file.endsWith(".jpg")).sort(), ["0.jpg", "2/0.jpg", "2/1.jpg", "3.jpg"]);
    const unknown = await run(["--input", input, "--out", env.out, "--config", config, "--only", "8"]);
    assert.equal(unknown.code, 1);
    assert.match(unknown.stderr, /--only 8: no blueprint at this slot path/);
    await assertNothingRunning(env.work);

    const failed = await run(["--input", path.join(env.dir, "missing.json"), "--out", env.out, "--config", config]);
    assert.equal(failed.code, 1);
    assert.match(failed.stderr, /render: Cannot read input/);
});

test("Ctrl+C stops the game", async t => {
    const env = await setup(t);
    const input = path.join(env.dir, "bp.txt");
    await fs.writeFile(input, encodeBlueprintString({ blueprint: row("x", 1) }));
    const child = spawn(process.execPath, [BIN, "--input", input, "--out", env.out, "--factorio", env.root, "--work-dir", env.work, "--timeout", "60"], {
        env: { ...process.env, FACTORIO_RENDER_CONFIG: "", FAKE_FACTORIO_MODE: "hang" }, stdio: "ignore",
    });
    const exited = new Promise(resolve => child.on("exit", code => resolve(code)));
    const deadline = Date.now() + 10_000;
    while ((await fakePids(env.work)).length === 0 && Date.now() < deadline) await sleep(50);
    const [pid] = await fakePids(env.work);
    assert.ok(pid && alive(pid));
    child.kill("SIGINT");
    assert.equal(await exited, 130);
    await sleep(100);
    assert.equal(alive(pid), false);
});

const clientStarts = async env => (await fs.readFile(path.join(env.work, "client", "client-starts.log"), "utf8")).trim().split("\n");

test("on Linux the game client runs without a window unless --show-window is given", { skip: process.platform !== "linux" }, async t => {
    const env = await setup(t);
    const input = path.join(env.dir, "bp.txt");
    await fs.writeFile(input, encodeBlueprintString({ blueprint: row("x", 1) }));
    const messages = [];
    const report = await render({ ...options(env), input }, message => messages.push(message));
    assert.deepEqual(await clientStarts(env), ["offscreen"]);
    assert.equal(report.window, "no window (SDL offscreen video driver)");
    assert.ok(messages.some(line => line.includes("starting the game client with no window")), messages.join("\n"));
    await assertNothingRunning(env.work);

    const shown = await setup(t);
    const visible = await render({ ...options(shown, { showWindow: true }), input }, () => {});
    assert.deepEqual(await clientStarts(shown), [process.env.SDL_VIDEO_DRIVER ?? "<unset>"]);
    assert.equal(visible.window, "a visible game window");
    await assertNothingRunning(shown.work);
});

test("a hidden client that cannot start is replaced by a visible window, with a notice", { skip: process.platform !== "linux" }, async t => {
    const env = await setup(t);
    const input = path.join(env.dir, "bp.txt");
    await fs.writeFile(input, encodeBlueprintString({ blueprint: row("x", 1) }));
    process.env.FAKE_FACTORIO_MODE = "offscreen-fails";
    t.after(() => { delete process.env.FAKE_FACTORIO_MODE; });
    const messages = [];
    const report = await render({ ...options(env), input }, message => messages.push(message));
    assert.equal(report.images.length, 1);
    assert.deepEqual(await clientStarts(env), ["offscreen", "<unset>"]);
    assert.equal(report.window, "a visible game window");
    assert.ok(messages.some(line => line.startsWith("The hidden game client exited before joining")), messages.join("\n"));
    await assertNothingRunning(env.work);
});
