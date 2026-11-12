// Command line: arguments, environment and config file, in that order of precedence.
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { listBlueprints, readInput } from "./blueprints.js";
import { FRAMING_DEFAULTS, framingOptions } from "./framing.js";

/** The owner's backdrop: the lab checkerboard with lab-dark-2 replaced by black refined concrete */
export const DEFAULT_BACKDROP = Object.freeze(["lab-dark-1", "black-refined-concrete"]);

/** Two tile names, from "a,b" or ["a", "b"] */
export function parseBackdrop(value) {
    if (value === undefined || value === null || value === "") return [...DEFAULT_BACKDROP];
    const tiles = (Array.isArray(value) ? value : String(value).split(",")).map(tile => String(tile).trim());
    if (tiles.length !== 2 || tiles.some(tile => !/^[\w-]+$/.test(tile))) {
        throw new Error(`--backdrop must be two tile names separated by a comma, like ${DEFAULT_BACKDROP.join(",")}, not "${value}"`);
    }
    return tiles;
}

export const USAGE = `Usage:
  render --input <file> --out <dir> [options]     render every blueprint in <file> to <dir>/0.jpg, 1.jpg, ...
  render --input <file> --list                    list the blueprints and their image numbers; no game needed

<file> is a blueprint.json (decoded JSON) or a text file holding a blueprint string.

Options:
  --factorio <path>             Factorio executable or install folder        (env FACTORIO_PATH)
  --max-size <px>               longest side of one screenshot, default ${FRAMING_DEFAULTS.maxSize}  (env FACTORIO_RENDER_MAX_SIZE)
  --min-pixels-per-tile <px>    below this, capture a grid and stitch, default ${FRAMING_DEFAULTS.minPixelsPerTile}
  --max-output-size <px>        longest side of a stitched image, default ${FRAMING_DEFAULTS.maxOutputSize}
  --mods <dir>                  extra mods for modded blueprints (copied, never modified) (env FACTORIO_RENDER_MODS)
  --save <file>                 start from a copy of this save instead of the built-in scenario
  --show-status-icons           keep "no power" / "no fuel" icons (hidden by default)
  --backdrop <tile>,<tile>      floor tiles replacing lab-dark-1 and lab-dark-2, default ${DEFAULT_BACKDROP.join(",")}
                                (env FACTORIO_RENDER_BACKDROP); "lab-dark-1,lab-dark-2" is the plain lab floor
  --diagnose                    run the placement experiment matrix for every blueprint (it always runs for a
                                blueprint the game refused completely); adds [diagnose] lines to the log
  --timeout <s>                 time allowed for the game to start and its window to join, default 300
  --work-dir <dir>              empty or new folder for the game's files (default: a temporary folder)
  --keep-work                   keep the work folder after a successful run (it is always kept after a failure)
  --json                        print the run's report as JSON on stdout (progress goes to stderr)
  --config <file>               config file (env FACTORIO_RENDER_CONFIG; default ${defaultConfigPath()})
  -h, --help

Config file (JSON, every key optional):
  { "factorio": "...", "mods": "...", "maxSize": 4096, "minPixelsPerTile": 8, "maxOutputSize": 8192,
    "timeout": 300, "showStatusIcons": false, "backdrop": ["lab-dark-1", "black-refined-concrete"] }

Exit status: 0 every blueprint has an image; 2 some blueprint got no image (see the report); 1 the run failed.`;

/** Where the config file is looked for when none is named */
export function defaultConfigPath(platform = process.platform, env = process.env, home = os.homedir()) {
    const base = platform === "win32" ? (env.APPDATA ?? path.join(home, "AppData", "Roaming"))
        : platform === "darwin" ? path.join(home, "Library", "Application Support")
            : (env.XDG_CONFIG_HOME || path.join(home, ".config"));
    return path.join(base, "factorio-blueprints", "render.json");
}

