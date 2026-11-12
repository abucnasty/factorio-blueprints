import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { MOD_NAME, factorioDataDir, gameModsDir, luaLongString, prepareMods, requiredDependencies, resolveFactorioExecutable } from "../src/factorio.js";
import { fakeInstall, tempDir, zipBytes } from "./helpers.js";

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

test("--enable-mods takes just the named mods and the mods they require, from folders or zips", async () => {
    const dir = await tempDir("render-enable-");
    try {
        const { executable } = await fakeInstall(dir);
        const extra = path.join(dir, "my-mods");
        const folderMod = async (folder, info) => {
            await fs.mkdir(path.join(extra, folder), { recursive: true });
            await fs.writeFile(path.join(extra, folder, "info.json"), JSON.stringify(info));
        };
        const zipMod = (name, version, info) =>
            fs.writeFile(path.join(extra, `${name}_${version}.zip`), zipBytes({ [`${name}_${version}/info.json`]: JSON.stringify(info), [`${name}_${version}/data.lua`]: "" }));
        await folderMod("backgrounds", { name: "backgrounds", version: "1.0.0",
            dependencies: ["base >= 2.0", "space-age", "lib-a >= 1.1", "? optional-mod", "(?) hidden-mod", "! bad-mod", "~ order-mod"] });
        await zipMod("lib-a", "1.2.0", { name: "lib-a", version: "1.2.0", dependencies: ["lib b"] });
        await folderMod("lib-b_0.3.0", { name: "lib b", version: "0.3.0" });
        await zipMod("optional-mod", "1.0.0", { name: "optional-mod", version: "1.0.0" });
        await zipMod("other-mod", "1.0.0", { name: "other-mod", version: "1.0.0" });
        await fs.writeFile(path.join(extra, "mod-settings.dat"), "settings");
        // mod-list.json is not used to choose mods: space-age stays on, backgrounds is used though disabled here
        await fs.writeFile(path.join(extra, "mod-list.json"), JSON.stringify({ mods: [
            { name: "space-age", enabled: false }, { name: "backgrounds", enabled: false }, { name: "other-mod", enabled: true },
        ] }));
        const before = (await fs.readdir(extra)).sort();
        const modsDir = path.join(dir, "work", "mods");
        const mods = await prepareMods({ executable, modsDir, extraModsDir: extra, enableMods: ["backgrounds"], hideStatusIcons: true });
        assert.deepEqual(mods.map(mod => mod.name), ["base", "elevated-rails", "quality", "space-age", MOD_NAME, "backgrounds", "lib-a", "lib b"]);
        assert.ok(mods.every(mod => mod.enabled));
        assert.deepEqual((await fs.readdir(modsDir)).sort(),
            [MOD_NAME, "backgrounds", "lib-a_1.2.0.zip", "lib-b_0.3.0", "mod-list.json", "mod-settings.dat"].sort());
        assert.deepEqual((await fs.readdir(extra)).sort(), before);

        await assert.rejects(prepareMods({ executable, modsDir, extraModsDir: extra, enableMods: ["nope"], hideStatusIcons: true }),
            new RegExp(`Mod "nope" is not in ${extra}`));
        await fs.rm(path.join(extra, "lib-b_0.3.0"), { recursive: true });
        await assert.rejects(prepareMods({ executable, modsDir, extraModsDir: extra, enableMods: ["backgrounds"], hideStatusIcons: true }),
            /Mod "lib b" \(required by "lib-a"\) is not in/);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test("without --mods, --enable-mods uses the game's own mods folder", async () => {
    const dir = await tempDir("render-game-mods-");
    try {
        const { root, executable } = await fakeInstall(dir);
        assert.equal(await gameModsDir(executable, "linux", {}, "/home/me"), "/home/me/.factorio/mods");
        assert.equal(await gameModsDir(executable, "win32", { APPDATA: "C:\\AppData" }, "/home/me"), path.join("C:\\AppData", "Factorio", "mods"));
        assert.equal(await gameModsDir(executable, "darwin", {}, "/home/me"), "/home/me/Library/Application Support/factorio/mods");
        await fs.writeFile(path.join(root, "config-path.cfg"), "config-path=__PATH__executable__/../../config\nuse-system-read-write-data-directories=false\n");
        assert.equal(await gameModsDir(executable), path.join(root, "mods"));

        const modsDir = path.join(dir, "work", "mods");
        await assert.rejects(prepareMods({ executable, modsDir, enableMods: ["backgrounds"], hideStatusIcons: true }),
            /mods folder was not found at .*: pass --mods/);
        await fs.mkdir(path.join(root, "mods", "backgrounds"), { recursive: true });
        await fs.writeFile(path.join(root, "mods", "backgrounds", "info.json"), JSON.stringify({ name: "backgrounds", version: "1.0.0" }));
        const mods = await prepareMods({ executable, modsDir, enableMods: ["backgrounds"], hideStatusIcons: true });
        assert.ok(mods.some(mod => mod.name === "backgrounds" && mod.enabled));
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test("required dependencies leave out optional, hidden, incompatible and load-order ones", () => {
    assert.deepEqual(requiredDependencies({ dependencies: ["base >= 2.0", "a", "b>=1.0", "c = 1.0.0", "? d", "?e", "(?) f", "! g", "~ h", "mod with spaces < 2"] }),
        ["base", "a", "b", "c", "mod with spaces"]);
    assert.deepEqual(requiredDependencies({}), []);
});

test("Lua long strings are never closed by their content", () => {
    assert.equal(luaLongString("abc"), "[=[abc]=]");
    assert.equal(luaLongString("a]=]b"), "[==[a]=]b]==]");
    assert.equal(luaLongString("]=]]==]"), "[===[]=]]==]]===]");
});
