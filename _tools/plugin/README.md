# factorio-blueprints Obsidian plugin

Turns blueprint strings copied in Factorio into `blueprint.json` files with
notes beside them, and back. Desktop only. The built plugin is committed in
`.obsidian/plugins/factorio-blueprints/`, so the vault sync installs it on
every machine; enabling it is described in
[vault setup](../docs/vault-setup.md).

## Commands

Both work from the command palette (on the active note's folder) and from
the file explorer's right-click menu (on the clicked folder).

- **Import blueprint from clipboard.** Decodes the clipboard and writes
  `blueprint.json` in the [canonical format](../docs/conventions.md).
  - Inside an existing blueprint folder (or any folder below one) it
    **updates** it: shows what was there and what replaces it, offers to
    bump `version` in the frontmatter, and leaves the notes otherwise alone.
    Importing the identical blueprint again does nothing.
  - Anywhere else it **creates** a folder there: you confirm the title and
    folder name (proposed from the label), an existing folder is never
    overwritten, and `README.md` is made from the notes template with
    `title`, `posted` (today) and `authors` (from settings) filled in.
    Folders starting with `_` or `.` are refused, as they are never scanned.
  - Then it commits just that folder with your one-line change note (blank
    gives `add <title>` or `update <title>`), pulls and pushes, using the
    system git. If git is busy or any step fails, the file stays saved, a
    notice says what happened, and the Git plugin's timed sync picks it up.
    Nothing is retried or forced; a pull that hits a merge conflict is
    undone (your commit stays local).
- **Copy blueprint string.** Encodes the blueprint folder's `blueprint.json`
  and puts the string on the clipboard, ready for Import string in the game.

Settings: default authors, commit after import on or off, the template
path, and (per computer) the git binary.

## Layout

```
src/core/       shared library: codec, canonical JSON, describe, slugs,
                frontmatter, notes template, blueprint folder rules
src/commands/   command logic, written against the Host interface (host.ts)
src/git/        commit, pull and push one folder (Node child_process)
src/obsidian/   the Obsidian side: Host, dialogs, settings
src/main.ts     registers commands and menus; FOLDER_COMMANDS is where the
                render command will be added
test/unit/      unit tests; test/fixtures/ small strings and expected files
test/corpus/    round-trip test over the old catalog (needs a download)
```

## Build and test

Needs Node 22.18 or later (TypeScript runs directly through Node's type
stripping) and git.

```sh
cd _tools/plugin
npm ci
npm run typecheck   # plugin against the obsidian typings; core with no DOM or Node types
npm test            # unit tests, including git against temporary repos
npm run build       # writes .obsidian/plugins/factorio-blueprints/main.js and manifest.json
```

Commit the rebuilt files with any source change; CI rebuilds and fails if
they differ. The build is reproducible (pinned dependencies, no
timestamps).

The corpus test checks every string in the old catalog. It downloads
factoriobin posts once into the ignored `.corpus/` directory:

```sh
npm run corpus:fetch -- --benchmarks /path/to/factorio-benchmarks
npm run test:corpus
```

To regenerate the hand-made fixtures: `python3 -I test/fixtures/make-fixtures.py`.

## Using the core from other tools

`src/core/index.ts` has no Obsidian or Node imports; it uses only `fflate`,
`yaml` and globals that Node, browsers and Cloudflare Workers all have.
Import it by path, after `npm ci` here:

```ts
import {
  decodeBlueprintString,
  encodeBlueprintString,
  writeCanonicalJson,
  readCanonicalJson,
  describeBlueprint,
  readNotesMeta,
} from "../plugin/src/core/index.ts";

const { value } = decodeBlueprintString(text);
const file = writeCanonicalJson(value); // what goes in blueprint.json
const string = encodeBlueprintString(readCanonicalJson(file));
```

Node 22.18+ runs this directly (`node script.ts`); bundlers such as
esbuild and Wrangler resolve the `.ts` imports as they are.
