# Render: in-game blueprint previews

Builds a blueprint (or every blueprint in a book) in the real game, takes a screenshot with alt-mode on and writes
one JPEG per blueprint: `<out>/0.jpg`, `<out>/1.jpg`, … A headless server runs the mod in `mod/`, and a game
client joins it to draw the screenshots. Both are started from a work folder of their own; your saves, config and mods
are never touched. Process control, RCON and screenshots are ported from
[abucnasty/clock-generator](https://github.com/abucnasty/clock-generator) (MIT).

## Requirements

- Factorio 2.1, the full game (not the headless build: it cannot take screenshots). Space Age is needed for space
  platform blueprints.
- **Linux:** the client runs without a window, using SDL's offscreen video driver and still the GPU, so nothing
  appears on your desktop or takes focus. If that client cannot start, a visible window is used instead, and the log
  says so. `--show-window` always shows the window. **Windows and macOS:** a game window opens during each run.
- Node.js 22 or later; `npm ci` in this folder.

## Usage

```bash
node bin/render.js --factorio <executable or install folder> --input <blueprint.json or .txt> --out <dir>
node bin/render.js --input <file> --list     # every entry with its slot path and image file; no game needed
node bin/render.js --help                    # every option, environment variable and the config file
```

`--enable-mods a,b` runs with just those mods (for example planet backgrounds) and the mods they require, taken
from `--mods <dir>` or else the game's own mods folder; that folder's `mod-list.json` is then ignored.

`npm test` runs the tests without the game; `npm run check:lua` parses the mod.

## Behaviour

- **File names.** Each blueprint's image is named by its slot path (the nested-links contract): in a book, slot 3's
  blueprint is `<out>/3.jpg` and slot 1 of the book in slot 3 is `<out>/3/1.jpg`; a single blueprint is `<out>/0.jpg`.
  A slot is the entry's `index`, or its array position when it has none. Planners and books get no image; an empty
  blueprint gets none either. If a malformed book repeats a slot number, the first entry wins and the rest are reported.
- **Stale images.** After a successful run, render images (slot-number paths ending in `.jpg`) in `<out>` that this
  run did not produce are deleted, with the slot folders they leave empty. Other files are left alone. Nothing is
  written to `<out>` if the run fails. `--only 3/1` (repeatable or comma-separated; a book's slot selects everything
  in it) renders just those entries and leaves the rest of `<out>` alone.
- **Manifest.** A successful run also writes `<out>/render.json`: per slot path the image file, size, a SHA-256 of
  the blueprint it shows (`blueprintHash` in `src/manifest.js`) and the render version that made it, so other tools
  can tell which images are current. An `--only` run leaves the other entries' records as they were.
- **Render version.** `render-version.json` holds one integer, `render_version`, and the rule for it: bump it in any
  change that alters what an existing blueprint's image looks like, and not for changes that cannot alter output. The
  Obsidian plugin treats an image made by a lower version as outdated; a record without `render_version` (images
  made before it existed) counts as 1. After a fix that changes output: bump the render version, then in Obsidian
  run **Render all that need it**.
- **Ordinary blueprints** are built on a fresh lab-tile surface, with all technologies researched and ore placed under
  mining drills. The floor is the backdrop: `--backdrop a,b` replaces `lab-dark-1` and `lab-dark-2` (default
  `lab-dark-1,black-refined-concrete`).
- **Space platform blueprints** are those with a hub, entities that can only be built in space, or foundation tiles.
  They are shown on a plain starfield.
  - A module without a hub is built over open space on a surface with a space platform's properties. The game
    allows there exactly what it allows on a platform; there is no planet, asteroid or starter platform.
  - A ship with a hub is built on a real, paused space platform, with its hub on the platform's hub. A hub cannot
    exist on any other surface.
- **Fallback.** If a blueprint cannot be built one way, the other surface is tried.
- **Report.** Every attempt is logged with what was built, failed or missing, and why. Each run writes `render.log`
  and `report.json` into its work folder (`--json` prints the report: per image its slot path, file, label, size and
  what failed or was missing; see `RenderReport` in `src/render.js`). The work folder is kept when something failed. `--diagnose` adds a
  matrix of placement experiments; it also runs by itself when the game builds nothing.
- **Work folder.** `--work-dir <dir>`, else a new `factorio-render-*` folder in `$XDG_CACHE_HOME/factorio-render/`
  (default `~/.cache/factorio-render/`) on Linux, where `/tmp` is often in memory, and in the temporary folder on
  Windows and macOS. It holds both game instances' files; mods are linked into it rather than copied where the system
  allows, and each screenshot is deleted once it is a JPEG. It is removed after a successful run unless `--keep-work`
  is given, and kept after a failure or when a blueprint got no image; delete kept folders when done with them (before
  this default, they were `/tmp/factorio-render-*`).
- **Exit status.** `0`: every blueprint has an image. `2`: some blueprint got none (see the report). `1`: the run
  failed.

## Known limits

- Tiles of a blueprint that lie where one of its own entities needs open space are left out, and the report says so.
  Examples are foundation behind a thruster or in front of an asteroid collector. With such tiles, the game refuses
  the whole blueprint.
- Entities the game forbids on a surface are reported as missing with the reason. On platforms these include chests,
  burner and pressure-bound machines, and rails.
- A ship whose hub is not at its blueprint's (0, 0) is shifted so that it is; nothing else is placed relative to the hub.
- Behind a ship with a hub, the planet its platform orbits can show. Asteroids are cleared before each screenshot,
  but faint ones may drift in.
- A car or spidertron the game does not build from the blueprint (one over other entities gets no ghost, or loses it)
  is created directly where the rest of the blueprint landed, with its items, and the report says so ("created N car
  directly"). One the surface refuses (a car on a platform) stays missing.
- The open end of a tileable stretch of elevated rail has no support within reach (in the game it rests on the next
  copy), so its ghost never revives; it is created directly where the game allows it, and the report says so
  ("created N elevated-straight-rail directly").
- Turrets without ammo still show their ammo icon.
- Large builds are captured as a grid of screenshots and stitched; a one-pixel seam is possible.
- Only Linux has been run for real; Windows and macOS share only the path handling.
