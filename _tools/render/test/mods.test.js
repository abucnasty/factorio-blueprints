import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { MOD_NAME, factorioDataDir, luaLongString, prepareMods, resolveFactorioExecutable } from "../src/factorio.js";
import { fakeInstall, tempDir } from "./helpers.js";

test("the game is found from its install folder or its executable", async () => {
    const dir = await tempDir("render-install-");
    try {
        const { root, executable } = await fakeInstall(dir);
        assert.equal(await resolveFactorioExecutable(root), executable);
        assert.equal(await resolveFactorioExecutable(executable), executable);
        assert.equal(factorioDataDir(executable), path.join(root, "data"));
        assert.equal(factorioDataDir("/Applications/factorio.app/Contents/MacOS/factorio"), "/Applications/factorio.app/Contents/data");
        await assert.rejects(resolveFactorioExecutable(path.join(dir, "nothing")), /not found/);
        await assert.rejects(resolveFactorioExecutable(dir), /No Factorio executable/);
        await assert.rejects(resolveFactorioExecutable(undefined), /No Factorio given/);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test("an isolated mod directory: the game's mods (not core) and the render mod", async () => {
    const dir = await tempDir("render-mods-");
    try {
        const { executable } = await fakeInstall(dir);
        const modsDir = path.join(dir, "work", "mods");
        const mods = await prepareMods({ executable, modsDir, hideStatusIcons: true });
        assert.deepEqual(mods.map(mod => mod.name).sort(), ["base", MOD_NAME, "elevated-rails", "quality", "space-age"]);
        assert.ok(mods.every(mod => mod.enabled));
        const list = JSON.parse(await fs.readFile(path.join(modsDir, "mod-list.json"), "utf8"));
        assert.deepEqual(list.mods, mods);
        assert.match(await fs.readFile(path.join(modsDir, MOD_NAME, "render-options.lua"), "utf8"), /hide_status_icons = true/);
        await fs.access(path.join(modsDir, MOD_NAME, "scenarios", "stage", "control.lua"));
        await prepareMods({ executable, modsDir, hideStatusIcons: false });
        assert.match(await fs.readFile(path.join(modsDir, MOD_NAME, "render-options.lua"), "utf8"), /hide_status_icons = false/);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test("extra mods are copied, honouring the folder's mod-list.json, and the folder is left untouched", async () => {
    const dir = await tempDir("render-extra-");
    try {
        const { executable } = await fakeInstall(dir);
        const extra = path.join(dir, "my-mods");
        await fs.mkdir(path.join(extra, "folder-mod"), { recursive: true });
        await fs.writeFile(path.join(extra, "folder-mod", "info.json"), JSON.stringify({ name: "folder-mod", version: "1.0.0" }));
        await fs.writeFile(path.join(extra, "zipped-mod_1.2.3.zip"), "zip");
        await fs.writeFile(path.join(extra, "disabled-mod_0.1.0.zip"), "zip");
        await fs.writeFile(path.join(extra, "mod-settings.dat"), "settings");
        await fs.writeFile(path.join(extra, "mod-list.json"), JSON.stringify({ mods: [
            { name: "base", enabled: true }, { name: "space-age", enabled: false }, { name: "folder-mod", enabled: true },
            { name: "zipped-mod", enabled: true }, { name: "disabled-mod", enabled: false },
        ] }));
        const before = (await fs.readdir(extra)).sort();
        const modsDir = path.join(dir, "work", "mods");
        const mods = await prepareMods({ executable, modsDir, extraModsDir: extra, hideStatusIcons: true });
        const state = Object.fromEntries(mods.map(mod => [mod.name, mod.enabled]));
        assert.deepEqual(state, { base: true, "elevated-rails": true, quality: true, "space-age": false, [MOD_NAME]: true, "folder-mod": true, "zipped-mod": true });
        assert.deepEqual((await fs.readdir(modsDir)).sort(), [MOD_NAME, "folder-mod", "mod-list.json", "mod-settings.dat", "zipped-mod_1.2.3.zip"].sort());
        assert.deepEqual((await fs.readdir(extra)).sort(), before);
        await assert.rejects(prepareMods({ executable, modsDir, extraModsDir: path.join(dir, "none"), hideStatusIcons: true }), /not a folder/);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test("Lua long strings are never closed by their content", () => {
    assert.equal(luaLongString("abc"), "[=[abc]=]");
    assert.equal(luaLongString("a]=]b"), "[==[a]=]b]==]");
    assert.equal(luaLongString("]=]]==]"), "[===[]=]]==]]===]");
});
