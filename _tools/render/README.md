# Render: in-game blueprint previews

Turns a blueprint (or every blueprint in a book) into a JPEG made by the real game: the blueprint is built,
Factorio takes a screenshot with alt-mode on, and the PNG is converted to JPEG. One image per blueprint:
`<out>/0.jpg`, `<out>/1.jpg`, …

**Status: ordinary blueprints verified in the real game; space platform blueprints not yet.** Two runs on Linux with
Factorio 2.1 (Space Age enabled) rendered the ordinary smoke-test blueprints correctly (research, backdrop, icons).
Platform blueprints built nothing in both runs; the third version below lays their tiles for real and comes with a
diagnosis matrix that shows the game's own verdict if it still fails. See [what is verified and what is not](#verified-and-unverified) and the
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

Other options: `--save <file>` (start from a copy of a save instead of the scenario), `--work-dir <empty dir>`, `--diagnose` (run the placement experiment matrix for every blueprint),
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
`build_blueprint` places no ghosts at all, the attempt says so explicitly, naming the surface kind and how many of
its tiles were laid. `superforced` is not used for rendering (it only differs from `forced` in clearing
obstructions, and a fresh surface has none); the diagnosis matrix tries it, and `normal`, as experiments.

**Diagnosis matrix.** Whenever an attempt gets zero ghosts for a blueprint with entities, and for every blueprint
with `--diagnose`, the mod runs a fixed set of experiments on scratch surfaces (a lab surface and a paused scratch
platform, removed afterwards) and logs one line each: `[diagnose] <what> | <where>: N entity ghosts, M tile ghosts`.
Every experiment is wrapped, so an error in one is printed and the rest still run.

- *What*: the full blueprint; tiles only; entities only; the full blueprint without its hub (if it has one).
- *Where*: plain lab tiles; lab with `empty-space` laid under the spot; lab with the blueprint's foundation tile laid
  for real under the spot; a platform far from its hub; a platform far from its hub with real foundation; a platform
  at its hub; a platform at its hub with real foundation.
- Build modes `normal` and `superforced` for the full blueprint on a platform with real foundation.
- Each entity kind alone (no tiles, up to 30 kinds) on real foundation, on the lab and on the platform.
- For each entity kind, the game's own verdict from `LuaSurface::can_place_entity` on real foundation, on the lab and
  on the platform: as a blueprint ghost (`entity-ghost` with `build_check_type.blueprint_ghost`, `forced`) and as an
  entity (`build_check_type.script`).

How to read it: tile ghosts only "with empty space under" means foundation ghosts need empty space; entity ghosts only
"with real foundation" means entity ghosts need real tiles; zero everywhere for "full" but not for "entities only" or
single kinds points at the tiles or one entity kind refusing the whole blueprint; a difference between "far" and "at
hub" means placement must touch the existing platform; `can_place_entity` saying yes while the build gives zero ghosts
means `build_blueprint` itself refuses, not the placement rules.

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

**How a platform blueprint is placed** (also used on the ordinary stage for blueprints with tiles that need
something special under them, such as foundation or landfill): its tiles are laid for real with `set_tiles` at a
chosen offset, so nothing depends on tile-ghost rules. The blueprint is then built (`forced`) at a first guess, the
offset at which its entity ghosts actually landed is read from the ghosts, and if it differs the ghosts are removed
and the build is repeated, moved by the difference (at most 4 builds). The game's ghosts decide where things land;
no placement rule of `build_blueprint` is assumed, and no far-away probe build is needed.

- A blueprint **with a hub**: the offset puts the blueprint's hub on the platform's hub, as pasting a ship onto a new
  platform does. The platform's hub stands in for the blueprint's (not listed as missing) and is in the picture;
  diagnostics say whether the hub lined up.
- A blueprint **without a hub** (a module): the offset puts it 64 tiles clear of the hub and its starter foundation.
  If the game then refuses every entity, a 1-tile strip of real foundation is laid from the blueprint to the starter
  foundation, the build is retried, and the strip is removed again before the screenshot (diagnostics show
  `joined_to_starter`). The starter hub is never removed: a platform whose hub dies is deleted.

All of this happens per blueprint; any error inside one attempt is caught in the game and reported, and the next
strategy or blueprint carries on. Screenshots on both stages are taken at `daytime = 0` (noon) with `hide_clouds`
and `hide_fog` (the latter also hides space dust in front of a platform).

**Placement.** The blueprint is built in `forced` mode. Ordinary blueprints (no tiles, or tiles such as concrete
that go on lab tiles) are built as ghosts on the lab floor and revived; this path is verified. Blueprints with tiles
that need something special under them (from their item's `place_as_tile` rule: landfill needs water, foundation
needs empty space) are placed as described above, with their tiles laid for real. Tile ghosts are revived first,
then entities, rolling stock last (after rails); modules and other item requests are inserted directly so alt-mode
shows them. Mining drills get a resource they can mine
under them (iron ore or crude oil first; ordinary stage only). Nothing aborts the run: per attempt, the report lists
entities that could not be revived (`failed`), entities that never got a ghost (`missing`) and problems; the plain
log prints all of them too, with the counts (`failed: none; missing: 1× thruster`) and a `diagnostics` line
(surface kind, method, tiles laid, builds, ghost count, backdrop, hub).

