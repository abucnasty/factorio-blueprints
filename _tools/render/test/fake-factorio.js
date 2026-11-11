// A stand-in for the Factorio executable, for testing the launcher's process control without the game.
// It mimics only what the launcher relies on:
//   server (--start-server-load-scenario / --start-server): checks its config and mod directory, prints
//     "Starting RCON interface" and answers the launcher's RCON commands (connected players, game.tick, the mod's
//     remote interface, game.take_screenshot);
//   client (--mp-connect): tells the server where its write-data folder is (over the game's UDP port), so the server
//     can write screenshots into the client's script-output, as the real client would draw them.
// Each process writes its pid to <write-data>/fake.pid so tests can check nothing is left running.
// FAKE_FACTORIO_MODE: ok (default) | exit-early | hang | client-crash | no-screenshot | stall-build
import dgram from "node:dgram";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import sharp from "sharp";
import { decodeBlueprintString } from "../src/codec.js";

const MOD = "blueprint-vault-render";
const mode = process.env.FAKE_FACTORIO_MODE ?? "ok";
const argv = process.argv.slice(2);
const arg = name => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
};
const fail = message => {
    console.log(`Error: ${message}`);
    process.exit(1);
};

const config = arg("--config");
if (!config) fail("fake factorio needs --config");
const writeData = /write-data=(.*)/.exec(fs.readFileSync(config, "utf8"))?.[1]?.trim();
if (!writeData) fail("config has no write-data");
fs.writeFileSync(path.join(writeData, "fake.pid"), String(process.pid));
fs.writeFileSync(path.join(writeData, "factorio-current.log"), `fake factorio ${argv.join(" ")}\n`);
const keepAlive = () => setInterval(() => {}, 1 << 30);

const modsDir = arg("--mod-directory");
const modList = JSON.parse(fs.readFileSync(path.join(modsDir, "mod-list.json"), "utf8"));
if (!modList.mods.some(mod => mod.name === MOD && mod.enabled)) fail("render mod not enabled");
if (!fs.existsSync(path.join(modsDir, MOD, "control.lua"))) fail("render mod not in the mod directory");

if (arg("--mp-connect")) {
    if (mode === "client-crash") fail("fake client crashed");
    const [host, port] = arg("--mp-connect").split(":");
    const socket = dgram.createSocket("udp4");
    const hello = () => socket.send(`hello ${writeData}`, Number(port), host);
    hello();
    setInterval(hello, 200);
} else {
    const scenario = arg("--start-server-load-scenario");
    const save = arg("--start-server");
    if (scenario !== `${MOD}/stage` && !(save && fs.existsSync(save))) fail(`unexpected scenario/save ${scenario ?? save}`);
    if (mode === "exit-early") fail("fake server failed to start");
    if (mode === "hang") {
        console.log("fake server hanging before RCON");
        keepAlive();
    } else {
        startServer();
    }
}

