# Conventions

Shared definitions for everything in this repo. The plugin, the migration,
the CI scripts and the Workers all follow this file. Change it first, then
the code.

## Repo layout

The repo root is the Obsidian vault.

```
.obsidian/                 vault settings and plugins
.github/workflows/         CI and deploys
.gitattributes .lfsconfig  Git LFS setup for render images
_tools/                    everything that is not a blueprint
  docs/                    this file and the setup doc
  setup/                   per-machine setup check script
  templates/               note templates
  plugin/                  Obsidian plugin source (TypeScript)
  lfs-worker/              Cloudflare Worker: Git LFS endpoint backed by R2
  render/                  Factorio mod + launcher for in-game screenshots
  migration/               one-off import of the old catalog
  link-worker/             Cloudflare Worker: live blueprint links
  ci/                      validation and catalog index builder
<category>/<sub-category>/<blueprint-slug>/
  README.md                notes + frontmatter
  blueprint.json           the decoded blueprint
  versions.json            its recorded versions, once published
  renders/<slot path>.jpg  one image per blueprint: 0.jpg, or 3/1.jpg in a book
<category>/<book-slug>/    an expanded book
  README.md  book.json     the book without its entries
  versions.json            the whole book's recorded versions, once published
  0-<slug>/                slot folder: a blueprint folder or expanded book
```

A **blueprint folder** has `blueprint.json` (one pasted string), `README.md`
and optional `renders/`. An **expanded book** has `book.json` (the book
without `blueprints`) and `README.md` instead; its entries are **slot
folders** named `<slot>` or `<slot>-<slug of the label>` (at most 60
characters; only the number counts), each a blueprint folder or expanded
book. An expanded book has no `renders/`; its leaves keep their own. A
**category folder** has neither file. A folder never has both files, a
blueprint folder contains no other, and inside an expanded book every
folder holding blueprints is a slot folder. The book's value is `book.json`
with one entry per slot folder, `index` = slot (`assembleBook` /
`expandBook` in the core). Any directory whose name starts with `_` or `.`
is never scanned for blueprints. Category nesting can be any depth.

Slugs are lowercase ASCII, words joined by `-`, no other punctuation
(`Military Science (240/s)` becomes `military-science-240`). In detail:
rich text icons become their name (`[item=iron-plate]` gives `iron-plate`)
and other rich text tags are dropped; accents are dropped (`ß` becomes
`ss`); a rate keeps only its number (`240/s`, `/sec`, `/m`, `/min`, `/h`);
`%` becomes the word `percent` (`100%` gives `100-percent`);
any other run of characters that are not ASCII letters or digits is one
`-`. A label with no ASCII letters or digits gives no slug, and the user
names the folder. `slugify` in the core is the implementation.

## Notes file frontmatter

`README.md` in a blueprint folder starts with YAML frontmatter. A new
blueprint's notes file has only the five keys of
`_tools/templates/blueprint-notes.md` and an empty body (the frontmatter
block followed by a single newline):

```yaml
---
title: Military Science (240/s)
authors: [abucnasty]
version: "1"
posted: 2026-03-10
status: draft
---
```

The keys, required and optional:

```yaml
---
title: Military Science (240/s)     # required, display name
authors: [abucnasty]                # required, list, may be empty
version: "3"                        # required to publish; always a string, unique per blueprint
posted: 2026-03-10                  # optional, ISO date
video: https://youtu.be/...         # optional
factoriobin: https://factoriobin.com/post/...   # optional
status: public                      # draft, public, deprecated or unlisted; absent means draft
previous_paths: [old/folder/path]   # optional, old folder paths, for link redirects
---
```

`status` says where the blueprint is published:

| status | website | live link |
|---|---|---|
| `draft` | not shown | does not work |
| `public` | listed | works |
| `deprecated` | listed behind "Show deprecated" | works |
| `unlisted` | opens by its address only, not listed or searched | works |

A draft is not in `index.json`, except one that was published before: it
keeps its live entry (string, notes, renders, versions), and changes saved
as a draft never become versions. Making it public again publishes its
current content under its `version` (see Versions). In an expanded book
only the root book's note has a status; slot folders' notes have none.
`status` replaced the `deprecated: true` checkbox: a note may not have
`deprecated`.

### Versions

