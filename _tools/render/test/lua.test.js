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
