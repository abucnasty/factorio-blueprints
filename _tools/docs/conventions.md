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
  docs/                    design docs, this file, setup guides
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
  renders/<n>.jpg          one image per blueprint in the string, 0-based
```

A directory is a **blueprint folder** if and only if it contains
`blueprint.json`. Any directory whose name starts with `_` or `.` is never
scanned for blueprints. Category nesting can be any depth.

Slugs are lowercase ASCII, words joined by `-`, no other punctuation
(`Military Science (240/s)` becomes `military-science-240`).

## Notes file frontmatter

`README.md` in a blueprint folder starts with YAML frontmatter:

```yaml
---
title: Military Science (240/s)     # required, display name
authors: [abucnasty]                # required, list, may be empty
version: "3"                        # optional, always a string
posted: 2026-03-10                  # optional, ISO date
video: https://youtu.be/...         # optional
factoriobin: https://factoriobin.com/post/...   # optional
deprecated: false                   # optional, default false
previous_paths: []                  # optional, old folder paths, for link redirects
---
```

Unknown keys are preserved by every tool.

## Blueprint string codec

- Decode: drop the first character (version byte, must be `0`), base64-decode,
  zlib-inflate, parse as UTF-8 JSON.
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
  a decimal point.
- Non-ASCII characters are written as-is, not escaped.

Reading a file in this format and writing it again must produce identical
bytes. There is exactly one implementation of the writer, in
`_tools/plugin/src/core/`; other tools import it rather than reimplementing it.

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
