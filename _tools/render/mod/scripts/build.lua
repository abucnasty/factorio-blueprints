-- Builds one blueprint string as real entities, for a screenshot, by one of two strategies:
--   "ordinary": a new lab-tile surface (no terrain, enemies or decoratives, always day, surface conditions ignored)
--   "platform": space platform blueprints (Space Age) on the space background: a ship with a hub on a new, paused
--               space platform (a hub cannot exist anywhere else); a module without a hub on a starfield surface
--               (empty space with the platform's surface properties: no planet, asteroids or starter platform)
-- The launcher picks the order (see build.inspect) and falls back to the other strategy when one builds nothing.
--
-- Ported and trimmed from abucnasty/clock-generator (MIT), clock-generator-recorder/scripts/harness.lua:
-- import_stack, build_blueprint in forced mode, the offset search (blueprint_offset), ore under drills
-- (place_drill_ore), reviving rolling stock after rails, filling item requests (fulfil_item_requests) and the
-- built bounding box. New here: surfaces per blueprint, tile underlays, space platforms with hub alignment, and a
-- report of what could not be placed instead of an error.

local build = {}

local ROLLING_STOCK_TYPES = { ["cargo-wagon"] = true, ["fluid-wagon"] = true, ["artillery-wagon"] = true, ["locomotive"] = true }
-- Vehicles that may stand where a ghost will not revive (over other entities), so they are created directly
local VEHICLE_TYPES = { ["car"] = true, ["spider-vehicle"] = true }
-- Resources tried first under a drill, so a plain drill sits on plain ore; any resource it can mine is the fallback
local PREFERRED_RESOURCES = { "iron-ore", "crude-oil", "stone", "coal", "copper-ore" }
-- Room around the blueprint's own extent, for the underlay and chunk generation
local MARGIN_TILES = 8
-- The surface prototype whose properties (gravity, pressure, ...) a starfield surface copies, so the game refuses
-- what it would refuse on a platform (chests, burner machines, rails)
local PLATFORM_SURFACE_PROTOTYPE = "space-platform"
-- Where the diagnosis tries "far from the hub" on its scratch platform: south of it, as north of y = -200 the game
-- makes no foundation at all
local DIAGNOSE_FAR = 64
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

---Quarter turns of a 16-way direction (0 north, 4 east, 8 south, 12 west), or nil for a diagonal
local function quarter_turns(direction)
    direction = direction or 0
    if direction % 4 ~= 0 then
        return nil
    end
    return (direction / 4) % 4
end

---The box build_blueprint centres a blueprint on: tile cells and entity footprints (tile_width x tile_height,
---swapped for east and west). Measured in 2.1.24: a blueprint without a hub lands with offset
---floor(position - centre + 0.5) per axis.
---@return number left, number top, number right, number bottom
local function footprint_extent(entities, tiles)
    local left, top, right, bottom = math.huge, math.huge, -math.huge, -math.huge
    for _, entity in pairs(entities) do
        local prototype = prototypes.entity[entity.name]
        local width, height = 1, 1
        if prototype then
            width, height = prototype.tile_width, prototype.tile_height
        end
        local turns = quarter_turns(entity.direction)
        if turns == 1 or turns == 3 then
            width, height = height, width
        end
        left, right = math.min(left, entity.position.x - width / 2), math.max(right, entity.position.x + width / 2)
        top, bottom = math.min(top, entity.position.y - height / 2), math.max(bottom, entity.position.y + height / 2)
    end
    for _, tile in pairs(tiles) do
        left, right = math.min(left, tile.position.x), math.max(right, tile.position.x + 1)
        top, bottom = math.min(top, tile.position.y), math.max(bottom, tile.position.y + 1)
    end
    return left, top, right, bottom
end

---The largest build grid of the blueprint's entities (2 for some entity types): build_blueprint moves the
---blueprint in steps of it, so offsets that are a multiple of it land exactly (measured in 2.1.24)
local function build_grid(entities)
    local grid = 1
    for _, entity in pairs(entities) do
        local prototype = prototypes.entity[entity.name]
        if prototype then
            local ok, size = pcall(function() return prototype.build_grid_size end)
            if ok and type(size) == "number" and size > grid then
                grid = size
            end
        end
    end
    return grid
end

---A tile_buildability_rules area turned with the entity
local function rotate_area(area, turns)
    local l, t, r, b = area.left_top.x, area.left_top.y, area.right_bottom.x, area.right_bottom.y
    for _ = 1, turns do
        -- a quarter turn clockwise: (x, y) -> (-y, x)
        l, t, r, b = -b, l, -t, r
    end
    return l, t, r, b
end

local function any_layer(layers, wanted)
    for layer in pairs(wanted or {}) do
        if layers[layer] then
            return true
        end
    end
    return false
end

---The blueprint's tiles that break a tile rule of one of its own entities (a tile in a thruster's exhaust, in front
---of an asteroid collector). The game refuses a blueprint with any such tile completely, in every build mode and on
---every surface, so they are left out and reported instead.
---@return table<integer, string> conflicting tile index -> the entity whose rule it breaks
local function self_conflicts(entities, tiles)
    local conflicts = {}
    for _, entity in pairs(entities) do
        local prototype = prototypes.entity[entity.name]
        local turns = quarter_turns(entity.direction)
        for _, rule in pairs(prototype and turns and prototype.tile_buildability_rules or {}) do
            local l, t, r, b = rotate_area(rule.area, turns)
            local colliding = rule.colliding_tiles and rule.colliding_tiles.layers or {}
            local required = rule.required_tiles and rule.required_tiles.layers or {}
            local needs_some = next(required) ~= nil
            for index, tile in pairs(tiles) do
                local x = tile.position.x + 0.5 - entity.position.x
                local y = tile.position.y + 0.5 - entity.position.y
                if x > l and x < r and y > t and y < b then
                    local tile_prototype = prototypes.tile[tile.name]
                    local layers = tile_prototype and tile_prototype.collision_mask.layers or {}
                    if any_layer(layers, colliding) or (needs_some and not any_layer(layers, required)) then
                        conflicts[index] = entity.name
                    end
                end
            end
        end
    end
    return conflicts
