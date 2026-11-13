import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url).pathname;

test("the mod's Lua parses as Lua 5.2", () => {
    const output = execFileSync(process.execPath, ["test/check-lua.js"], { cwd: ROOT, encoding: "utf8" });
    assert.match(output, /ok {3}control\.lua/);
    assert.match(output, /ok {3}scripts\/build\.lua/);
    assert.doesNotMatch(output, /FAIL/);
});

test("the mod's info.json targets Factorio 2.1 and names the remote interface the launcher calls", async () => {
    const info = JSON.parse(await fs.readFile(new URL("../mod/info.json", import.meta.url), "utf8"));
    const { MOD_NAME } = await import("../src/factorio.js");
    assert.equal(info.name, MOD_NAME);
    assert.equal(info.factorio_version, "2.1");
    const control = await fs.readFile(new URL("../mod/control.lua", import.meta.url), "utf8");
    assert.match(control, new RegExp(`INTERFACE = "${MOD_NAME}"`));
    const scenario = JSON.parse(await fs.readFile(new URL("../mod/scenarios/stage/description.json", import.meta.url), "utf8"));
    assert.equal(scenario["multiplayer-compatible"], true);
});

test("the mod researches everything, lays the default backdrop and knows space platforms", async () => {
    const build = await fs.readFile(new URL("../mod/scripts/build.lua", import.meta.url), "utf8");
    assert.match(build, /force\.research_all_technologies\(\)/);
    assert.match(build, /force\.enable_all_recipes\(\)/);
    assert.match(build, /DEFAULT_BACKDROP = \{ "lab-dark-1", "black-refined-concrete" \}/);
    assert.match(build, /create_space_platform/);
    // platform placement rules measured in the game: no blueprint tile may break its own entities' tile rules,
    // offsets follow the build grid, and nothing has to be joined to the starter foundation
    assert.match(build, /local function self_conflicts\(/);
    assert.match(build, /build_grid_size/);
    assert.doesNotMatch(build, /joined_to_starter/);
    // a car or spidertron whose ghost will not revive is created directly, after everything else
    assert.match(build, /VEHICLE_TYPES = \{ \["car"\] = true, \["spider-vehicle"\] = true \}/);
    assert.match(build, /\{ entities_first, rolling, vehicles \}/);
    assert.match(build, /local function place_vehicle\(surface, ghost\)[\s\S]*?surface\.create_entity/);
    const { DEFAULT_BACKDROP } = await import("../src/cli.js");
    assert.deepEqual([...DEFAULT_BACKDROP], ["lab-dark-1", "black-refined-concrete"]);
});
