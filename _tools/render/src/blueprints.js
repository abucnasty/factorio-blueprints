// Reading the input and listing the blueprints it holds, in the order their images are numbered.
import fs from "node:fs/promises";
import { decodeBlueprintString, encodeBlueprintString } from "./codec.js";

const PLANNER_KEYS = ["upgrade_planner", "deconstruction_planner"];

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

/**
 * @typedef {object} BlueprintEntry
 * @property {number} number   the image number: <out>/<number>.jpg
 * @property {string} path     slot indices from the top-level book down, e.g. "2/0"; "" for a lone blueprint
 * @property {string} label    the blueprint's label, or ""
 * @property {any} blueprint   the blueprint object (the value under the "blueprint" key)
 * @property {boolean} empty   no entities and no tiles: nothing to render
 */

/**
 * List every blueprint in a decoded blueprint string, depth first, each book's slots in ascending `index` order
 * (the order the game shows them in). Only blueprints are numbered; planners are listed as skipped and take no
 * number, books take no number themselves. An empty blueprint keeps its number but gets no image.
 * @param {any} root
 * @returns {{ blueprints: BlueprintEntry[], skipped: { path: string, kind: string }[] }}
 */
export function listBlueprints(root) {
    if (!root || typeof root !== "object") throw new Error("The blueprint JSON is not an object");
    /** @type {BlueprintEntry[]} */
    const blueprints = [];
    const skipped = [];
    const visit = (item, path) => {
        if (item.blueprint) {
            const blueprint = item.blueprint;
            const empty = !(blueprint.entities?.length) && !(blueprint.tiles?.length);
            blueprints.push({ number: blueprints.length, path: path.join("/"), label: blueprint.label ?? "", blueprint, empty });
        } else if (item.blueprint_book) {
            const slots = (item.blueprint_book.blueprints ?? [])
                .map((slot, order) => ({ slot, order }))
                .sort((a, b) => (a.slot.index ?? a.order) - (b.slot.index ?? b.order) || a.order - b.order);
            for (const { slot, order } of slots) visit(slot, [...path, slot.index ?? order]);
        } else {
            const kind = PLANNER_KEYS.find(key => item[key]) ?? "unknown item";
            skipped.push({ path: path.join("/"), kind });
        }
    };
    visit(root, []);
    return { blueprints, skipped };
}

/**
 * The string the game imports for one listed blueprint: just that blueprint, outside any book.
 * @param {BlueprintEntry} entry
 */
export function blueprintStringOf(entry) {
    return encodeBlueprintString({ blueprint: entry.blueprint });
}
