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
 * @property {boolean} [diagnose]  run the experiment matrix for every blueprint
 * @property {[string, string]} [backdrop]  tiles replacing lab-dark-1 and lab-dark-2 on ordinary surfaces
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
 * The strategies to try for a blueprint, in order. A platform blueprint is built on a space platform first (real
 * space background), then on an ordinary surface; any other blueprint on an ordinary surface first, then on a
 * platform when the game has platforms (a blueprint the game refuses on a planet may still build there).
 * @param {{ platform?: boolean, platforms_available?: boolean }} inspection
 */
export function strategyOrder(inspection) {
    if (inspection.platform) return inspection.platforms_available ? ["platform", "ordinary"] : ["ordinary"];
    return inspection.platforms_available ? ["ordinary", "platform"] : ["ordinary"];
}

const describeCounts = counts => Object.entries(counts).map(([entity, n]) => `${n}× ${entity}`).join(", ") || "none";

/** What one build attempt reported, normalised, and the lines that tell a person about it */
export function summariseAttempt(built) {
    const attempt = {
        strategy: built.strategy, surface: built.surface ?? null, error: built.error ?? null,
        built: built.built ?? 0, tiles: built.tiles ?? 0, has_area: Boolean(built.area), area: built.area ?? null, tick: built.tick ?? 0,
        failed: asCounts(built.failed), missing: asCounts(built.missing),
        problems: Object.values(built.problems ?? []), import_errors: Boolean(built.import_errors),
        diagnostics: built.diagnostics && !Array.isArray(built.diagnostics) ? built.diagnostics : {},
    };
    const tag = `  [${attempt.strategy}]`;
    const lines = attempt.error ? [`${tag} error: ${attempt.error}`] : [
        `${tag} built ${attempt.built} entities, ${attempt.tiles} tiles; failed: ${describeCounts(attempt.failed)}; missing: ${describeCounts(attempt.missing)}`,
        ...attempt.problems.map(problem => `${tag} problem: ${problem}`),
        ...(attempt.import_errors ? [`${tag} problem: the game imported the string with errors (unknown entities or tiles?)`] : []),
        ...(Object.keys(attempt.diagnostics).length ? [`${tag} diagnostics: ${JSON.stringify(attempt.diagnostics)}`] : []),
    ];
    return { attempt, lines };
}

/** Build one blueprint, trying each strategy until one builds something, and capture it */
async function renderOne(session, entry, workDir, options, log) {
    const name = `${entry.number}${entry.label ? ` "${entry.label}"` : ""}`;
    const about = { number: entry.number, path: entry.path, label: entry.label };
    log(`Blueprint ${name} (${entry.blueprint.entities?.length ?? 0} entities, ${entry.blueprint.tiles?.length ?? 0} tiles)`);
    await session.send(blueprintStringOf(entry));
    const inspection = await session.inspect();
    if (inspection.error) {
        log(`  no image: ${inspection.error}`);
        return { missing: { ...about, reason: inspection.error, attempts: [] } };
    }
    const order = strategyOrder(inspection);
    const reasons = Object.values(inspection.reasons ?? []);
    log(`  ${inspection.platform ? `space platform blueprint: ${reasons.join("; ")}` : "ordinary blueprint"}; trying ${order.join(", then ")}`);
    const attempts = [];
    let chosen = null;
    for (const strategy of order) {
        const surfaceName = `blueprint-render-${entry.number}-${strategy}`;
        const { attempt, lines } = summariseAttempt({ strategy, ...await session.build(strategy, surfaceName, options.backdrop) });
        attempts.push(attempt);
        for (const line of lines) log(line);
        if (!attempt.error && attempt.has_area) {
            chosen = { attempt, surfaceName };
            break;
        }
        log(`  [${strategy}] nothing to photograph${attempts.length < order.length ? "; trying the next strategy" : ""}`);
        await session.remove(surfaceName);
    }
    let result;
    if (!chosen) {
        const reason = attempts.length === 1 && attempts[0].error ? attempts[0].error : `nothing of it could be built (tried ${order.join(", ")})`;
        log(`  no image: ${reason}`);
        const last = attempts[attempts.length - 1];
        result = { missing: { ...about, reason, failed: last.failed, missing: last.missing, problems: last.problems, attempts } };
    } else {
        result = await capture(session, entry, workDir, options, log, { ...about, attempt: chosen.attempt, attempts, surfaceName: chosen.surfaceName });
    }
    if (needsDiagnosis(entry, attempts, options.diagnose)) {
        const diagnosis = await diagnose(session, entry, log);
        (result.image ?? result.missing).diagnosis = diagnosis;
    }
    return result;
}

/** Whether to run the experiment matrix: asked for, or some attempt got no ghosts for a blueprint with entities */
export function needsDiagnosis(entry, attempts, asked) {
    if (asked) return true;
    const hasEntities = (entry.blueprint.entities?.length ?? 0) > 0;
    return hasEntities && attempts.some(attempt => !attempt.error && attempt.diagnostics?.ghosts === 0);
}

