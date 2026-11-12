// Reading the input and listing its entries by slot path, the addressing of the nested-links contract.
import fs from "node:fs/promises";
import { decodeBlueprintString, encodeBlueprintString } from "./codec.js";

/**
 * Read a `blueprint.json` (decoded JSON, the repo's canonical format) or a file holding a raw blueprint string.
 * @param {string} file
 * @returns {Promise<{ value: any, format: "json" | "string" }>}
 */
export async function readInput(file) {
    let text;
    try {
        text = await fs.readFile(file, "utf8");
    } catch (error) {
        throw new Error(`Cannot read input ${file}: ${error.message}`);
    }
    const trimmed = text.replace(/^﻿/, "").trim();
    if (trimmed.startsWith("{")) {
        try {
            return { value: JSON.parse(trimmed), format: "json" };
        } catch (error) {
            throw new Error(`${file} looks like JSON but does not parse: ${error.message}`);
        }
    }
    try {
        return { value: decodeBlueprintString(trimmed), format: "string" };
    } catch (error) {
        throw new Error(`${file} is neither blueprint JSON nor a blueprint string: ${error.message}`);
    }
}

/** The kinds of book entries, as named in the nested-links contract */
const KINDS = [
    ["blueprint", "blueprint"],
    ["blueprint_book", "blueprint-book"],
    ["upgrade_planner", "upgrade-planner"],
    ["deconstruction_planner", "deconstruction-planner"],
];

/**
 * One entry of the input: the root or any slot of any book, at any depth.
 * @typedef {object} Entry
 * @property {string} path     slot path, slot numbers from the root book down joined by "/" ("3/1"); "" for the root
 * @property {number[]} slots  the same as numbers
 * @property {"blueprint" | "blueprint-book" | "upgrade-planner" | "deconstruction-planner" | "unknown"} kind
 * @property {string} label    the entry's own label, or ""
 * @property {string | null} file   for a blueprint, its render file relative to the output folder ("3/1.jpg";
 *                                   "0.jpg" for a lone blueprint at the root); null for anything else
 * @property {string | null} problem  why this entry is ignored (a duplicate slot), if it is
 */

/**
 * A blueprint to render.
 * @typedef {object} BlueprintEntry
 * @property {string} path     slot path ("3/1"); "" for a lone blueprint
 * @property {string} file     render file relative to the output folder, "/"-separated ("3/1.jpg", or "0.jpg")
 * @property {string} key      the file without ".jpg" and with "-" for "/", for names in the game ("3-1", "0")
 * @property {string} label    the blueprint's label, or ""
 * @property {any} blueprint   the blueprint object (the value under the "blueprint" key)
 * @property {boolean} empty   no entities and no tiles: nothing to render
 */

/** The render file of a blueprint at a slot path, by the nested-links contract */
export function renderFileOf(path) {
    return `${path === "" ? "0" : path}.jpg`;
}

/** The slot number of a book slot: its `index`, or its position in the array when it has none (contract) */
function slotNumber(slot, position, problems, where) {
    if (slot.index === undefined || slot.index === null) return position;
    if (Number.isInteger(slot.index) && slot.index >= 0) return slot.index;
    problems.push(`book ${where || "(root)"}: slot index ${JSON.stringify(slot.index)} is not a whole number; using its position ${position}`);
    return position;
}

/**
 * List every entry of a decoded blueprint string and the blueprints to render, depth first, each book's slots in
 * ascending slot number (the order the game shows them in).
 *
 * Slot paths follow the nested-links contract: a slot's number is its `index`, or its position in the
 * `blueprints` array when it has none. A malformed book can give two entries the same slot number; the first in the
 * array keeps the slot path, the others are listed with a problem and are not rendered (their links and image file
 * would be the same). Only blueprints get render files; books and planners are listed, and planners are also
 * reported as skipped. An empty blueprint keeps its slot path but gets no image.
 * @param {any} root
 * @returns {{ entries: Entry[], blueprints: BlueprintEntry[], skipped: { path: string, kind: string, reason?: string }[],
 *   problems: string[] }}
 */
export function listBlueprints(root) {
    if (!root || typeof root !== "object") throw new Error("The blueprint JSON is not an object");
    /** @type {Entry[]} */
    const entries = [];
    /** @type {BlueprintEntry[]} */
    const blueprints = [];
    const skipped = [];
    const problems = [];
    const visit = (item, slots) => {
        const path = slots.join("/");
        const [key, kind] = KINDS.find(([field]) => item[field]) ?? [null, "unknown"];
        const label = (key && item[key].label) ?? "";
        const file = kind === "blueprint" ? renderFileOf(path) : null;
        entries.push({ path, slots, kind, label, file, problem: null });
        if (kind === "blueprint") {
            const blueprint = item.blueprint;
            const empty = !(blueprint.entities?.length) && !(blueprint.tiles?.length);
            blueprints.push({ path, file, key: file.slice(0, -4).replace(/\//g, "-"), label, blueprint, empty });
        } else if (kind === "blueprint-book") {
            const seen = new Set();
            const book = (item.blueprint_book.blueprints ?? [])
                .map((slot, position) => ({ slot, position, number: slotNumber(slot, position, problems, path) }))
                .sort((a, b) => a.number - b.number || a.position - b.position);
            for (const { slot, number } of book) {
                if (seen.has(number)) {
                    const where = [...slots, number].join("/");
                    const reason = `duplicate slot ${number} in book ${path || "(root)"}: only the first entry with it is used`;
                    problems.push(`${where}: ${reason}`);
                    const [, slotKind] = KINDS.find(([field]) => slot[field]) ?? [null, "unknown"];
                    entries.push({ path: where, slots: [...slots, number], kind: slotKind, label: "", file: null, problem: reason });
                    skipped.push({ path: where, kind: slotKind, reason });
                    continue;
                }
                seen.add(number);
                visit(slot, [...slots, number]);
            }
        } else {
            skipped.push({ path, kind });
        }
    };
    visit(root, []);
    return { entries, blueprints, skipped, problems };
}

/**
 * The blueprints selected by slot paths (`--only`): each selector picks the entry at that slot path and, for a book,
 * everything under it. "0" also picks a lone blueprint at the root (its file is 0.jpg).
 * @param {BlueprintEntry[]} blueprints
 * @param {string[]} selectors
 * @returns {BlueprintEntry[]}
 */
export function selectBlueprints(blueprints, selectors) {
    const unmatched = selectors.filter(selector => !blueprints.some(entry => selects(selector, entry)));
    if (unmatched.length) {
        throw new Error(`--only ${unmatched.join(", ")}: no blueprint at ${unmatched.length > 1 ? "these slot paths" : "this slot path"} in the input (see --list)`);
    }
    return blueprints.filter(entry => selectors.some(selector => selects(selector, entry)));
}

/** Whether a selector picks an entry: the same slot path, a book above it, or the file stem of a lone blueprint */
export function selects(selector, entry) {
    return entry.path === selector || entry.path.startsWith(`${selector}/`) || (entry.path === "" && entry.file === `${selector}.jpg`);
}

/**
 * The string the game imports for one listed blueprint: just that blueprint, outside any book.
 * @param {BlueprintEntry} entry
 */
export function blueprintStringOf(entry) {
    return encodeBlueprintString({ blueprint: entry.blueprint });
}
