-- Blueprint Vault Render: the launcher (_tools/render) drives this mod over RCON, one blueprint at a time:
--   reset()            forget any partly sent blueprint string
--   append(part)       add the next part of a blueprint string (sent in parts to keep RCON commands short)
--   inspect()          what kind of blueprint the string sent so far is (JSON: platform, reasons, platforms_available)
--   setup()            once per session: research all technologies and enable all recipes (JSON report)
--   build(job_json)    build the string sent so far; job = {surface = "<name>", strategy = "ordinary"|"platform",
--                      backdrop = {"<tile>", "<tile>"} (optional: replaces lab-dark-1 and lab-dark-2)};
--                      returns a JSON report. The string is kept, so another strategy can be tried after it.
--   diagnose(prefix)   run the experiment matrix of build.diagnose on scratch surfaces named <prefix>-*; JSON
--                      {lines = [...], experiments = [...]}
--   prepare(surface)   just before a screenshot: remove asteroids from a platform surface
--   delete(name)       remove the surface or platform build made under that name
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
    ---@return string
    setup = function()
        local ok, report = pcall(build.setup)
        if not ok then
            report = { error = tostring(report) }
        end
        return helpers.table_to_json(report)
    end,
    ---@return string
    inspect = function()
        local ok, report = pcall(build.inspect, table.concat(parts()))
        if not ok then
            report = { error = tostring(report) }
        end
        return helpers.table_to_json(report)
    end,
    build = function(job_json)
        local job = helpers.json_to_table(job_json)
        if type(job) ~= "table" or type(job.surface) ~= "string" or (job.strategy ~= "ordinary" and job.strategy ~= "platform") then
            return helpers.table_to_json({ error = "build needs a job {surface = <name>, strategy = \"ordinary\"|\"platform\"}" })
        end
        local ok, report = pcall(build.run, table.concat(parts()), job.surface, job.strategy, job.backdrop)
        if not ok then
            report = { error = tostring(report), strategy = job.strategy }
        end
        return helpers.table_to_json(report)
    end,
    ---@param prefix string
    ---@return string
    diagnose = function(prefix)
        local ok, report = pcall(build.diagnose, table.concat(parts()), prefix)
        if not ok then
            report = { error = tostring(report) }
        end
        return helpers.table_to_json(report)
    end,
    ---@param name string
    ---@return string
    prepare = function(name)
        local surface = game.surfaces[name]
        return tostring(surface and build.clear_asteroids(surface) or 0)
    end,
    ---@param name string
    ---@return string
    delete = function(name)
        local ok, message = pcall(build.remove, name)
        return ok and "ok" or ("error: " .. tostring(message))
    end,
})