async function diagnose(session, entry, log) {
    log("  running the diagnosis matrix (scratch surfaces; one line per experiment)");
    const diagnosis = await session.diagnose(`blueprint-render-${entry.number}-diagnose`);
    if (diagnosis.error) {
        log(`  [diagnose] error: ${diagnosis.error}`);
        return diagnosis;
    }
    for (const line of Object.values(diagnosis.lines ?? [])) log(`  ${line}`);
    return { lines: Object.values(diagnosis.lines ?? []), experiments: Object.values(diagnosis.experiments ?? []) };
}

async function capture(session, entry, workDir, options, log, { attempt, attempts, surfaceName, ...about }) {
    try {
        await session.waitUntilTick(attempt.tick + SETTLE_TICKS, 60_000);
        const plan = planCapture(attempt.area, options.framing);
        log(`  [${attempt.strategy}] capturing ${plan.width}×${plan.height} px at ${plan.pixelsPerTile.toFixed(1)} px/tile${plan.shots.length > 1 ? ` in ${plan.shots.length} screenshots` : ""}`);
        const shots = [];
        for (const [index, shot] of plan.shots.entries()) {
            await session.prepare(attempt.surface);
            const file = await session.takeScreenshot({
                name: `render-${entry.number}-${index}.png`, surface: attempt.surface, position: shot.position, resolution: shot.resolution,
                zoom: shot.zoom, anti_alias: shot.anti_alias, timeoutMs: SCREENSHOT_TIMEOUT_MS,
            });
            shots.push({ ...shot, file });
        }
        const jpeg = path.join(workDir, "images", `${entry.number}.jpg`);
        const written = shots.length === 1 ? await convertToJpeg(shots[0].file, jpeg) : await stitchToJpeg(plan, shots, jpeg);
        return {
            file: jpeg,
            image: {
                ...about, strategy: attempt.strategy, width: written.width, height: written.height, bytes: written.bytes,
                pixels_per_tile: plan.pixelsPerTile, screenshots: shots.length, built: attempt.built, tiles: attempt.tiles,
                failed: attempt.failed, missing: attempt.missing, problems: attempt.problems, import_errors: attempt.import_errors,
                attempts,
            },
        };
    } finally {
        await session.remove(surfaceName);
    }
}

/**
 * @param {RenderOptions} options
 * @param {(message: string) => void} log
 */
export async function render(options, print) {
    // everything logged is also kept, for render.log in the work directory
    const logLines = [];
    const log = message => {
        logLines.push(message);
        print(message);
    };
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
    const logFile = path.join(workDir, "render.log");
    const reportFile = path.join(workDir, "report.json");
    const persist = async () => {
        await fsp.writeFile(logFile, logLines.join("\n") + "\n");
        await fsp.writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
    };
    try {
        session = await Session.start({
            executable, workDir, extraModsDir: options.mods, save: options.save,
            hideStatusIcons: options.hideStatusIcons, timeoutSeconds: options.timeoutSeconds, log,
        });
        const setup = await session.setup();
        if (setup.error) throw new Error(`Could not research all technologies: ${setup.error}`);
        log(`Researched all technologies (${setup.technologies_researched}); recipes still disabled: ${setup.recipes_still_disabled}`);
        report.setup = setup;
        for (const entry of pending) {
            const result = await renderOne(session, entry, workDir, options, log);
            if (result.image) {
                images.push({ number: entry.number, file: result.file });
                report.images.push(result.image);
            } else {
                report.without_image.push(result.missing);
            }
        }
        succeeded = true;
    } catch (error) {
        log(`Failed: ${error.message}`);
        report.error = error.message;
        throw error;
    } finally {
        await session?.close();
        if (!succeeded) {
            log(`Work directory kept: ${workDir}`);
            log(`Run log: ${logFile}`);
            log(`Report: ${reportFile} (game logs: server-output.log, client-output.log, server/factorio-current.log, client/factorio-current.log)`);
            await persist().catch(() => {});
        }
    }
    report.removed = await publishImages(options.out, images);
    for (const image of report.images) log(`Wrote ${path.join(options.out, `${image.number}.jpg`)} (${image.width}×${image.height})`);
    for (const missing of report.without_image) log(`No image for blueprint ${missing.number}: ${missing.reason}`);
    // kept whenever a blueprint got no image, so its log and report never need a second run
    const keep = options.keepWork || chosen || report.without_image.length > 0;
    if (keep) {
        log(`Work directory kept: ${workDir}`);
        log(`Run log: ${logFile}`);
        log(`Report: ${reportFile}`);
        await persist();
    } else {
        await fsp.rm(workDir, { recursive: true, force: true });
    }
    return report;
}