end

---The offset from the blueprint's positions to the world's, from the ghosts that a build of it made: the one that
---puts every entity ghost on an entity of the blueprint of the same name. (harness.lua: blueprint_offset)
---@param blueprint_entities BlueprintEntity[]
---@param ghosts LuaEntity[]
---@return MapPosition|nil
local function blueprint_offset(blueprint_entities, ghosts)
    -- positions are fixed point (1/256 tile), so a position rounded to that is an exact key
    local function key(name, x, y)
        return name .. "@" .. math.floor(x * 256 + 0.5) .. "," .. math.floor(y * 256 + 0.5)
    end
    local by_name, at_key = {}, {}
    for _, entity in pairs(blueprint_entities) do
        by_name[entity.name] = by_name[entity.name] or {}
        table.insert(by_name[entity.name], entity.position)
        at_key[key(entity.name, entity.position.x, entity.position.y)] = true
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
        return at_key[key(ghost.ghost_name, ghost.position.x - dx, ghost.position.y - dy)] == true
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

---Put the items of an insert plan (BlueprintInsertPlan[]) straight into the entity
---@param entity LuaEntity
---@param insert_plan BlueprintInsertPlan[]
local function insert_items(entity, insert_plan)
    for _, plan in pairs(insert_plan) do
        local id = type(plan.id) == "table" and plan.id or { name = plan.id }
        for _, slot in pairs(plan.items.in_inventory or {}) do
            local inventory = entity.get_inventory(slot.inventory)
            if inventory then
                inventory[slot.stack + 1].set_stack({ name = id.name, quality = id.quality, count = slot.count or 1 })
            end
        end
    end
end

---Put the modules and other items a blueprint asks for straight into the entity, so alt-mode shows them.
---(harness.lua: fulfil_item_requests)
---@param entity LuaEntity
---@param proxy LuaEntity item-request-proxy
local function fulfil_item_requests(entity, proxy)
    insert_items(entity, proxy.insert_plan)
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

---Revive ghosts: tiles first (entities may stand on them), then entities, rolling stock (it needs its rails), vehicles
---last. A vehicle that is not built here (no ghost, a ghost destroyed by reviving what is under it, or a ghost that
---will not revive) is created after this from the blueprint (create_missing_vehicles).
---@return LuaEntity[] entities, table<string, integer> built, table<string, integer> failed, string[] problems
local function revive_all(surface, ghosts)
    local tiles, entities_first, rolling, vehicles = {}, {}, {}, {}
    for _, ghost in pairs(ghosts) do
        if ghost.valid then
            if ghost.type == "tile-ghost" then
                table.insert(tiles, ghost)
            elseif ghost.type == "entity-ghost" then
                local kind = ghost.ghost_type
                table.insert(ROLLING_STOCK_TYPES[kind] and rolling or VEHICLE_TYPES[kind] and vehicles or entities_first, ghost)
            end
        end
    end
    -- one set_tiles for all of them: reviving foundation ghosts one by one fails for every ghost not yet next to
    -- foundation (most of a large ship), and set_tiles leaves the ghosts behind, so they are removed after
    if #tiles > 0 then
        local laid = {}
        for _, ghost in ipairs(tiles) do
            table.insert(laid, { name = ghost.ghost_name, position = ghost.position })
        end
        surface.set_tiles(laid, true, false)
        destroy_all(tiles)
    end
    local entities, built, failed, problems = {}, {}, {}, {}
    for _, list in ipairs({ entities_first, rolling, vehicles }) do
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
                elseif list ~= vehicles then
                    -- a vehicle that will not revive is created after this (create_missing_vehicles)
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

---The planet a render platform orbits: Nauvis if it exists, else the first planet
local function render_planet()
    if prototypes.space_location["nauvis"] then
        return "nauvis"
    end
    for name, location in pairs(prototypes.space_location) do
        if location.type == "planet" then
            return name
        end
    end
    return nil
end

