// Syntax check of the mod's Lua with luaparse in Lua 5.2 mode (Factorio runs a modified Lua 5.2), plus a check that
// every global it reads is a Lua builtin or one of Factorio's documented globals (catches typos of local names).
// This cannot check calls against the game's API.
import fs from "node:fs/promises";
import path from "node:path";
import luaparse from "luaparse";

const MOD = new URL("../mod/", import.meta.url).pathname;
const files = (await fs.readdir(MOD, { recursive: true })).filter(file => file.endsWith(".lua")).sort();
// Lua builtins used, and Factorio's globals: lua-api.factorio.com/latest (Global objects; data stage: data)
const KNOWN_GLOBALS = new Set(["error", "ipairs", "math", "next", "pairs", "pcall", "require", "select", "string", "table",
    "tonumber", "tostring", "type", "data", "defines", "game", "helpers", "prototypes", "rcon", "remote", "script", "settings",
    "storage", "log"]);
let failed = 0;
for (const file of files) {
    try {
        const chunk = luaparse.parse(await fs.readFile(path.join(MOD, file), "utf8"), { luaVersion: "5.2", scope: true });
        const unknown = chunk.globals.map(global => global.name).filter(name => !KNOWN_GLOBALS.has(name));
        if (unknown.length) throw new Error(`unknown globals: ${unknown.join(", ")}`);
        console.log(`ok   ${file}`);
    } catch (error) {
        failed++;
        console.log(`FAIL ${file}: ${error.message}`);
    }
}
if (!files.length) throw new Error(`No Lua files under ${MOD}`);
process.exitCode = failed ? 1 : 0;
