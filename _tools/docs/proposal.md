# Proposal: `factorio-blueprints` vault

A public repo that holds every curated blueprint as version-controlled JSON with
notes, edited through Obsidian without touching git, with permanent live links
on `blueprints.abucnasty.dev`.

Status: design agreed, nothing built. Items marked **untested** have not been
run and need a short spike before they are relied on.

## Decisions

| Topic | Decision |
|---|---|
| Source of truth | The vault. factoriobin becomes an optional per-blueprint link |
| Migration scope | The curated catalog only (`docs/blueprints/README.md` entries and `purple-science.txt`). Competition and benchmark blueprints stay in `factorio-benchmarks` |
| Devices | Desktop only: Linux, Windows, Mac |
| String to JSON | A custom Obsidian plugin, at paste time |
| Stored in git | JSON only. Strings are generated on request |
| Blueprint books | One JSON file per pasted string |
| Versions | Commit SHA. "Latest" and "at SHA" links both return a pasteable string |
| Layout | One folder per blueprint; folder path is the category; metadata in the notes file's frontmatter |
| Community designs | Included, with an `authors` field. No licence requirement |
| Previews | Real in-game screenshots, taken by an explicit plugin command on a machine with Factorio. factoriobin link is the fallback |
| Render detail | One image per blueprint in a book, first is the cover. Placed entities, alt-mode on |
| Render machines | Linux first. Windows and Mac need only a configured path to the Factorio binary |
| Render storage | Git LFS backed by a new R2 bucket |
| Commit messages | Import prompts for an optional one-line change note |
| Link host | `blueprints.abucnasty.dev`, served by a Cloudflare Worker |
| factorio-draftsman | CI only, for validation and catalog metadata |
| Phasing | 1: vault and links. 2: website integration. 3 (optional): website moves to `abucnasty.dev` |

## How it fits together

```
 Factorio ──copy string──▶ Obsidian vault (= git clone of factorio-blueprints)
                             │  plugin: import / copy / render
                             │  obsidian-git: pull + push on a timer
                             ▼
                    GitHub: abucnasty/factorio-blueprints
                      │ JSON + notes in git        │ renders via Git LFS
                      ▼                            ▼
              GitHub Action on push          R2 bucket (new)
              validate, build index.json ──▶ R2
                      │
                      ▼
        Cloudflare Worker  blueprints.abucnasty.dev
          /index.json            catalog
          /<path>.txt            latest string
          /<path>@<sha>.txt      string at a commit
          /<path>/renders/N.jpg  preview image
                      │
                      ▼
        abucnasty.github.io (phase 2) fetches index.json at runtime
```

## Repo layout

The repo root is the Obsidian vault.

```
factorio-blueprints/
  .obsidian/                      vault settings, obsidian-git, our plugin (built JS)
  .github/workflows/publish.yml
  .lfsconfig  .gitattributes      LFS endpoint; **/renders/* tracked by LFS
  _tools/
    docs/                         this proposal
    plugin/                       plugin source (TypeScript)
    render/                       Factorio mod + launcher
    worker/                       Cloudflare Worker
    ci/                           validate + index builder (Python)
  megabasing/
    uncommon-science/
      military-science-240/
        README.md                 notes + frontmatter
        blueprint.json
        renders/0.jpg, 1.jpg …    LFS
```

Frontmatter, editable in Obsidian's Properties panel:

```yaml
title: Military Science (240/s)
authors: [abucnasty]
version: "3"
posted: 2026-03-10
video: https://youtu.be/vD_zzN8VT68
factoriobin: https://factoriobin.com/post/90pg6z
deprecated: false
```

`blueprint.json` is written with sorted keys and one entity per line. Fully
indented JSON was measured at 3.9 MB for the 133 KB purple-science book, too
large for GitHub to render diffs.

## Components

### Off the shelf

| Piece | Role |
|---|---|
| Obsidian | The vault UI |
| obsidian-git plugin | Scheduled pull, commit and push; uses system git, so LFS works. Its README calls mobile "very unstable", which is why this is desktop only |
| Git LFS + the existing `infrastructure/lfs-worker` code | Render storage. Same Worker code, deployed a second time against the new bucket |
| GitHub Actions | Validation and index build |
| factorio-draftsman 4.x | Validation and metadata (labels, entity counts) in CI |
| Cloudflare Workers, R2, Registrar | Link serving, storage, domain |

### Custom

| Piece | Size | What it does |
|---|---|---|
| Obsidian plugin | Small | Three commands, below |
| Render mod + launcher | Small, highest risk | Drives the real game to take screenshots |
| Link Worker | Small | Resolves a path (and optional SHA) to JSON on GitHub, encodes it, caches it |
| CI script | Small | Validates every `blueprint.json`, writes `index.json` to R2 |
| Migration script | One-off | Imports the current catalog from factoriobin |