function startServer() {
    const [rconHost, rconPort] = arg("--rcon-bind").split(":");
    const password = arg("--rcon-password");
    const started = Date.now();
    let clientDir = null;
    let parts = [];
    const surfaces = new Set();

    const udp = dgram.createSocket("udp4");
    udp.on("message", message => {
        const match = /^hello (.*)$/.exec(message.toString());
        if (match) clientDir = match[1];
    });
    udp.bind(Number(arg("--port")), "127.0.0.1");

    const tick = () => Math.floor((Date.now() - started) * 60 / 1000);

    async function screenshot(params) {
        fs.appendFileSync(path.join(writeData, "screenshots.jsonl"), JSON.stringify(params) + "\n");
        if (mode === "no-screenshot" || !clientDir) return;
        for (const key of ["show_entity_info", "force_render", "hide_clouds", "hide_fog"]) {
            if (params[key] !== true) throw new Error(`take_screenshot without ${key}`);
        }
        if (params.show_gui !== false || params.daytime !== 0) throw new Error("take_screenshot with GUI or not at noon");
        if (!surfaces.has(params.surface)) throw new Error(`no surface ${params.surface}`);
        const png = await sharp({ create: { width: params.resolution.x, height: params.resolution.y, channels: 3, background: "#30a050" } }).png().toBuffer();
        const file = path.join(clientDir, "script-output", params.path);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        // written in two steps, as the game writes asynchronously: the launcher must wait for IEND
        fs.writeFileSync(file, png.subarray(0, png.length - 12));
        setTimeout(() => fs.writeFileSync(file, png), 300);
    }

    function build(job) {
        const blueprint = decodeBlueprintString(parts.join("")).blueprint;
        parts = [];
        if (!blueprint) return { error: "not a blueprint" };
        surfaces.add(job.surface);
        const entities = blueprint.entities ?? [];
        const placed = entities.filter(entity => !entity.name.startsWith("fake-unplaceable"));
        const missing = {};
        for (const entity of entities) if (!placed.includes(entity)) missing[entity.name] = (missing[entity.name] ?? 0) + 1;
        if (!placed.length) return { surface: job.surface, built: 0, failed: {}, missing, problems: [], tick: tick() };
        const xs = placed.map(entity => entity.position.x), ys = placed.map(entity => entity.position.y);
        return {
            surface: job.surface, built: placed.length, tiles: 0, failed: {}, missing, problems: [], tick: tick(),
            area: { left_top: { x: Math.min(...xs) - 0.5, y: Math.min(...ys) - 0.5 }, right_bottom: { x: Math.max(...xs) + 0.5, y: Math.max(...ys) + 0.5 } },
        };
    }

    async function run(command) {
        if (command === "/sc rcon.print(#game.connected_players)") return clientDir ? "1" : "0";
        if (command === "/sc rcon.print(game.tick)") return String(tick());
        const call = /^\/sc rcon\.print\(remote\.call\("([\w-]+)", "(\w+)"(?:, \[(=*)\[([\s\S]*)\]\3\])?\)\)$/.exec(command);
        if (call) {
            const [, iface, name, , text] = call;
            if (iface !== MOD) return `Error: unknown interface ${iface}`;
            if (name === "reset") { parts = []; return "ok"; }
            if (name === "append") { parts.push(text); return String(parts.length); }
            if (name === "build") {
                if (mode === "stall-build") return new Promise(() => {});
                return JSON.stringify(build(JSON.parse(text)));
            }
            if (name === "delete") { surfaces.delete(text); return "ok"; }
            return `Error: unknown function ${name}`;
        }
        const shot = /^\/sc game\.take_screenshot\(helpers\.json_to_table\(\[(=*)\[([\s\S]*)\]\1\]\)\)$/.exec(command);
        if (shot) {
            await screenshot(JSON.parse(shot[2]));
            return "";
        }
        return `Error: fake factorio does not know ${command.slice(0, 80)}`;
    }

    const rcon = net.createServer(socket => {
        let buffer = Buffer.alloc(0);
        let authed = false;
        const reply = (id, body) => {
            const payload = Buffer.from(body, "utf8");
            const packet = Buffer.alloc(14 + payload.length);
            packet.writeInt32LE(10 + payload.length, 0);
            packet.writeInt32LE(id, 4);
            packet.writeInt32LE(0, 8);
            payload.copy(packet, 12);
            socket.write(packet);
        };
        let queue = Promise.resolve();
        socket.on("data", chunk => {
            buffer = Buffer.concat([buffer, chunk]);
            while (buffer.length >= 4 && buffer.length >= 4 + buffer.readInt32LE(0)) {
                const size = buffer.readInt32LE(0);
                const id = buffer.readInt32LE(4), type = buffer.readInt32LE(8);
                const body = buffer.toString("utf8", 12, 4 + size - 2);
                buffer = buffer.subarray(4 + size);
                if (type === 3) {
                    authed = body === password;
                    reply(authed ? id : -1, "");
                } else if (authed) {
                    queue = queue.then(() => run(body)).then(answer => reply(id, answer), error => reply(id, `Error: ${error.message}`));
                }
            }
        });
        socket.on("error", () => {});
    });
    rcon.listen(Number(rconPort), rconHost, () => {
        setTimeout(() => console.log(`Info RemoteCommandProcessor.cpp: Starting RCON interface at IP ADDR:({${rconHost}:${rconPort}})`), 200);
    });
}
