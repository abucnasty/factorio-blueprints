# Render: in-game blueprint previews

Turns a blueprint (or every blueprint in a book) into a JPEG made by the real game: the blueprint is built,
Factorio takes a screenshot with alt-mode on, and the PNG is converted to JPEG. One image per blueprint:
`<out>/0.jpg`, `<out>/1.jpg`, …

**Status: partly verified in the real game.** A first run on Linux with Factorio 2.1 (Space Age enabled) rendered
the two ordinary smoke-test blueprints; the space platform one built nothing, which led to the platform strategy
below (not yet run). See [what is verified and what is not](#verified-and-unverified) and the
[next test on your machine](#test-this-on-your-machine).

The process control, RCON client, screenshot call and JPEG settings are ported from the game harness of
[abucnasty/clock-generator](https://github.com/abucnasty/clock-generator) (MIT), which takes screenshots of small
fixtures with Factorio 2.1 this way.

## How it works

```
render (Node) ──copies──▶ work dir: server/ + client/ write-data, isolated mods/ (base, DLC mods, this mod)
   │ spawns
   ├─▶ factorio --start-server-load-scenario blueprint-vault-render/stage   (headless, RCON on 127.0.0.1)
   └─▶ factorio --mp-connect 127.0.0.1:<port>                               (the game window: it draws the images)
   │ RCON, once: research all technologies, enable all recipes
   │ RCON, per blueprint:
   │   send the string in parts ─▶ inspect (platform blueprint or not) ─▶ pick the strategy order
   │   per strategy until one builds something: build on a new lab-tile surface or a new paused space
   │     platform ─▶ report (built area, failures, problems, diagnostics)
   │   wait 120 ticks ─▶ clear asteroids ─▶ game.take_screenshot(...) per shot ─▶ wait for the PNG's IEND
   │   Sharp: PNG ─▶ JPEG (or stitch a grid of PNGs) ─▶ delete the surface or platform
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
| Backdrop tiles (for lab-dark-1, lab-dark-2) | `--backdrop a,b` | `FACTORIO_RENDER_BACKDROP` | `backdrop` (`"a,b"` or `["a","b"]`) | `lab-dark-1,black-refined-concrete` |
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

**Research.** Once per session, before anything is built, the building force (`player`) gets
`LuaForce::research_all_technologies()` and then `LuaForce::enable_all_recipes()` (for recipes no technology
unlocks). Without it, the game draws the recipe icon of a machine whose recipe is not yet unlocked with a red
crossed-out circle (seen in the first real run on a copper-cable assembler). Research is per force, so it also holds
on platforms; it also unlocks space platforms and qualities. The log prints how many technologies are researched and
how many recipes are still disabled.

**Strategies.** Each blueprint is first inspected in the game and then built by one or two strategies, in order,
until one produces something to photograph:

- *platform blueprint*: `platform`, then `ordinary`;
- any other blueprint: `ordinary`, then `platform` (if the game has space platforms; a blueprint the game refuses on
  a planet may still build there);
- without Space Age: `ordinary` only.

A blueprint is a **platform blueprint** when, judged from prototypes in the running game, it has (a) an entity of
type `space-platform-hub`, or (b) an entity whose surface conditions are met by the `space-platform` surface
prototype but by no planet (thrusters, asteroid collectors; modded ones too), or (c) a tile that can only be placed
over a tile with the `empty_space` collision layer (platform foundation: its item's `place_as_tile` condition is
inverted on that layer). The log prints which rule matched. Every attempt is logged and reported (`attempts` in
`--json`) with its counts, problems and diagnostics, and the image's `strategy` says which one made it. When
`build_blueprint` places no ghosts at all, the attempt says so explicitly, naming the surface kind and any underlay.
`defines.build_mode.superforced` is not tried: it only differs from `forced` in clearing obstructions, and a fresh
surface has none, so it could not explain or fix a refusal.

**Ordinary stage.** A new surface per blueprint (`game.create_surface`) with lab tiles
(`generate_with_lab_tiles`: no terrain, resources, decoratives or enemies), `always_day`, no clouds and
`ignore_surface_conditions = true`. The floor is then turned into the **backdrop**: every `lab-dark-1` becomes the
first backdrop tile and every `lab-dark-2` the second, read tile by tile from what the game generated, so the
checker pattern is exactly the game's own. The default is the owner's grid, `lab-dark-1` and
`black-refined-concrete` (a real tile in 2.1: base data makes a hidden `<colour>-refined-concrete` for each player
colour). Both names are checked against the running game; if either does not exist, the plain lab checkerboard is
used and the attempt reports a problem. `--backdrop lab-dark-1,lab-dark-2` gives the plain lab floor. Blueprint
tiles are placed on top.

**Platform stage.** A new space platform per blueprint: `LuaForce::create_space_platform` over Nauvis with the game's
starter pack (found by item type, not name), `apply_starter_pack` (silently where the game supports it), then
`paused = true` with no schedule, so it stays in orbit and does not move. The screenshot shows the real space
background (no backdrop is laid there). Asteroids and asteroid chunks are removed after building and again right
before every screenshot; nothing on the platform is powered, so collectors and turrets do nothing. Afterwards the
platform is scheduled for deletion with `LuaSpacePlatform::destroy`, which removes its surface.

- A blueprint **with a hub** is lined up with the platform's own hub, as pasting a ship onto a new platform does: a
  probe build far from the hub shows where the blueprint lands, the build position is shifted so the blueprint's hub
  falls on the platform's hub, and the result is checked. The platform's hub stands in for the blueprint's (it is not
  listed as missing) and is part of the picture.
- A blueprint **without a hub** (a module) is built 64 tiles clear of the hub and its starter foundation, so they
  are outside the frame. The starter hub is not removed: a platform whose hub dies is deleted, so removing it is not
  safe; the cost is only that the platform exists for a few seconds out of frame.

All of this happens per blueprint; any error inside one attempt is caught in the game and reported, and the next
strategy or blueprint carries on. Screenshots on both stages are taken at `daytime = 0` (noon) with `hide_clouds`
and `hide_fog` (the latter also hides space dust in front of a platform).

**Placement.** The blueprint is built in `forced` mode. Tiles that cannot go on lab tiles get the tile they need
laid under the whole area first: landfill gets the first tile of its item's `tile_condition` (water), platform
foundation gets `empty-space` (any tile with the layer its inverted condition asks for). Tile ghosts are revived
first, then entities, rolling stock last (after rails); modules and other item requests are inserted directly so
alt-mode shows them. Underlay the blueprint does not cover is turned back into the checkerboard
(`build_checkerboard`, one tile at a time) before the backdrop is laid. Mining drills get a resource they can mine
under them (iron ore or crude oil first; ordinary stage only). Nothing aborts the run: per attempt, the report lists
entities that could not be revived (`failed`), entities that never got a ghost (`missing`) and problems; the plain
log prints all of them too, with the counts (`failed: none; missing: 1× thruster`) and a `diagnostics` line
(surface kind, underlay, ghost count, backdrop, hub).

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
`~/.steam/steam/steamapps/common/Factorio`). Space Age must be enabled for the platform tests.

```bash
git fetch origin && git checkout in-game-render && git pull
cd _tools/render
npm ci
npm test                     # offline tests, under a minute; all should pass
npm run check:lua            # Lua syntax and globals check
rm -rf /tmp/render-test

# 1. The smoke-test book: two ordinary blueprints, a planner, and a platform module without a hub
node bin/render.js --factorio ~/factorio --input test/fixtures/smoke-book.json --out /tmp/render-test/smoke \
  --work-dir /tmp/render-test/smoke-work --json > /tmp/render-test/smoke-report.json

# 2. A tiny ship with its own hub, thruster, asteroid collector and chest
node bin/render.js --factorio ~/factorio --input test/fixtures/platform-ship.json --out /tmp/render-test/ship \
  --work-dir /tmp/render-test/ship-work --json > /tmp/render-test/ship-report.json
```

What should happen in each run: "Starting the Factorio server", "opening the game window", a window that loads
for 1–3 minutes and joins, then `Researched all technologies (N); recipes still disabled: 0` (a small number is
fine), then per blueprint a block like:

```
Blueprint 2 "smoke 3 (Space Age): …" (2 entities, 100 tiles)
  space platform blueprint: thruster can only be built on a space platform (surface conditions); …; trying platform, then ordinary
  [platform] built 2 entities, 100 tiles; failed: none; missing: none
  [platform] diagnostics: {"surface_kind":"space platform","ghosts":…}
  [platform] capturing … px at 48.0 px/tile
```

and the window closes by itself. Check:

- `smoke/0.jpg`: two assemblers with gear and copper-cable recipe icons, **neither crossed out** (the red
  crossed-out circle of the first run must be gone), inserters, a pole and a belt; no "no power" icons.
- `smoke/0.jpg` and `smoke/1.jpg`: the floor is **your grid**: alternating `lab-dark-1` and black refined concrete
  squares, one tile each, in the same pattern as the plain lab checkerboard of the first run (where the darker lab
  square was, black concrete now is). Blueprint tiles (the refined concrete pad in `1.jpg`) sit on top.
- `smoke/1.jpg`: as in the first run (drill on iron ore, burner inserter, chest, stone furnace, no "no fuel" icons).
- `smoke/2.jpg` (new): the 10×10 foundation with the thruster and a chest **on a space background**, with no hub
  or other foundation in the picture. The log says `[platform]`.
- `ship/0.jpg`: the ship on a space background: its foundation, the hub where the blueprint has it, the thruster at
  the bottom left, the asteroid collector at the bottom right edge, the chest top right. No asteroids. The log's
  diagnostics should say `"hub":"lined up with the platform's hub"`. The asteroid collector may be listed as missing
  or failed (its edge rule is the least certain part); say if so.
- Exit status 0 for both (`echo $?` right after each command), or 2 with a reason in the log.

Then, if those look right, the real ones (save each string into a text file first):

3. A medium blueprint, the Military Science (240/s) string from its factoriobin post, saved as `military.txt`:
   `node bin/render.js --factorio ~/factorio --input military.txt --out /tmp/render-test/military --work-dir /tmp/render-test/military-work`
4. A large book, `docs/blueprints/purple-science.txt` from factorio-benchmarks (133 KB):
   `node bin/render.js --factorio ~/factorio --input purple-science.txt --out /tmp/render-test/purple --work-dir /tmp/render-test/purple-work --json > /tmp/render-test/purple-report.json`
   (zoom-to-fit, and for builds wider than about 510 tiles the stitched grid: the log then says "in N screenshots").
5. One of your real space platform ships from the catalog.

**Send back** the terminal output (stderr) of every command, the `*-report.json` files, the images, and if a run
failed, from its work folder: `server-output.log`, `client-output.log`, `server/factorio-current.log`,
`client/factorio-current.log`. Clean up with `rm -rf /tmp/render-test`. Nothing else on the machine is written to.

## Verified and unverified

**Verified in the real game** (Linux, Factorio 2.1, Space Age enabled; first run of the smoke book):

- the server starting on the mod's scenario (no save needed), RCON, the client joining, process shutdown;
- blueprint strings sent in parts over RCON, `import_stack`, `build_blueprint` in forced mode, reviving ghosts,
  refined concrete tiles on a lab floor, iron ore placed under an electric mining drill;
- screenshots of a surface the player is not on, the 120-tick wait for small builds, framing at 48 px/tile, PNG to
  JPEG;
- the status-icon flags: no "no power" icons on assemblers and inserters, no "no fuel" icons on a burner inserter and
  a stone furnace.

**Not yet run**, most likely to break first:

1. **Space platforms**: `create_space_platform`, `apply_starter_pack`, `paused`, building foundation and entities
   from ghosts on empty space, the hub alignment (probe build far away, then shift), the 64-tile clearance for
   modules, asteroid clearing, `destroy` removing the surface, and whether the screenshot shows the space background.
   If the platform strategy fails, the ordinary fallback now lays `empty-space` under platform foundation, which
   is what the game's own Factoriopedia simulations do; the log shows both attempts.
2. **Research and recipes**: `research_all_technologies` plus `enable_all_recipes` removing the crossed-out recipe
   icon.
3. **The backdrop**: replacing lab tiles with `black-refined-concrete` (a hidden tile) and keeping the pattern.
4. **Underlays on ordinary surfaces** (water under landfill, empty space under foundation) and resetting the rest
   with `build_checkerboard` one tile at a time; asteroid collectors and other entities with tile rules.
5. **Timing for large builds**: a client that lags behind ignores `force_render` (documented); 120 ticks have only
   been tried on small builds.
6. **Grid stitching** and anti-aliasing above 2048 px are tested only on synthetic images.
7. Crude oil under pumpjacks; turrets still show an ammo icon (no flag exists for it).
8. Windows and macOS: only the path resolution is shared with the proven harness, which has been used on Linux.
9. Very long strings (hundreds of RCON parts) and very large builds (one RCON command may take up to 10 minutes).

## Development

`npm test` runs every test without the game: framing and tiling maths, codec round trip, book order, PNG
completeness, JPEG conversion and stitching, mod directory isolation, arguments, and the launcher against
`test/fake-factorio.js` (a stand-in executable that speaks RCON, writes PNGs into the client's `script-output` in
two steps, and can crash, hang or stall) including checks that no process survives, the strategy order and
fallback, the plain-log lines, research before building and the backdrop option. `npm run check:lua` parses the
mod as Lua 5.2 with luaparse and rejects unknown globals; it cannot check API calls, which were checked by hand
against https://lua-api.factorio.com/latest/ (2.1.24) and the clock-generator harness.
