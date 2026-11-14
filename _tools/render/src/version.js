// The render version: one integer in ../render-version.json, stamped on every image record in render.json. The
// Obsidian plugin reads the same file, so the rule for bumping it lives there, next to the number.
import fs from "node:fs";

export const RENDER_VERSION_FILE = new URL("../render-version.json", import.meta.url);

/** The current render version, from render-version.json */
export const RENDER_VERSION = parseRenderVersion(fs.readFileSync(RENDER_VERSION_FILE, "utf8"));

/** @param {string} text */
export function parseRenderVersion(text) {
    const version = JSON.parse(text)?.render_version;
    if (!Number.isInteger(version) || version < 1) throw new Error(`render-version.json: render_version must be a whole number of at least 1, not ${JSON.stringify(version)}`);
    return version;
}
