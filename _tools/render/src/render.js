// One render run: list the blueprints, start the game, build and capture each one, publish the JPEGs.
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { blueprintStringOf, listBlueprints, readInput, selectBlueprints, selects } from "./blueprints.js";
import { Session, resolveFactorioExecutable } from "./factorio.js";
import { planCapture } from "./framing.js";
import { convertToJpeg, stitchToJpeg } from "./image.js";
import { blueprintHash, manifestKey, nextManifest, readManifest, writeManifest } from "./manifest.js";

/** Ticks the game runs after a build before its screenshot, so the client has caught up and drawn it */
export const SETTLE_TICKS = 120;
const SCREENSHOT_TIMEOUT_MS = 120_000;
/** A render image under the output folder: slot numbers as folders, the last one as the file name ("3/1.jpg") */
const RENDER_FILE = /^(\d+\/)*\d+\.jpg$/;
const SLOT_FOLDER = /^\d+$/;
/** Version of the report's shape (report.json, --json); 2 added slot paths and render files */
export const REPORT_SCHEMA = 2;

/**
 * @typedef {object} RenderOptions
 * @property {string} factorio        executable or install folder
 * @property {string} input           blueprint.json or a file with a blueprint string
 * @property {string} out             folder for the render files (<slot path>.jpg)
 * @property {string[]} [only]        slot paths to render; the rest of <out> is left alone
 * @property {import("./framing.js").FRAMING_DEFAULTS} framing
 * @property {string} [mods]          extra mods folder
 * @property {string[]} [enableMods]  only these mods (and those they require) from `mods` or the game's mods folder
 * @property {string} [save]          start from this save instead of the mod's scenario
 * @property {string} [workDir]       must be empty or missing
 * @property {boolean} keepWork
 * @property {boolean} hideStatusIcons
 * @property {boolean} [showWindow]   a visible game window instead of none (Linux hides it by default)
 * @property {number} timeoutSeconds  for the game to start and the window to join
 * @property {boolean} [diagnose]  run the experiment matrix for every blueprint
 * @property {[string, string]} [backdrop]  tiles replacing lab-dark-1 and lab-dark-2 on ordinary surfaces
 */

/** The game's JSON writer turns an empty Lua table into [] */
const asCounts = value => (value && !Array.isArray(value) ? value : {});

/**
 * Where a run's own work directory goes when --work-dir is not given. On Linux a disk-backed cache folder
 * ($XDG_CACHE_HOME/factorio-render, else ~/.cache/factorio-render): /tmp is often tmpfs (RAM), and the work directory
 * holds both game instances' write-data for the whole run and is kept after a run with a blueprint left without an
 * image. Elsewhere the system's temporary folder.
 */
export function defaultWorkRoot(platform = process.platform, env = process.env, home = os.homedir()) {
    if (platform !== "linux") return os.tmpdir();
    const cache = env.XDG_CACHE_HOME && path.isAbsolute(env.XDG_CACHE_HOME) ? env.XDG_CACHE_HOME : path.join(home, ".cache");
    return path.join(cache, "factorio-render");
}

async function makeWorkDir(requested) {
    if (!requested) {
        const root = defaultWorkRoot();
        await fsp.mkdir(root, { recursive: true });
        return { dir: await fsp.mkdtemp(path.join(root, "factorio-render-")), chosen: false };
    }
    const dir = path.resolve(requested);
    const entries = await fsp.readdir(dir).catch(error => {
        if (error.code === "ENOENT") return [];
        throw error;
    });
    if (entries.length) throw new Error(`--work-dir ${dir} is not empty; choose a new folder`);
    await fsp.mkdir(dir, { recursive: true });
    return { dir, chosen: true };
}

/** Every render image under `dir`, as "/"-separated paths relative to it */
async function renderFilesUnder(dir, prefix = "") {
    const found = [];
    for (const entry of await fsp.readdir(path.join(dir, prefix), { withFileTypes: true }).catch(() => [])) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory() && SLOT_FOLDER.test(entry.name)) found.push(...await renderFilesUnder(dir, relative));
        else if (entry.isFile() && RENDER_FILE.test(relative)) found.push(relative);
    }
    return found;
}

/** Remove slot folders (all-digit names) under `dir` that are empty, deepest first; never `dir` itself */
async function removeEmptySlotFolders(dir, prefix = "") {
    for (const entry of await fsp.readdir(path.join(dir, prefix), { withFileTypes: true }).catch(() => [])) {
        if (!entry.isDirectory() || !SLOT_FOLDER.test(entry.name)) continue;
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        await removeEmptySlotFolders(dir, relative);
        if ((await fsp.readdir(path.join(dir, relative))).length === 0) await fsp.rmdir(path.join(dir, relative));
    }
}

