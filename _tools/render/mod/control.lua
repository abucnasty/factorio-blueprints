-- Blueprint Vault Render: the launcher (_tools/render) drives this mod over RCON, one blueprint at a time:
--   reset()            forget any partly sent blueprint string
--   append(part)       add the next part of a blueprint string (sent in parts to keep RCON commands short)
--   build(job_json)    build the string sent so far on a new surface; job = {surface = "<name>"}; returns a JSON report
--   delete(name)       delete a surface made by build
-- Every call returns a string for rcon.print. The launcher takes the screenshots itself with game.take_screenshot.
-- The RCON and remote-interface pattern comes from clock-generator-recorder (abucnasty/clock-generator, MIT).

local build = require("scripts.build")

local INTERFACE = "blueprint-vault-render"

local function parts()
    storage.parts = storage.parts or {}
    return storage.parts
end

script.on_init(function()
    storage.parts = {}
end)

remote.add_interface(INTERFACE, {
    ---@return string
    reset = function()
        storage.parts = {}
        return "ok"
    end,
    ---@param part string
    ---@return string
    append = function(part)
        local list = parts()
        list[#list + 1] = part
        return tostring(#list)
    end,
    ---@param job_json string
    ---@return string
    build = function(job_json)
        local job = helpers.json_to_table(job_json)
        local blueprint = table.concat(parts())
        storage.parts = {}
        if type(job) ~= "table" or type(job.surface) ~= "string" then
            return helpers.table_to_json({ error = "build needs a job {surface = <name>}" })
        end
        local ok, report = pcall(build.run, blueprint, job.surface)
        if not ok then
            report = { error = tostring(report) }
        end
        return helpers.table_to_json(report)
    end,
    ---@param name string
    ---@return string
    delete = function(name)
        local surface = game.surfaces[name]
        if surface then
            game.delete_surface(surface)
        end
        return "ok"
    end,
})
