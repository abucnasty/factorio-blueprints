-- Builds one blueprint string as real entities, for a screenshot, by one of two strategies:
--   "ordinary": a new lab-tile surface (no terrain, enemies or decoratives, always day, surface conditions ignored)
--   "platform": a new, paused space platform (Space Age), for the real space background
-- The launcher picks the order (see build.inspect) and falls back to the other strategy when one builds nothing.
--
-- Ported and trimmed from abucnasty/clock-generator (MIT), clock-generator-recorder/scripts/harness.lua:
-- import_stack, build_blueprint in forced mode, the offset search (blueprint_offset), ore under drills
-- (place_drill_ore), reviving rolling stock after rails, filling item requests (fulfil_item_requests) and the
-- built bounding box. New here: surfaces per blueprint, tile underlays, space platforms with hub alignment, and a
-- report of what could not be placed instead of an error.

local build = {}

local ROLLING_STOCK_TYPES = { ["cargo-wagon"] = true, ["fluid-wagon"] = true, ["artillery-wagon"] = true, ["locomotive"] = true }
-- Resources tried first under a drill, so a plain drill sits on plain ore; any resource it can mine is the fallback
local PREFERRED_RESOURCES = { "iron-ore", "crude-oil", "stone", "coal", "copper-ore" }
-- Room around the blueprint's own extent, for the underlay and chunk generation
local MARGIN_TILES = 8
-- Tiles between a blueprint without a hub and the platform's own hub and starter foundation, so they stay out of
-- the picture (the frame is the build plus 2 tiles)
local HUB_CLEARANCE = 64
-- The collision layer of the space around a platform; a tile that can only be placed over it is platform foundation
local EMPTY_SPACE_LAYER = "empty_space"
local HUB_TYPE = "space-platform-hub"
local PLATFORM_SURFACE = "space-platform"
-- The game's lab checkerboard; the backdrop replaces each of them with a tile of its own
local LAB_TILES = { "lab-dark-1", "lab-dark-2" }
-- The owner's backdrop: the lab checkerboard with lab-dark-2 replaced by black refined concrete
local DEFAULT_BACKDROP = { "lab-dark-1", "black-refined-concrete" }

---@param counts table<string, integer>
---@param name string
local function count(counts, name)
    counts[name] = (counts[name] or 0) + 1
end

---The extent of the blueprint in its own coordinates (entity positions and tile corners)
---@return number left, number top, number right, number bottom
local function blueprint_extent(entities, tiles)
    local left, top, right, bottom = math.huge, math.huge, -math.huge, -math.huge
    for _, entity in pairs(entities) do
        left, right = math.min(left, entity.position.x), math.max(right, entity.position.x)
        top, bottom = math.min(top, entity.position.y), math.max(bottom, entity.position.y)
    end
    for _, tile in pairs(tiles) do
        left, right = math.min(left, tile.position.x), math.max(right, tile.position.x + 1)
        top, bottom = math.min(top, tile.position.y), math.max(bottom, tile.position.y + 1)
    end
    return left, top, right, bottom
end

---The offset from the blueprint's positions to the world's, from the ghosts that a build of it made: the one that
---puts every entity ghost on an entity of the blueprint of the same name. (harness.lua: blueprint_offset)
---@param blueprint_entities BlueprintEntity[]
---@param ghosts LuaEntity[]
---@return MapPosition|nil
local function blueprint_offset(blueprint_entities, ghosts)
    local by_name = {}
    for _, entity in pairs(blueprint_entities) do
        by_name[entity.name] = by_name[entity.name] or {}
        table.insert(by_name[entity.name], entity.position)
    end
    local built = {}
    for _, ghost in pairs(ghosts) do
        if ghost.valid and ghost.type == "entity-ghost" then
            table.insert(built, ghost)
        end
    end
    if #built == 0 then
        return nil
    end
    local function on_blueprint(ghost, dx, dy)
        for _, at in pairs(by_name[ghost.ghost_name] or {}) do
            if math.abs(at.x + dx - ghost.position.x) < 0.01 and math.abs(at.y + dy - ghost.position.y) < 0.01 then
                return true
            end
        end
        return false
    end
    for _, at in pairs(by_name[built[1].ghost_name] or {}) do
        local dx, dy = built[1].position.x - at.x, built[1].position.y - at.y
        local all = true
        for _, ghost in ipairs(built) do
            if not on_blueprint(ghost, dx, dy) then
                all = false
                break
            end
        end
        if all then
            return { x = dx, y = dy }
        end
    end
    return nil
