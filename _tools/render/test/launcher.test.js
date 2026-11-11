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
        hideStatusIcons: true, timeoutSeconds: 20, ...overrides,
    };
}

async function assertNothingRunning(work) {
    const pids = await fakePids(work);
    assert.ok(pids.length > 0, "the fake game wrote no pid");
    for (const pid of pids) assert.equal(alive(pid), false, `process ${pid} is still running`);
}

test("a book renders one image per blueprint, numbered in book order, and the game is closed", async t => {
    const env = await setup(t);
    const input = path.join(env.dir, "blueprint.json");
    const book = sampleBook();
    book.blueprint_book.blueprints.push({ index: 6, blueprint: row("unplaceable", 2, 0, "fake-unplaceable-thing") });
    await fs.writeFile(input, JSON.stringify(book, null, 2));
    await fs.mkdir(env.out, { recursive: true });
    for (const stale of ["9.jpg", "5.jpg", "notes.txt"]) await fs.writeFile(path.join(env.out, stale), "old");
    const messages = [];
    const report = await render({ ...options(env), input }, message => messages.push(message));

    // 0 A, 1 B, 2 C, 3 D render; 4 is tiles only (the fake builds no tiles), 5 is empty, 6 cannot be placed
    assert.deepEqual(report.images.map(image => [image.number, image.label]), [[0, "A"], [1, "B"], [2, "C"], [3, "D"]]);
    assert.deepEqual(report.without_image.map(item => [item.number, item.reason]), [
        [5, "empty blueprint"], [4, "nothing of it could be built"], [6, "nothing of it could be built"],
    ]);
    assert.deepEqual(report.without_image.find(item => item.number === 6).missing, { "fake-unplaceable-thing": 2 });
    assert.deepEqual(report.skipped.map(item => item.kind), ["upgrade_planner", "deconstruction_planner"]);
    assert.deepEqual((await fs.readdir(env.out)).sort(), ["0.jpg", "1.jpg", "2.jpg", "3.jpg", "notes.txt"]);
    assert.deepEqual(report.removed.sort(), ["5.jpg", "9.jpg"]);
    const meta = await sharp(path.join(env.out, "2.jpg")).metadata();
    assert.equal(meta.format, "jpeg");
    assert.equal(meta.width, report.images[2].width);
    // C is 3 machines in a row, which the fake reports as a 7 × 1 tile area; plus 2 tiles of margin each side
    assert.equal(report.images[2].pixels_per_tile, 48);
    assert.ok(meta.width >= 11 * 48 && meta.height >= 5 * 48 && meta.width < 12 * 48, `${meta.width}×${meta.height}`);
    await assertNothingRunning(env.work);
    // the work directory was chosen, so it is kept, with the logs
    await fs.access(path.join(env.work, "server-output.log"));
    const shots = (await fs.readFile(path.join(env.work, "server", "screenshots.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
    assert.equal(shots.length, 4);
    assert.ok(shots.every(shot => shot.show_entity_info === true && shot.show_gui === false && shot.surface.startsWith("blueprint-render-")));
});

test("without --work-dir, a temporary work directory is used and removed after success", async t => {
    const env = await setup(t);
    const input = path.join(env.dir, "bp.txt");
    await fs.writeFile(input, encodeBlueprintString({ blueprint: row("x", 2) }));
    const report = await render({ ...options(env), input, workDir: undefined }, () => {});
    assert.deepEqual(await fs.readdir(env.out), ["0.jpg"]);
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
    assert.deepEqual(JSON.parse(listed.stdout).blueprints.map(entry => entry.number), [0, 1, 2, 3, 4, 5]);

    const rendered = await run(["--input", input, "--out", env.out, "--json", "--config", config, "--work-dir", env.work]);
    assert.equal(rendered.code, 2, rendered.stderr); // the empty and tiles-only blueprints have no image
    assert.deepEqual(JSON.parse(rendered.stdout).images.map(image => image.number), [0, 1, 2, 3]);
    assert.match(rendered.stderr, /No image for blueprint 5: empty blueprint/);
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
