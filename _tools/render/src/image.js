// PNG handling: waiting for the game to finish writing a screenshot, JPEG conversion and stitching.
// The JPEG settings and the IEND check come from clock-generator (MIT): tests/game/helpers/scaffold-screenshot.js
// (compressScreenshot) and src/harness/factorio-harness.ts (takeScreenshot).
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const JPEG_QUALITY = 82;
const JPEG_OPTIONS = Object.freeze({ quality: JPEG_QUALITY, mozjpeg: true, chromaSubsampling: "4:4:4" });
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Whether a buffer is a whole PNG file: the signature at the start and the IEND chunk at the end. The game writes
 * screenshots asynchronously, so a file that exists may still be growing.
 * @param {Buffer | null | undefined} png
 */
export function isCompletePng(png) {
    return Boolean(png) && png.length >= PNG_SIGNATURE.length + 12
        && png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
        && png.subarray(-8, -4).toString("ascii") === "IEND";
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Wait until `file` holds a complete PNG.
 * @param {string} file
 * @param {{ timeoutMs: number, pollMs?: number, check?: () => void }} options  `check` throws to stop waiting
 *   (e.g. when the game has exited)
 */
export async function waitForPng(file, { timeoutMs, pollMs = 100, check = () => {} }) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        check();
        const png = await fs.readFile(file).catch(error => {
            if (error.code !== "ENOENT") throw error;
            return null;
        });
        if (isCompletePng(png)) return file;
        if (Date.now() > deadline) throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)} s waiting for the screenshot ${file}`);
        await sleep(pollMs);
    }
}

/** Write through a temporary file next to the target, so a failure never leaves half a JPEG */
async function writeAtomically(target, write) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp`;
    try {
        const result = await write(temporary);
        await fs.rename(temporary, target);
        return result;
    } finally {
        await fs.rm(temporary, { force: true });
    }
}

/**
 * Convert one native screenshot to the stored JPEG, without resizing.
 * @param {string} png
 * @param {string} jpeg
 */
export async function convertToJpeg(png, jpeg) {
    return writeAtomically(jpeg, async temporary => {
        const info = await sharp(png).flatten({ background: "#000000" }).jpeg(JPEG_OPTIONS).toFile(temporary);
        return { width: info.width, height: info.height, bytes: info.size };
    });
}

/**
 * Stitch a grid of screenshots into one JPEG.
 * @param {{ width: number, height: number }} size   the final image size
 * @param {{ file: string, left: number, top: number, resolution: { x: number, y: number } }[]} shots
 * @param {string} jpeg
 */
export async function stitchToJpeg(size, shots, jpeg) {
    const layers = [];
    for (const shot of shots) {
        const meta = await sharp(shot.file).metadata();
        let input = shot.file;
        // The game should write exactly the resolution asked for; if it does not, fit the shot to its cell rather
        // than shift every shot after it.
        if (meta.width !== shot.resolution.x || meta.height !== shot.resolution.y) {
            input = await sharp(shot.file).resize(shot.resolution.x, shot.resolution.y, { fit: "fill" }).png().toBuffer();
        }
        layers.push({ input, left: shot.left, top: shot.top });
    }
    return writeAtomically(jpeg, async temporary => {
        const canvas = sharp({
            create: { width: size.width, height: size.height, channels: 3, background: { r: 0, g: 0, b: 0 } },
            limitInputPixels: false,
        });
        const info = await canvas.composite(layers).jpeg(JPEG_OPTIONS).toFile(temporary);
        return { width: info.width, height: info.height, bytes: info.size };
    });
}
