// One render run: list the blueprints, start the game, build and capture each one, publish the JPEGs.
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { blueprintStringOf, listBlueprints, readInput } from "./blueprints.js";
import { Session, resolveFactorioExecutable } from "./factorio.js";
import { planCapture } from "./framing.js";
import { convertToJpeg, stitchToJpeg } from "./image.js";

/** Ticks the game runs after a build before its screenshot, so the client has caught up and drawn it */
export const SETTLE_TICKS = 120;
const SCREENSHOT_TIMEOUT_MS = 120_000;
const IMAGE_NAME = /^(\d+)\.jpg$/;

/**
 * @typedef {object} RenderOptions
 * @property {string} factorio        executable or install folder
 * @property {string} input           blueprint.json or a file with a blueprint string
 * @property {string} out             folder for <n>.jpg
 * @property {import("./framing.js").FRAMING_DEFAULTS} framing
 * @property {string} [mods]          extra mods folder
 * @property {string} [save]          start from this save instead of the mod's scenario
 * @property {string} [workDir]       must be empty or missing
 * @property {boolean} keepWork
 * @property {boolean} hideStatusIcons
 * @property {number} timeoutSeconds  for the game to start and the window to join
 */

/** The game's JSON writer turns an empty Lua table into [] */
const asCounts = value => (value && !Array.isArray(value) ? value : {});

async function makeWorkDir(requested) {
    if (!requested) return { dir: await fsp.mkdtemp(path.join(os.tmpdir(), "factorio-render-")), chosen: false };
    const dir = path.resolve(requested);
    const entries = await fsp.readdir(dir).catch(error => {
        if (error.code === "ENOENT") return [];
        throw error;
    });
    if (entries.length) throw new Error(`--work-dir ${dir} is not empty; choose a new folder`);
    await fsp.mkdir(dir, { recursive: true });
    return { dir, chosen: true };
}

/**
 * Move the new images into `out` and remove numbered images that no longer belong there (the blueprint is gone
 * from the book, or it rendered nothing this time). Other files in `out` are left alone.
 */
export async function publishImages(out, images) {
    await fsp.mkdir(out, { recursive: true });
    const produced = new Set(images.map(image => image.number));
    for (const image of images) {
        const target = path.join(out, `${image.number}.jpg`);
        const temporary = `${target}.tmp`;
        await fsp.copyFile(image.file, temporary);
        await fsp.rename(temporary, target);
    }
    const removed = [];
    for (const name of await fsp.readdir(out)) {
        const match = IMAGE_NAME.exec(name);
        if (match && !produced.has(Number(match[1]))) {
            await fsp.rm(path.join(out, name), { force: true });
            removed.push(name);
        }
    }
    return removed;
}

/**
 * @param {RenderOptions} options
 * @param {(message: string) => void} log
 */
export async function render(options, log) {
    const { value, format } = await readInput(options.input);
    const { blueprints, skipped } = listBlueprints(value);
    for (const item of skipped) log(`Skipping ${item.kind} at book slot ${item.path || "(top level)"}: only blueprints are rendered`);
    const report = { input: path.resolve(options.input), format, out: path.resolve(options.out), images: [], without_image: [], skipped, removed: [], work_dir: null };
    const pending = [];
    for (const entry of blueprints) {
        if (entry.empty) report.without_image.push({ number: entry.number, path: entry.path, label: entry.label, reason: "empty blueprint" });
        else pending.push(entry);
    }
    if (!pending.length) throw new Error("The input holds no blueprint with entities or tiles to render");

    const executable = await resolveFactorioExecutable(options.factorio);
    const { dir: workDir, chosen } = await makeWorkDir(options.workDir);
    report.work_dir = workDir;
    const images = [];
    let succeeded = false;
    let session = null;
    try {
        session = await Session.start({
            executable, workDir, extraModsDir: options.mods, save: options.save,
            hideStatusIcons: options.hideStatusIcons, timeoutSeconds: options.timeoutSeconds, log,
        });
        for (const entry of pending) {
            const name = `${entry.number}${entry.label ? ` "${entry.label}"` : ""}`;
            log(`Building blueprint ${name} (${entry.blueprint.entities?.length ?? 0} entities, ${entry.blueprint.tiles?.length ?? 0} tiles)`);
            const surface = `blueprint-render-${entry.number}`;
            const built = await session.build(blueprintStringOf(entry), surface);
            const notes = {
                failed: asCounts(built.failed), missing: asCounts(built.missing),
                problems: Object.values(built.problems ?? []), import_errors: Boolean(built.import_errors),
            };
            if (built.error || !built.area) {
                const reason = built.error ?? "nothing of it could be built";
                log(`  no image: ${reason}`);
                report.without_image.push({ number: entry.number, path: entry.path, label: entry.label, reason, ...notes });
                await session.deleteSurface(surface);
                continue;
            }
            for (const [what, counts] of [["could not be revived", notes.failed], ["got no ghost (not placeable here)", notes.missing]]) {
                const list = Object.entries(counts).map(([entity, n]) => `${n}× ${entity}`).join(", ");
                if (list) log(`  ${what}: ${list}`);
            }
            for (const problem of notes.problems) log(`  ${problem}`);
            await session.waitUntilTick(built.tick + SETTLE_TICKS, 60_000);

            const plan = planCapture(built.area, options.framing);
            log(`  capturing ${plan.width}×${plan.height} px at ${plan.pixelsPerTile.toFixed(1)} px/tile${plan.shots.length > 1 ? ` in ${plan.shots.length} screenshots` : ""}`);
            const shots = [];
            for (const [index, shot] of plan.shots.entries()) {
                const file = await session.takeScreenshot({
                    name: `render-${entry.number}-${index}.png`, surface, position: shot.position, resolution: shot.resolution,
                    zoom: shot.zoom, anti_alias: shot.anti_alias, timeoutMs: SCREENSHOT_TIMEOUT_MS,
                });
                shots.push({ ...shot, file });
            }
            const jpeg = path.join(workDir, "images", `${entry.number}.jpg`);
            const written = shots.length === 1 ? await convertToJpeg(shots[0].file, jpeg) : await stitchToJpeg(plan, shots, jpeg);
            images.push({ number: entry.number, file: jpeg });
            report.images.push({
                number: entry.number, path: entry.path, label: entry.label, width: written.width, height: written.height,
                bytes: written.bytes, pixels_per_tile: plan.pixelsPerTile, screenshots: shots.length,
                built: built.built, tiles: built.tiles, ...notes,
            });
            await session.deleteSurface(surface);
        }
        succeeded = true;
    } finally {
        await session?.close();
        if (succeeded && !options.keepWork && !chosen) await fsp.rm(workDir, { recursive: true, force: true });
        else log(`Work directory kept: ${workDir} (logs: server-output.log, client-output.log, server/factorio-current.log, client/factorio-current.log)`);
    }
    report.removed = await publishImages(options.out, images);
    for (const image of report.images) log(`Wrote ${path.join(options.out, `${image.number}.jpg`)} (${image.width}×${image.height})`);
    return report;
}
