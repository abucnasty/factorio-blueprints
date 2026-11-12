import assert from "node:assert/strict";
import test from "node:test";
import { FRAMING_DEFAULTS, MAX_SCREENSHOT_SIZE, TILE_PIXELS, framingOptions, pixelsPerTileFor, planCapture } from "../src/framing.js";

const area = (x, y, width, height) => ({ left_top: { x, y }, right_bottom: { x: x + width, y: y + height } });

/** Every map point of the area plus margin is inside the image, and the shots tile the image exactly */
function assertCovers(plan, box, margin = FRAMING_DEFAULTS.marginTiles) {
    const ppt = plan.pixelsPerTile;
    assert.ok(plan.origin.x <= box.left_top.x - margin + 1e-9 && plan.origin.y <= box.left_top.y - margin + 1e-9);
    assert.ok(plan.origin.x + plan.width / ppt >= box.right_bottom.x + margin - 1e-9);
    assert.ok(plan.origin.y + plan.height / ppt >= box.right_bottom.y + margin - 1e-9);
    let pixels = 0;
    for (const shot of plan.shots) {
        assert.ok(shot.left >= 0 && shot.top >= 0);
        assert.ok(shot.left + shot.resolution.x <= plan.width && shot.top + shot.resolution.y <= plan.height);
        assert.equal(shot.resolution.x % 2, 0);
        assert.equal(shot.resolution.y % 2, 0);
        assert.equal(shot.zoom, ppt / TILE_PIXELS);
        // the centre of a shot is the map point under the centre of its cell
        assert.ok(Math.abs(shot.position.x - (plan.origin.x + (shot.left + shot.resolution.x / 2) / ppt)) < 1e-9);
        assert.ok(Math.abs(shot.position.y - (plan.origin.y + (shot.top + shot.resolution.y / 2) / ppt)) < 1e-9);
        pixels += shot.resolution.x * shot.resolution.y;
    }
    // no overlap and no gap
    assert.equal(pixels, plan.width * plan.height);
}

test("a small build is one screenshot at the maximum detail, like the proven 48 px/tile", () => {
    const box = area(-7, 30, 24, 17);
    const plan = planCapture(box);
    assert.equal(plan.pixelsPerTile, 48);
    assert.equal(plan.zoom, 1.5);
    assert.equal(plan.shots.length, 1);
    assert.equal(plan.shots[0].anti_alias, true);
    assertCovers(plan, box);
});

test("wide and tall builds zoom to fit one screenshot within max size", () => {
    for (const [width, height] of [[100, 10], [10, 100], [300, 200], [400, 400]]) {
        const box = area(-50.5, 12, width, height);
        const plan = planCapture(box);
        assert.equal(plan.shots.length, 1, `${width}×${height}`);
        assert.ok(plan.width <= 4096 && plan.height <= 4096);
        assert.ok(plan.pixelsPerTile >= FRAMING_DEFAULTS.minPixelsPerTile);
        assertCovers(plan, box);
    }
});

test("anti-aliasing only up to 2048 px, the documented recommendation", () => {
    const big = planCapture(area(0, 0, 200, 200));
    assert.ok(big.width > 2048);
    assert.equal(big.shots[0].anti_alias, false);
    assert.equal(planCapture(area(0, 0, 30, 30)).shots[0].anti_alias, true);
});

test("a build too large for min pixels per tile is captured as a grid at min pixels per tile", () => {
    const box = area(-300, -250, 900, 600);
    const plan = planCapture(box);
    assert.equal(plan.pixelsPerTile, 8);
    assert.ok(plan.shots.length > 1);
    assert.equal(plan.shots.length, Math.ceil(plan.width / 4096) * Math.ceil(plan.height / 4096));
    for (const shot of plan.shots) assert.ok(shot.resolution.x <= 4096 && shot.resolution.y <= 4096);
    assertCovers(plan, box);
});

test("the stitched image is capped at max output size by lowering pixels per tile", () => {
    const box = area(0, 0, 3000, 500);
    const plan = planCapture(box);
    assert.ok(plan.width <= FRAMING_DEFAULTS.maxOutputSize);
    assert.ok(plan.pixelsPerTile < 8 && plan.pixelsPerTile > 2);
    assertCovers(plan, box);
});

test("never below one pixel per tile (take_screenshot's minimum zoom 0.03125)", () => {
    assert.equal(pixelsPerTileFor(1e6, 10, {}), 1);
});

test("options are checked against the API limits", () => {
    assert.throws(() => framingOptions({ maxSize: MAX_SCREENSHOT_SIZE + 2 }), /max size/);
    assert.throws(() => framingOptions({ maxSize: 1001 }), /even/);
    assert.throws(() => framingOptions({ minPixelsPerTile: 0.5 }), /pixels per tile/);
    assert.throws(() => framingOptions({ minPixelsPerTile: 100 }), /pixels per tile/);
    assert.throws(() => planCapture(area(0, 0, 0, 5)), /nonempty/);
    assert.throws(() => planCapture({ left_top: { x: 0, y: 0 }, right_bottom: { x: Infinity, y: 1 } }), /finite/);
    assert.deepEqual(framingOptions({ maxSize: undefined }), { ...FRAMING_DEFAULTS });
});

test("a smaller max size gives more, smaller shots of the same plan", () => {
    const box = area(0, 0, 120, 70);
    const plan = planCapture(box, { maxSize: 512, minPixelsPerTile: 16 });
    assert.equal(plan.pixelsPerTile, 16);
    assert.ok(plan.shots.length >= 6);
    assertCovers(plan, box);
});