A version is made on purpose: the root note's `version` is its label (free
text such as `1.0`, `1.2` or `MK3`, no `/`, unique per blueprint), and a
published blueprint must have one. Each published blueprint has a ledger,
`versions.json`, next to its note (for an expanded book, in the root
book's folder): every version recorded, oldest first.

```json
[
  {
    "label": "1.0",
    "date": "2025-08-15T05:10:57Z",
    "hash": "efdbf8fa…",
    "commit": "0afbbf04…"
  }
]
```

`hash` is the content hash: the render tool's `blueprintHash` (SHA-256 of
compact JSON with sorted keys) of the whole `blueprint.json` value, or of
the assembled expanded book. `commit` is the full SHA of the commit that
brought that content in, and `date` its author date.

The plugin writes the ledger whenever it commits a published blueprint
(and with **Publish version**); CI only reads it. The rules:

- The same content as the latest version never makes a new version, so
  re-saving, reformatting or expanding a book changes nothing. A new
  `version` for the same content renames the latest version.
- New content under a `version` the ledger does not have is a new version,
  recorded with the commit that brought the content in (the plugin adds it
  in a second commit, pushed together).
- New content under a `version` the ledger already has (the latest's or an
  older one's) is not published: the last recorded version stays live, the
  plugin says "content changed, bump `version` to publish", and CI lists
  it in its step summary without failing.

Generated keys, written by the plugin from `blueprint.json` and
overwritten each time (do not edit them; `index.json` has the same numbers
under `blueprint.counts` and `blueprint.factorioVersion`):

```yaml
entities: 1234                # blueprints and books, even when 0
tiles: 560                    # omitted when 0
blueprints: 12                # books only, at every depth
factorio_version: "2.1.24"    # the game version that saved the blueprint
```

Optional keys are omitted when they have no value: the owner adds `video`,
`factoriobin` or `previous_paths` only when needed. The body below the frontmatter is free
notes and may be empty.

Unknown keys are preserved by every tool, and so are key order, comments
and the notes body: tools rewrite only the lines of the keys they change.
An optional key that is empty or `null` (`posted:`) means the same as the
key being absent.

### Generated block

The cover image and contents list at the top of a note are generated; write
below them. The plugin writes them at the top of the body, one blank line
after the frontmatter and one blank line before the owner's text, with no
marker lines:

```
![<title>](https://blueprints.abucnasty.dev/<folder path>/cover.jpg)

- [<label>](https://blueprints.abucnasty.dev/<folder path>/0.txt)
- <label of nested book> ([book](https://blueprints.abucnasty.dev/<folder path>/3.txt))
  - [<label>](https://blueprints.abucnasty.dev/<folder path>/3/1.txt)
```

- The image line is there only when the folder has a render image.
- The list is there only for books: one item per entry (slot path = the
  entry's `index`, else its position), nested like the book, in slot order,
  each linking to that entry's string. Labels are plain text with rich text
  turned into words and Markdown characters escaped; an entry without a
  label shows as `Blueprint (slot 3)`, `Book (slot 3)`, `Upgrade planner
  (slot 3)` or `Deconstruction planner (slot 3)`.
- A folder with neither has no block.
- The plugin finds its block by shape, only at the top of the body (blank
  lines skipped): an optional line that is exactly one image whose http(s)
  URL ends in `/cover.jpg`, then blank lines, then an optional run of list
  items (any indentation) each ending in a link to an http(s) URL ending in
  `.txt`, as `- [label](url)` or `- label ([book](url))`. It replaces that,
  whatever base URL or folder path it was written with, and never changes
  anything below it. Import, Render preview and "Refresh generated content
  in all notes" write it; `generatedBlockLines` and `applyGeneratedBlock` in the
  core are the implementation.

### Render state

After a render, `renders/render.json` (plain git, not LFS) records what each
image shows:

```json
{ "schema": 1, "rendered_at": "<ISO time>",
  "entries": { "<slot path, or 0 for a single blueprint>":
               { "file": "3/1.jpg", "sha256": "<hash>", "width": 0, "height": 0 } } }
```

`sha256` is the SHA-256 (lowercase hex) of the entry's blueprint object (the
value under its `blueprint` key) as compact JSON with keys sorted by code
point and array order kept (`blueprintHash` in the core). An image is
current when its entry's hash matches the blueprint now, outdated when it
differs or is not recorded; blueprints with no entities and no tiles get no
image and do not count. The render tool writes the file after every
successful run (merging on `--only`); the plugin only reads it. The catalog
copies an entry's `width` and `height` to that image's `renders[]` item in
`index.json`, and leaves them out when the file does not record the image.

## Blueprint string codec

- Decode: drop the first character (version byte, must be `0`), base64-decode,
  zlib-inflate, parse as UTF-8 JSON. Whitespace anywhere in the string is
  ignored, so a wrapped or padded paste still decodes.
- Encode: compact JSON (no whitespace), zlib-deflate at level 9, base64,
  prefix `0`.
- Decoding then encoding then decoding must give identical JSON. Byte-identical
  strings are not required; the game accepts re-encoded strings.

## `blueprint.json` canonical format

One pasted string is one file, whether it is a single blueprint, a book, or a
planner. The file holds exactly the decoded JSON value, nothing added or
removed, written as follows:

- UTF-8, LF line endings, one trailing newline.
- Object keys sorted by Unicode code point at every depth. Array order is
  never changed.
- Two-space indentation.
- **Compact rows:** every element of an array found under one of the keys
  `entities`, `tiles`, `wires`, `stock_connections`, `schedules` is written on
  a single line, as compact JSON with sorted keys and no spaces. This keeps
  one entity per line so diffs stay readable and files stay small.
- Everything else is expanded one value per line as usual. Empty arrays and
  objects are written `[]` and `{}`.
- Numbers are written as the shortest form that parses back to the same
  value (what `JSON.stringify` produces in JavaScript). Integers must not gain
  a decimal point. A number the game wrote in a longer form for the same
  double (`0.2509804069995880126953125`) is therefore written shorter
  (`0.250980406999588`); the value does not change. A string holding an
  integer too large for a double (above 2^53) is refused at import rather
  than stored rounded.
- Non-ASCII characters are written as-is, not escaped.

Reading a file in this format and writing it again must produce identical
bytes. There is exactly one implementation of the writer, in
`_tools/plugin/src/core/`; other tools import it rather than reimplementing it
(see `_tools/plugin/README.md`).

## Links

`https://blueprints.abucnasty.dev/` serves, for a blueprint folder `<path>`:

- `<path>.txt`: the latest blueprint string.
- `<path>@<sha>.txt`: the string of a recorded version, by the commit in
  its ledger entry (full SHA, or a unique prefix of at least 7).
- `<path>/<slot path>.txt` and `<path>/<slot path>@<sha>.txt`: one entry
  of a book (a blueprint, nested book or planner), alone.
- `<path>/renders/<file path>`: a render image.
- `<path>/cover.jpg`: the cover render.
- `index.json`: the catalog index (schema: `_tools/ci/catalog-index.ts`).

A book entry's **slot path** is the slot numbers from the root book down to
it, each the entry's `index` or, without one, its position in `blueprints`:
`3/1` is the entry in slot 1 of the book in slot 3. If entries share a
slot, the first in the array keeps it and later ones get no link or render.
Slots are positions, so reordering a book changes what a latest entry link
returns. A blueprint folder never contains another, so what follows its
path is a slot path.

Render files are `renders/<slot path>.jpg` for each blueprint in a book
(`renders/3/1.jpg`) and `renders/0.jpg` for a single blueprint; nested
books and planners get none. The cover is the first blueprint with an image,
depth first, slots ascending.

An expanded book not inside another (a root book) is addressed like a
`blueprint.json` book at its folder path, by slot path, never by folder
name; a leaf's `renders/0.jpg` is `<path>/renders/<slot path>.jpg`. Its
content is the assembled book, so expanding a book is no new version and
keeps its links.

A path in some blueprint's `previous_paths` redirects to its current path.
CI (`_tools/ci/catalog.ts`) builds the index from the pushed commit's files
and the ledgers, never from the git history, and writes the R2 bucket
`factorio-blueprints-catalog` on every push to `main`:
`strings/<path>/<commit>.txt` and `strings/<path>/<commit>/<slot path>.txt`
for the current version (`<commit>` is the version's), then `index.json`.
An older version's strings were uploaded while it was current and are
never made again, so a moved folder's older versions are not served under
its new path. Renders are read from `factorio-blueprints-lfs` at
`<oid[0:2]>/<oid[2:4]>/<oid>`.

## Branches and commits

- One branch per unit of work, named for what it does (`vault-skeleton`,
  `in-game-render`). No generated or random names.
- Tooling changes (anything under `_tools/`, `.github/`, `.obsidian/` or the
  LFS config) reach `main` only through a pull request the owner merges.
- Blueprint and notes edits made in the vault are committed and pushed to
  `main` directly by the vault's sync. `main` therefore has no branch
  protection that blocks direct pushes.
- Commit messages say what changed and why, in lowercase imperative.

## Secrets

No token, key or password is ever written to a file in this repo, a commit
message or a document. Cloudflare credentials live in GitHub Actions secrets
(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) and the LFS upload token in
the Worker's secret store and each machine's git credential store.