/**
 * Write the new images into `out` at their render files and remove render images that no longer belong there (the
 * blueprint is gone from the book, moved slot, or rendered nothing this time), then slot folders left empty. Only
 * render images (slot-number paths ending in .jpg) are ever removed; other files are left alone.
 * @param {string} out
 * @param {{ file: string, source: string }[]} images  file: render file relative to `out`; source: the JPEG to copy
 * @param {(file: string) => boolean} [inScope]  only stale files it accepts are removed (all by default)
 * @returns {Promise<string[]>} removed render files, relative to `out`
 */
export async function publishImages(out, images, inScope = () => true) {
    await fsp.mkdir(out, { recursive: true });
    const produced = new Set(images.map(image => image.file));
    for (const image of images) {
        const target = path.join(out, ...image.file.split("/"));
        await fsp.mkdir(path.dirname(target), { recursive: true });
        const temporary = `${target}.tmp`;
        await fsp.copyFile(image.source, temporary);
        await fsp.rename(temporary, target);
    }
    const removed = [];
    for (const file of await renderFilesUnder(out)) {
        if (!produced.has(file) && inScope(file)) {
            await fsp.rm(path.join(out, ...file.split("/")), { force: true });
            removed.push(file);
        }
    }
    await removeEmptySlotFolders(out);
    return removed.sort();
}

/**
 * The run's report: report.json in the work folder and --json on stdout. A caller (the Obsidian plugin) can update
 * notes from it without reading the log.
 * @typedef {object} RenderReport
 * @property {number} schema           REPORT_SCHEMA
 * @property {string} input            the input file, absolute
 * @property {"json" | "string"} format
 * @property {string} out              the output folder, absolute
 * @property {string[] | null} only    the --only slot paths, or null for a whole run
 * @property {ImageResult[]} images    blueprints that got an image, in book order
 * @property {MissingResult[]} without_image  blueprints that got none, in book order
 * @property {{ path: string, kind: string, reason?: string }[]} skipped  planners and ignored duplicate slots
 * @property {string[]} problems       problems with the input itself (duplicate or invalid slot numbers)
 * @property {string[]} removed        stale render files removed from `out`, relative to it
 * @property {string | null} manifest  the render manifest written (<out>/render.json), absolute; null if none
 * @property {string | null} work_dir
 * @property {string} [window]         how the game client was shown
 * @property {object} [setup]          research report from the game
 * @property {string} [error]          why the run failed, when it did
 *
 * @typedef {object} ImageResult
 * @property {string} path             slot path ("3/1"; "" for a lone blueprint)
 * @property {string} file             render file relative to `out`, "/"-separated ("3/1.jpg", "0.jpg")
 * @property {string} label
 * @property {string} sha256           blueprintHash of the blueprint the image shows (as in the manifest)
 * @property {number} width
 * @property {number} height
 * @property {number} bytes
 * @property {number} pixels_per_tile
 * @property {number} screenshots      1, or the number of stitched screenshots
 * @property {string} strategy         "ordinary" or "platform"
 * @property {number} built            entities built
 * @property {number} tiles            blueprint tiles placed
 * @property {Record<string, number>} failed   entity name to count: ghosts that could not be revived
 * @property {Record<string, number>} missing  entity name to count: entities that never got a ghost
 * @property {string[]} problems
 * @property {boolean} import_errors
 * @property {object[]} attempts       every build attempt, in order
 * @property {object} [diagnosis]      the experiment matrix, when it ran
 *
 * @typedef {object} MissingResult
 * @property {string} path
 * @property {string} file             where its image would be; any old image there is removed
 * @property {string} label
 * @property {string} reason
 * @property {Record<string, number>} [failed]
 * @property {Record<string, number>} [missing]
 * @property {string[]} [problems]
 * @property {object[]} [attempts]
 * @property {object} [diagnosis]
 */

