// Framing: which part of the surface to capture, at what zoom, in how many screenshots.
//
// Adapted from clock-generator's tests/game/helpers/scaffold-screenshot.js (screenshotFrame, MIT): frame the built
// entity bounds plus two tiles of margin, at up to 48 pixels per tile. That version caps one image at 1920×1440,
// enough for small fixtures. Here the cap is configurable and large builds are split into a grid of screenshots that
// the launcher stitches back together.
//
// Policy:
// 1. Zoom to fit: the largest pixels-per-tile (at most `maxPixelsPerTile`) at which the whole frame fits one
//    screenshot of at most `maxSize` pixels on its long side.
// 2. If that falls below `minPixelsPerTile` (entities become unreadable), keep `minPixelsPerTile` instead and capture
//    a grid of screenshots of at most `maxSize` each, stitched into one image. The stitched image is capped at
//    `maxOutputSize` on its long side; past that, pixels-per-tile drops below `minPixelsPerTile` again.
// 3. Never below 1 pixel per tile: the game's lower zoom limit for take_screenshot is 0.03125.
//
// Limits from the API docs (LuaGameScript::take_screenshot, resolution): at most 16384×16384 per screenshot, or
// 8192×8192 with anti_alias; recommended at most 4096×4096, or 2048×2048 with anti_alias. Anti-aliasing is therefore
// only asked for when a screenshot is no larger than `antiAliasUpTo` (2048) on both sides.

/** Pixels per tile at zoom 1 */
export const TILE_PIXELS = 32;
export const MAX_SCREENSHOT_SIZE = 16384;
const MIN_ZOOM = 0.03125;

export const FRAMING_DEFAULTS = Object.freeze({
    maxSize: 4096,
    minPixelsPerTile: 8,
    maxPixelsPerTile: 48,
    maxOutputSize: 8192,
    marginTiles: 2,
    antiAliasUpTo: 2048,
});

/**
 * @typedef {{ left_top: { x: number, y: number }, right_bottom: { x: number, y: number } }} Area
 * @typedef {object} Shot one take_screenshot call and where its pixels go in the final image
 * @property {number} left       x of the shot's left edge in the final image, in pixels
 * @property {number} top        y of the shot's top edge in the final image, in pixels
 * @property {{ x: number, y: number }} resolution  width and height in pixels
 * @property {{ x: number, y: number }} position    the map position at the centre of the shot
 * @property {number} zoom
 * @property {boolean} anti_alias
 * @typedef {object} CapturePlan
 * @property {number} pixelsPerTile
 * @property {number} zoom
 * @property {number} width       final image width in pixels
 * @property {number} height      final image height in pixels
 * @property {{ x: number, y: number }} origin  map position of the final image's top-left corner
 * @property {Shot[]} shots       row by row, left to right
 */

/** @param {Partial<typeof FRAMING_DEFAULTS>} options */
export function framingOptions(options = {}) {
    const merged = { ...FRAMING_DEFAULTS };
    for (const [key, value] of Object.entries(options)) if (value !== undefined) merged[key] = value;
    const { maxSize, minPixelsPerTile, maxPixelsPerTile, maxOutputSize, marginTiles, antiAliasUpTo } = merged;
    if (!Number.isInteger(maxSize) || maxSize < 64 || maxSize > MAX_SCREENSHOT_SIZE || maxSize % 2) {
        throw new Error(`max size must be an even whole number of pixels from 64 to ${MAX_SCREENSHOT_SIZE}, not ${maxSize}`);
    }
    if (!(minPixelsPerTile >= TILE_PIXELS * MIN_ZOOM) || !(maxPixelsPerTile >= minPixelsPerTile)) {
        throw new Error(`pixels per tile must satisfy 1 <= min (${minPixelsPerTile}) <= max (${maxPixelsPerTile})`);
    }
    if (!Number.isInteger(maxOutputSize) || maxOutputSize < 64) {
        throw new Error(`max output size must be a whole number of pixels of at least 64, not ${maxOutputSize}`);
    }
    if (!(marginTiles >= 0)) throw new Error(`margin must be zero or more tiles, not ${marginTiles}`);
    if (!(antiAliasUpTo >= 0 && antiAliasUpTo <= MAX_SCREENSHOT_SIZE / 2)) {
        throw new Error(`anti-alias limit must be from 0 to ${MAX_SCREENSHOT_SIZE / 2}, not ${antiAliasUpTo}`);
    }
    return merged;
}

/** Pixels per tile for an area of the given size in tiles, by the policy above */
export function pixelsPerTileFor(spanX, spanY, options) {
    const { maxSize, minPixelsPerTile, maxPixelsPerTile, maxOutputSize } = framingOptions(options);
    const longest = Math.max(spanX, spanY);
    // 4 pixels of slack: aligning to the pixel grid and rounding to even sizes adds up to 3
    const fit = Math.min(maxPixelsPerTile, (maxSize - 4) / longest);
    if (fit >= minPixelsPerTile) return fit;
    const stitched = Math.min(minPixelsPerTile, (maxOutputSize - 4) / longest);
    return Math.max(stitched, fit, TILE_PIXELS * MIN_ZOOM);
}

/** Split `total` pixels (even) into runs of at most `max` (even), all even */
function split(total, max) {
    const count = Math.ceil(total / max);
    const step = 2 * Math.ceil(total / count / 2);
    const runs = [];
    for (let start = 0; start < total; start += step) runs.push({ start, size: Math.min(step, total - start) });
    return runs;
}

/**
 * Plan the screenshots for the built area of a blueprint.
 * @param {Area} area
 * @param {Partial<typeof FRAMING_DEFAULTS>} [options]
 * @returns {CapturePlan}
 */
export function planCapture(area, options = {}) {
    const settings = framingOptions(options);
    const values = [area?.left_top?.x, area?.left_top?.y, area?.right_bottom?.x, area?.right_bottom?.y];
    if (!values.every(Number.isFinite) || !(area.right_bottom.x > area.left_top.x) || !(area.right_bottom.y > area.left_top.y)) {
        throw new Error("A screenshot needs a nonempty, finite built area");
    }
    const m = settings.marginTiles;
    const left = area.left_top.x - m, top = area.left_top.y - m;
    const right = area.right_bottom.x + m, bottom = area.right_bottom.y + m;
    const ppt = pixelsPerTileFor(right - left, bottom - top, settings);
    // Start on a whole pixel of the map at this zoom and keep every size even, so each shot's centre also falls on
    // a whole pixel and neighbouring shots meet without a half-pixel seam (best effort: how the game rounds a
    // camera position is not documented).
    const origin = { x: Math.floor(left * ppt) / ppt, y: Math.floor(top * ppt) / ppt };
    const width = 2 * Math.ceil((right - origin.x) * ppt / 2);
    const height = 2 * Math.ceil((bottom - origin.y) * ppt / 2);
    const zoom = ppt / TILE_PIXELS;
    const shots = [];
    for (const row of split(height, settings.maxSize)) {
        for (const column of split(width, settings.maxSize)) {
            shots.push({
                left: column.start,
                top: row.start,
                resolution: { x: column.size, y: row.size },
                position: { x: origin.x + (column.start + column.size / 2) / ppt, y: origin.y + (row.start + row.size / 2) / ppt },
                zoom,
                anti_alias: Math.max(column.size, row.size) <= settings.antiAliasUpTo,
            });
        }
    }
    return { pixelsPerTile: ppt, zoom, width, height, origin, shots };
}
