--[[
"Infinite 'Bag' Riftbound Deck Loader" by DXHHH101

This is an infinite "bag" that will attempt to update its own code.
After it does so (if it needs to), it will attempt to let the
deck loader inside of it.

Feel free to contribute if you spot a bug or something to improve!
https://github.com/DXHHH101/TabletopSimulatorScripts
]]

-- ============================================================================
-- Variables GITHUB AUTO-UPDATE
-- ============================================================================
local ScriptVersion = "1.0.0"
local ScriptClass = 'RiftboundImporter.InfiniteDeckloaderMat'
local checkUpdateTimeout = 1

-- ============================================================================
-- GITHUB AUTO-UPDATE
-- ============================================================================
--(originally written by ThatRobHuman, heavily modified by DXHHH101)
local function isNewerVersion(r,l)
    local a,b,c = r:match("(%d+)%.(%d+)%.(%d+)")
    local x,y,z = l:match("(%d+)%.(%d+)%.(%d+)")
    a,b,c,x,y,z = tonumber(a),tonumber(b),tonumber(c),tonumber(x),tonumber(y),tonumber(z)
    return a>x or (a==x and (b>y or (b==y and c>z)))
end

local function installUpdate(newVersion)
    self.setVar("updateFinished", true)
end

local function checkForUpdates()
    if Global.getVar("DXRiftboundScriptVersions_fetchFailed") then
        error("Remote version check previously failed.")
        self.setVar("updateFinished", true) --used for the infinite bag object
        return
    end


    if Global.getVar("DXRiftboundScriptVersions_isFetching") then
        if checkUpdateTimeout <= 5 then
            Wait.time(checkForUpdates, 1)
            checkUpdateTimeout = checkUpdateTimeout + 1
            return
        else 
            error("Failed to check for DX Riftbound script updates.")
        end
    else
        local allRemoteVersions = Global.getTable("DXRiftboundScriptVersions")
        if not allRemoteVersions then
            Global.setVar("DXRiftboundScriptVersions_isFetching", true)
            WebRequest.get('https://raw.githubusercontent.com/DXHHH101/TabletopSimulatorScripts/refs/heads/main/ScriptVersions.json' .. "?t=" .. tostring(os.time()), function(res)
                if (not(res.is_error)) then
                    local response = JSON.decode(res.text)
                    Global.setTable("DXRiftboundScriptVersions", response)
                    Global.setVar("DXRiftboundScriptVersions_isFetching", false)

                    local remoteVersion = response[ScriptClass]
                    if not remoteVersion then
                        self.setVar("updateFinished", true)
                    elseif isNewerVersion(remoteVersion, ScriptVersion) then
                        installUpdate(remoteVersion)
                    end
                else
                    Global.setVar("DXRiftboundScriptVersions_fetchFailed", true)
                    Global.setVar("DXRiftboundScriptVersions_isFetching", false)
                    error("Failed to fetch DX Riftbound script versions: " .. tostring(res and res.error))
                    self.setVar("updateFinished", true) --used for the infinite bag object
                end
            end)
            return
        else
            local remoteVersion = allRemoteVersions[ScriptClass]
            if not remoteVersion then
                self.setVar("updateFinished", true)
            elseif isNewerVersion(remoteVersion, ScriptVersion) then
                installUpdate(remoteVersion)
                return
            end
        end
    end
    self.setVar("updateFinished", true) --used for the infinite bag object
end

local function checkCurrentVersion(script_state)
    local state = {}
    if script_state ~= "" then
        state = JSON.decode(script_state) or {}
    end
    --Will skip an update check once when the object is reloaded after updating
    if state.updatedTo ~= ScriptVersion then
        checkForUpdates()
    else
        state.updatedTo = nil
        self.script_state = JSON.encode(state)
        self.setVar("updateFinished", true) --used for the infinite bag object
    end
end

-- ============================================================================
-- LIFECYCLE
-- ============================================================================
local function patchFirstPulledObject()
    self.takeObject({
        position = self.getPosition() + Vector(0, -1000, 0),
        smooth = false,
        callback_function = function(obj)
            local objGUID = obj.getGUID()
            local cancelWait = false
            obj.setLock(true)

            self.setName("[00B4FF]Riftbound Deck Loader[-] [EF8B06]DX[-]")

            Wait.frames(function()
                self.setDescription(obj.getDescription())
            end, 1)

            Wait.condition(
                function()
                    if cancelWait then
                        return
                    end

                    local newObjectRef = getObjectFromGUID(objGUID)
                    if not newObjectRef or newObjectRef.isDestroyed() then
                        return
                    end

                    self.reset()
                    newObjectRef.setLock(false)

                    Wait.frames(function()
                        self.setDescription(newObjectRef.getDescription())
                        self.putObject(newObjectRef)
                    end, 1)
                    
                end,
                function()
                    local newObjectRef = getObjectFromGUID(objGUID)

                    if not newObjectRef or newObjectRef.isDestroyed() then
                        return false
                    end

                    local updateFinished = newObjectRef.getVar("updateFinished")

                    if updateFinished == true then
                        return true
                    elseif updateFinished == "kill" then
                        newObjectRef.destruct()
                        cancelWait = true
                        return true
                    end

                    return false
                end,
                20,
                function()
                    local newObjectRef = getObjectFromGUID(objGUID)
                    if newObjectRef and not newObjectRef.isDestroyed() then
                        self.setName("[00B4FF]Riftbound Deck Loader[-] [EF8B06]DX[-]")
                        newObjectRef.destruct()
                    end
                end
            )
        end
    })
end

function onLoad(script_state)
    checkCurrentVersion(script_state)

    local isReloading = false
    Wait.condition(
        function()
            if not isReloading then
                patchFirstPulledObject()
            end
        end,
        function()
            local updateFinished = self.getVar("updateFinished")
            if updateFinished then
                return true
            elseif updateFinished == "reload" then
                isReloading = true
            else
                return false
            end
        end,
        20,
        function()
            patchFirstPulledObject()
        end

    )
    
end
