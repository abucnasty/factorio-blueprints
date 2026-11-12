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
                entries: listed.entries.map(({ path, kind, label, file, problem }) => ({ path, kind, label, file, problem })),
                blueprints: listed.blueprints.map(({ path, label, file, empty }) => ({ path, label, file, empty })),
                skipped: listed.skipped,
                problems: listed.problems,
            }, null, 2) + "\n");
        } else {
            const empty = new Set(listed.blueprints.filter(entry => entry.empty).map(entry => entry.path));
            for (const entry of listed.entries) {
                const indent = "  ".repeat(Math.max(0, entry.slots.length - 1));
                const where = entry.path === "" ? "(root)" : entry.path;
                const target = entry.file ? `  -> ${entry.file}${empty.has(entry.path) ? " [empty: no image]" : ""}` : "";
                const note = entry.problem ? `  [ignored: ${entry.problem}]` : "";
                process.stdout.write(`${indent}${where}  ${entry.kind}  ${entry.label || "(no label)"}${target}${note}\n`);
            }
            for (const problem of listed.problems) process.stdout.write(`problem: ${problem}\n`);
        }
        return 0;
    }
    const report = await render(options, log);
    if (options.json) process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return report.without_image.length ? 2 : 0;
}

main().then(code => { process.exitCode = code; }, error => {
    log(`render: ${error.message}`);
    killAll();
    process.exitCode = 1;
});
