# Render: in-game blueprint previews

Turns a blueprint (or every blueprint in a book) into a JPEG made by the real game: the blueprint is built,
Factorio takes a screenshot with alt-mode on, and the PNG is converted to JPEG. One image per blueprint:
`<out>/0.jpg`, `<out>/1.jpg`, …

**Status: not yet run against the real game.** Everything here was written and tested without Factorio (see
[What has not been run](#what-has-not-been-run-against-the-game)). The first real run is the
[test on your machine](#test-this-on-your-machine) below.

The process control, RCON client, screenshot call and JPEG settings are ported from the game harness of
[abucnasty/clock-generator](https://github.com/abucnasty/clock-generator) (MIT), which takes screenshots of small
fixtures with Factorio 2.1 this way.

## How it works

```
render (Node) ──copies──▶ work dir: server/ + client/ write-data, isolated mods/ (base, DLC mods, this mod)
   │ spawns
   ├─▶ factorio --start-server-load-scenario blueprint-vault-render/stage   (headless, RCON on 127.0.0.1)
   └─▶ factorio --mp-connect 127.0.0.1:<port>                               (the game window: it draws the images)
   │ RCON, per blueprint:
   │   send the string in parts ─▶ mod builds it on a new lab-tile surface ─▶ report (built area, failures)
   │   wait 120 ticks ─▶ game.take_screenshot(...) per shot ─▶ wait for the PNG's IEND
   │   Sharp: PNG ─▶ JPEG (or stitch a grid of PNGs) ─▶ delete the surface
   └─ kill both processes, then write <out>/<n>.jpg
```

- `bin/render.js`: the command. `src/`: `cli.js` (options), `blueprints.js` (input, book order), `codec.js`,
  `framing.js` (zoom and tiling), `factorio.js` (processes, RCON, screenshots), `image.js` (PNG/JPEG),
  `render.js` (one run).
- `mod/`: the Factorio mod `blueprint-vault-render` (`factorio_version` 2.1). `control.lua` is the remote
  interface, `scripts/build.lua` builds a blueprint, `data-final-fixes.lua` hides status icons,
  `scenarios/stage` is an empty scenario for the server to start on.

## Requirements

- Factorio 2.1 with graphics (the full game, not the headless build: `game.take_screenshot` does nothing headless)
  and a desktop session. A window opens during each run.
- Node.js 22 or later, npm.
- `npm ci` in this folder (installs Sharp; luaparse for the Lua check).

## Usage

```bash
cd _tools/render
npm ci
node bin/render.js --factorio <path> --input <blueprint.json or .txt> --out <dir>
node bin/render.js --input <file> --list        # which blueprint gets which number; no game needed
node bin/render.js --help
```

`--factorio` takes the executable or the install folder (`bin/x64/factorio`, `bin/x64/factorio.exe` and macOS
`factorio.app/Contents/MacOS/factorio` are found inside it). Windows and macOS need nothing else but that path.

Defaults come from, in order: arguments, environment, config file. So the Obsidian plugin can call it with just
`--input` and `--out`.

| Setting | Argument | Environment | Config key | Default |
|---|---|---|---|---|
| Factorio | `--factorio` | `FACTORIO_PATH` | `factorio` | required |
| Longest side of one screenshot | `--max-size` | `FACTORIO_RENDER_MAX_SIZE` | `maxSize` | 4096 |
| Grid below this many px/tile | `--min-pixels-per-tile` | | `minPixelsPerTile` | 8 |
| Longest side of a stitched image | `--max-output-size` | | `maxOutputSize` | 8192 |
| Extra mods folder | `--mods` | `FACTORIO_RENDER_MODS` | `mods` | none |
| Keep status icons | `--show-status-icons` | | `showStatusIcons` | false |
| Start-up timeout (s) | `--timeout` | | `timeout` | 300 |

The config file is JSON at `~/.config/factorio-blueprints/render.json` (Linux, or under `$XDG_CONFIG_HOME`),
`%APPDATA%\factorio-blueprints\render.json` (Windows), `~/Library/Application Support/factorio-blueprints/render.json`
(macOS), or wherever `--config` / `FACTORIO_RENDER_CONFIG` points. Example:
`{ "factorio": "/home/me/factorio" }`.

Other options: `--save <file>` (start from a copy of a save instead of the scenario), `--work-dir <empty dir>`,
`--keep-work`, `--json` (the run's report on stdout; progress always goes to stderr).

Exit status: `0` every blueprint has an image; `2` at least one blueprint got none (empty, or nothing of it could
be built; the report says why); `1` the run failed and `<out>` was not touched.

## Behaviour and decisions

**Input.** A `blueprint.json` (decoded JSON in the repo's format) or a text file holding a blueprint string
(line breaks are ignored). Each blueprint is re-encoded on its own (`{"blueprint": …}`, compact JSON, zlib level 9,
base64, `0` prefix) and imported by the game with `LuaItemStack::import_stack`.

**Numbering.** Blueprints are numbered from 0, depth first through nested books, each book's slots in ascending
`index` order (the order the game shows them in; slots without an `index` keep their listed order). Only
blueprints take a number: upgrade and deconstruction planners and the books themselves do not. An empty blueprint
keeps its number but gets no image. `--list` prints the mapping. After a successful run, numbered images in `<out>`
that were not produced this time (`<n>.jpg` past the end of a shorter book, or a blueprint that rendered nothing) are
removed; other files are left alone. Images are only written after the whole run succeeded.

**Stage.** Each blueprint is built on a new surface of its own (`game.create_surface`) with lab tiles
(`generate_with_lab_tiles`, so no terrain, resources, decoratives or enemies), `always_day`, no clouds, and
`ignore_surface_conditions = true`, so platform-only entities such as thrusters can be placed. The screenshot is
taken at `daytime = 0` (noon) with `hide_clouds` and `hide_fog`. The surface is deleted after its screenshot.

**Placement.** The blueprint is built in `forced` mode and every ghost is revived (rolling stock after rails);
modules and other item requests are inserted directly so alt-mode shows them. Blueprint tiles (concrete, landfill,
space platform foundation) are placed with `LuaSurface::set_tiles`: the most common tile of the blueprint is first
laid under the whole area so entities that need it get ghosts, the ghosts show where the blueprint landed, the floor
is reset to lab tiles, the real tiles are placed there and the blueprint is built again. Mining drills get a
resource they can mine under them (iron ore or crude oil first). Nothing aborts the run: per blueprint, the report
lists entities that could not be revived (`failed`), entities that never got a ghost (`missing`: an offshore pump
without water, an entity of a mod that is not loaded, an asteroid collector off a platform edge) and other problems.

**Framing.** The frame is the built entities' bounding boxes (and placed tiles) plus 2 tiles of margin.
1. Zoom to fit: the largest pixels-per-tile up to 48 (as in the proven harness) at which the frame fits one
   screenshot of `--max-size` (default 4096, the API's recommended maximum; hard limit 16384).
2. If that would be below `--min-pixels-per-tile` (default 8, where entities stop being readable), the frame is
   captured at 8 px/tile as a grid of screenshots of at most `--max-size` each and stitched with Sharp. The
   stitched image is capped at `--max-output-size` (default 8192) on its long side, lowering px/tile again past
   that; never below 1 px/tile (the game's minimum zoom).
3. Anti-aliasing is used only for screenshots of at most 2048 px per side (the API recommends at most 2048 with
   `anti_alias`, which renders at double size).

So a build up to about 80 tiles across gets 48 px/tile; up to about 510 tiles one screenshot at 8 px/tile or more;
beyond that a grid. Shots are aligned to the pixel grid and have even sizes so they should meet without seams; how
the game rounds a camera position is not documented, so a one-pixel seam is possible.

**Status icons.** The "no power", "no fuel" and "no network" icons are switched off in the data stage with the
documented prototype flags `render_no_power_icon` and `render_no_network_icon` (on every `energy_source`;
`render_no_power_icon` also covers the no-fuel icon of burners), `render_not_in_network_icon` (logistic and
infinity containers, rocket silos) and `render_recharge_icon` (roboports). Alt-mode info (recipe, module and fluid
icons) is separate and stays on. This only affects the tool's own mod directory. `--show-status-icons` keeps them.
Not covered: turrets without ammo still show their ammo icon (no flag exists for it). No "no recipe" icon exists in
2.1 as far as the docs show.

**No hand-made save.** The server starts with `--start-server-load-scenario blueprint-vault-render/stage`, an
empty scenario shipped in the mod; the map it generates is only where the client's character stands. `--save` is a
fallback if that ever fails: the server then starts from a copy of the given save (the proven harness's way).

**Mods.** Each run gets its own mod directory: the mods in the game's data folder (base and, if installed,
space-age, quality, elevated-rails, recycler), all enabled, plus this mod. The player's own saves, config, mods and
mod settings are never read or written; the game is started with `--config` and `--mod-directory` pointing into the
work folder. For modded blueprints, pass `--mods <folder>`: zip files (`name_1.2.3.zip`) and unpacked mod folders in
it are copied in and enabled. If that folder has a `mod-list.json` (e.g. you point at your real `mods` folder) only
the mods enabled there are used, the game's own mods follow it too (e.g. Space Age off), and its `mod-settings.dat`
is copied. The folder itself is only read.

**Never leaves the game running.** Both processes are killed when the run ends, fails, times out (start-up:
`--timeout`; each RCON command: 10 minutes; each screenshot: 2 minutes) or on Ctrl+C / SIGTERM. If the launcher
itself is killed with SIGKILL, it cannot clean up.

**Not ported** from the clock-generator harness: tick recording, warm-up runs, the sidecar mod, the recording cache
and the hash-based skipping of up-to-date images (the render is an explicit command; the caller decides when).

## Test this on your machine

From a clone, on Linux with Factorio 2.1 installed. Replace `~/factorio` with your install folder (Steam:
`~/.steam/steam/steamapps/common/Factorio`).

```bash
cd _tools/render
npm ci
npm test                     # offline tests, under a minute; all should pass
npm run check:lua            # Lua syntax check

# 1. The smoke-test book shipped with the tests: three small blueprints and a planner
node bin/render.js --factorio ~/factorio --input test/fixtures/smoke-book.json --out /tmp/render-test/smoke \
  --work-dir /tmp/render-test/smoke-work
```

What should happen: the terminal prints "Starting the Factorio server", then "opening the game window"; a Factorio
window opens, loads (expect 1–3 minutes: the game window starts from an empty write-data folder each run, so it
builds its caches again) and joins a game; you may briefly see a character on lab tiles or grass. The terminal then
prints one "Building blueprint …" and "capturing …" block per blueprint, a few seconds each, and the window closes by
itself. The result:

- `/tmp/render-test/smoke/0.jpg`: two assemblers with gear and cable recipe icons, inserters, a pole and a belt on
  lab tiles, no flashing "no power" icons.
- `1.jpg`: a refined concrete pad with a mining drill on iron ore, a burner inserter, a chest and a stone furnace,
  no "no fuel" icons.
- `2.jpg` (needs Space Age): a 10×10 space platform foundation with a thruster and a chest.
- No image for the upgrade planner (it is listed as skipped). Exit status 0 (`echo $?`).

Then two real ones (save each string into a text file first):

2. A medium blueprint: the Military Science (240/s) string from its factoriobin post, saved as `military.txt`:
   `node bin/render.js --factorio ~/factorio --input military.txt --out /tmp/render-test/military --work-dir /tmp/render-test/military-work`
3. A large book: `docs/blueprints/purple-science.txt` from factorio-benchmarks (133 KB):
   `node bin/render.js --factorio ~/factorio --input purple-science.txt --out /tmp/render-test/purple --work-dir /tmp/render-test/purple-work --json > /tmp/render-test/purple-report.json`
   This one should exercise zoom-to-fit and, for builds wider than about 510 tiles, the stitched grid
   (the terminal then says "in N screenshots").

Check in each image: recipe icons visible, modules shown in machines, no status icons, nothing cut off at the
edges, no visible seams in stitched images, nothing missing compared with the game (the terminal lists what could
not be placed).

**If it fails**, send back:
- the terminal output (stderr) of the command, and the `--json` report if you used it;
- from the work folder (`--work-dir`; without it, the temporary folder named in the output, kept after a failure):
  `server-output.log`, `client-output.log`, `server/factorio-current.log`, `client/factorio-current.log`;
- any image that looks wrong.

Clean up with `rm -rf /tmp/render-test`. Nothing else on the machine is written to.

## What has not been run against the game

In rough order of how likely it is to break:

1. **The scenario start** (`--start-server-load-scenario blueprint-vault-render/stage` with a scenario folder that
   holds only `control.lua` and `description.json`). Documented flag, but the proven harness used a save. If the
   server log complains about the scenario, retry with `--save <any save of yours>` (a copy is used).
2. **Tiles and foundations**: laying the most common tile first, `build_checkerboard` to reset, and
   `set_tiles` with space platform foundation on a non-platform surface. Entities with tile rules (asteroid
   collectors) may still be missing.
3. **Screenshots of a surface the player is not on.** `take_screenshot` takes a `surface`, but the proven harness
   only photographed the surface its player was on. If images come out black or empty, this is why (and charting:
   the mod calls `LuaForce::chart` for the area).
4. **Timing**: 120 ticks between the build and the screenshot for the client to catch up. A client that lags
   behind ignores `force_render` (documented), which could give a missing or stale image.
5. **Status icon flags**: whether `render_no_power_icon = false` hides every icon that clutters a picture (e.g.
   locomotives, roboports, turrets).
6. **Grid stitching** and anti-aliasing above 2048 px are tested only on synthetic images.
7. **Ore under drills** (resource chosen by `resource_categories`), and crude oil under pumpjacks.
8. Windows and macOS: only the path resolution is shared with the proven harness, which has been used on Linux.
9. Blueprint strings sent in 4000-character parts over RCON: proven for short strings only.

## Development

`npm test` runs every test without the game: framing and tiling maths, codec round trip, book order, PNG
completeness, JPEG conversion and stitching, mod directory isolation, arguments, and the launcher against
`test/fake-factorio.js` (a stand-in executable that speaks RCON, writes PNGs into the client's `script-output` in
two steps, and can crash, hang or stall) including checks that no process survives. `npm run check:lua` parses the
mod as Lua 5.2 with luaparse and rejects unknown globals; it cannot check API calls, which were checked by hand
against https://lua-api.factorio.com/latest/ (2.1.24) and the clock-generator harness.