## Plugin commands

1. **Import blueprint from clipboard.** Decodes the string and writes
   `blueprint.json` into the current folder, creating the folder and notes file
   from a template if new. Prompts for an optional change note, then commits and
   pushes with it (blank becomes `update <name>`).
2. **Copy blueprint string.** Encodes the folder's JSON to the clipboard.
3. **Render preview.** Launches Factorio, writes `renders/N.jpg`, commits.

The codec is version byte `0` + base64 + zlib (confirmed against the Factorio
wiki). A decode, encode, decode round trip of `purple-science.txt` returned
identical JSON.

## Render command

Same method factoriobin uses: the game draws the image.

1. The launcher writes the blueprint strings into a generated mod in a
   dedicated mod directory and starts the normal (non-headless) client on a
   render scenario.
2. The mod places each blueprint on an empty surface, revives the ghosts, frames
   the bounding box and calls `game.take_screenshot` with alt-mode on.
3. The mod writes a marker file; the launcher sees it, kills the game and moves
   the images into `renders/`.

**Untested**, to resolve in a spike before anything else is built on it:

- Writing `.jpg` directly. If the game only writes PNG, the launcher converts.
- Framing very large builds. Older API docs recommend at most 4096×4096 per
  screenshot; start with zoom-to-fit, add tiling only if results are unreadable.
- Suppressing "no power" and "no fuel" warning icons on the placed entities.
- Hiding the window on Linux with a virtual display.
- Blueprints that need mods render with whatever mods the install has.

A window opens for the length of a game start on each render, which is why it
is an explicit command and not part of every paste.

## Links

| Link | URL |
|---|---|
| Latest | `blueprints.abucnasty.dev/megabasing/uncommon-science/military-science-240.txt` |
| At a commit | `blueprints.abucnasty.dev/…/military-science-240@3f9c2ab.txt` |
| Catalog | `blueprints.abucnasty.dev/index.json` |

- CI writes `index.json` on every push. It holds each blueprint's frontmatter,
  label, entity counts, render list, current SHA and history (SHA, date, change
  note).
- For a string request the Worker looks up the SHA, fetches that commit's JSON
  from `raw.githubusercontent.com` (immutable per SHA), encodes it and caches the
  result. Freshness is the length of the CI run, not a CDN cache window.
- Responses allow any origin, so the website and third-party tools can fetch
  them.

**Untested:** encoding inside a Worker with the built-in compression stream.

## Phases

### Phase 1: vault and links

1. Prerequisites (yours): buy `abucnasty.dev` through Cloudflare; create R2
   bucket `factorio-blueprints-lfs`. The repo itself already exists.
2. Render spike: prove the mod and launcher on Linux with two or three real
   blueprints, including one large book.
3. Repo skeleton: vault settings, obsidian-git config, LFS config, second
   deployment of the LFS Worker against the new bucket.
4. Plugin: import, copy, render.
5. CI and link Worker on `blueprints.abucnasty.dev`.
6. Migration: for each catalog row, read the factoriobin post's `/info.json`,
   download the string, write the folder and frontmatter, and save
   factoriobin's existing render as the initial preview. Verified on one post
   (Military Science 240/s V3).
7. Set up the vault on the other two machines: Obsidian, git, git-lfs, clone.

### Phase 2: website integration

1. `abucnasty.github.io` blueprint page fetches `index.json` at runtime instead
   of parsing the README at build time; adds copy-string and version history.
2. Remove the build-time factoriobin preview scraping and `blueprintsSource`
   from the site's manifest and deploy workflow.
3. **Last step:** delete `docs/blueprints/README.md` and `purple-science.txt`
   from `factorio-benchmarks` and link to the new repo from the root README.

### Phase 3 (optional): website on `abucnasty.dev`

Host the site on Cloudflare under `abucnasty.dev`, with `abucnasty.github.io`
redirecting. Blueprint links do not change.

## Cost

| Item | Cost |
|---|---|
| `abucnasty.dev` | About $12.20/year (first year currently $8.20); availability not checked |
| Workers and R2 | Expected to fit the free tiers at this scale; limits not checked |
| Everything else | Free |

## Secrets and installs

- GitHub Actions secret: a Cloudflare API token that can write the R2 bucket.
- Each vault machine: Obsidian, git, git-lfs, and the LFS upload token in git's
  credential store. The render machine also needs Factorio.
- A separate upload token from the benchmarks bucket, so vault machines cannot
  write benchmark data.
