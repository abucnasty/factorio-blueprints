// Shared test fixtures.
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const tempDir = prefix => fs.mkdtemp(path.join(os.tmpdir(), prefix));

/** A blueprint with `count` entities in a row, starting at x */
export function row(label, count, x = 0, name = "assembling-machine-2") {
    const entities = [];
    for (let i = 0; i < count; i++) entities.push({ entity_number: i + 1, name, position: { x: x + i * 3 + 0.5, y: 0.5 } });
    return { item: "blueprint", label, entities, version: 562949958139904 };
}

/** A book: slots listed out of index order, a nested book, planners and an empty blueprint */
export function sampleBook() {
    return {
        blueprint_book: {
            item: "blueprint-book",
            label: "Main",
            active_index: 0,
            blueprints: [
                { index: 3, blueprint: row("D", 2) },
                { index: 0, blueprint: row("A", 1) },
                { index: 1, upgrade_planner: { item: "upgrade-planner", settings: {} } },
                {
                    index: 2,
                    blueprint_book: {
                        item: "blueprint-book",
                        blueprints: [
                            { index: 1, blueprint: row("C", 3) },
                            { index: 0, blueprint: row("B", 2) },
                            { index: 2, deconstruction_planner: { item: "deconstruction-planner", settings: {} } },
                        ],
                    },
                },
                { index: 5, blueprint: { item: "blueprint", label: "E (empty)", version: 1 } },
                { index: 4, blueprint: { item: "blueprint", label: "tiles", tiles: [{ name: "concrete", position: { x: 0, y: 0 } }], version: 1 } },
            ],
            version: 562949958139904,
        },
    };
}

/**
 * A fake Factorio install: bin/x64/factorio runs test/fake-factorio.js, data/ holds the game's own mods.
 * @returns {Promise<{ root: string, executable: string }>}
 */
export async function fakeInstall(dir, gameMods = ["base", "core", "elevated-rails", "quality", "space-age"]) {
    const root = path.join(dir, "factorio");
    const executable = path.join(root, "bin", "x64", "factorio");
    await fs.mkdir(path.dirname(executable), { recursive: true });
    const script = new URL("./fake-factorio.js", import.meta.url).pathname;
    await fs.writeFile(executable, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`, { mode: 0o755 });
    for (const mod of gameMods) {
        await fs.mkdir(path.join(root, "data", mod), { recursive: true });
        await fs.writeFile(path.join(root, "data", mod, "info.json"), JSON.stringify({ name: mod, version: "2.1.24" }));
    }
    return { root, executable };
}

/** Whether a process is alive. A killed child whose parent exited may linger as a zombie until it is reaped
 * (in a container without an init process, never): on Linux that counts as dead. */
export function alive(pid) {
    try {
        process.kill(pid, 0);
    } catch {
        return false;
    }
    try {
        return !/^\d+ \(.*\) Z/.test(readFileSync(`/proc/${pid}/stat`, "utf8"));
    } catch {
        return true;
    }
}

/** The pids the fake game wrote into a work directory */
export async function fakePids(workDir) {
    const pids = [];
    for (const side of ["server", "client"]) {
        const pid = await fs.readFile(path.join(workDir, side, "fake.pid"), "utf8").catch(() => null);
        if (pid) pids.push(Number(pid));
    }
    return pids;
}
