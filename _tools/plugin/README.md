# factorio-blueprints Obsidian plugin

Turns blueprint strings copied in Factorio into `blueprint.json` files with
notes beside them, and back. The built plugin is committed in
`.obsidian/plugins/factorio-blueprints/`, so every clone of the vault has it.

- **Import blueprint from clipboard** (right-click a folder, or the command
  palette): writes `blueprint.json` in the
  [canonical format](../docs/conventions.md), creating the folder and notes
  from the template or updating an existing blueprint, then commits just
  that folder with a one-line change note, pulls and pushes. New blueprints
  go under `blueprints/` (from the vault root, straight into it); the
  commands only see blueprints there.
- **Copy blueprint string**: encodes a folder's `blueprint.json` to the
  clipboard, ready for Import string in the game.

- **Expand book into folders** (on a book's folder): `book.json` plus one
  folder per entry, each with its own note and render; see the conventions.
- **Copy live link**: the folder's link on the link service; for a book, a
  picker offers the whole book or any entry.
- **Set blueprint status**: draft, public, deprecated or unlisted, written
  to the note's `status` (the root book's, inside an expanded book), then
  committed and pushed. New blueprints start as drafts.
- **Publish version**: every command that commits a published blueprint
  also records its version in `versions.json` (see the conventions): new
  content under a new `version` becomes a new version, recorded with the
  commit that brought it in; a new `version` for the same content renames
  the latest one. New content under a `version` that is already recorded is
  committed but not published, and the notice says to bump `version`. This
  command does the same on its own, for a `version` edited by hand.
- **Render preview** (also: click the `Render: …` status bar item): runs
  `_tools/render` for the folder (with `--only` for just the outdated
  entries when clicked from the status bar), refreshes the notes' generated
  block, commits and pushes. **Show
  blueprints needing a render** and **Render all that need it** work across
  the vault; **Cancel render preview** stops a run. An image is outdated
  when its blueprint changed since it was made, or when it was made by an
  older render version than `_tools/render/render-version.json` (an image
  record without one counts as version 1). After a render tool fix that
  changes output: bump the render version, then run **Render all that need
  it**.
- **Commit blog post** (right-click a post folder under `blog/`, or the
  command palette in its note): checks a published post's frontmatter,
  then commits, pulls and pushes just that folder; CI publishes it unless
  its `status` is draft. Blog folders are never blueprint folders, so the
  blueprint commands do not act on them. New posts start from the
  `blog-post` template (Templates: Insert template).
- **Refresh generated content in all notes**: writes the stats, cover image
  and contents list into every note, without committing. The cover image and
  contents list at the top of a note are generated; write below them.

Settings: default authors, commit after import and render, the template
path and the link service address (shared); per computer: the git binary,
Factorio path, Node path, extra render arguments, render after import, and
render mods with their mods folder (`--enable-mods`, `--mods`).

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
