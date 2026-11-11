-- Hide entity status icons that would clutter a screenshot of an unpowered, unfuelled build, without touching
-- alt-mode info (recipe, module and fluid icons stay). Only the documented prototype flags are used:
--   BaseEnergySource::render_no_power_icon (also covers the "no fuel" icon of burner energy sources)
--   BaseEnergySource::render_no_network_icon
--   LogisticContainerPrototype / InfinityContainerPrototype / RocketSiloPrototype::render_not_in_network_icon
--   RoboportPrototype::render_recharge_icon
-- This mod only ever runs in the launcher's own mod directory, so changing every prototype is harmless.

local ok, options = pcall(require, "render-options")
if not ok or type(options) ~= "table" then
    options = {}
end
if options.hide_status_icons == false then
    return
end

local ENERGY_SOURCE_KEYS = { "energy_source", "burner" }
local ENERGY_SOURCE_TYPES = { electric = true, burner = true, heat = true, fluid = true, void = true }
local NOT_IN_NETWORK_TYPES = { ["logistic-container"] = true, ["infinity-container"] = true, ["rocket-silo"] = true }

for type_name, of_type in pairs(data.raw) do
    for _, prototype in pairs(of_type) do
        if type(prototype) == "table" then
            for _, key in ipairs(ENERGY_SOURCE_KEYS) do
                local source = prototype[key]
                if type(source) == "table" and ENERGY_SOURCE_TYPES[source.type] then
                    source.render_no_power_icon = false
                    source.render_no_network_icon = false
                end
            end
            if NOT_IN_NETWORK_TYPES[type_name] then
                prototype.render_not_in_network_icon = false
            end
            if type_name == "roboport" then
                prototype.render_recharge_icon = false
            end
        end
    end
end
