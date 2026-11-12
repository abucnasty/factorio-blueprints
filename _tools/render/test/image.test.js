import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { JPEG_QUALITY, convertToJpeg, isCompletePng, stitchToJpeg, waitForPng } from "../src/image.js";
import { tempDir } from "./helpers.js";

const png = (width, height, background) => sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();

test("a PNG is complete only with its signature and IEND chunk", async () => {
    const whole = await png(8, 8, "#ff0000");
    assert.equal(isCompletePng(whole), true);
    assert.equal(isCompletePng(whole.subarray(0, whole.length - 12)), false);
    assert.equal(isCompletePng(whole.subarray(0, 10)), false);
    assert.equal(isCompletePng(Buffer.concat([Buffer.from("not a png"), whole.subarray(8)])), false);
    assert.equal(isCompletePng(null), false);
});

test("waitForPng waits for a file the game is still writing", async () => {
    const dir = await tempDir("render-png-");
    try {
        const file = path.join(dir, "shot.png");
        const whole = await png(16, 16, "#00ff00");
        setTimeout(() => fs.writeFile(file, whole.subarray(0, 20)), 50);
        setTimeout(() => fs.writeFile(file, whole), 250);
        const started = Date.now();
        assert.equal(await waitForPng(file, { timeoutMs: 5000, pollMs: 20 }), file);
        assert.ok(Date.now() - started >= 200);
        await assert.rejects(waitForPng(path.join(dir, "never.png"), { timeoutMs: 100, pollMs: 20 }), /Timed out/);
        await assert.rejects(waitForPng(file + "x", { timeoutMs: 5000, check: () => { throw new Error("game gone"); } }), /game gone/);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test("convertToJpeg writes a JPEG of the same size and keeps the PNG", async () => {
    const dir = await tempDir("render-jpeg-");
    try {
        const source = path.join(dir, "native.png"), target = path.join(dir, "out", "0.jpg");
        await fs.writeFile(source, await png(96, 64, "#c07030"));
        const result = await convertToJpeg(source, target);
        assert.equal(JPEG_QUALITY, 82);
        assert.deepEqual(await sharp(target).metadata().then(({ format, width, height, chromaSubsampling }) => ({ format, width, height, chromaSubsampling })),
            { format: "jpeg", width: 96, height: 64, chromaSubsampling: "4:4:4" });
        assert.equal(result.bytes, (await fs.stat(target)).size);
        assert.deepEqual(await fs.readdir(path.dirname(target)), ["0.jpg"]);
        await fs.access(source);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test("stitchToJpeg puts each shot in its cell", async () => {
    const dir = await tempDir("render-stitch-");
    try {
        const colours = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]];
        const shots = [];
        for (const [index, [r, g, b]] of colours.entries()) {
            const file = path.join(dir, `${index}.png`);
            const [width, height] = [index % 2 ? 40 : 60, index < 2 ? 30 : 20];
            await fs.writeFile(file, await png(width, height, { r, g, b }));
            shots.push({ file, left: index % 2 ? 60 : 0, top: index < 2 ? 0 : 30, resolution: { x: width, y: height } });
        }
        // a shot the game wrote at the wrong size is fitted to its cell
        await fs.writeFile(shots[3].file, await png(10, 10, { r: 255, g: 255, b: 0 }));
        const target = path.join(dir, "stitched.jpg");
        const result = await stitchToJpeg({ width: 100, height: 50 }, shots, target);
        assert.deepEqual([result.width, result.height], [100, 50]);
        const { data, info } = await sharp(target).raw().toBuffer({ resolveWithObject: true });
        const at = (x, y) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
        const near = (actual, expected) => actual.every((value, i) => Math.abs(value - expected[i]) < 40);
        for (const [[x, y], colour] of [[[30, 15], colours[0]], [[80, 15], colours[1]], [[30, 40], colours[2]], [[80, 40], colours[3]]]) {
            assert.ok(near(at(x, y), colour), `pixel ${x},${y} is ${at(x, y)}, expected ${colour}`);
        }
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});