end

---The resource to put under a drill: one it can mine, a common one first
---@param drill LuaEntityPrototype
---@return LuaEntityPrototype|nil
local function resource_for(drill)
    local categories = drill.resource_categories or {}
    for _, name in ipairs(PREFERRED_RESOURCES) do
        local resource = prototypes.entity[name]
        if resource and resource.type == "resource" and categories[resource.resource_category] then
            return resource
        end
    end
    for _, resource in pairs(prototypes.get_entity_filtered({ { filter = "type", type = "resource" } })) do
        if categories[resource.resource_category] then
            return resource
        end
    end
    return nil
end

---Create a resource under each mining drill of the blueprint, which is only built on its ore.
---(harness.lua: place_drill_ore, with the resource chosen per drill instead of passed in)
---@return integer placed
local function place_drill_ore(surface, blueprint_entities, offset)
    local placed = 0
    for _, entity in pairs(blueprint_entities) do
        local prototype = prototypes.entity[entity.name]
        if prototype and prototype.type == "mining-drill" then
            local resource = resource_for(prototype)
            if resource then
                local width, height = prototype.tile_width, prototype.tile_height
                local direction = entity.direction or 0
                if direction == defines.direction.east or direction == defines.direction.west then
                    width, height = height, width
                end
                local x0, y0 = entity.position.x + offset.x, entity.position.y + offset.y
                if resource.infinite_resource then
                    -- an oil-like field: one under the middle of the drill is enough
                    if surface.create_entity({ name = resource.name, position = { x0, y0 }, amount = 300000 }) then
                        placed = placed + 1
                    end
                else
                    local left = math.floor(x0 - width / 2 + 0.5)
                    local top = math.floor(y0 - height / 2 + 0.5)
                    for x = left, left + width - 1 do
                        for y = top, top + height - 1 do
                            if surface.create_entity({ name = resource.name, position = { x + 0.5, y + 0.5 }, amount = 1000000 }) then
                                placed = placed + 1
                            end
                        end
                    end
                end
            end
        end
    end
    return placed
end

---Put the modules and other items a blueprint asks for straight into the entity, so alt-mode shows them.
---(harness.lua: fulfil_item_requests)
---@param entity LuaEntity
---@param proxy LuaEntity item-request-proxy
local function fulfil_item_requests(entity, proxy)
    for _, plan in pairs(proxy.insert_plan) do
        local id = type(plan.id) == "table" and plan.id or { name = plan.id }
        for _, slot in pairs(plan.items.in_inventory or {}) do
            local inventory = entity.get_inventory(slot.inventory)
            if inventory then
                inventory[slot.stack + 1].set_stack({ name = id.name, quality = id.quality, count = slot.count or 1 })
            end
        end
    end
    proxy.destroy()
end

---@param ghosts LuaEntity[]
local function destroy_all(ghosts)
    for _, ghost in pairs(ghosts) do
        if ghost.valid then
            ghost.destroy()
        end
    end
end

-- ---------------------------------------------------------------------------------------------------------------
-- What a blueprint needs, from prototypes

local underlay_cache = {}

