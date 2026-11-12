// Starting Factorio for a render and driving it.
//
// Ported from clock-generator (MIT), src/harness/factorio-harness.ts: a headless server started from a COPY of
// everything it needs (config, mods, game) in a work directory of its own, driven over RCON, plus the graphical
// client joined to it, which is what draws the screenshots (game.take_screenshot does nothing headless). Dropped:
// recording, warm-up, the sidecar mod, the recording cache. Changed: the server starts the mod's scenario instead of
// a prepared save, and the mod directory holds only this tool's mod, the game's own mods and mods the user opts in to.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import dgram from "node:dgram";
import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RconClient } from "./rcon.js";
import { waitForPng } from "./image.js";

export const MOD_NAME = "blueprint-vault-render";
export const SCENARIO = `${MOD_NAME}/stage`;
export const MOD_SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "mod");
const RCON_READY = "Starting RCON interface";
/** No single command may take longer than this (a very large build is one command); the game is then stopped */
export const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_MS = 100;
/** Blueprint strings are sent in parts of this many characters, well under the classic 4096-byte RCON packet */
export const PART_SIZE = 4000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const exists = file => fsp.access(file).then(() => true, () => false);

// ---------------------------------------------------------------------------------------------------------------
// Process bookkeeping: every Factorio process started here is killed on exit, error, timeout or a signal.

/** @type {Set<import("node:child_process").ChildProcess>} */
const running = new Set();

function track(child) {
    running.add(child);
    child.once("exit", () => running.delete(child));
    // a failed spawn (no such file, not executable) emits "error" and may never emit "exit"
    child.on("error", error => {
        child.startError ??= error;
        running.delete(child);
    });
    return child;
}

const isRunning = child => !child.startError && child.exitCode === null && child.signalCode === null;

/** Kill every Factorio process this launcher started, at once. Safe to call from a signal or exit handler. */
export function killAll() {
    for (const child of running) {
        if (isRunning(child)) {
            try { child.kill("SIGKILL"); } catch { /* already gone */ }
        }
    }
}

/** Stop one process: politely first, then by force; resolves when it has exited */
async function stop(child, graceMs) {
    if (!isRunning(child) || child.pid === undefined) return;
    const exited = new Promise(resolve => child.once("exit", resolve));
    try { child.kill(graceMs > 0 ? "SIGTERM" : "SIGKILL"); } catch { /* already gone */ }
    if (graceMs > 0 && await Promise.race([exited.then(() => true), sleep(graceMs).then(() => false)]) === false) {
        try { child.kill("SIGKILL"); } catch { /* already gone */ }
    }
    await exited;
}

// ---------------------------------------------------------------------------------------------------------------
// Locating the game (ported: resolveFactorioExecutable, factorioDataDir)

/** The executable of an install folder, or the path itself when it already is a file */
export async function resolveFactorioExecutable(factorio) {
    if (!factorio) throw new Error("No Factorio given: pass --factorio <path>, set FACTORIO_PATH or put \"factorio\" in the config file");
    const stat = await fsp.stat(factorio).catch(() => null);
    if (!stat) throw new Error(`Factorio not found at ${factorio}`);
    if (stat.isFile()) return path.resolve(factorio);
    const candidates = [
        ["bin", "x64", "factorio"],
        ["bin", "x64", "factorio.exe"],
        ["factorio.app", "Contents", "MacOS", "factorio"],
        ["Contents", "MacOS", "factorio"],
    ].map(parts => path.resolve(factorio, ...parts));
    for (const candidate of candidates) if (await exists(candidate)) return candidate;
    throw new Error(`No Factorio executable under ${factorio} (looked for ${candidates.join(", ")})`);
}

/** Game data sits beside MacOS inside an app bundle, or beside bin in a standalone install */
export function factorioDataDir(executable) {
    const dir = path.dirname(executable);
    const appBundle = path.basename(dir) === "MacOS" && path.basename(path.dirname(dir)) === "Contents";
    return appBundle ? path.resolve(dir, "..", "data") : path.resolve(dir, "..", "..", "data");
}