const OPTIONS = {
    factorio: { type: "string" },
    input: { type: "string" },
    out: { type: "string" },
    "max-size": { type: "string" },
    "min-pixels-per-tile": { type: "string" },
    "max-output-size": { type: "string" },
    mods: { type: "string" },
    save: { type: "string" },
    "show-status-icons": { type: "boolean" },
    diagnose: { type: "boolean" },
    backdrop: { type: "string" },
    timeout: { type: "string" },
    "work-dir": { type: "string" },
    "keep-work": { type: "boolean" },
    json: { type: "boolean" },
    list: { type: "boolean" },
    config: { type: "string" },
    help: { type: "boolean", short: "h" },
};

function number(name, value, { integer = true, min = 0 } = {}) {
    if (value === undefined || value === null || value === "") return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed)) || parsed < min) {
        throw new Error(`${name} must be ${integer ? "a whole number" : "a number"} of at least ${min}, not "${value}"`);
    }
    return parsed;
}

/**
 * Turn arguments, environment and config file into options. Throws with a message for the user on bad input.
 * @param {string[]} argv
 * @param {{ env?: NodeJS.ProcessEnv, readConfig?: (file: string) => Promise<string>, platform?: string, home?: string }} [context]
 */
export async function parseCommandLine(argv, context = {}) {
    const env = context.env ?? process.env;
    const readConfig = context.readConfig ?? (file => fsp.readFile(file, "utf8"));
    let parsed;
    try {
        parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: false, strict: true });
    } catch (error) {
        throw new Error(`${error.message}\n\n${USAGE}`);
    }
    const args = parsed.values;
    if (args.help) return { help: true };

    const named = args.config ?? env.FACTORIO_RENDER_CONFIG;
    const configPath = named ?? defaultConfigPath(context.platform, env, context.home);
    let config = {};
    try {
        config = JSON.parse(await readConfig(configPath));
        if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("it is not a JSON object");
    } catch (error) {
        if (error.code === "ENOENT" && !named) config = {};
        else throw new Error(`Cannot use config file ${configPath}: ${error.message}`);
    }
    const pick = (cli, envName, key) => cli ?? (envName ? env[envName] : undefined) ?? config[key];

    if (!args.input) throw new Error(`--input is required\n\n${USAGE}`);
    if (args.list) return { list: true, input: args.input, json: Boolean(args.json) };
    if (!args.out) throw new Error(`--out is required (or use --list)\n\n${USAGE}`);

    const framing = framingOptions({
        maxSize: number("--max-size", pick(args["max-size"], "FACTORIO_RENDER_MAX_SIZE", "maxSize"), { min: 64 }),
        minPixelsPerTile: number("--min-pixels-per-tile", pick(args["min-pixels-per-tile"], null, "minPixelsPerTile"), { integer: false, min: 1 }),
        maxOutputSize: number("--max-output-size", pick(args["max-output-size"], null, "maxOutputSize"), { min: 64 }),
    });
    const factorio = pick(args.factorio, "FACTORIO_PATH", "factorio");
    if (!factorio) throw new Error("Where is Factorio? Pass --factorio <path>, set FACTORIO_PATH, or set \"factorio\" in " + configPath);
    const showStatusIcons = args["show-status-icons"] ?? config.showStatusIcons ?? false;
    return {
        factorio,
        input: args.input,
        out: args.out,
        framing,
        mods: pick(args.mods, "FACTORIO_RENDER_MODS", "mods") || undefined,
        save: args.save,
        workDir: args["work-dir"],
        keepWork: Boolean(args["keep-work"]),
        hideStatusIcons: !showStatusIcons,
        diagnose: Boolean(args.diagnose),
        backdrop: parseBackdrop(pick(args.backdrop, "FACTORIO_RENDER_BACKDROP", "backdrop")),
        timeoutSeconds: number("--timeout", pick(args.timeout, null, "timeout"), { min: 10 }) ?? 300,
        json: Boolean(args.json),
    };
}

/** The --list output */
export async function listInput(file) {
    const { value, format } = await readInput(file);
    return { format, ...listBlueprints(value) };
}
