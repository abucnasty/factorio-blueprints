# factorio-blueprints Obsidian plugin

Turns blueprint strings copied in Factorio into `blueprint.json` files with
notes beside them, and back. The built plugin is committed in
`.obsidian/plugins/factorio-blueprints/`, so every clone of the vault has it.

- **Import blueprint from clipboard** (right-click a folder, or the command
  palette): writes `blueprint.json` in the
  [canonical format](../docs/conventions.md), creating the folder and notes
  from the template or updating an existing blueprint, then commits just
  that folder with a one-line change note, pulls and pushes.
- **Copy blueprint string**: encodes a folder's `blueprint.json` to the
  clipboard, ready for Import string in the game.

Settings: default authors, commit after import, the template path, and (per
computer) the git binary.

## Build and test

Needs Node 22.18 or later and git.

```sh
cd _tools/plugin
npm ci
npm run typecheck
npm test            # unit tests, including git against temporary repos
npm run build       # writes .obsidian/plugins/factorio-blueprints/
npm run corpus:fetch -- --benchmarks /path/to/factorio-benchmarks
npm run test:corpus # round trip over the old catalog (downloads once into .corpus/)
```

Commit the rebuilt files with any source change; CI rebuilds and fails if
they differ.

## Using the core from other tools

`src/core/index.ts` has no Obsidian or Node imports (only `fflate`, `yaml`
and globals that Node, browsers and Workers share). Import it by path after
`npm ci` here:

```ts
import { decodeBlueprintString, encodeBlueprintString, writeCanonicalJson, readCanonicalJson }
  from "../plugin/src/core/index.ts";

const file = writeCanonicalJson(decodeBlueprintString(text).value); // blueprint.json
const string = encodeBlueprintString(readCanonicalJson(file));
```
