import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { defaultConfigPath, parseCommandLine } from "../src/cli.js";
import { FRAMING_DEFAULTS } from "../src/framing.js";

const noConfig = async () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); };
const parse = (argv, { env = {}, config } = {}) => parseCommandLine(argv, {
    env, platform: "linux", home: "/home/me",
    readConfig: config === undefined ? noConfig : async () => JSON.stringify(config),
});

test("just input and output, with Factorio from the environment", async () => {
    const options = await parse(["--input", "bp.json", "--out", "renders"], { env: { FACTORIO_PATH: "/opt/factorio" } });
    assert.equal(options.factorio, "/opt/factorio");
    assert.deepEqual(options.framing, { ...FRAMING_DEFAULTS });
    assert.equal(options.hideStatusIcons, true);
    assert.equal(options.timeoutSeconds, 300);
    assert.equal(options.keepWork, false);
    assert.equal(options.mods, undefined);
    assert.deepEqual(options.backdrop, ["lab-dark-1", "black-refined-concrete"]);
    assert.equal(options.diagnose, false);
    assert.equal((await parse(["--input", "a", "--out", "b", "--diagnose"], { env: { FACTORIO_PATH: "f" } })).diagnose, true);
});

test("the backdrop tiles come from the argument, environment or config, and are checked", async () => {
    const base = ["--input", "a", "--out", "b", "--factorio", "f"];
    assert.deepEqual((await parse([...base, "--backdrop", "lab-dark-1, lab-dark-2"])).backdrop, ["lab-dark-1", "lab-dark-2"]);
    assert.deepEqual((await parse(base, { env: { FACTORIO_RENDER_BACKDROP: "concrete,stone-path" } })).backdrop, ["concrete", "stone-path"]);
    assert.deepEqual((await parse(base, { config: { backdrop: ["refined-concrete", "black-refined-concrete"] } })).backdrop, ["refined-concrete", "black-refined-concrete"]);
    await assert.rejects(parse([...base, "--backdrop", "one-tile"]), /two tile names/);
    await assert.rejects(parse([...base, "--backdrop", "a,b,c"]), /two tile names/);
});

test("arguments beat environment, environment beats the config file", async () => {
    const config = { factorio: "/from/config", maxSize: 2048, mods: "/config/mods", minPixelsPerTile: 4, showStatusIcons: true, timeout: 60 };
    const fromConfig = await parse(["--input", "a", "--out", "b"], { config });
    assert.equal(fromConfig.factorio, "/from/config");
    assert.equal(fromConfig.framing.maxSize, 2048);
    assert.equal(fromConfig.framing.minPixelsPerTile, 4);
    assert.equal(fromConfig.mods, "/config/mods");
    assert.equal(fromConfig.hideStatusIcons, false);
    assert.equal(fromConfig.timeoutSeconds, 60);
    const env = { FACTORIO_PATH: "/from/env", FACTORIO_RENDER_MAX_SIZE: "1024", FACTORIO_RENDER_MODS: "/env/mods" };
    const fromEnv = await parse(["--input", "a", "--out", "b"], { env, config });
    assert.deepEqual([fromEnv.factorio, fromEnv.framing.maxSize, fromEnv.mods], ["/from/env", 1024, "/env/mods"]);
    const fromArgs = await parse(["--input", "a", "--out", "b", "--factorio", "/arg", "--max-size", "512", "--mods", "/arg/mods", "--keep-work"], { env, config });
    assert.deepEqual([fromArgs.factorio, fromArgs.framing.maxSize, fromArgs.mods, fromArgs.keepWork], ["/arg", 512, "/arg/mods", true]);
});

test("clear errors for missing or bad arguments", async () => {
    await assert.rejects(parse(["--out", "x"], { env: { FACTORIO_PATH: "f" } }), /--input is required/);
    await assert.rejects(parse(["--input", "x"], { env: { FACTORIO_PATH: "f" } }), /--out is required/);
    await assert.rejects(parse(["--input", "x", "--out", "y"]), /Where is Factorio/);
    await assert.rejects(parse(["--input", "x", "--out", "y", "--factorio", "f", "--max-size", "big"]), /--max-size must be a whole number/);
    await assert.rejects(parse(["--input", "x", "--out", "y", "--factorio", "f", "--max-size", "100000"]), /max size/);
    await assert.rejects(parse(["--input", "x", "--out", "y", "--frobnicate"]), /Unknown option/);
    await assert.rejects(parse(["--input", "x", "--out", "y", "--factorio", "f", "--timeout", "1"]), /--timeout/);
});

test("a named config file must exist; the default one may not", async () => {
    await assert.rejects(parse(["--input", "x", "--out", "y", "--config", "/nope.json"]), /Cannot use config file \/nope.json/);
    await assert.rejects(parseCommandLine(["--input", "x", "--out", "y"], { env: {}, readConfig: async () => "[1]" }), /not a JSON object/);
});

test("--list and --help need no Factorio", async () => {
    assert.deepEqual(await parse(["--input", "x", "--list"]), { list: true, input: "x", json: false });
    assert.deepEqual(await parse(["-h"]), { help: true });
});

test("default config path per platform", () => {
    assert.equal(defaultConfigPath("linux", {}, "/home/me"), "/home/me/.config/factorio-blueprints/render.json");
    assert.equal(defaultConfigPath("linux", { XDG_CONFIG_HOME: "/xdg" }, "/home/me"), "/xdg/factorio-blueprints/render.json");
    assert.equal(defaultConfigPath("darwin", {}, "/Users/me"), "/Users/me/Library/Application Support/factorio-blueprints/render.json");
    assert.equal(defaultConfigPath("win32", { APPDATA: "C:\\Users\\me\\AppData\\Roaming" }, "C:\\Users\\me"),
        path.join("C:\\Users\\me\\AppData\\Roaming", "factorio-blueprints", "render.json"));
});