---A new space platform with its starter pack applied and paused, or nil and an error
---@return LuaSpacePlatform|nil, string|nil
local function new_platform(name)
    local pack = starter_pack()
    if not pack then
        return nil, "space platforms are not available: no space platform starter pack prototype (is Space Age enabled?)"
    end
    local platform = game.forces.player.create_space_platform({ name = name, planet = render_planet(), starter_pack = pack })
    if not platform then
        return nil, "LuaForce::create_space_platform returned nothing"
    end
    storage.platforms = storage.platforms or {}
    storage.platforms[name] = platform.index
    -- silent (2.1.7+): no "platform created" message in the window
    local ok = pcall(function() platform.apply_starter_pack(true) end)
    if not ok then
        platform.apply_starter_pack()
    end
    -- no thrust and no schedule: it stays in orbit and nothing on it changes
    platform.paused = true
    if not platform.surface then
        return nil, "the space platform has no surface after apply_starter_pack"
    end
    storage.render_surfaces = storage.render_surfaces or {}
    storage.render_surfaces[name] = platform.surface.name
    return platform
end

---A new lab-tile surface (ordinary stage)
local function new_ordinary_surface(name)
    local surface = game.create_surface(name)
    surface.generate_with_lab_tiles = true
    surface.always_day = true
    surface.show_clouds = false
    surface.ignore_surface_conditions = true
    storage.render_surfaces = storage.render_surfaces or {}
    storage.render_surfaces[name] = surface.name
    return surface
end

local function generate(surface, center, half_width, half_height)
    surface.request_to_generate_chunks(center, math.ceil(math.max(half_width, half_height) / 32) + 1)
    surface.force_generate_chunk_requests()
end

---A new starfield surface for a platform blueprint without a hub: the ordinary stage's settings, but the surface
---properties of a space platform and surface conditions enforced, so the game builds exactly what a platform would
---allow. The space background comes from the empty-space tiles laid under the blueprint. Measured in 2.1.24: a
---space-platform-hub cannot be created on such a surface (create_entity and every clone method give nothing), so a
---ship with a hub still needs a real platform.
---@return LuaSurface|nil, string|nil
local function new_space_surface(name)
    local prototype = prototypes.surface[PLATFORM_SURFACE_PROTOTYPE]
    if not prototype then
        return nil, "space platforms are not available: no " .. PLATFORM_SURFACE_PROTOTYPE .. " surface prototype (is Space Age enabled?)"
    end
    local surface = new_ordinary_surface(name)
    surface.ignore_surface_conditions = false
    for property, value in pairs(prototype.surface_properties or {}) do
        pcall(surface.set_property, property, value)
    end
    return surface
end

---The tile with the empty_space layer that platforms float in
local function space_tile()
    if prototypes.tile["empty-space"] then
        return "empty-space"
    end
    for name, tile in pairs(prototypes.tile) do
        if (tile.collision_mask.layers or {})[EMPTY_SPACE_LAYER] then
            return name
        end
    end
    return nil
end

