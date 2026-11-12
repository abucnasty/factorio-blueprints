// Bundle the plugin into the vault's plugin folder, which is committed so
// the vault sync installs it on every machine. The output must be
// byte-for-byte reproducible: CI rebuilds it and fails on any difference.

import { builtinModules } from "node:module";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const outDir = join(root, "..", "..", ".obsidian", "plugins", "factorio-blueprints");

mkdirSync(outDir, { recursive: true });

await build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  outfile: join(outDir, "main.js"),
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  // Provided by Obsidian (Electron) at run time.
  external: [
    "obsidian",
    "electron",
    "@codemirror/*",
    "@lezer/*",
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
  ],
  minify: false,
  sourcemap: false,
  treeShaking: true,
  charset: "utf8",
  legalComments: "inline",
  logLevel: "info",
  banner: {
    js: "/* factorio-blueprints Obsidian plugin. Generated from _tools/plugin by `npm run build`; do not edit. */",
  },
});

copyFileSync(join(root, "manifest.json"), join(outDir, "manifest.json"));