async function freeTcpPort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });
}

async function freeUdpPort() {
    return new Promise((resolve, reject) => {
        const socket = dgram.createSocket("udp4");
        socket.once("error", reject);
        socket.bind(0, "127.0.0.1", () => {
            const { port } = socket.address();
            socket.close(() => resolve(port));
        });
    });
}

/** Long bracket level that the text does not close, for passing text to Lua untouched (ported: luaLongString) */
export function luaLongString(text) {
    let level = 1;
    while (text.includes(`]${"=".repeat(level)}]`)) level++;
    const equals = "=".repeat(level);
    return `[${equals}[${text}]${equals}]`;
}

// ---------------------------------------------------------------------------------------------------------------
// Mods

/** The name of a mod from its zip file name (name_1.2.3.zip) or its folder's info.json */
async function modNameOf(dir, entry) {
    if (entry.isFile()) {
        const match = /^(.+)_\d+\.\d+\.\d+\.zip$/i.exec(entry.name);
        return match ? match[1] : null;
    }
    if (entry.isDirectory()) {
        try {
            const info = JSON.parse(await fsp.readFile(path.join(dir, entry.name, "info.json"), "utf8"));
            return typeof info.name === "string" ? info.name : null;
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * The mods to run with, written into `modsDir`: the game's own mods (from its data folder, as the proven harness
 * does: base, and space-age, quality, elevated-rails, recycler where installed), this tool's mod, and the mods of
 * `extraModsDir` when given. If `extraModsDir` holds a mod-list.json, only the mods enabled there are used (game
 * mods included) and its mod-settings.dat is copied too, so a player's own mods folder can be pointed at as it is.
 * Nothing is ever written to `extraModsDir`.
 */
export async function prepareMods({ executable, modsDir, extraModsDir, hideStatusIcons }) {
    await fsp.rm(modsDir, { recursive: true, force: true });
    await fsp.mkdir(modsDir, { recursive: true });
    const dataDir = factorioDataDir(executable);
    /** @type {Map<string, boolean>} */
    const enabled = new Map();
    for (const entry of await fsp.readdir(dataDir, { withFileTypes: true }).catch(() => [])) {
        if (entry.isDirectory() && entry.name !== "core" && await exists(path.join(dataDir, entry.name, "info.json"))) {
            enabled.set(entry.name, true);
        }
    }
    if (!enabled.has("base")) throw new Error(`No base mod in ${dataDir}: is ${executable} a Factorio install?`);

    await fsp.cp(MOD_SOURCE, path.join(modsDir, MOD_NAME), { recursive: true });
    await fsp.writeFile(path.join(modsDir, MOD_NAME, "render-options.lua"),
        `-- written by the render launcher for this run\nreturn {\n    hide_status_icons = ${hideStatusIcons ? "true" : "false"},\n}\n`);

    const extras = [];
    if (extraModsDir) {
        const stat = await fsp.stat(extraModsDir).catch(() => null);
        if (!stat?.isDirectory()) throw new Error(`--mods ${extraModsDir} is not a folder`);
        let list = null;
        try {
            list = JSON.parse(await fsp.readFile(path.join(extraModsDir, "mod-list.json"), "utf8"));
        } catch (error) {
            if (error.code !== "ENOENT") throw new Error(`Cannot read ${path.join(extraModsDir, "mod-list.json")}: ${error.message}`);
        }
        const wanted = list ? new Map((list.mods ?? []).map(mod => [mod.name, mod.enabled !== false])) : null;
        if (wanted) for (const name of enabled.keys()) if (name !== "base" && wanted.has(name)) enabled.set(name, wanted.get(name));
        for (const entry of await fsp.readdir(extraModsDir, { withFileTypes: true })) {
            const name = await modNameOf(extraModsDir, entry);
            if (!name || name === MOD_NAME || enabled.has(name)) continue;
            if (wanted && !wanted.get(name)) continue;
            await fsp.cp(path.join(extraModsDir, entry.name), path.join(modsDir, entry.name), { recursive: true });
            if (!extras.includes(name)) extras.push(name);
        }
        if (await exists(path.join(extraModsDir, "mod-settings.dat"))) {
            await fsp.copyFile(path.join(extraModsDir, "mod-settings.dat"), path.join(modsDir, "mod-settings.dat"));
        }
    }
    const mods = [...[...enabled].map(([name, on]) => ({ name, enabled: on })), { name: MOD_NAME, enabled: true },
        ...extras.map(name => ({ name, enabled: true }))];
    await fsp.writeFile(path.join(modsDir, "mod-list.json"), JSON.stringify({ mods }, null, 2) + "\n");
    return mods;
}

// ---------------------------------------------------------------------------------------------------------------
// Work directory: server/ and client/ are each a write-data folder of their own. Nothing in the Factorio install or
// the player's own saves, config and mods is written to.

/** A config.ini pointing read-data at the install and write-data at our folder. The first line is the config
 * version: the proven harness found the game resets a config without it. */
function configIni(dataDir, writeDir) {
    return `; version=13\n[path]\nread-data=${dataDir}\nwrite-data=${writeDir}\n`;
}

const SERVER_SETTINGS = {
    name: "blueprint-render",
    description: "",
    tags: [],
    max_players: 0,
    visibility: { public: false, lan: false },
    username: "",
    password: "",
    token: "",
    game_password: "",
    require_user_verification: false,
    allow_commands: "true",
    autosave_interval: 0,
    autosave_slots: 1,
    // with nobody connected the server would never run a tick
    auto_pause: false,
    only_admins_can_pause_the_game: true,
    autosave_only_on_server: true,
    non_blocking_saving: false,
};

export async function prepareWorkDir({ workDir, executable, extraModsDir, save, hideStatusIcons }) {
    const dataDir = factorioDataDir(executable);
    const server = path.join(workDir, "server");
    const client = path.join(workDir, "client");
    for (const dir of [server, client]) await fsp.mkdir(dir, { recursive: true });
    const mods = await prepareMods({ executable, modsDir: path.join(server, "mods"), extraModsDir, hideStatusIcons });
    await fsp.cp(path.join(server, "mods"), path.join(client, "mods"), { recursive: true });
    await fsp.writeFile(path.join(server, "config.ini"), configIni(dataDir, server));
    await fsp.writeFile(path.join(client, "config.ini"), configIni(dataDir, client));
    await fsp.writeFile(path.join(server, "server-settings.json"), JSON.stringify(SERVER_SETTINGS, null, 2));
    await fsp.writeFile(path.join(client, "player-data.json"), JSON.stringify({ "service-username": "renderer" }));
    let saveCopy = null;
    if (save) {
        await fsp.mkdir(path.join(server, "saves"), { recursive: true });
        saveCopy = path.join(server, "saves", path.basename(save));
        await fsp.copyFile(save, saveCopy);
    }
    return { server, client, save: saveCopy, mods };
}

// ---------------------------------------------------------------------------------------------------------------

function spawnLogged(executable, args, logFile) {
    const out = fs.openSync(logFile, "a");
    try {
        return track(spawn(executable, args, { stdio: ["ignore", out, out], windowsHide: false }));
    } finally {
        fs.closeSync(out);
    }
}

function tail(file, lines = 30) {
    try {
        return fs.readFileSync(file, "utf8").trimEnd().split("\n").slice(-lines).join("\n");
    } catch {
        return "(no output)";
    }
}

/**
 * A running render session: the server, the client, and RCON to the server.
 */
export class Session {
    constructor({ workDir, dirs, server, client, serverLog, clientLog, log }) {
        Object.assign(this, { workDir, dirs, server, client, serverLog, clientLog, log });
        /** @type {RconClient | null} */
        this.rcon = null;
    }

    /**
     * @param {{ executable: string, workDir: string, extraModsDir?: string, save?: string, hideStatusIcons: boolean,
     *   timeoutSeconds: number, log: (message: string) => void }} options
     */
    static async start(options) {
        const { executable, workDir, log } = options;
        const dirs = await prepareWorkDir(options);
        const deadline = Date.now() + options.timeoutSeconds * 1000;
        const rconPort = await freeTcpPort();
        const rconPassword = randomBytes(18).toString("base64url");
        const gamePort = await freeUdpPort();
        const serverLog = path.join(workDir, "server-output.log");
        const clientLog = path.join(workDir, "client-output.log");
        log(`Starting the Factorio server (${executable}); work directory ${workDir}`);
        const server = spawnLogged(executable, [
            "--config", path.join(dirs.server, "config.ini"),
            "--mod-directory", path.join(dirs.server, "mods"),
            ...(dirs.save ? ["--start-server", dirs.save] : ["--start-server-load-scenario", SCENARIO]),
            "--server-settings", path.join(dirs.server, "server-settings.json"),
            "--port", String(gamePort),
            "--bind", "127.0.0.1",
            "--rcon-bind", `127.0.0.1:${rconPort}`,
            "--rcon-password", rconPassword,
        ], serverLog);
        const session = new Session({ workDir, dirs, server, client: null, serverLog, clientLog, log });
        try {
            await session.waitForServer(deadline);
            session.rcon = await RconClient.connect(rconPort, rconPassword);
            log("Server is up; opening the game window to join it (it draws the screenshots)");
            session.client = spawnLogged(executable, [
                "--config", path.join(dirs.client, "config.ini"),
                "--mod-directory", path.join(dirs.client, "mods"),
                "--mp-connect", `127.0.0.1:${gamePort}`,
            ], clientLog);
            await session.waitForClient(deadline);
        } catch (error) {
            await session.close();
            throw error;
        }
        return session;
    }

    /** Throws with the end of the logs once either game process is gone */
    assertRunning() {
        for (const child of [this.server, this.client]) {
            if (child?.startError) throw new Error(`Could not start Factorio: ${child.startError.message}`);
        }
        if (!isRunning(this.server)) {
            throw new Error(`The Factorio server exited (code ${this.server.exitCode}, signal ${this.server.signalCode}). End of its output (${this.serverLog}):\n${tail(this.serverLog)}`);
        }
        if (this.client && !isRunning(this.client)) {
            throw new Error(`The Factorio game window closed (code ${this.client.exitCode}, signal ${this.client.signalCode}). End of its output (${this.clientLog}):\n${tail(this.clientLog)}`);
        }
    }

    async waitForServer(deadline) {
        for (;;) {
            this.assertRunning();
            if (fs.existsSync(this.serverLog) && fs.readFileSync(this.serverLog, "utf8").includes(RCON_READY)) return;
            if (Date.now() > deadline) throw new Error(`The Factorio server did not open its RCON port in time. End of its output (${this.serverLog}):\n${tail(this.serverLog)}`);
            await sleep(POLL_MS);
        }
    }

    async waitForClient(deadline) {
        for (;;) {
            this.assertRunning();
            if (Number(await this.command("/sc rcon.print(#game.connected_players)")) > 0) return;
            if (Date.now() > deadline) throw new Error(`The game window did not join the server in time. End of its output (${this.clientLog}):\n${tail(this.clientLog)}`);
            await sleep(POLL_MS);
        }
    }

    /** @param {string} command */
    async command(command, timeoutMs = Session.commandTimeoutMs) {
        this.assertRunning();
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`The game did not answer within ${Math.round(timeoutMs / 1000)} s: ${command.slice(0, 120)}`)), timeoutMs);
        });
        try {
            return await Promise.race([this.rcon.command(command), timeout]);
        } catch (error) {
            // a dead game explains a dropped connection better than the socket does
            this.assertRunning();
            throw error;
        } finally {
            clearTimeout(timer);
        }
    }

    /** Call the mod's remote interface; `text` is passed as one Lua string argument */
    async call(name, text) {
        const argument = text === undefined ? "" : `, ${luaLongString(text)}`;
        return this.command(`/sc rcon.print(remote.call("${MOD_NAME}", "${name}"${argument}))`);
    }

    /** Parse a JSON answer from the mod, or fail with what the game printed instead */
    static parseAnswer(what, answer) {
        try {
            return JSON.parse(answer);
        } catch {
            throw new Error(`${what} failed in the game: ${answer.trim() || "no answer"}`);
        }
    }

    /** Send a blueprint string to the mod, in parts; it stays there until the next send */
    async send(blueprintString) {
        await this.call("reset");
        for (let start = 0; start < blueprintString.length; start += PART_SIZE) {
            await this.call("append", blueprintString.slice(start, start + PART_SIZE));
        }
    }

    /** What kind of blueprint was sent: { platform, reasons, platforms_available } or { error } */
    async inspect() {
        return Session.parseAnswer("Inspecting the blueprint", await this.call("inspect"));
    }

    /**
     * Build the blueprint sent last with one strategy ("ordinary" or "platform") under a new name.
     * @returns {Promise<any>} the mod's report
     */
    async build(strategy, name, backdrop) {
        return Session.parseAnswer("Building", await this.call("build", JSON.stringify({ surface: name, strategy, ...(backdrop ? { backdrop } : {}) })));
    }

    /** Once per session: research every technology and enable every recipe, so no recipe icon shows as locked */
    async setup() {
        return Session.parseAnswer("Researching all technologies", await this.call("setup"));
    }

    /** Run the mod's experiment matrix for the blueprint sent last: { lines, experiments } or { error } */
    async diagnose(prefix) {
        return Session.parseAnswer("Diagnosing", await this.call("diagnose", prefix));
    }

    /** Just before a screenshot: clear asteroids from a platform surface */
    async prepare(surface) {
        await this.call("prepare", surface);
    }

    async tick() {
        const answer = await this.command("/sc rcon.print(game.tick)");
        const tick = Number(answer);
        if (!Number.isFinite(tick)) throw new Error(`Unexpected answer to game.tick: ${answer}`);
        return tick;
    }

    /** Let the game run until `tick`, so the client has caught up and drawn the new build */
    async waitUntilTick(tick, timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        while (await this.tick() < tick) {
            if (Date.now() > deadline) throw new Error(`The game did not reach tick ${tick} in time`);
            await sleep(POLL_MS);
        }
    }

    /** Remove the surface or platform built under `name` */
    async remove(name) {
        await this.call("delete", name);
    }

    /**
     * Take one screenshot with the client and wait for the complete PNG (ported: takeScreenshot).
     * @returns {Promise<string>} the PNG's path
     */
    async takeScreenshot({ name, surface, position, resolution, zoom, anti_alias, timeoutMs }) {
        if (!/^[\w.-]+\.png$/.test(name)) throw new Error("Screenshot name must be a plain .png file name");
        const file = path.join(this.dirs.client, "script-output", name);
        await fsp.rm(file, { force: true });
        const params = {
            path: name, surface, position, resolution, zoom, anti_alias,
            show_gui: false, show_entity_info: true, hide_clouds: true, hide_fog: true, daytime: 0, force_render: true,
        };
        await this.command(`/sc game.take_screenshot(helpers.json_to_table(${luaLongString(JSON.stringify(params))}))`);
        return waitForPng(file, { timeoutMs, check: () => this.assertRunning() });
    }

    /** How long one RCON command may take (a setting for tests) */
    static commandTimeoutMs = COMMAND_TIMEOUT_MS;

    /** End both processes. Safe to call more than once. */
    async close() {
        this.rcon?.close();
        this.rcon = null;
        await Promise.all([
            this.client ? stop(this.client, 5000) : null,
            // nothing of the scratch game is worth keeping, so the server is not given time to save (as proven)
            stop(this.server, 0),
        ]);
    }
}