**Run log and report.** Every run writes its full log (`render.log`, the same lines as the terminal) and its report
(`report.json`, the same as `--json`) into the work directory. The work directory is kept whenever a blueprint got
no image or the run failed (and with `--work-dir` or `--keep-work`), and the last lines of the output name both
files, so a problem never needs a second run just to capture output.

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

From a clone, on Linux with Factorio 2.1 and Space Age. Replace `~/factorio` with your install folder (Steam:
`~/.steam/steam/steamapps/common/Factorio`).

```bash
git fetch origin && git checkout in-game-render && git pull
cd _tools/render
npm ci
npm test                     # offline tests, under a minute; all should pass
npm run check:lua            # Lua syntax and globals check
rm -rf /tmp/render-test

# 1. The smoke-test book: two ordinary blueprints (already right), a planner, a platform module without a hub
node bin/render.js --factorio ~/factorio --input test/fixtures/smoke-book.json \
  --out /tmp/render-test/smoke --work-dir /tmp/render-test/smoke-work --diagnose

# 2. A tiny ship with its own hub, thruster, asteroid collector and chest
node bin/render.js --factorio ~/factorio --input test/fixtures/platform-ship.json \
  --out /tmp/render-test/ship --work-dir /tmp/render-test/ship-work --diagnose

# 3. Your real ship: 1920SPS (Heisenberg MK3A), 2550 entities, 6991 foundation tiles
node bin/render.js --factorio ~/factorio --input test/fixtures/heisenberg-ship.txt \
  --out /tmp/render-test/heisenberg --work-dir /tmp/render-test/heisenberg-work --diagnose
```

`test/fixtures/heisenberg-ship.txt` is your public blueprint string from factoriobin post `akka5t`, unchanged.
`--diagnose` adds the experiment matrix for every blueprint; it takes a little longer (for the Heisenberg ship
perhaps a minute or two). Each run ends with `Run log: …/render.log` and `Report: …/report.json`.

What to look for:

- `smoke/0.jpg`, `smoke/1.jpg`: as last time (your grid, no crossed-out recipe icons, no status icons).
- `smoke/2.jpg`: the 10×10 foundation with thruster and chest on a space background, no hub in the picture; the log
  says `[platform] built 2 entities, 100 tiles` and `"method":"real tiles, then entities landed on them"`. If
  `joined_to_starter` appears in its diagnostics, the game wanted the module connected to the platform.
- `ship/0.jpg` and `heisenberg/0.jpg`: the ship on a space background with the hub where the blueprint has it;
  diagnostics `"hub":"lined up with the platform's hub"`; the `failed`/`missing` counts in the log should be
  small (asteroid collectors are the most likely to be listed).
- Exit status 0 (`echo $?`), or 2 with the reasons in the log.

**Send back**, for each of the three runs: `render.log` and `report.json` from its work folder
(`/tmp/render-test/*-work/`), and the images. Only if a run failed outright, also `server-output.log`,
`client-output.log`, `server/factorio-current.log` and `client/factorio-current.log` from the same folder.
Clean up with `rm -rf /tmp/render-test`. Nothing else on the machine is written to.

Later, once platforms work: a medium blueprint (the Military Science (240/s) string saved as `military.txt`) and the
large purple-science book from factorio-benchmarks, as `--input` with their own `--out` and `--work-dir`.

## Verified and unverified

**Verified in the real game** (Linux, Factorio 2.1, Space Age enabled; two runs of the smoke book):

- the server starting on the mod's scenario (no save needed), RCON, the client joining, process shutdown;
- blueprint strings sent in parts over RCON, `import_stack`, `build_blueprint` in forced mode, reviving ghosts,
  refined concrete tiles on a lab floor, iron ore placed under an electric mining drill;
- screenshots of a surface the player is not on, the 120-tick wait for small builds, framing at 48 px/tile, PNG to
  JPEG;
- the status-icon flags (no "no power" or "no fuel" icons);
- `research_all_technologies` plus `enable_all_recipes`: 254 technologies, 0 recipes disabled, no crossed-out recipe
  icons;
- the backdrop: `lab-dark-1` and `black-refined-concrete` in the game's own checker pattern;
- inspection: the platform rule matched the ship for all four reasons; creating a space platform worked (the server
  log names its surface); the plain log carries every count, problem and diagnostic.
- What failed: `build_blueprint` placed no ghosts at all, not even tile ghosts, for platform blueprints: on a lab
  surface with real foundation laid under it (run 1), on a real platform far from the hub, and on a lab surface with
  `empty-space` under it (run 2).

**Not yet run**, most likely to break first:

1. **Platform blueprints with real tiles**: whether `build_blueprint` accepts entity ghosts on foundation laid with
   `set_tiles` (on a platform, at the hub, and on a lab surface); the landing loop; hub alignment; joining a module
   to the starter foundation. The diagnosis matrix runs automatically if it fails and should say why.
2. **The diagnosis matrix itself** on a large ship (time taken; `set_blueprint_entities` on subsets).
3. Asteroid clearing, `paused`, `destroy` removing the surface, and whether the screenshot shows the space background.
4. Landfill blueprints on the ordinary stage (now real landfill tiles plus the landing loop).
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
fallback, the plain-log lines, research before building, the backdrop option, the diagnosis trigger and the
persisted `render.log` / `report.json`. `npm run check:lua` parses the
mod as Lua 5.2 with luaparse and rejects unknown globals; it cannot check API calls, which were checked by hand
against https://lua-api.factorio.com/latest/ (2.1.24) and the clock-generator harness.