/** How an entry is named in the log: its slot path and label */
const nameOf = entry => `${entry.path === "" ? "(single blueprint)" : entry.path}${entry.label ? ` "${entry.label}"` : ""}`;

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
    const name = nameOf(entry);
    const about = { path: entry.path, file: entry.file, label: entry.label };
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
        const surfaceName = `blueprint-render-${entry.key}-${strategy}`;
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
    const diagnosis = await session.diagnose(`blueprint-render-${entry.key}-diagnose`);
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
                name: `render-${entry.key}-${index}.png`, surface: attempt.surface, position: shot.position, resolution: shot.resolution,
                zoom: shot.zoom, anti_alias: shot.anti_alias, timeoutMs: SCREENSHOT_TIMEOUT_MS,
            });
            shots.push({ ...shot, file });
        }
        const jpeg = path.join(workDir, "images", ...entry.file.split("/"));
        const written = shots.length === 1 ? await convertToJpeg(shots[0].file, jpeg) : await stitchToJpeg(plan, shots, jpeg);
        // the raw screenshots (PNG, up to 4096 px square each) are the bulk of a work directory; the JPEG replaces them
        for (const shot of shots) await fsp.rm(shot.file, { force: true });
        return {
            file: jpeg,
            image: {
                ...about, sha256: blueprintHash(entry.blueprint), strategy: attempt.strategy,
                width: written.width, height: written.height, bytes: written.bytes,
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
    const listed = listBlueprints(value);
    const only = options.only?.length ? options.only : null;
    const blueprints = only ? selectBlueprints(listed.blueprints, only) : listed.blueprints;
    // with --only, stale images are removed only where the selection is: its own files and anything under a
    // selected slot path (a slot that was a blueprint and is now a book, or a book whose entries moved)
    const inScope = file => !only || blueprints.some(entry => entry.file === file)
        || only.some(selector => file === `${selector}.jpg` || file.startsWith(`${selector}/`));
    for (const problem of listed.problems) log(`Problem in the input: ${problem}`);
    for (const item of listed.skipped) {
        if (!item.reason && (!only || only.some(selector => selects(selector, item)))) {
            log(`Skipping ${item.kind} at slot ${item.path || "(top level)"}: only blueprints are rendered`);
        }
    }
    if (only) log(`Rendering only ${only.join(", ")}: ${blueprints.length} blueprint(s); other images in ${options.out} are left alone`);
    /** @type {RenderReport} */
    const report = {
        schema: REPORT_SCHEMA, input: path.resolve(options.input), format, out: path.resolve(options.out), only,
        images: [], without_image: [], skipped: listed.skipped, problems: listed.problems, removed: [], manifest: null, work_dir: null,
    };
    const pending = [];
    for (const entry of blueprints) {
        if (entry.empty) report.without_image.push({ path: entry.path, file: entry.file, label: entry.label, reason: "empty blueprint" });
        else pending.push(entry);
    }
    if (!pending.length) throw new Error(`The input holds no blueprint with entities or tiles to render${only ? ` at ${only.join(", ")}` : ""}`);

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
            executable, workDir, extraModsDir: options.mods, enableMods: options.enableMods, save: options.save,
            hideStatusIcons: options.hideStatusIcons, showWindow: options.showWindow, timeoutSeconds: options.timeoutSeconds, log,
        });
        report.window = session.window;
        const setup = await session.setup();
        if (setup.error) throw new Error(`Could not research all technologies: ${setup.error}`);
        log(`Researched all technologies (${setup.technologies_researched}); recipes still disabled: ${setup.recipes_still_disabled}`);
        report.setup = setup;
        for (const entry of pending) {
            const result = await renderOne(session, entry, workDir, options, log);
            if (result.image) {
                images.push({ file: entry.file, source: result.file });
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
    const order = new Map(listed.blueprints.map((entry, position) => [entry.path, position]));
    const byBookOrder = (a, b) => order.get(a.path) - order.get(b.path);
    report.images.sort(byBookOrder);
    report.without_image.sort(byBookOrder);
    report.removed = await publishImages(options.out, images, inScope);
    // the JPEGs are in <out> now; a kept work directory does not need its copies
    await fsp.rm(path.join(workDir, "images"), { recursive: true, force: true });
    // the manifest says which images are current; it is not a render image and cleanup never touches it
    const { manifest: previous, problem: manifestProblem } = only ? await readManifest(options.out) : { manifest: null, problem: null };
    if (manifestProblem) log(`Render manifest: ${manifestProblem}`);
    const produced = report.images.map(image => ({ key: manifestKey(image.path), file: image.file, sha256: image.sha256, width: image.width, height: image.height }));
    report.manifest = await writeManifest(options.out, nextManifest(previous, produced, report.removed, Boolean(only)));
    for (const image of report.images) log(`Wrote ${path.join(options.out, ...image.file.split("/"))} (${image.width}×${image.height})`);
    for (const file of report.removed) log(`Removed stale ${path.join(options.out, ...file.split("/"))}`);
    for (const missing of report.without_image) log(`No image for blueprint ${nameOf(missing)}: ${missing.reason}`);
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