---How far past an entity its tile rules reach (a thruster's exhaust: about 90 tiles), so open space is laid there
local function rule_reach(entities)
    local reach = 0
    for _, entity in pairs(entities) do
        local prototype = prototypes.entity[entity.name]
        for _, rule in pairs(prototype and prototype.tile_buildability_rules or {}) do
            local a = rule.area
            reach = math.max(reach, math.abs(a.left_top.x), math.abs(a.left_top.y), math.abs(a.right_bottom.x), math.abs(a.right_bottom.y))
        end
    end
    return math.ceil(reach)
end

---Why the game will not build this entity on this surface by its surface conditions, or nil
local function surface_refusal(entity_name, surface)
    local prototype = prototypes.entity[entity_name]
    local conditions = prototype and prototype.surface_conditions
    if not conditions or #conditions == 0 or surface.ignore_surface_conditions then
        return nil
    end
    for _, condition in pairs(conditions) do
        local ok, value = pcall(surface.get_property, condition.property)
        if ok and (value < condition.min or value > condition.max) then
            return entity_name .. " cannot be built here: it needs " .. condition.property .. " " .. condition.min
                .. "–" .. condition.max .. " and this surface has " .. value .. " (surface conditions)"
        end
    end
    return nil
end

---Leave out the blueprint's tiles that break a tile rule of its own entities, which would make the game refuse the
---whole blueprint (see self_conflicts)
---@return table[] tiles kept, string[] problems, integer left out
local function drop_self_conflicts(stack, entities, tiles)
    local conflicts = self_conflicts(entities, tiles)
    if not next(conflicts) then
        return tiles, {}, 0
    end
    local kept, by_entity, dropped = {}, {}, 0
    for index, tile in ipairs(tiles) do
        if conflicts[index] then
            dropped = dropped + 1
            count(by_entity, conflicts[index])
        else
            table.insert(kept, tile)
        end
    end
    stack.set_blueprint_tiles(kept)
    local problems = {}
    for name, n in pairs(by_entity) do
        table.insert(problems, "left out " .. n .. " of the blueprint's tiles: they lie where its " .. name
            .. " needs open space (its tile rules); with them the game builds nothing of the blueprint")
    end
    return kept, problems, dropped
end

---Move a blueprint so that its hub is at (0, 0). build_blueprint moves a blueprint with a hub only in steps of 256
---tiles (measured in 2.1.24: offset = 256 * floor(position / 256 + 0.5)), so it is placed by its own coordinates
local function centre_on_hub(stack, entities, tiles, hub_entity)
    local dx, dy = hub_entity.position.x, hub_entity.position.y
    if dx == 0 and dy == 0 then
        return entities, tiles
    end
    for _, entity in pairs(entities) do
        entity.position = { x = entity.position.x - dx, y = entity.position.y - dy }
    end
    for _, tile in pairs(tiles) do
        tile.position = { x = tile.position.x - dx, y = tile.position.y - dy }
    end
    stack.set_blueprint_entities(entities)
    stack.set_blueprint_tiles(tiles)
    return stack.get_blueprint_entities() or {}, stack.get_blueprint_tiles() or {}
end

-- How far (tiles) a built vehicle may be from its blueprint position + offset and still count as built from it
local VEHICLE_MATCH_TOLERANCE = 0.1

---The blueprint's cars and spidertrons that were not built. Measured in 2.1.24: build_blueprint in forced mode makes
---no ghost for some vehicles over other entities (the 22 cars of Quantum Blade), and reviving an entity under a
---vehicle's ghost destroys that ghost (a spidertron over a heat pipe). Each built vehicle is matched to one blueprint
---vehicle of the same name at blueprint position + offset.
---@param entities LuaEntity[] what revive_all built
---@param offset MapPosition|nil world = blueprint + offset, from the ghosts of the build (blueprint_offset)
---@return BlueprintEntity[] not built (empty without an offset), table<string, integer> not built, by name
local function missing_vehicles(blueprint_entities, entities, offset)
    local built = {}
    for _, entity in pairs(entities) do
        if entity.valid and VEHICLE_TYPES[entity.type] then
            table.insert(built, entity)
        end
    end
    local unbuilt, counts, built_by_name = {}, {}, {}
    for _, entity in ipairs(built) do
        count(built_by_name, entity.name)
    end
    for _, entity in pairs(blueprint_entities) do
        local prototype = prototypes.entity[entity.name]
        if prototype and VEHICLE_TYPES[prototype.type] then
            if offset then
                local x, y = entity.position.x + offset.x, entity.position.y + offset.y
                local found
                for index, vehicle in ipairs(built) do
                    if vehicle.name == entity.name and math.abs(vehicle.position.x - x) < VEHICLE_MATCH_TOLERANCE
                        and math.abs(vehicle.position.y - y) < VEHICLE_MATCH_TOLERANCE then
                        found = index
                        break
                    end
                end
                if found then
                    table.remove(built, found)
                else
                    table.insert(unbuilt, entity)
                    count(counts, entity.name)
                end
            elseif (built_by_name[entity.name] or 0) > 0 then
                -- without an offset only the number per name can be told
                built_by_name[entity.name] = built_by_name[entity.name] - 1
            else
                count(counts, entity.name)
            end
        end
    end
    return unbuilt, counts
end

---Create the blueprint's vehicles that were not built, at blueprint position + offset, once everything else stands.
---create_entity does not check collisions, so a car parked over other entities (used as a chest) stands where the
---editor's forced placement puts it. A car is turned to its orientation (a spidertron's blueprint has none) and every
---vehicle gets its items. Vehicles the surface refuses by its surface conditions (cars on a platform) are left out:
---they stay missing and the report says why.
---@param unbuilt BlueprintEntity[]
---@return LuaEntity[] entities, table<string, integer> created, string[] problems
local function create_missing_vehicles(surface, unbuilt, offset)
    local entities, created, problems = {}, {}, {}
    for _, blueprint_entity in ipairs(unbuilt) do
        local name = blueprint_entity.name
        local position = { x = blueprint_entity.position.x + offset.x, y = blueprint_entity.position.y + offset.y }
        if not surface_refusal(name, surface) then
            local ok, entity = pcall(surface.create_entity, {
                name = name, position = position, force = game.forces.player, quality = blueprint_entity.quality,
                raise_built = true,
            })
            if ok and entity then
                if blueprint_entity.orientation and entity.type == "car" then
                    entity.orientation = blueprint_entity.orientation
                end
                if blueprint_entity.items and not pcall(insert_items, entity, blueprint_entity.items) then
                    table.insert(problems, "could not insert the items requested for " .. name)
                end
                table.insert(entities, entity)
                count(created, name)
            else
                table.insert(problems, "create_entity " .. (ok and "made nothing" or ("failed: " .. tostring(entity)))
                    .. " for " .. name .. " at " .. position.x .. ", " .. position.y)
            end
        end
    end
    for name, n in pairs(created) do
        table.insert(problems, "created " .. n .. " " .. name .. " directly with create_entity: the game built none from the"
            .. " blueprint (no ghost, or its ghost would not revive)")
    end
    return entities, created, problems
end

