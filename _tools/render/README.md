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
node bin/render.js --input <file> --list     # which blueprint gets which number; no game needed
node bin/render.js --help                    # every option, environment variable and the config file
```

`npm test` runs the tests without the game; `npm run check:lua` parses the mod.

## Behaviour

- **Numbering.** Blueprints are numbered from 0, depth first through nested books, each book in slot order.
  Planners and books take no number. An empty blueprint keeps its number but gets no image.
- **Stale images.** After a successful run, numbered images in `<out>` that this run did not produce are deleted.
  Other files are left alone. Nothing is written to `<out>` if the run fails.
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
  and `report.json` (`--json` prints the report) into its work folder. The work folder is kept when something
  failed. `--diagnose` adds a matrix of placement experiments; it also runs by itself when the game builds nothing.
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
- Turrets without ammo still show their ammo icon.
- Large builds are captured as a grid of screenshots and stitched; a one-pixel seam is possible.
- Only Linux has been run for real; Windows and macOS share only the path handling.