---The tile a blueprint tile has to be placed on, if lab tiles will not do: the place-as-tile rule of the first item
---that places it (LuaTilePrototype::items_to_place_this, LuaItemPrototype::place_as_tile_result). Landfill lists
---water in tile_condition; platform foundation has an inverted condition: the tile under it must have the
---empty_space layer. Concrete and the like have neither and go on lab tiles.
---@param tile_name string
---@return string|nil
local function underlay_for(tile_name)
    if underlay_cache[tile_name] ~= nil then
        return underlay_cache[tile_name] or nil
    end
    local found = false
    local tile = prototypes.tile[tile_name]
    local items = tile and tile.items_to_place_this or {}
    local item = items[1] and prototypes.item[items[1].name]
    local rule = item and item.place_as_tile_result
    if rule then
        if rule.tile_condition and #rule.tile_condition > 0 then
            found = rule.tile_condition[1].name
        elseif rule.invert then
            local wanted = rule.condition.layers or {}
            for name, candidate in pairs(prototypes.tile) do
                for layer in pairs(candidate.collision_mask.layers or {}) do
                    if wanted[layer] then
                        -- prefer the plain space tile, the one platforms are made of
                        if not found or name == "empty-space" then
                            found = name
                        end
                    end
                end
            end
        end
    end
    underlay_cache[tile_name] = found
    return found or nil
end

---Whether a tile is platform foundation: it can only be placed over a tile with the empty_space layer
local function is_platform_tile(tile_name)
    local underlay = underlay_for(tile_name)
    local prototype = underlay and prototypes.tile[underlay]
    return prototype ~= nil and (prototype.collision_mask.layers or {})[EMPTY_SPACE_LAYER] == true
end

---The value of a surface property on a surface or planet prototype, or its default
local function property_value(properties, name)
    local value = properties and properties[name]
    if value == nil then
        local property = prototypes.surface_property[name]
        value = property and property.default_value or 0
    end
    return value
end

local function conditions_met(conditions, properties)
    for _, condition in pairs(conditions) do
        local value = property_value(properties, condition.property)
        if value < condition.min or value > condition.max then
            return false
        end
    end
    return true
end

local platform_only_cache = {}

---Whether an entity can be built on a space platform but on no planet, by its surface conditions
local function platform_only(entity_name)
    if platform_only_cache[entity_name] ~= nil then
        return platform_only_cache[entity_name]
    end
    local result = false
    local prototype = prototypes.entity[entity_name]
    local platform = prototypes.surface[PLATFORM_SURFACE]
    local conditions = prototype and prototype.surface_conditions
    if platform and conditions and #conditions > 0 and conditions_met(conditions, platform.surface_properties) then
        result = true
        for _, location in pairs(prototypes.space_location) do
            if location.surface_properties and conditions_met(conditions, location.surface_properties) then
                result = false
                break
            end
        end
    end
    platform_only_cache[entity_name] = result
    return result
end

---The item that starts a space platform, if the game has one (Space Age)
local function starter_pack()
    for name in pairs(prototypes.get_item_filtered({ { filter = "type", type = "space-platform-starter-pack" } })) do
        return name
    end
    return nil
end

-- ---------------------------------------------------------------------------------------------------------------

---Import a blueprint string into a script inventory
---@return LuaInventory|nil inventory, LuaItemStack|string stack or error, integer|nil import result
local function import(blueprint)
    local inventory = game.create_inventory(1)
    local stack = inventory[1]
    local imported = stack.import_stack(blueprint)
    -- 0: imported, -1: imported with errors (e.g. unknown entities), 1: failed
    if imported == 1 or not stack.valid_for_read or not stack.is_blueprint then
        inventory.destroy()
        return nil, "the game could not import the blueprint string (import_stack returned " .. tostring(imported) .. ")"
    end
    if not stack.is_blueprint_setup() then
        inventory.destroy()
        return nil, "the blueprint is empty"
    end
    return inventory, stack, imported
end

