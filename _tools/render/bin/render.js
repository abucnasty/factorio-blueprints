#!/usr/bin/env node
// Render in-game screenshots of the blueprints in a blueprint.json or blueprint string. See ../README.md.
import { USAGE, listInput, parseCommandLine } from "../src/cli.js";
import { killAll } from "../src/factorio.js";
import { render } from "../src/render.js";

const log = message => process.stderr.write(`${message}\n`);

// Never leave a game running: kill it on Ctrl+C, termination and on any way out of this process.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
        log(`Received ${signal}: stopping Factorio`);
        killAll();
        process.exit(130);
    });
}
process.on("exit", killAll);

async function main() {
    const options = await parseCommandLine(process.argv.slice(2));
    if (options.help) {
        process.stdout.write(`${USAGE}\n`);
        return 0;
    }
    if (options.list) {
        const listed = await listInput(options.input);
        if (options.json) {
            process.stdout.write(JSON.stringify({
                format: listed.format,
                blueprints: listed.blueprints.map(({ number, path, label, empty }) => ({ number, path, label, empty })),
                skipped: listed.skipped,
            }, null, 2) + "\n");
        } else {
            for (const entry of listed.blueprints) {
                process.stdout.write(`${entry.number}.jpg  slot ${entry.path || "-"}  ${entry.label || "(no label)"}${entry.empty ? "  [empty: no image]" : ""}\n`);
            }
            for (const item of listed.skipped) process.stdout.write(`skipped ${item.kind} at slot ${item.path || "-"}\n`);
        }
        return 0;
    }
    const report = await render(options, log);
    if (options.json) process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    for (const missing of report.without_image) log(`No image for blueprint ${missing.number}: ${missing.reason}`);
    return report.without_image.length ? 2 : 0;
}

main().then(code => { process.exitCode = code; }, error => {
    log(`render: ${error.message}`);
    killAll();
    process.exitCode = 1;
});