---Build a blueprint string on a new surface.
---
---Ordinary blueprints (no tiles, or tiles that go on lab tiles such as concrete): build_blueprint on a lab-tile
---surface, then revive the ghosts (verified in the real game). Every other blueprint is built once at a position
---computed from the placement rules measured in 2.1.24:
---  * tiles that break a tile rule of the blueprint's own entities are left out (else nothing is built at all);
---  * a blueprint with a hub lands at its own coordinates (moved to put its hub at (0, 0)), so on a platform its hub
---    lines up with the platform's;
---  * a blueprint without a hub lands with offset floor(position - centre + 0.5) of its footprint box, in steps of
---    its build grid, so it is built at centre + an offset that is a multiple of the grid; with strategy "platform"
---    it is built on a starfield surface (new_space_surface) over empty space;
---  * on a lab surface, tiles that need something under them (foundation: empty space; landfill: water) get it.
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
    local problems = {}
    local diagnostics = { surface_kind = strategy == "platform" and "space platform" or "lab-tile surface" }
    local kept, dropped_problems, dropped = drop_self_conflicts(stack, blueprint_entities, blueprint_tiles)
    blueprint_tiles = kept
    for _, problem in ipairs(dropped_problems) do
        table.insert(problems, problem)
    end
    if dropped > 0 then
        diagnostics.tiles_left_out = dropped
    end

    local wanted, tile_names = {}, {}
    local has_drill, blueprint_hub, special_tiles = false, nil, false
    for _, entity in pairs(blueprint_entities) do
        count(wanted, entity.name)
        local prototype = prototypes.entity[entity.name]
        has_drill = has_drill or (prototype ~= nil and prototype.type == "mining-drill")
        if prototype and prototype.type == HUB_TYPE and not blueprint_hub then
            blueprint_hub = entity
        end
    end
    if blueprint_hub then
        blueprint_entities, blueprint_tiles = centre_on_hub(stack, blueprint_entities, blueprint_tiles, blueprint_hub)
        for _, entity in pairs(blueprint_entities) do
            if entity.name == blueprint_hub.name then
                blueprint_hub = entity
                break
            end
        end
    end
    local underlay, by_underlay, best = nil, {}, 0
    for _, tile in pairs(blueprint_tiles) do
        tile_names[tile.name] = true
        local needed = underlay_for(tile.name)
        if needed then
            special_tiles = true
            count(by_underlay, needed)
            if by_underlay[needed] > best then
                underlay, best = needed, by_underlay[needed]
            end
        end
    end
    local left, top, right, bottom = footprint_extent(blueprint_entities, blueprint_tiles)
    if left > right then
        inventory.destroy()
        return { error = "the blueprint has no entities or tiles", strategy = strategy, problems = problems }
    end
    local half_width = math.ceil((right - left) / 2) + MARGIN_TILES
    local half_height = math.ceil((bottom - top) / 2) + MARGIN_TILES
    local centre = { x = (left + right) / 2, y = (top + bottom) / 2 }

    local surface, platform, hub
    -- where the blueprint's positions go in the world: world = blueprint + offset. A multiple of the build grid, so
    -- that position = centre + offset is exactly on the grid and no rounding decides where it lands.
    local grid = build_grid(blueprint_entities)
    -- (+ 0 turns -0 into 0 for the report)
    local offset = { x = -grid * math.floor(centre.x / grid) + 0, y = -grid * math.floor(centre.y / grid) + 0 }
    local starfield = strategy == "platform" and not blueprint_hub
    if strategy == "platform" and blueprint_hub then
        local message
        platform, message = new_platform(surface_name)
        if not platform then
            inventory.destroy()
            return { error = message, strategy = strategy }
        end
        surface, hub = platform.surface, platform.hub
    elseif starfield then
        local message
        surface, message = new_space_surface(surface_name)
        if not surface then
            inventory.destroy()
            return { error = message, strategy = strategy }
        end
        diagnostics.surface_kind = "starfield surface"
    else
        surface = new_ordinary_surface(surface_name)
    end
    if blueprint_hub then
        -- its own coordinates; the platform's hub is at (0, 0)
        offset = { x = 0, y = 0 }
    end
    if grid > 1 then
        diagnostics.build_grid = grid
    end
    local at = { x = centre.x + offset.x, y = centre.y + offset.y }
    local around = {
        left_top = { x = at.x - half_width, y = at.y - half_height },
        right_bottom = { x = at.x + half_width, y = at.y + half_height },
    }
    generate(surface, at, half_width, half_height)

    local function build_ghosts(position)
        return stack.build_blueprint({
            surface = surface, force = game.forces.player, position = position,
            build_mode = defines.build_mode.forced, skip_fog_of_war = false,
        })
    end
    -- where the blueprint actually landed (world = blueprint + landed), from the ghosts of the real build
    local ghosts, landed
    if strategy == "platform" or special_tiles then
        diagnostics.method = "built once at a computed position"
        if starfield then
            -- open space under the frame and as far as the entities' tile rules reach (thruster exhausts)
            local space = space_tile()
            local reach = rule_reach(blueprint_entities)
            generate(surface, at, half_width + reach, half_height + reach)
            local cover = {}
            if space then
                for x = math.floor(around.left_top.x - reach), math.ceil(around.right_bottom.x + reach) - 1 do
                    for y = math.floor(around.left_top.y - reach), math.ceil(around.right_bottom.y + reach) - 1 do
                        table.insert(cover, { name = space, position = { x = x, y = y } })
                    end
                end
            end
            local ok, message = pcall(function() surface.set_tiles(cover, true, false) end)
            if not ok or not space then
                table.insert(problems, "could not lay open space under the blueprint: " .. tostring(message or "no empty-space tile"))
            end
        end
        if strategy ~= "platform" and underlay then
            -- what these tiles need under them, under the whole frame (whatever the blueprint does not cover is turned
            -- back into the checkerboard after)
            local cover = {}
            for x = math.floor(around.left_top.x), math.ceil(around.right_bottom.x) - 1 do
                for y = math.floor(around.left_top.y), math.ceil(around.right_bottom.y) - 1 do
                    table.insert(cover, { name = underlay, position = { x = x, y = y } })
                end
            end
            local ok, message = pcall(function() surface.set_tiles(cover, true, false) end)
            diagnostics.underlay = underlay
            if not ok then
                table.insert(problems, "could not lay " .. underlay .. " under the blueprint: " .. tostring(message))
            end
        end
        if has_drill and strategy ~= "platform" then
            diagnostics.ores = place_drill_ore(surface, blueprint_entities, offset)
        end
        -- a blueprint with a hub stays at its own coordinates for any position within 127 tiles of (0, 0)
        ghosts = build_ghosts(blueprint_hub and (hub and hub.position or { x = 0, y = 0 }) or at)
        landed = blueprint_offset(blueprint_entities, ghosts)
        if landed and (math.abs(landed.x - offset.x) > 0.01 or math.abs(landed.y - offset.y) > 0.01) then
            table.insert(problems, "the blueprint landed at offset " .. landed.x .. ", " .. landed.y .. " instead of "
                .. offset.x .. ", " .. offset.y)
        end
        if hub and blueprint_hub then
            local lined_up = landed == nil or (math.abs(landed.x) < 0.01 and math.abs(landed.y) < 0.01)
            diagnostics.hub = lined_up and "lined up with the platform's hub" or "not lined up"
        end
    else
        diagnostics.method = "ghosts on a lab floor"
        if has_drill then
            -- probe build: where the blueprint lands, to put ore under its drills before the real build
            local probe = build_ghosts(at)
            local landed = blueprint_offset(blueprint_entities, probe)
            destroy_all(probe)
            if landed then
                diagnostics.ores = place_drill_ore(surface, blueprint_entities, landed)
            else
                table.insert(problems, "the probe build placed " .. #probe .. " ghosts, not enough to tell where the blueprint lands")
            end
        end
        ghosts = build_ghosts(at)
        landed = blueprint_offset(blueprint_entities, ghosts)
    end
    inventory.destroy()
    diagnostics.ghosts = #ghosts
    if #ghosts == 0 and #blueprint_entities > 0 then
        table.insert(problems, "build_blueprint placed no ghosts at all on a " .. diagnostics.surface_kind)
    end
    if landed then
        diagnostics.offset = { x = landed.x + 0, y = landed.y + 0 }
    end
    local entities, built, failed, revive_problems = revive_all(surface, ghosts)
    for _, problem in ipairs(revive_problems) do
        table.insert(problems, problem)
    end
    -- vehicles last of all: the blueprint's cars and spidertrons that nothing was built for are created directly
    local unbuilt, unbuilt_counts = missing_vehicles(blueprint_entities, entities, landed)
    if landed then
        local created, created_counts, vehicle_problems = create_missing_vehicles(surface, unbuilt, landed)
        for _, vehicle in ipairs(created) do
            table.insert(entities, vehicle)
        end
        for name, n in pairs(created_counts) do
            built[name] = (built[name] or 0) + n
        end
        for _, problem in ipairs(vehicle_problems) do
            table.insert(problems, problem)
        end
    elseif #ghosts > 0 then
        -- with no ghosts at all the build failed as a whole, which is reported above
        for name, n in pairs(unbuilt_counts) do
            table.insert(problems, "could not create " .. n .. " " .. name .. " that the game did not build: where the"
                .. " blueprint landed is unknown (no ghosts matched the blueprint)")
        end
    end
    if hub and blueprint_hub then
        -- the platform's own hub stands in for the blueprint's
        wanted[blueprint_hub.name] = (wanted[blueprint_hub.name] or 1) - 1
        failed[blueprint_hub.name] = nil
        table.insert(entities, hub)
    end
    if strategy ~= "platform" and underlay then
        -- the underlay the blueprint does not cover goes back to the lab checkerboard (the backdrop comes later),
        -- one tile at a time so the game's own checker pattern comes back
        local ok, message = pcall(function()
            for _, tile in pairs(surface.find_tiles_filtered({ area = around, name = underlay })) do
                local p = tile.position
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
        if short > 0 or failed[name] then
            local refusal = surface_refusal(name, surface)
            if refusal then
                table.insert(problems, refusal)
            end
        end
    end

    local area = area_of(entities, surface, around, tile_names)
    local placed_tiles = 0
    for name in pairs(tile_names) do
        placed_tiles = placed_tiles + surface.count_tiles_filtered({ area = around, name = name })
    end
    -- Ordinary surface: the backdrop instead of the plain lab checkerboard, laid after the area is known (a
    -- blueprint may use the backdrop's own tiles). A platform keeps its space background.
    if strategy ~= "platform" then
        local floor_tiles, problem = backdrop_tiles(backdrop)
        if problem then
            table.insert(problems, problem)
        end
        local ok, message = pcall(apply_backdrop, surface, around, floor_tiles)
        if ok then
            diagnostics.backdrop = floor_tiles[1] .. " / " .. floor_tiles[2]
        else
            table.insert(problems, "could not lay the backdrop: " .. tostring(message))
        end
    end
    if area then
        game.forces.player.chart(surface, area)
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

-- ---------------------------------------------------------------------------------------------------------------
-- Diagnosis: small experiments that show which placement rule refuses a blueprint

local MAX_KINDS = 30

---Run a fixed matrix of build experiments on scratch surfaces and report one line each. Every experiment is wrapped:
---an error in one is reported and the rest still run.
---@param blueprint string
---@param prefix string name prefix for the scratch surfaces and platform
---@return table {lines = string[], experiments = table[]}
function build.diagnose(blueprint, prefix)
    local inventory, stack = import(blueprint)
    if not inventory then
        return { error = stack }
    end
    local entities = stack.get_blueprint_entities() or {}
    local tiles = stack.get_blueprint_tiles() or {}
    inventory.destroy()
    local left, top, right, bottom = blueprint_extent(entities, tiles)
    if left > right then
        return { error = "the blueprint has no entities or tiles" }
    end
    local half_width = math.ceil((right - left) / 2) + MARGIN_TILES
    local half_height = math.ceil((bottom - top) / 2) + MARGIN_TILES
    local span = 2 * math.max(half_width, half_height) + 32
    local lines, experiments = {}, {}
    local function note(line, record)
        table.insert(lines, line)
        table.insert(experiments, record)
    end
    local conflicts, conflicting = self_conflicts(entities, tiles), {}
    for _, name in pairs(conflicts) do
        count(conflicting, name)
    end
    for name, n in pairs(conflicting) do
        note("[diagnose] " .. n .. " tiles lie where its " .. name .. " needs open space: the game refuses the whole blueprint with them (the build leaves them out)",
            { self_conflict = name, tiles = n })
    end

    -- the foundation to lay for real: the blueprint's own platform tile, else its most common tile, else the game's
    local foundation, counts, best = nil, {}, 0
    for _, tile in pairs(tiles) do
        count(counts, tile.name)
        if is_platform_tile(tile.name) and counts[tile.name] > best then
            foundation, best = tile.name, counts[tile.name]
        end
    end
    if not foundation and prototypes.tile["space-platform-foundation"] then
        foundation = "space-platform-foundation"
    end
    local space_tile = foundation and underlay_for(foundation)

    -- the places to build in: each gets its own fresh spot
    local places = {}
    local function add_place(label, surface, origin, prelay)
        table.insert(places, { label = label, surface = surface, origin = origin, prelay = prelay, next = 0 })
    end
    local ok, message = pcall(function()
        local lab = new_ordinary_surface(prefix .. "-lab")
        add_place("lab tiles", lab, { x = 0, y = 0 }, nil)
        if space_tile then
            add_place("lab + " .. space_tile .. " underlay", lab, { x = 0, y = 4 * span }, space_tile)
        end
        if foundation then
            add_place("lab + real " .. foundation, lab, { x = 0, y = 8 * span }, foundation)
        end
    end)
    if not ok then
        note("[diagnose] could not make the scratch lab surface: " .. tostring(message), { error = tostring(message) })
    end
    local platform, problem = nil, nil
    ok, message = pcall(function()
        platform, problem = new_platform(prefix .. "-platform")
    end)
    if platform then
        -- south of the hub: north of y = -200 the game makes no foundation at all
        local far = DIAGNOSE_FAR + 4 * span
        add_place("platform far from hub", platform.surface, { x = 0, y = far }, nil)
        if foundation then
            add_place("platform far + real " .. foundation, platform.surface, { x = 0, y = far + 8 * span }, foundation)
        end
        if platform.hub then
            add_place("platform at hub", platform.surface, { x = platform.hub.position.x, y = platform.hub.position.y }, nil)
            if foundation then
                add_place("platform at hub + real " .. foundation, platform.surface, { x = platform.hub.position.x, y = platform.hub.position.y }, foundation)
            end
        end
    else
        note("[diagnose] no scratch platform: " .. tostring(problem or message), { error = tostring(problem or message) })
    end

    ---A fresh spot in a place, with its prelay laid
    local function spot(place)
        local position = { x = place.origin.x + place.next * span, y = place.origin.y }
        if place.label:find("at hub", 1, true) then
            position = place.origin -- always the hub itself; ghosts are removed after each experiment
        end
        place.next = place.next + 1
        generate(place.surface, position, half_width, half_height)
        if place.prelay then
            local cover = {}
            for x = math.floor(position.x - half_width), math.ceil(position.x + half_width) - 1 do
                for y = math.floor(position.y - half_height), math.ceil(position.y + half_height) - 1 do
                    table.insert(cover, { name = place.prelay, position = { x = x, y = y } })
                end
            end
            place.surface.set_tiles(cover, true, false)
        end
        return position
    end

    local function experiment(label, place, variant_entities, variant_tiles, mode, mode_name)
        local scratch, result = nil, nil
        local ran, err = pcall(function()
            local position = spot(place)
            local scratch_inventory, scratch_stack = import(blueprint)
            scratch = scratch_inventory
            if not scratch_inventory then
                error(scratch_stack)
            end
            if variant_entities then
                scratch_stack.set_blueprint_entities(variant_entities)
            end
            if variant_tiles then
                scratch_stack.set_blueprint_tiles(variant_tiles)
            end
            local ghosts = scratch_stack.build_blueprint({
                surface = place.surface, force = game.forces.player, position = position,
                build_mode = mode or defines.build_mode.forced, skip_fog_of_war = false,
            })
            local entity_ghosts, tile_ghosts = 0, 0
            for _, ghost in pairs(ghosts) do
                if ghost.valid and ghost.type == "tile-ghost" then
                    tile_ghosts = tile_ghosts + 1
                elseif ghost.valid and ghost.type == "entity-ghost" then
                    entity_ghosts = entity_ghosts + 1
                end
            end
            destroy_all(ghosts)
            result = { entity_ghosts = entity_ghosts, tile_ghosts = tile_ghosts }
        end)
        if scratch and scratch.valid then
            scratch.destroy()
        end
        local name = label .. " | " .. place.label .. (mode_name and (" | " .. mode_name) or "")
        if ran then
            note(string.format("[diagnose] %s: %d entity ghosts, %d tile ghosts", name, result.entity_ghosts, result.tile_ghosts),
                { experiment = name, entity_ghosts = result.entity_ghosts, tile_ghosts = result.tile_ghosts })
        else
            note("[diagnose] " .. name .. ": error: " .. tostring(err), { experiment = name, error = tostring(err) })
        end
    end

    -- 1. whole blueprint, tiles only, entities only, in every place
    for _, place in ipairs(places) do
        experiment("full (" .. #entities .. " entities, " .. #tiles .. " tiles)", place, nil, nil)
        if #tiles > 0 and #entities > 0 then
            experiment("tiles only", place, {}, nil)
            experiment("entities only", place, nil, {})
        end
        if #entities > 0 then
            local without_hub = {}
            for _, entity in pairs(entities) do
                local prototype = prototypes.entity[entity.name]
                if not (prototype and prototype.type == HUB_TYPE) then
                    table.insert(without_hub, entity)
                end
            end
            if #without_hub < #entities and #without_hub > 0 then
                experiment("full without its hub", place, without_hub, nil)
            end
        end
    end
    -- 2. build modes, where the game should be most willing
    for _, place in ipairs(places) do
        if place.label:find("platform far + real", 1, true) or (not platform and place.label:find("lab + real", 1, true)) then
            experiment("full", place, nil, nil, defines.build_mode.normal, "normal")
            experiment("full", place, nil, nil, defines.build_mode.superforced, "superforced")
        end
    end
    -- 3. each entity kind alone (no tiles) on real foundation, and the game's own placement verdict for it
    local kinds, by_kind = {}, {}
    for _, entity in pairs(entities) do
        if not by_kind[entity.name] then
            by_kind[entity.name] = {}
            table.insert(kinds, entity.name)
        end
        -- alone, without wires to entities that are not in the experiment
        local copy = {}
        for key, value in pairs(entity) do
            if key ~= "wires" then
                copy[key] = value
            end
        end
        table.insert(by_kind[entity.name], copy)
    end
    table.sort(kinds)
    if #kinds > MAX_KINDS then
        note("[diagnose] " .. #kinds .. " entity kinds; only the first " .. MAX_KINDS .. " are tried alone", { note = "kinds truncated" })
    end
    local verdict_places = {}
    for _, place in ipairs(places) do
        -- not at the hub: everything there collides with the hub itself
        if foundation and place.prelay == foundation and not place.label:find("at hub", 1, true) then
            table.insert(verdict_places, place)
        end
    end
    for index, kind in ipairs(kinds) do
        if index > MAX_KINDS then
            break
        end
        for _, place in ipairs(verdict_places) do
            experiment("only " .. kind, place, by_kind[kind], {})
        end
        local verdicts = {}
        local first = by_kind[kind][1]
        for _, place in ipairs(verdict_places) do
            local answered, text = pcall(function()
                local position = spot(place)
                local function check(name, inner, check_type)
                    return place.surface.can_place_entity({
                        name = name, inner_name = inner, position = position, direction = first.direction,
                        force = game.forces.player, build_check_type = check_type, forced = true,
                    }) and "yes" or "no"
                end
                return "ghost " .. check("entity-ghost", kind, defines.build_check_type.blueprint_ghost)
                    .. ", entity " .. check(kind, nil, defines.build_check_type.script)
            end)
            table.insert(verdicts, place.label .. ": " .. (answered and text or ("error: " .. tostring(text))))
        end
        if #verdicts > 0 then
            note("[diagnose] can_place_entity " .. kind .. " | " .. table.concat(verdicts, " | "),
                { can_place = kind, verdicts = verdicts })
        end
    end

    -- clean up the scratch surfaces and platform
    pcall(build.remove, prefix .. "-lab")
    pcall(build.remove, prefix .. "-platform")
    return { lines = lines, experiments = experiments }
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
