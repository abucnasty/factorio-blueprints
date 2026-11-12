// The render manifest, <out>/render.json: which images in the output folder are current, so other tools (the
// Obsidian plugin) can tell whether a blueprint has been rendered since it last changed.
import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";

export const MANIFEST_FILE = "render.json";
export const MANIFEST_SCHEMA = 1;

/**
 * @typedef {object} Manifest
 * @property {number} schema           MANIFEST_SCHEMA
 * @property {string} rendered_at      ISO time (UTC) of the run that last wrote it
 * @property {Record<string, ManifestEntry>} entries  by slot path ("3/1"), "0" for a single blueprint
 *
 * @typedef {object} ManifestEntry
 * @property {string} file     render file relative to the output folder ("3/1.jpg")
 * @property {string} sha256   blueprintHash of the blueprint the image was made from
 * @property {number} width
 * @property {number} height
 */

/** Compare strings by Unicode code point (not UTF-16 code unit, which orders astral characters differently) */
export function compareCodePoints(a, b) {
    const left = [...a], right = [...b];
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
        const difference = left[i].codePointAt(0) - right[i].codePointAt(0);
        if (difference) return difference;
    }
    return left.length - right.length;
}

/**
 * Compact JSON with object keys sorted by code point at every depth, array order kept, no whitespace, numbers as
 * JSON.stringify prints them and non-ASCII characters unescaped (JSON.stringify's own string escaping).
 * @param {any} value
 * @returns {string}
 */
export function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item === undefined ? null : item)).join(",")}]`;
    if (value && typeof value === "object") {
        const keys = Object.keys(value).filter(key => value[key] !== undefined).sort(compareCodePoints);
        return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}

/**
 * The hash that says which version of a blueprint an image shows: SHA-256, lowercase hex, of the UTF-8 bytes of
 * canonicalJson(blueprint), where blueprint is the value under an entry's "blueprint" key (not its wrapper, and
 * not the book slot's index). The Obsidian plugin computes the same hash to compare.
 * @param {any} blueprint
 */
export function blueprintHash(blueprint) {
    return createHash("sha256").update(canonicalJson(blueprint), "utf8").digest("hex");
}

/** The manifest key of a blueprint: its slot path, or "0" for a single blueprint */
export const manifestKey = slotPath => (slotPath === "" ? "0" : slotPath);

/**
 * Read <out>/render.json. A missing file gives null; an unreadable one gives null and a problem.
 * @returns {Promise<{ manifest: Manifest | null, problem: string | null }>}
 */
export async function readManifest(out) {
    const file = path.join(out, MANIFEST_FILE);
    let text;
    try {
        text = await fsp.readFile(file, "utf8");
    } catch (error) {
        if (error.code === "ENOENT") return { manifest: null, problem: null };
        return { manifest: null, problem: `cannot read ${file}: ${error.message}` };
    }
    try {
        const manifest = JSON.parse(text);
        if (!manifest || typeof manifest.entries !== "object" || Array.isArray(manifest.entries)) throw new Error("no entries object");
        return { manifest, problem: null };
    } catch (error) {
        return { manifest: null, problem: `${file} is not a render manifest (${error.message}); it is rebuilt from this run` };
    }
}

/**
 * JSON with two-space indent and object keys sorted by code point at every depth. Written by hand because a
 * JavaScript object always lists integer-like keys ("0", "3") before others ("2/0"), whatever order they were set in.
 */
export function sortedPrettyJson(value, indent = "") {
    const inner = `${indent}  `;
    if (Array.isArray(value)) {
        if (!value.length) return "[]";
        return `[\n${value.map(item => inner + sortedPrettyJson(item, inner)).join(",\n")}\n${indent}]`;
    }
    if (value && typeof value === "object") {
        const keys = Object.keys(value).filter(key => value[key] !== undefined).sort(compareCodePoints);
        if (!keys.length) return "{}";
        return `{\n${keys.map(key => `${inner}${JSON.stringify(key)}: ${sortedPrettyJson(value[key], inner)}`).join(",\n")}\n${indent}}`;
    }
    return JSON.stringify(value);
}

/** Write <out>/render.json atomically: keys sorted (entries by slot path), two-space indent, LF, trailing newline */
export async function writeManifest(out, manifest) {
    const file = path.join(out, MANIFEST_FILE);
    const temporary = `${file}.tmp`;
    await fsp.writeFile(temporary, sortedPrettyJson(manifest) + "\n");
    await fsp.rename(temporary, file);
    return file;
}

/**
 * The manifest after a run. A full run lists exactly the images it produced. An --only run starts from the existing
 * manifest, drops entries whose image it removed, and sets the entries it rendered.
 * @param {Manifest | null} previous
 * @param {{ key: string, file: string, sha256: string, width: number, height: number }[]} produced
 * @param {string[]} removed  render files removed from the output folder
 * @param {boolean} partial   an --only run
 * @param {Date} now
 * @returns {Manifest}
 */
export function nextManifest(previous, produced, removed, partial, now = new Date()) {
    const entries = {};
    if (partial && previous) {
        const gone = new Set(removed);
        for (const [key, entry] of Object.entries(previous.entries)) if (!gone.has(entry?.file)) entries[key] = entry;
    }
    for (const { key, file, sha256, width, height } of produced) entries[key] = { file, sha256, width, height };
    return { schema: MANIFEST_SCHEMA, rendered_at: now.toISOString(), entries };
}
