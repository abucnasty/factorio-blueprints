-- Builds one blueprint string as real entities on a fresh surface of its own, for a screenshot.
--
-- Ported and trimmed from abucnasty/clock-generator (MIT), clock-generator-recorder/scripts/harness.lua:
-- import_stack, build_blueprint in forced mode, the offset search (blueprint_offset), ore under drills
-- (place_drill_ore), reviving rolling stock after rails, filling item requests (fulfil_item_requests) and the
-- built bounding box. New here: a lab-tile surface per blueprint, blueprint tiles, and a report of what could
-- not be placed instead of an error.

local build = {}

local ROLLING_STOCK_TYPES = { ["cargo-wagon"] = true, ["fluid-wagon"] = true, ["artillery-wagon"] = true, ["locomotive"] = true }
-- Resources tried first under a drill, so a plain drill sits on plain ore; any resource it can mine is the fallback
local PREFERRED_RESOURCES = { "iron-ore", "crude-oil", "stone", "coal", "copper-ore" }
-- Room around the blueprint's own extent: for the floor laid before the offset is known, and for chunk generation
local MARGIN_TILES = 8

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

---The most common tile of the blueprint, laid under the whole build before the offset is known: entities that need
---a particular floor (a space platform's foundation) only get ghosts on it
local function most_common_tile(tiles)
    local counts, best, best_count = {}, nil, 0
    for _, tile in pairs(tiles) do
        count(counts, tile.name)
        if counts[tile.name] > best_count then
            best, best_count = tile.name, counts[tile.name]
        end
    end
    return best
end

---Build a blueprint string on a new surface named `surface_name`.
---@param blueprint string a blueprint string of one blueprint (not a book)
---@param surface_name string
---@return table report
function build.run(blueprint, surface_name)
    if game.surfaces[surface_name] then
        error("surface " .. surface_name .. " already exists")
    end
    local inventory = game.create_inventory(1)
    local stack = inventory[1]
    local imported = stack.import_stack(blueprint)
    -- 0: imported, -1: imported with errors (e.g. unknown entities), 1: failed
    if imported == 1 or not stack.valid_for_read or not stack.is_blueprint then
        inventory.destroy()
        return { error = "the game could not import the blueprint string (import_stack returned " .. tostring(imported) .. ")" }
    end
    if not stack.is_blueprint_setup() then
        inventory.destroy()
        return { error = "the blueprint is empty" }
    end
    local blueprint_entities = stack.get_blueprint_entities() or {}
    local blueprint_tiles = stack.get_blueprint_tiles() or {}
    local wanted = {}
    local has_drill = false
    for _, entity in pairs(blueprint_entities) do
        count(wanted, entity.name)
        local prototype = prototypes.entity[entity.name]
        has_drill = has_drill or (prototype ~= nil and prototype.type == "mining-drill")
    end

    local left, top, right, bottom = blueprint_extent(blueprint_entities, blueprint_tiles)
    if left > right then
        inventory.destroy()
        return { error = "the blueprint has no entities or tiles" }
    end
    local half_width = math.ceil((right - left) / 2) + MARGIN_TILES
    local half_height = math.ceil((bottom - top) / 2) + MARGIN_TILES
    local position = { x = 0, y = 0 }

    local surface = game.create_surface(surface_name)
    surface.generate_with_lab_tiles = true
    surface.always_day = true
    surface.show_clouds = false
    surface.ignore_surface_conditions = true
    surface.request_to_generate_chunks(position, math.ceil(math.max(half_width, half_height) / 32) + 1)
    surface.force_generate_chunk_requests()
    local force = game.forces.player
    local floor_area = {
        left_top = { x = position.x - half_width, y = position.y - half_height },
        right_bottom = { x = position.x + half_width, y = position.y + half_height },
    }

    local function build_ghosts()
        return stack.build_blueprint({
            surface = surface,
            force = force,
            position = position,
            build_mode = defines.build_mode.forced,
            skip_fog_of_war = false,
        })
    end

    local problems = {}
    local placed_tiles, ores = 0, 0
    -- where the blueprint's tiles went, for the area to frame
    local tile_positions = {}
    local floor = most_common_tile(blueprint_tiles)
    if floor then
        local cover = {}
        for x = floor_area.left_top.x, floor_area.right_bottom.x - 1 do
            for y = floor_area.left_top.y, floor_area.right_bottom.y - 1 do
                table.insert(cover, { name = floor, position = { x = x, y = y } })
            end
        end
        local ok, message = pcall(function() surface.set_tiles(cover, true, false) end)
        if not ok then
            table.insert(problems, "could not lay " .. floor .. " to find the offset: " .. tostring(message))
        end
    end
    local ghosts = build_ghosts()

    if floor or has_drill then
        -- Where the blueprint went, from its ghosts; then the real floor and ore, and the blueprint built again on them
        local offset = blueprint_offset(blueprint_entities, ghosts)
        if not offset and #blueprint_entities == 0 then
            -- tiles only: nothing to line them up with, so centre them
            offset = { x = position.x - math.floor((left + right) / 2), y = position.y - math.floor((top + bottom) / 2) }
        end
        destroy_all(ghosts)
        if floor then
            surface.build_checkerboard(floor_area)
        end
        if offset then
            if #blueprint_tiles > 0 then
                local tiles = {}
                for _, tile in pairs(blueprint_tiles) do
                    table.insert(tiles, {
                        name = tile.name,
                        position = { x = math.floor(tile.position.x + offset.x + 0.5), y = math.floor(tile.position.y + offset.y + 0.5) },
                    })
                end
                local ok, message = pcall(function() surface.set_tiles(tiles, true, false) end)
                if ok then
                    placed_tiles = #tiles
                    for _, tile in pairs(tiles) do
                        table.insert(tile_positions, tile.position)
                    end
                else
                    table.insert(problems, "could not place the blueprint's tiles: " .. tostring(message))
                end
            end
            if has_drill then
                ores = place_drill_ore(surface, blueprint_entities, offset)
            end
        else
            table.insert(problems, "could not tell where the blueprint was built, so its tiles and drill ore were not placed")
        end
        ghosts = build_ghosts()
    end
    inventory.destroy()

    -- a wagon is only built on rails, which a blueprint may list after it: rolling stock is revived after everything else
    local order = {}
    for index, ghost in ipairs(ghosts) do
        if not (ghost.valid and ghost.type == "entity-ghost" and ROLLING_STOCK_TYPES[ghost.ghost_type]) then
            table.insert(order, index)
        end
    end
    for index, ghost in ipairs(ghosts) do
        if ghost.valid and ghost.type == "entity-ghost" and ROLLING_STOCK_TYPES[ghost.ghost_type] then
            table.insert(order, index)
        end
    end
    local entities, built, failed = {}, {}, {}
    for _, index in ipairs(order) do
        local ghost = ghosts[index]
        if ghost.valid and ghost.type == "entity-ghost" then
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
        elseif ghost.valid and ghost.type == "tile-ghost" then
            ghost.revive()
        end
    end
    -- what could not be revived would otherwise be drawn as ghosts
    destroy_all(ghosts)

    -- entities that never got a ghost (no water for an offshore pump, an entity of a missing mod) are in no list yet
    local missing = {}
    for name, wanted_count in pairs(wanted) do
        local short = wanted_count - (built[name] or 0) - (failed[name] or 0)
        if short > 0 then
            missing[name] = short
        end
    end

    local area_left, area_top, area_right, area_bottom = math.huge, math.huge, -math.huge, -math.huge
    for _, entity in pairs(entities) do
        if entity.valid then
            local box = entity.bounding_box
            area_left, area_top = math.min(area_left, box.left_top.x), math.min(area_top, box.left_top.y)
            area_right, area_bottom = math.max(area_right, box.right_bottom.x), math.max(area_bottom, box.right_bottom.y)
        end
    end
    for _, tile in pairs(tile_positions) do
        area_left, area_top = math.min(area_left, tile.x), math.min(area_top, tile.y)
        area_right, area_bottom = math.max(area_right, tile.x + 1), math.max(area_bottom, tile.y + 1)
    end
    local area = nil
    if area_left < area_right and area_top < area_bottom then
        area = { left_top = { x = area_left, y = area_top }, right_bottom = { x = area_right, y = area_bottom } }
        force.chart(surface, area)
    end

    return {
        surface = surface.name,
        area = area,
        built = #entities,
        tiles = placed_tiles,
        ores = ores,
        failed = failed,
        missing = missing,
        import_errors = imported == -1,
        problems = problems,
        tick = game.tick,
    }
end

return build
