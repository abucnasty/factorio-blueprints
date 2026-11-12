import assert from "node:assert/strict";
import test from "node:test";
import { strategyOrder, summariseAttempt } from "../src/render.js";

test("strategy order: platform blueprints on a platform first, others on an ordinary surface first", () => {
    assert.deepEqual(strategyOrder({ platform: true, platforms_available: true }), ["platform", "ordinary"]);
    assert.deepEqual(strategyOrder({ platform: false, platforms_available: true }), ["ordinary", "platform"]);
    assert.deepEqual(strategyOrder({ platform: true, platforms_available: false }), ["ordinary"]);
    assert.deepEqual(strategyOrder({ platform: false, platforms_available: false }), ["ordinary"]);
});

test("an attempt is summarised with counts, every problem and diagnostics", () => {
    const { attempt, lines } = summariseAttempt({
        strategy: "ordinary", surface: "s", built: 0, tiles: 0, failed: [], missing: { thruster: 1, "steel-chest": 1 },
        problems: { 1: "build_blueprint placed no ghosts at all on a lab-tile surface" }, import_errors: false,
        diagnostics: { surface_kind: "lab-tile surface", ghosts: 0 }, tick: 5,
    });
    assert.equal(attempt.has_area, false);
    assert.deepEqual(attempt.failed, {});
    assert.deepEqual(lines, [
        "  [ordinary] built 0 entities, 0 tiles; failed: none; missing: 1× thruster, 1× steel-chest",
        "  [ordinary] problem: build_blueprint placed no ghosts at all on a lab-tile surface",
        "  [ordinary] diagnostics: {\"surface_kind\":\"lab-tile surface\",\"ghosts\":0}",
    ]);
    assert.deepEqual(summariseAttempt({ strategy: "platform", error: "no starter pack" }).lines, ["  [platform] error: no starter pack"]);
});