---What kind of blueprint this is and which strategies can build it
---@param blueprint string
---@return table report {platform = bool, reasons = string[], platforms_available = bool} or {error}
function build.inspect(blueprint)
    local inventory, stack = import(blueprint)
    if not inventory then
        return { error = stack }
    end
    local reasons, seen = {}, {}
    local function reason(text)
        if not seen[text] then
            seen[text] = true
            table.insert(reasons, text)
        end
    end
    for _, entity in pairs(stack.get_blueprint_entities() or {}) do
        local prototype = prototypes.entity[entity.name]
        if prototype and prototype.type == HUB_TYPE then
            reason("has a space platform hub (" .. entity.name .. ")")
        elseif platform_only(entity.name) then
            reason(entity.name .. " can only be built on a space platform (surface conditions)")
        end
    end
    for _, tile in pairs(stack.get_blueprint_tiles() or {}) do
        if is_platform_tile(tile.name) then
            reason(tile.name .. " can only be placed over empty space")
        end
    end
    inventory.destroy()
    return { platform = #reasons > 0, reasons = reasons, platforms_available = starter_pack() ~= nil }
end

---Revive ghosts: tiles first (entities may stand on them), then entities, rolling stock last (it needs its rails)
---@return LuaEntity[] entities, table<string, integer> built, table<string, integer> failed, string[] problems
local function revive_all(ghosts)
    local tiles, entities_first, rolling = {}, {}, {}
    for _, ghost in pairs(ghosts) do
        if ghost.valid then
            if ghost.type == "tile-ghost" then
                table.insert(tiles, ghost)
            elseif ghost.type == "entity-ghost" then
                table.insert(ROLLING_STOCK_TYPES[ghost.ghost_type] and rolling or entities_first, ghost)
            end
        end
    end
    for _, ghost in ipairs(tiles) do
        if ghost.valid then
            ghost.revive()
        end
    end
    local entities, built, failed, problems = {}, {}, {}, {}
    for _, list in ipairs({ entities_first, rolling }) do
        for _, ghost in ipairs(list) do
            if ghost.valid then
                local name = ghost.ghost_name
                local _, entity, proxy = ghost.revive({ raise_revive = true })
                if entity then
                    if proxy and proxy.valid then
                        local ok = pcall(fulfil_item_requests, entity, proxy)
                        if not ok then
                            table.insert(problems, "could not insert the items requested for " .. name)
                        end
                    end
                    table.insert(entities, entity)
                    count(built, name)
                else
                    count(failed, name)
                end
            end
        end
    end
    -- what could not be revived would otherwise be drawn as ghosts
    destroy_all(ghosts)
    return entities, built, failed, problems
end

---The area to frame: entity bounding boxes and the blueprint's tiles
local function area_of(entities, surface, tile_area, tile_names)
    local left, top, right, bottom = math.huge, math.huge, -math.huge, -math.huge
    for _, entity in pairs(entities) do
        if entity.valid then
            local box = entity.bounding_box
            left, top = math.min(left, box.left_top.x), math.min(top, box.left_top.y)
            right, bottom = math.max(right, box.right_bottom.x), math.max(bottom, box.right_bottom.y)
        end
    end
    if tile_area and next(tile_names) then
        local names = {}
        for name in pairs(tile_names) do
            table.insert(names, name)
        end
        for _, tile in pairs(surface.find_tiles_filtered({ area = tile_area, name = names })) do
            local p = tile.position
            left, top = math.min(left, p.x), math.min(top, p.y)
            right, bottom = math.max(right, p.x + 1), math.max(bottom, p.y + 1)
        end
    end
    if left < right and top < bottom then
        return { left_top = { x = left, y = top }, right_bottom = { x = right, y = bottom } }
    end
    return nil
end

---Remove asteroids and asteroid chunks from a platform surface, so nothing drifts through the picture
function build.clear_asteroids(surface)
    if not surface.platform then
        return 0
    end
    local removed = 0
    for _, asteroid in pairs(surface.find_entities_filtered({ type = "asteroid" })) do
        asteroid.destroy()
        removed = removed + 1
    end
    return removed + surface.platform.destroy_asteroid_chunks({})
end

---The backdrop tiles to use: the two asked for if both exist in this game, else the plain lab checkerboard
---@param wanted string[]|nil
---@return string[] tiles, string|nil problem
local function backdrop_tiles(wanted)
    wanted = wanted or DEFAULT_BACKDROP
    local unknown = {}
    for i = 1, 2 do
        if type(wanted[i]) ~= "string" or not prototypes.tile[wanted[i]] then
            table.insert(unknown, tostring(wanted[i]))
        end
    end
    if #unknown > 0 then
        return LAB_TILES, "backdrop tile(s) " .. table.concat(unknown, ", ") .. " do not exist in this game; using the plain lab checkerboard"
    end
    return wanted
end

---Turn the lab checkerboard in `area` into the backdrop: every lab-dark-1 becomes tiles[1], every lab-dark-2
---tiles[2]. Reading the tiles the game generated keeps its own checker pattern exactly. Blueprint tiles are left alone.
local function apply_backdrop(surface, area, tiles)
    for i = 1, 2 do
        if tiles[i] ~= LAB_TILES[i] then
            local replace = {}
            for _, tile in pairs(surface.find_tiles_filtered({ area = area, name = LAB_TILES[i] })) do
                table.insert(replace, { name = tiles[i], position = tile.position })
            end
            surface.set_tiles(replace, true, false)
        end
    end
end

---Build a blueprint string on a new surface.
---@param blueprint string a blueprint string of one blueprint (not a book)
---@param surface_name string the name for the new surface (ordinary) or platform (platform)
---@param strategy "ordinary"|"platform"
---@param backdrop string[]|nil two tile names for the ordinary surface's checkerboard (nil: the default)
---@return table report
function build.run(blueprint, surface_name, strategy, backdrop)
    local inventory, stack, imported = import(blueprint)
    if not inventory then
        return { error = stack, strategy = strategy }
    end
    local blueprint_entities = stack.get_blueprint_entities() or {}
    local blueprint_tiles = stack.get_blueprint_tiles() or {}
    local left, top, right, bottom = blueprint_extent(blueprint_entities, blueprint_tiles)
    if left > right then
        inventory.destroy()
        return { error = "the blueprint has no entities or tiles", strategy = strategy }
    end
    local wanted, tile_names = {}, {}
    local has_drill, blueprint_hub = false, nil
    for _, entity in pairs(blueprint_entities) do
        count(wanted, entity.name)
        local prototype = prototypes.entity[entity.name]
        has_drill = has_drill or (prototype ~= nil and prototype.type == "mining-drill")
        if prototype and prototype.type == HUB_TYPE and not blueprint_hub then
            blueprint_hub = entity
        end
    end
    for _, tile in pairs(blueprint_tiles) do
        tile_names[tile.name] = true
    end
    local half_width = math.ceil((right - left) / 2) + MARGIN_TILES
    local half_height = math.ceil((bottom - top) / 2) + MARGIN_TILES
    local radius = math.ceil(math.max(half_width, half_height) / 32) + 1
    local force = game.forces.player
    local problems = {}
    local surface, platform, position

    if strategy == "platform" then
        local pack = starter_pack()
        if not pack then
            inventory.destroy()
            return { error = "space platforms are not available: no space platform starter pack prototype (is Space Age enabled?)", strategy = strategy }
        end
        local planet = prototypes.space_location["nauvis"] and "nauvis" or nil
        if not planet then
            for name, location in pairs(prototypes.space_location) do
                if location.type == "planet" then
                    planet = name
                    break
                end
            end
        end
        platform = force.create_space_platform({ name = surface_name, planet = planet, starter_pack = pack })
        if not platform then
            inventory.destroy()
            return { error = "LuaForce::create_space_platform returned nothing", strategy = strategy }
        end
        storage.platforms = storage.platforms or {}
        storage.platforms[surface_name] = platform.index
        -- silent (2.1.7+): no "platform created" message in the window
        local ok = pcall(function() platform.apply_starter_pack(true) end)
        if not ok then
            platform.apply_starter_pack()
        end
        -- no thrust and no schedule: it stays in orbit and nothing on it changes
        platform.paused = true
        surface = platform.surface
        if not surface then
            inventory.destroy()
            return { error = "the space platform has no surface after apply_starter_pack", strategy = strategy }
        end
        -- a blueprint without a hub goes well clear of the platform's own hub and starter foundation
        position = { x = 0, y = -(half_height + HUB_CLEARANCE) }
    else
        surface = game.create_surface(surface_name)
        surface.generate_with_lab_tiles = true
        surface.always_day = true
        surface.show_clouds = false
        surface.ignore_surface_conditions = true
        position = { x = 0, y = 0 }
    end
    storage.render_surfaces = storage.render_surfaces or {}
    storage.render_surfaces[surface_name] = surface.name
    surface.request_to_generate_chunks(position, radius)
    surface.force_generate_chunk_requests()
    local function area_around(at)
        return {
            left_top = { x = at.x - half_width, y = at.y - half_height },
            right_bottom = { x = at.x + half_width, y = at.y + half_height },
        }
    end
    local function build_ghosts()
        return stack.build_blueprint({
            surface = surface,
            force = force,
            position = position,
            build_mode = defines.build_mode.forced,
            skip_fog_of_war = false,
        })
    end
    local diagnostics = { surface_kind = strategy == "platform" and "space platform" or "lab-tile surface" }

    -- Ordinary surface: tiles that cannot go on lab tiles (landfill, platform foundation) get the tile they need
    -- under the whole area first; whatever of it the blueprint does not cover is turned back into the backdrop after.
    local underlay = nil
    if strategy ~= "platform" then
        local by_underlay, best = {}, 0
        for _, tile in pairs(blueprint_tiles) do
            local needed = underlay_for(tile.name)
            if needed then
                count(by_underlay, needed)
                if by_underlay[needed] > best then
                    underlay, best = needed, by_underlay[needed]
                end
            end
        end
        if underlay then
            local cover = {}
            local floor = area_around(position)
            for x = floor.left_top.x, floor.right_bottom.x - 1 do
                for y = floor.left_top.y, floor.right_bottom.y - 1 do
                    table.insert(cover, { name = underlay, position = { x = x, y = y } })
                end
            end
            local ok, message = pcall(function() surface.set_tiles(cover, true, false) end)
            diagnostics.underlay = underlay
            diagnostics.underlay_tiles = surface.count_tiles_filtered({ area = floor, name = underlay })
            if not ok then
                table.insert(problems, "could not lay " .. underlay .. " under the blueprint: " .. tostring(message))
            end
        end
    end

    -- Probe builds: where the blueprint lands, for ore under drills and for lining up with the platform's hub
    local hub = platform and platform.hub
    local aligned_hub = false
    if (has_drill and strategy ~= "platform") or (blueprint_hub and hub) then
        local ghosts = build_ghosts()
        local offset = blueprint_offset(blueprint_entities, ghosts)
        destroy_all(ghosts)
        if not offset then
            table.insert(problems, "the probe build placed " .. #ghosts .. " ghosts, not enough to tell where the blueprint lands")
        elseif blueprint_hub and hub then
            -- the blueprint's hub goes onto the platform's hub, as when pasting a ship onto a new platform
            local want = { x = hub.position.x - blueprint_hub.position.x, y = hub.position.y - blueprint_hub.position.y }
            position = { x = position.x + want.x - offset.x, y = position.y + want.y - offset.y }
            surface.request_to_generate_chunks(position, radius)
            surface.force_generate_chunk_requests()
            aligned_hub = true
        else
            diagnostics.ores = place_drill_ore(surface, blueprint_entities, offset)
        end
    end

    local ghosts = build_ghosts()
    inventory.destroy()
    diagnostics.ghosts = #ghosts
    if aligned_hub then
        local offset = blueprint_offset(blueprint_entities, ghosts)
        local want = { x = hub.position.x - blueprint_hub.position.x, y = hub.position.y - blueprint_hub.position.y }
        if not offset or math.abs(offset.x - want.x) > 0.01 or math.abs(offset.y - want.y) > 0.01 then
            table.insert(problems, "the blueprint's hub did not land on the platform's hub")
            aligned_hub = false
        end
    end
    if #ghosts == 0 then
        table.insert(problems, "build_blueprint placed no ghosts at all on a " .. diagnostics.surface_kind
            .. (underlay and (" (with " .. diagnostics.underlay_tiles .. " " .. underlay .. " tiles laid under it)") or ""))
    end

    local entities, built, failed, revive_problems = revive_all(ghosts)
    for _, problem in ipairs(revive_problems) do
        table.insert(problems, problem)
    end
    if aligned_hub then
        -- the platform's own hub stands in for the blueprint's
        wanted[blueprint_hub.name] = (wanted[blueprint_hub.name] or 1) - 1
        failed[blueprint_hub.name] = nil
        table.insert(entities, hub)
    end
    diagnostics.hub = blueprint_hub and (aligned_hub and "lined up with the platform's hub" or "not lined up") or nil

    if underlay then
        -- turn the underlay the blueprint does not cover back into the lab checkerboard (the backdrop comes later)
        local floor = area_around(position)
        local reset = {}
        for _, tile in pairs(surface.find_tiles_filtered({ area = floor, name = underlay })) do
            local p = tile.position
            if not tile_names[underlay] then
                table.insert(reset, p)
            end
        end
        -- one tile at a time, so the game's own checker pattern comes back and the blueprint's tiles stay
        local ok, message = pcall(function()
            for _, p in ipairs(reset) do
                surface.build_checkerboard({ left_top = { x = p.x, y = p.y }, right_bottom = { x = p.x + 1, y = p.y + 1 } })
            end
        end)
        if not ok then
            table.insert(problems, "could not reset the " .. underlay .. " around the blueprint: " .. tostring(message))
        end
    end

    -- entities that never got a ghost (no water for an offshore pump, an entity of a missing mod) are in no list yet
    local missing = {}
    for name, wanted_count in pairs(wanted) do
        local short = wanted_count - (built[name] or 0) - (failed[name] or 0)
        if short > 0 then
            missing[name] = short
        end
    end

    local area = area_of(entities, surface, area_around(position), tile_names)
    local placed_tiles = 0
    for name in pairs(tile_names) do
        placed_tiles = placed_tiles + surface.count_tiles_filtered({ area = area_around(position), name = name })
    end
    -- Ordinary surface: the backdrop instead of the plain lab checkerboard, laid after the area is known (a
    -- blueprint may use the backdrop's own tiles). A platform keeps its space background.
    if strategy ~= "platform" then
        local floor_tiles, problem = backdrop_tiles(backdrop)
        if problem then
            table.insert(problems, problem)
        end
        local ok, message = pcall(apply_backdrop, surface, area_around(position), floor_tiles)
        if ok then
            diagnostics.backdrop = floor_tiles[1] .. " / " .. floor_tiles[2]
        else
            table.insert(problems, "could not lay the backdrop: " .. tostring(message))
        end
    end

    if area then
        force.chart(surface, area)
    end
    build.clear_asteroids(surface)

    return {
        strategy = strategy,
        surface = surface.name,
        area = area,
        built = #entities,
        tiles = placed_tiles,
        failed = failed,
        missing = missing,
        import_errors = imported == -1,
        problems = problems,
        diagnostics = diagnostics,
        tick = game.tick,
    }
end

---Once per session: research every technology and enable every recipe for the building force, so no recipe icon is
---drawn as locked (crossed out) and every platform feature is available
---@return table report
function build.setup()
    local force = game.forces.player
    force.research_all_technologies()
    -- recipes no technology unlocks stay disabled after research
    force.enable_all_recipes()
    local disabled = 0
    for _, recipe in pairs(force.recipes) do
        if not recipe.enabled then
            disabled = disabled + 1
        end
    end
    local researched = 0
    for _, technology in pairs(force.technologies) do
        if technology.researched then
            researched = researched + 1
        end
    end
    return { technologies_researched = researched, recipes_still_disabled = disabled }
end

---Remove what build.run made under this name: a platform is scheduled for deletion, a surface deleted
function build.remove(surface_name)
    local platform_index = storage.platforms and storage.platforms[surface_name]
    if platform_index then
        storage.platforms[surface_name] = nil
        local platform = game.forces.player.platforms[platform_index]
        if platform and platform.valid then
            platform.destroy()
        end
    end
    local actual = storage.render_surfaces and storage.render_surfaces[surface_name] or surface_name
    if storage.render_surfaces then
        storage.render_surfaces[surface_name] = nil
    end
    local surface = game.surfaces[actual]
    if surface and not surface.platform then
        game.delete_surface(surface)
    end
end

return build
