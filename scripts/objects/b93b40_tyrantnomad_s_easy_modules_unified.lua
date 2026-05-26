-- Easy Modules Unified — modified for the Riftbound TTS table in this repo.
-- Do not drop this script onto another table AS-IS; it expects this save's Encoder,
-- Riftbound Card Importer, and Riftbound-specific card data.
--
-- Lineage: @TyrantNomad (original), then π's MTG 4-player table fork; this version
-- strips MTG-only UI (planeswalkers, loyalty, battles, etc.) and targets Might.
-- TyrantNomad's unmodified module:
-- https://steamcommunity.com/sharedfiles/filedetails/?id=2246039633
--
-- Built around the Encoder by Tipsy Hobbit (steam_id: 13465982).

moduleVersion = 3.14159265358979
pID = "_RB_Simplified_UNIFIED"

isRegistered = false

unifiedGithubLink = ""

function onload(saved_data)
    -- pieHere, do not auto-update (I want my buttons to stay as they are)
    -- WebRequest.get(unifiedGithubLink, self, "SelfUpdateCheck")

    local dataTable = {recursiveCall=false}
    ProcessSavedData(saved_data)
    InitializeDeckTables()
    TryAutoRegister(dataTable)
    CreateModuleChipButtons()
 end

function SelfUpdateCheck(webRequest)
    local gitVersion = tonumber(webRequest.text:match('moduleVersion%s=%s(%d+%.%d+)'))

    if gitVersion ~= nil and gitVersion > moduleVersion then
        self.script_code = webRequest.text
        self.reload()
    end
end

function onSave()
    local data_to_save = {
        autoActivateModule = autoActivateModule,
        autoActivatePlayerSettings = autoActivatePlayerSettings,
        autoActivateMight = autoActivateMight,
        autoActivatePlusOne = autoActivatePlusOne,
        autoActivateDFC = autoActivateDFC,
        autoActivateOwnership = autoActivateOwnership
    }
    local saved_data = JSON.encode(data_to_save)
    return saved_data
end

autoActivateModule = true
autoActivatePlayerSettings = {}
autoActivateMight = false
autoActivatePlusOne = true
autoActivateDFC = true
autoActivateOwnership = true
function ProcessSavedData(saved_data)
    if saved_data ~= nil and saved_data ~= "" then
        --print(saved_data)
        local loaded_data = JSON.decode(saved_data)
        autoActivateModule = loaded_data.autoActivateModule == nil and true or loaded_data.autoActivateModule
        autoActivatePlayerSettings = loaded_data.autoActivatePlayerSettings == nil and autoActivatePlayerSettings or loaded_data.autoActivatePlayerSettings
        if loaded_data.autoActivateMight == nil and loaded_data.autoActivateCounter ~= nil then
            autoActivateMight = loaded_data.autoActivateCounter
        else
            autoActivateMight = loaded_data.autoActivateMight == nil and false or loaded_data.autoActivateMight
        end
        autoActivatePlusOne = loaded_data.autoActivatePlusOne == nil and true or loaded_data.autoActivatePlusOne
        autoActivateDFC = loaded_data.autoActivateDFC == nil and true or loaded_data.autoActivateDFC
        autoActivateOwnership = loaded_data.autoActivateOwnership == nil and true or loaded_data.autoActivateOwnership
    end
end

function TryAutoRegister(data)
    if data.recursiveCall then
        RegisterModule()
    else
        local dataTable = {recursiveCall=true}
        Timer.destroy("unifiedModuleAutoRegister")
        Timer.create({
            identifier = "unifiedModuleAutoRegister",
            function_name = "TryAutoRegister",
            function_owner = self,
            parameters = dataTable,
            delay = 2
        })
    end
end

function ForceEncoderUpdate(placeholderCode)
    local placeholderCode = placeholderCode.text

    local encoder = Global.getVar('Encoder')
    if encoder ~= nil then
        encoder.script_code = placeholderCode
        encoder.reload()

        local dataTable = {recursiveCall=false}
        TryAutoRegister(dataTable)
    else broadcastToAll("[888888][EASY MODULES][-]\nFailed to find Encoder to update") end
end

function ForcePlaceholderDependency(placeholderCode, moduleName)
    local placeholderCode = placeholderCode.text
    spawnParams = {
        type = "reversi_chip",
        name = "[FF0000]PLACEHOLDER [-]"..moduleName,
        description = "Just go [FFCC00]get the real thing on the Steam Workshop[-] already\n [FF0000]...YOU STINKY LAZY-BUTT",
        position = {0, 5, 0},
        scale = {4, 32, 4},
        sound = false,
        callback_function = function(obj) AttachCodeToPlaceholder(obj, placeholderCode) end
    }

    spawnObject(spawnParams)
end

function ForcePlaceholderEncoder(placeholderCode)
    ForcePlaceholderDependency(placeholderCode, "Encoder")

    local dataTable = {recursiveCall=false}
    TryAutoRegister(dataTable)
end

function AttachCodeToPlaceholder (placeholderObject, placeholderCode)
    placeholderObject.script_code = placeholderCode
    placeholderObject.reload()
end

function CreateModuleChipButtons()
    local enc = Global.getVar('Encoder')
    if enc ~= nil then
        isRegistered = enc.call("APIpropertyExists",{propID = pID})
    else
        isRegistered = false
    end

    self.createButton({
        label = "TyrantNomad's",
        click_function=("DoNothing"),
        function_owner=self,

        position={0,0.15,-0.4},
        rotation = {0,0,0},

        height=0,
        width=0,

        font_size = 60,
        font_color = {1,156/255,196/255}
    })

    self.createButton({
        click_function="DoNothing",
        function_owner=self,
        position={0,0.15,-0.155},
        rotation={180,0,0},

        height= 116,
        width= 800,

        color = {90/255,24/255,51/255}
    })

    self.createButton({
        label= "EASY MODULES",
        click_function="DoNothing",
        function_owner=self,
        position={0,0.15,-0.155},

        height= 0,
        width= 0,

        color = {90/255,24/255,51/255},

        font_size = 100,
        font_color = {1,156/255,196/255}
    })

    self.createButton({
        label = "VERSION "..moduleVersion,
        click_function=("DoNothing"),
        function_owner=self,

        position={0,0.15,0.075},
        rotation = {0,0,0},

        height=0,
        width=0,

        font_size = 60,
        font_color = {1,156/255,196/255}
    })

    self.createButton({
        label=(isRegistered and "REGISTERED" or "ADD MODULE"),
        click_function="DoNothing",
        function_owner=self,

        position={0,0.15,0.33},

        height=0,
        width=0,

        font_size = 60,
        font_color = (isRegistered and {1,156/255,196/255} or {90/255,24/255,51/255})
    })

    self.createButton({
        click_function=(isRegistered and "DoNothing" or "RegisterModule"),
        function_owner=self,

        position={0,0.15,0.33},
        rotation = (isRegistered and {180,0,0} or {0,0,0}),

        color = (isRegistered and {238/255, 25/255, 110/255} or {1,156/255,196/255}),
        hover_color = {90/255,24/255,51/255},

        height=60,
        width=450,
    })

    self.createButton({
        label = "AUTO "..(autoActivateModule and "ON" or "OFF"),
        tooltip = "When ON, automatically activates the module, showing the easy-toggle menu on the left side of cards",

        click_function = "ToggleAutoActivate",
        function_owner = self,

        font_color = (autoActivateModule and {1,156/255,196/255} or {90/255,24/255,51/255}),
        color = (autoActivateModule and {238/255, 25/255, 110/255} or {1,156/255,196/255}),
        hover_color = {90/255,24/255,51/255},

        position={0,-0.15,0},
        rotation = {180,180,0},

        width = 600,
        height = 80
    })
end

function ClearModuleChipButtons()
    local chipButtons = self.getButtons()
    for index,button in pairs(chipButtons) do
        self.removeButton(index -1)
    end
end

function RefreshModuleChipButtons()
    ClearModuleChipButtons()
    CreateModuleChipButtons()
end

encVersion = 0
--external auto-registration compatibility
function registerModule() RegisterModule() end
function RegisterModule()
    --better to always try to register in case of object reloading
    --if isRegistered then return end

    local enc = Global.getVar('Encoder')
    if enc ~= nil then
        RefreshEncoderVersion(enc)
        if encVersion < 4.2 then
            broadcastToAll("[888888][EASY MODULES][-]\nEncoder version too old. To use this module, manually upgrade it to v4.20+ or type 'force encoder update' to attempt a forced update")
            return
        end

        local properties
        if encVersion < 4.4 then
            properties = {
                propID = pID,
                name = "Easy Modules Unified",
                values = {"tyrantUnified"},
                funcOwner = self,
                callOnActivate = false,
                visible = false,
                activateFunc =''
            }
        else
            properties = {
                propID = pID,
                name = "Easy Modules Unified",
                values = {"tyrantUnified"},
                funcOwner = self,
                tags="basic,counter",
                visible = false,
                visible_in_hand=0,
                activateFunc ='ModuleActivation'
            }
        end
        enc.call("APIregisterProperty",properties)

        local value = {
            valueID = 'tyrantUnified',
            validType = 'nil',
            desc = "why do my values have descriptions",
            default = {
                hasParsed = false,
                exactCopyOffset = 0,

                activeFace = 1,
                doubleFaceType = "none",
                doubleFaceStates = false,
                cardFaces = {
                    {baseMight = 0},
                    {baseMight = 0} --backface
                },

                --[[
                face types:
                "none", single-faced card
                "split", two cards in a single face side by side
                "flip", two cards in a single face in opposite orientations, sharing a central art
                "oldImport", DFC (!/null) - old importer DFC, button should reimport card
                "modal", DFC (^/^v) - at least one side is a non-legendary land
                "weredrazi", DFC(full moon/squid thing) - back side is type eldrazi
                "discovery", DFC(compass/land) - back side is type legendary land
                "werecard", DFC(sun/crescent moon) - any other card that transforms
                --]]

                might = 0,
                plusOneCounters = 0,

                displayCounters = false,
                displayPlusOne = false,
                displayOwnership = true,
                displayDFC = false,


                ownerColor = "Grey",
                controllerColor = "Grey"
            }
        }
        enc.call("APIregisterValue",value)

        -- BroadcastSettings()
        -- broadcastToAll("Type [FFCC00]'modules help'[-] to list commands")

        RefreshModuleChipButtons()
    else
        broadcastToAll("[888888][EASY MODULES][-]\nNo encoder found. You need [FFCC00]Encoder v4.20+ by Tipsy Hobbit (steam_id: 13465982)[-] to use the module")
        broadcastToAll("[888888][EASY MODULES][-]\nGet the Encoder from the Steam Workshop or type [FFCC00]'force encoder temporary'[-] to spawn a placeholder")
    end
end

function RefreshEncoderVersion(encoder)
    encVersion = tonumber(encoder.getVar("version"):match("%d+%.%d+"))
end

function ModuleActivation(obj,ply)
    enc.call("APItoggleProperty",{obj=obj,propID=pID})
end

function onChat(message, player)
    local message = string.lower(message)

    if string.find(message,'^force encoder') ~= nil then
        if string.find (message,'update') ~= nil then
            WebRequest.get("https://raw.githubusercontent.com/Jophire/Tabletop-Simulator-Workshop-Items/master/Encoder/Encoder%20Core.lua", self, "ForceEncoderUpdate")
        elseif string.find (message,'temporary') ~= nil then
            WebRequest.get("https://raw.githubusercontent.com/Jophire/Tabletop-Simulator-Workshop-Items/master/Encoder/Encoder%20Core.lua", self, "ForcePlaceholderEncoder")
        elseif string.find (message, 'reload') ~= nil then
            enc = Global.getVar("Encoder")
            if enc ~= nil then
                BroadcastToAll("Reloading Encoder object")
                enc.reload()
            end
        end
    end

    if string.find(message, 'auto') ~= nil then
        --multi-setting supported ex 'auto might plusone off' should set both
        local targetState = message:find('%son') and true or (message:find('%soff') == nil and nil or false)
        if targetState == nil then return end

        local changedAnything = false
        if message:find('might') then
            autoActivateMight = targetState
            changedAnything = true
        end

        if message:find('plusone') then
            autoActivatePlusOne = targetState
            changedAnything = true
        end

        if message:find('encode') then
            autoActivateModule = targetState
            changedAnything = true
        end

        if message:find('dfc') or message:find('double%-faced') then
            autoActivateDFC = targetState
            changedAnything = true
        end

        if message:find('owner') or message:find('control') then
            autoActivateOwnership = targetState
            changedAnything = true
        end

        if message:find('player') then
            autoActivatePlayerSettings[player.steam_id] = targetState and targetState or false
            local targetString = targetState and "[00FF00]ENABLED [-]" or "[FF0000]DISABLED [-]"
            local hexColor = Color.fromString(player.color):toHex(false)
            broadcastToAll("[BBBBBB]Auto-encoding "..targetString.."for ["..hexColor.."]"..player.steam_name.."[-]")
        end

        if changedAnything then BroadcastSettings() end
    end

    if string.find(message, '^module') ~= nil then
        if message:find('help') then BroadcastCommands() end
        if message:find('setting') then BroadcastSettings() end
        if message:find('update') then SelfUpdateCheck() end
    end
end

function BroadcastSettings()
    broadcastToAll("\n[888888][EASY MODULES][-] v"..moduleVersion.." - Auto-encode "..(autoActivateModule and "[00FF00]ON[-]" or "[FF0000]OFF[-]").." - Auto settings:")

    autoMightText = autoActivateMight and "[FFCC00]ON[-]" or "[BBBBBB]OFF[-]"
    autoPlusOneText = autoActivatePlusOne and "[FFCC00]ON[-]" or "[BBBBBB]OFF[-]"
    autoDFCtext = autoActivateDFC and "[FFCC00]ON[-]" or "[BBBBBB]OFF[-]"
    autoOwnershipText = autoActivateOwnership and "[FFCC00]ON[-]" or "[BBBBBB]OFF[-]"

    broadcastToAll("Auto Might "..autoMightText.."     ".."Auto PlusOne "..autoPlusOneText)
    broadcastToAll("Auto Double-faced "..autoDFCtext.."     ".."Auto Ownership "..autoOwnershipText.."\n")

    if autoActivateModule == false then broadcastToAll("\n[FF0000]Auto-encoding is [FFFFFF]OFF[-] - Nothing will activate automatically.\nType [FFFFFF]'auto encode on'[-] to turn it back on\n")
    else
        for key, player in pairs(Player.getPlayers()) do
            if autoActivatePlayerSettings[player.steam_id] ~= nil then
            --honestly we don't really car to show this unless the player disabled it, I'll keep the string ready for it but let's avoid spamming too much
                if autoActivatePlayerSettings[player.steam_id] then else
                    local stateString = autoActivatePlayerSettings[player.steam_id] and "[00FF00]ENABLED [-]" or "[FF0000]DISABLED [-]"
                    local hexColor = Color.fromString(player.color):toHex(false)
                    broadcastToAll("[BBBBBB]Auto-encoding is "..stateString.."for ["..hexColor.."]"..player.steam_name.."[-]")
                end
            end
        end
        broadcastToAll("[BBBBBB]Each player can set their preference by typing [FFCC00]'auto [FFFFFF]player[-] on/off")
    end
end

function BroadcastCommands()
    broadcastToAll("[888888][EASY MODULES][-] Command List")
    broadcastToAll("force     [BBBBBB]encoder / importer[-]     reload[888888] - Reloads the object, use if they stop working")
    broadcastToAll("force     [BBBBBB]encoder / importer[-]     update[888888] - Replaces object script with most recent release")
    broadcastToAll("force     [BBBBBB]encoder / importer[-]     temporary[888888] - Creates a placeholder with that script")
    broadcastToAll("\nauto     [BBBBBB]player[-]     on / off[888888] - Changes auto-encoding settings for who sent the message")
    broadcastToAll("\nauto     [BBBBBB]encode / dfc / owner[-]     on / off[888888] - Changes auto-activation settings")
    broadcastToAll("auto     [BBBBBB]might / plusone[-]     on / off[888888] - Changes auto-activation settings")
    broadcastToAll("\nmodules     settings[888888] - Shows the current auto-activation settings")
    broadcastToAll("modules     help[888888] - Spams chat with 10 lines of text")
    broadcastToAll("[888888]You can [BBBBBB]stack commands[-] with the same starting word: [BBBBBB]'auto might plusone off'[-]")
end

function ToggleAutoActivate()
    autoActivateModule = not autoActivateModule
    RefreshModuleChipButtons()
end

function GetMightDisplayText(data)
    local activeFace = data.activeFace or 1
    local baseMight = data.cardFaces[activeFace]["baseMight"] or 0
    local mightText = baseMight
    mightText = tonumber(mightText) ~= nil and (mightText + data.might) or (data.might == 0 and mightText or data.might)
    return mightText
end

--external call compatibility casing
function createButtons(t)
    enc = Global.getVar('Encoder')

    if enc ~= nil then
        ParseCardData(t.obj, enc)

        local encData = enc.call("APIobjGetPropData",{obj=t.obj,propID=pID})
        local data = encData["tyrantUnified"]
        local flip = enc.call("APIgetFlip",{obj=t.obj})
        local scaler = {x=1,y=1,z=1}--t.obj.getScale()
        local activeFace = data.activeFace

        local riftboundImporter = getRiftboundImporter()

        local colorLightGrey = {177/255,177/255,177/255}
        local colorDarkGrey = {40/255,40/255,40/255}
        local colorCardBorderBlack = {19/255,16/255,12/255}

        local hexTooltipLowlight = "[BBBBBB]"
        local hexTooltipMidlight = "[DDDDDD]"
        local hexTooltipHighlight = "[FFCC00]"
        local hexTooltipBluelight = "[7799FF]"
        local hexTooltipRedlight = "[FF2222]"

        local rimSize = 30
        local counterHorizontalOffset = 0.87
        local counterZOffset = -1.3

        local cardOwner = data.ownerColor == nil and "Grey" or data.ownerColor
        local ownershipColor = Color.fromString(cardOwner)
        local ownerColorHex = ownershipColor:toHex(false)

        local cardController = data.controllerColor == nil and "Grey" or data.controllerColor
        local controlColor = Color.fromString(cardController)
        local controlColorHex = controlColor:toHex(false)
        --tooltips
        --pieHere, dont't want the extra text
        local multiSelectTooltip = ""
        local singleSelectTooltip = ""
        -- local multiSelectTooltip = hexTooltipHighlight.."AFFECTS ALL SELECTED CARDS[-]\n\n"
        -- local singleSelectTooltip = hexTooltipBluelight.."AFFECTS CLICKED CARD ONLY[-]\n\n"

        local buttonTooltipOwnershipGem =
            multiSelectTooltip..
            "CONTROLLER: ["..controlColorHex.."]"..cardController.."[-]\n"..
            "OWNER: ["..ownerColorHex.."]"..cardOwner.."[-]\n\n"..
            hexTooltipMidlight.."Click to become CONTROLLER[-]\n"..
            hexTooltipLowlight.."R-Click: Become OWNER[-]\n\n"..
            hexTooltipHighlight.."Button Below:[-]"..hexTooltipMidlight.." Toggle Ownership Gem"

        local buttonTooltipMightSingleClick =
            multiSelectTooltip..
            "Adds 1"..hexTooltipMidlight.." to Might[-]\n"..
            hexTooltipMidlight.."R-Click: "..hexTooltipLowlight.."Subtracts 1 instead[-]\n\n"..
            hexTooltipHighlight.."Button Below:[-]"..hexTooltipMidlight.." Add/Subtract 10[-]"

        local buttonTooltipMightTenClick =
            multiSelectTooltip..
            "Adds 10"..hexTooltipMidlight.." to Might[-]\n"..
            hexTooltipMidlight.."R-Click: "..hexTooltipLowlight.."Subtracts 10 instead[-]"

        local buttonTooltipPlusOneSingleClick =
            multiSelectTooltip..
            "Adds a +1"..hexTooltipMidlight.." to counters[-]\n"..
            hexTooltipMidlight.."R-Click: "..hexTooltipLowlight.."Subtracts instead[-]\n\n"..
            hexTooltipHighlight.."Button Below:[-]"..hexTooltipMidlight.." Add/Subtract 10[-]"

        local buttonTooltipPlusOneTenClick =
            multiSelectTooltip..
            "Adds +10"..hexTooltipMidlight.." to counters[-]\n"..
            hexTooltipMidlight.."R-Click: "..hexTooltipLowlight.."Subtracts instead[-]"

        local buttonTooltipToggleDisplayMight =
            multiSelectTooltip..
            hexTooltipHighlight..(data.displayCounters == true and "HIDE" or "SHOW").."[-]"..hexTooltipMidlight.." MIGHT\n"..
            hexTooltipLowlight.."Shows or hides the Might overlay on this card"
        local buttonTooltipToggleDisplayPlusOne =
            multiSelectTooltip..
            hexTooltipHighlight..(data.displayPlusOne == true and "HIDE" or "SHOW").."[-]"..hexTooltipMidlight.." +1 COUNTER\n"..
            hexTooltipLowlight.."Toggles +1 counter on the card"

        local buttonTooltipToggleDisplayOwnership =
            multiSelectTooltip..
            hexTooltipHighlight..(data.displayOwnership == true and "HIDE" or "SHOW").."[-]"..hexTooltipMidlight.." OWNERSHIP GEM\n"..
            -- hexTooltipLowlight.."Toggles Ownership Gem on the card"
            hexTooltipLowlight.."Toggles Ownership Gem on the card\n\n[sup][ffcccc][i]left click[/i] = highlight [b]on[/b]    [-][ccccff][i]right click[/i] = highlight [b]off[/b][/sup][-]"
        local buttonTooltipExactCopy =
            singleSelectTooltip..
            hexTooltipHighlight.."EXACT COPY[-]"..hexTooltipLowlight.." (SPAM-CLICKABLE)[-]\n"..
            hexTooltipMidlight.."Spawns an exact copy of this card including its encoder data[-]\n\n"..
            hexTooltipMidlight.."R-Click: "..hexTooltipLowlight.."Spawn a regular copy instead"
        local buttonTooltipReImport =
            singleSelectTooltip..
            hexTooltipHighlight.."RE-IMPORT[-]\n"..
            hexTooltipMidlight.."Re-imports this card through Riftseer\nand spawns it with an updated image[-]"

        local buttonTooltipReImportMissingImporter =
            hexTooltipHighlight.."RE-IMPORT[-]\n"..
            hexTooltipMidlight.."Re-imports this card through Riftseer\nand spawns it with an updated image[-]\n\n"..
            hexTooltipRedlight.."REQUIRES RIFTBOUND CARD IMPORTER[-]"

        local buttonTooltipFlipDFC =
            singleSelectTooltip..
            "[FFFFFF]FLIP TO [-]"..hexTooltipHighlight..(activeFace == 1 and "BACK" or "FRONT").."[-] FACE\n"..
            hexTooltipLowlight.."Flip the card and change the active face\n\n"..
            hexTooltipMidlight.."R-CLICK:\n[-]"..
            hexTooltipLowlight.."Changes active face without flipping[-]"

        local buttonTooltipFlipDFCbackless =
            hexTooltipRedlight.."NO BACK FACE IMAGE FOUND[-]\n"..
            "Click to reimport card \n\n"..
            hexTooltipMidlight.."R-CLICK:\n[-]"..
            hexTooltipLowlight.."Change active face without flipping[-]"

        local buttonTooltipFlipDFColdImport =
            hexTooltipRedlight.."BAD DATA - REIMPORT REQUIRED[-]\n"..
            "Click to reimport card \n\n"..
            hexTooltipMidlight.."R-CLICK:\n[-]"..
            hexTooltipLowlight.."Change active face without flipping[-]"

        if true then --side buttons, toggles on the left and utils on the right

          --------------------------------------------------------------------------------
          --pieHere: I create buttons on the card margins for show
          -- and then actual buttons are much larger at that location but invisible until mouse-over
          local buttonBackgroundColorOff = {0,0,0, 0}
          local buttonBackgroundColorOn =  {0,0,0, 0}
          local buttonBackgroundColorError = {0.6,0,0,   0}
          local buttonTextColorOff = {0.4,0.4,0.4,75}
          local buttonTextColorOn  = { 0.75,0.5,0,75}
          local buttonTextSize = 60
          local buttonDimensions = 0
          local verticalSpacing = 0.35
          local horizontalOffset = 1.025
          local verticalOffset = -0.9
          local rightVerticalOffset = -0.35

          --toggle plusone (top)
          t.obj.createButton({
              click_function = 'ToggleDisplayPlusOne',
              function_owner = self,

              label = "+1 ",
              font_size = buttonTextSize,
              font_color = data.displayPlusOne and buttonTextColorOn or buttonTextColorOff,
              tooltip = buttonTooltipToggleDisplayPlusOne,

              height = buttonDimensions,
              width = buttonDimensions,
              scale = {0.5,1,0.5},
              color = data.displayPlusOne and buttonBackgroundColorOn or buttonBackgroundColorOff,
              -- hover_color = buttonHoverColor,

              rotation = {0, 0, 90 - 90 * flip},
              position =
              {
                  -horizontalOffset * flip * scaler.x,
                  0.34*flip*scaler.z,
                  verticalOffset + 1 * verticalSpacing * scaler.y
              }
          })

          --toggle might overlay (below +1)
          t.obj.createButton({
              click_function = 'ToggleDisplayCounter',
              function_owner = self,

              label = "①",
              font_size = buttonTextSize + 8,
              font_color = data.displayCounters and buttonTextColorOn or buttonTextColorOff,
              tooltip = buttonTooltipToggleDisplayMight,

              height = buttonDimensions,
              width = buttonDimensions,
              scale = {0.5,1,0.5},
              color = data.displayCounters and buttonBackgroundColorOn or buttonBackgroundColorOff,
              -- hover_color = buttonHoverColor,

              rotation = {0, 0, 90 - 90 * flip},
              position =
              {
                 - horizontalOffset * flip * scaler.x,
                  0.34*flip*scaler.z,
                  verticalOffset + 0 * verticalSpacing * scaler.y
              }
          })

          --exact copy
          t.obj.createButton({
              click_function = "MakeExactCopy",
              function_owner = self,

              label = "❐",
              font_size = buttonTextSize + 6,
              font_color = buttonTextColorOff,
              tooltip = buttonTooltipExactCopy,

              height = buttonDimensions,
              width = buttonDimensions,
              scale = {0.5,1,0.5},
              color = buttonBackgroundColorOff,
              -- hover_color = buttonHoverColor,

              rotation = {0, 0, 90 - 90 * flip},
              position =
              {
                  horizontalOffset * flip * scaler.x,
                  0.34*flip*scaler.z,
                  rightVerticalOffset + 0 * verticalSpacing * scaler.y
              }
          })

          --reimport
          if riftboundImporter ~= nil then --re-import button
              t.obj.createButton({
                  click_function = "ReImport",
                  function_owner = self,

                  label = "↺",
                  font_size = buttonTextSize + 16,
                  font_color = buttonTextColorOff,
                  tooltip = buttonTooltipReImport,

                  height = buttonDimensions,
                  width = buttonDimensions,
                  scale = {0.5,1,0.5},
                  color = buttonBackgroundColorOff,
                  -- hover_color = buttonHoverColor,

                  rotation = {0, 0, 90 - 90 * flip},
                  position =
                  {
                      horizontalOffset * flip * scaler.x,
                      0.34*flip*scaler.z,
                      rightVerticalOffset + 1 * verticalSpacing * scaler.y
                  }
              })
          else
              t.obj.createButton({
                  click_function = 'ReImport',
                  function_owner = self,

                  label = "↺",
                  font_size = buttonTextSize + 16,
                  font_color = buttonTextColorOff,
                  tooltip = buttonTooltipReImportMissingImporter,

                  height = buttonDimensions,
                  width = buttonDimensions,
                  scale = {0.5,1,0.5},
                  color = buttonBackgroundColorError,
                  -- hover_color = buttonBackgroundColorError,

                  rotation = {0, 0, 90 - 90 * flip},
                  position =
                  {
                      horizontalOffset * flip * scaler.x,
                      0.34*flip*scaler.z,
                      rightVerticalOffset + 1 * verticalSpacing * scaler.y
                  }
              })
          end

          local buttonBackgroundColorOff = {0,0,0,  0}
          local buttonBackgroundColorOn = {0,0,0,   0}
          local buttonBackgroundColorError = {0.6,0,0,   0}
          local buttonTextColorOff = {0.8,0.8,0.8, 1}
          local buttonTextColorOn = {1,0.8,0.4, 1}
          local buttonTextSize = 105
          local buttonHoverColor = {0.1,0.1,0.1,1}
          local buttonDimensions = 150
          local verticalSpacing = 0.35
          local horizontalOffset = 0.92
          local verticalOffset = -0.9
          local rightVerticalOffset = -0.35
          --------------------------------------------------------------------------------

                --toggle plusone (top)
                t.obj.createButton({
                    click_function = 'ToggleDisplayPlusOne',
                    function_owner = self,

                    label = "+1 ",
                    font_size = buttonTextSize,
                    font_color = data.displayPlusOne and buttonTextColorOn or buttonTextColorOff,
                    tooltip = buttonTooltipToggleDisplayPlusOne,

                    height = buttonDimensions,
                    width = buttonDimensions,

                    color = data.displayPlusOne and buttonBackgroundColorOn or buttonBackgroundColorOff,
                    hover_color = buttonHoverColor,

                    rotation = {0, 0, 90 - 90 * flip},
                    position =
                    {
                        -horizontalOffset * flip * scaler.x,
                        0.35*flip*scaler.z,
                        verticalOffset + 1 * verticalSpacing * scaler.y
                    }
                })

                --toggle might overlay (below +1)
                t.obj.createButton({
                    click_function = 'ToggleDisplayCounter',
                    function_owner = self,

                    label = "①",
                    font_size = buttonTextSize + 8,
                    font_color = data.displayCounters and buttonTextColorOn or buttonTextColorOff,
                    tooltip = buttonTooltipToggleDisplayMight,

                    height = buttonDimensions,
                    width = buttonDimensions,

                    color = data.displayCounters and buttonBackgroundColorOn or buttonBackgroundColorOff,
                    hover_color = buttonHoverColor,

                    rotation = {0, 0, 90 - 90 * flip},
                    position =
                    {
                       - horizontalOffset * flip * scaler.x,
                        0.35*flip*scaler.z,
                        verticalOffset + 0 * verticalSpacing * scaler.y
                    }
                })

                --exact copy
                t.obj.createButton({
                    click_function = "MakeExactCopy",
                    function_owner = self,

                    label = "❐",
                    font_size = buttonTextSize + 6,
                    font_color = buttonTextColorOff,
                    tooltip = buttonTooltipExactCopy,

                    height = buttonDimensions,
                    width = buttonDimensions,

                    color = buttonBackgroundColorOff,
                    hover_color = buttonHoverColor,

                    rotation = {0, 0, 90 - 90 * flip},
                    position =
                    {
                        horizontalOffset * flip * scaler.x,
                        0.35*flip*scaler.z,
                        rightVerticalOffset + 0 * verticalSpacing * scaler.y
                    }
                })

                --reimport
                if riftboundImporter ~= nil then --re-import button
                    t.obj.createButton({
                        click_function = "ReImport",
                        function_owner = self,

                        label = "↺",
                        font_size = buttonTextSize + 16,
                        font_color = buttonTextColorOff,
                        tooltip = buttonTooltipReImport,

                        height = buttonDimensions,
                        width = buttonDimensions,

                        color = buttonBackgroundColorOff,
                        hover_color = buttonHoverColor,

                        rotation = {0, 0, 90 - 90 * flip},
                        position =
                        {
                            horizontalOffset * flip * scaler.x,
                            0.35*flip*scaler.z,
                            rightVerticalOffset + 1 * verticalSpacing * scaler.y
                        }
                    })
                else
                    t.obj.createButton({
                        click_function = 'ReImport',
                        function_owner = self,

                        label = "↺",
                        font_size = buttonTextSize + 16,
                        font_color = buttonTextColorOff,
                        tooltip = buttonTooltipReImportMissingImporter,

                        height = buttonDimensions,
                        width = buttonDimensions,

                        color = buttonBackgroundColorError,
                        hover_color = buttonBackgroundColorError,

                        rotation = {0, 0, 90 - 90 * flip},
                        position =
                        {
                            horizontalOffset * flip * scaler.x,
                            0.35*flip*scaler.z,
                            rightVerticalOffset + 1 * verticalSpacing * scaler.y
                        }
                    })
                end

            end

        --might overlay
        if data.displayCounters then

            local verticalSize = 130
            local overlayLabel = GetMightDisplayText(data)
            local widthPerDigit = 25
            local baseWidth = 145
            local horizontalSize = baseWidth + (string.len(tostring(overlayLabel)) * widthPerDigit)
            --tile size is about 500 for 1 unit

            local counterPos = vector( (counterHorizontalOffset*flip*scaler.x), 0.35*flip*scaler.z, (counterZOffset)*scaler.y )
            local counterRot = vector(0,0,90-90*flip)
            -- tile ~500 per unit; +10 strip uses scale {1,1,0.7}
            local plusTenStripHeight = 80 * 0.7
            local plusTenStripScaleZ = 0.7
            local counterPlus10ZOffset = (verticalSize / 2 + plusTenStripHeight / 2) / 1000
            local counterPlus10Pos = vector(
                (counterHorizontalOffset*flip*scaler.x),
                0.35*flip*scaler.z,
                (counterZOffset * scaler.y) + counterPlus10ZOffset * scaler.y
            )

            --bg
            t.obj.createButton({
                click_function = 'DoNothing',
                function_owner = self,

                height = verticalSize + rimSize,
                width = horizontalSize + rimSize,

                color = colorLightGrey,

                position=counterPos,
                rotation=counterRot+vector(0,0,-180)
            })

            t.obj.createButton({
                label=" "..overlayLabel.." ",
                tooltip = buttonTooltipMightSingleClick,

                click_function='ReceiveCounterClick',
                function_owner=self,

                position=counterPos,
                rotation=counterRot,

                height= verticalSize,
                width= horizontalSize,
                color = colorDarkGrey,

                font_size=fSize,
                font_color = {1,1,1}
            })

            --delta 10 button
            t.obj.createButton({
                tooltip = buttonTooltipMightTenClick,
                click_function='ReceiveTenCounterClick',
                function_owner=self,

                position=counterPlus10Pos,
                height= 80,
                width= horizontalSize,
                color = {0.3,0.3,0.3, 0.4},
                hover_color = {1,1,1, 0.66},

                scale = {1,1,plusTenStripScaleZ},

                rotation=counterRot
            })
        end

        --plusone buttons
        if data.displayPlusOne then
            local widthPerDigit = 25
            local baseWidth = 145
            local verticalSize = 130
            local horizontalSize = baseWidth + (string.len(math.abs(data.plusOneCounters)) * widthPerDigit)
            local plusOneZOffset = -0.97

            plusOneLabelString = ""..((data.plusOneCounters >= 0) and "+" or "")..data.plusOneCounters.." "

            -- delta 10 button
            t.obj.createButton({
                tooltip = buttonTooltipPlusOneTenClick,
                click_function='ReceiveTenPlusOneClick',
                function_owner=self,

                position=
                {
                    (0.87)*flip*scaler.x,
                    0.35*flip*scaler.z,
                    0.2 + plusOneZOffset*scaler.y
                },

                height= 60,
                width= horizontalSize-40,
                color = {0.3,0.3,0.3, 0.4},
                hover_color = {1,1,1, 0.66},

                scale = {1,1,0.5},

                rotation={0,0,90-90*flip}
            })

            --bg button
            t.obj.createButton({
                click_function = 'DoNothing',
                function_owner = self,

                height = verticalSize + rimSize + 16,
                width = horizontalSize + rimSize,

                color = colorLightGrey,

                position=
                {
                    (0.87)*flip*scaler.x,
                    0.28*flip*scaler.z,
                    plusOneZOffset*scaler.y
                },

                rotation={0,0,-90-90*flip}
            })

            --plus one button
            t.obj.createButton({
                label=plusOneLabelString,
                tooltip = buttonTooltipPlusOneSingleClick,

                click_function='ReceivePlusOneClick',
                function_owner=self,

                position=
                {
                    (0.87)*flip*scaler.x,
                    0.35*flip*scaler.z,
                    plusOneZOffset*scaler.y
                },

                height= verticalSize,
                width= horizontalSize,
                color = colorDarkGrey,

                font_size= 80,
                font_color = {1,1,1},

                rotation={0,0,90-90*flip}
            })
        end

        if true then --toggle ownership buttons collapsible section
            local verticalOffset = 1.345
            local verticalSize = 280
            local horizontalSize = 500
            local buttonScale = {0.375,0.375,0.375} -- used to fix weird scaling issues on small size values

            if data.displayOwnership then
                --bg with ownership function
                t.obj.createButton({
                    tooltip =   buttonTooltipOwnershipGem,
                    click_function= "ReceiveGemClick",
                    function_owner=self,

                    position=
                    {
                        0,
                        0.35*flip*scaler.z,
                        verticalOffset
                    },

                    height= verticalSize,
                    width= horizontalSize,
                    color = colorCardBorderBlack,

                    rotation={0,0,90-90*flip},
                    scale = buttonScale
                })

                --ownership gem
                t.obj.createButton({
                    click_function='DoNothing',
                    function_owner=self,

                    position=
                    {
                        0,
                        0.4*flip*scaler.z,
                        verticalOffset
                    },

                    height= verticalSize * 0.7,
                    width= horizontalSize * 0.85,
                    color = Color.Black:lerp(ownershipColor, 0.33),

                    rotation={180,0,90-90*flip},
                    scale = buttonScale
                })

                --control gem
                t.obj.createButton({
                    click_function= "DoNothing",
                    function_owner=self,

                    position=
                    {
                        0,
                        0.45*flip*scaler.z,
                        verticalOffset
                    },

                    height= verticalSize * 0.4,
                    width= horizontalSize * 0.66,
                    color = Color.White:lerp(controlColor, 0.66),

                    rotation={180,0,90-90*flip},
                    scale = buttonScale
                })

            end

            --toggle visibility
            t.obj.createButton({
                tooltip = buttonTooltipToggleDisplayOwnership,
                click_function= "ToggleDisplayOwnership",
                function_owner=self,

                position=
                {
                    0,
                    0.35*flip*scaler.z,
                    0.13 + verticalOffset
                },

                height= 80,
                width= horizontalSize / 3,
                color = {0.3,0.3,0.3, 0.3},

                scale = {1,1,0.7},

                rotation={0,0,90-90*flip}
            })
        end

        --DFC section
        if data.displayDFC and data.doubleFaceType ~= "none" and data.doubleFaceType ~= "flip" and data.doubleFaceType ~= "split" then
            --offsets are all over the place rip, but these should fit the vast majority of most common prints
            local typeOffsets = {
                default = {-0.875, -1.300},
                MOMback = {0.86,-1.3},
                modal = {-0.875, -1.300},
                discovery = {-0.87, -1.305},
                werecard = {-0.87, -1.305},
                weredrazi = {-0.87, -1.300},
                artifactWerecard = {-0.85, -1.280},
                oldImport = {-0.87, -1.315}
            }

            local MOMbacks = 'Arcee, Acrobatic Coupe-Blaster, Morale Booster-Blitzwing, Adaptive Assailant-Cyclonus, Cybertronian Fighter-Flamewar, Streetwise Operative-Goldbug, Scrappy Scout-Jetfire, Air Guardian-Megatron, Destructive Force-Optimus Prime, Autobot Leader-Prowl, Pursuit Vehicle-Ratchet, Rescue Racer-Slicer, High-Speed Antagonist-Soundwave, Superior Captain-Starscream, Seeker Leader-Ultra Magnus, Armored Carrier-Gitaxian Mindstinger-Ayara, Furnace Queen-Blightsower Thallid-Plated Kilnbeast-Compleated Conjurer-The Argent Etchings-Etali, Primal Sickness-Chrome Host Hulk-Phyrexian Skyflayer-Heliod, the Warped Eclipse-Malady Invoker-The Great Synthesis-Gitaxian Spellstalker-Hideous Fleshwheeler-Order of the Alabaster Host-Polukranos, Engine of Ruin-Glistening Goremonger-Rona, Tolarian Obliterator-Seraph of New Phyrexia-The True Scriptures-Skyclave Invader-Furnace-Blessed Conqueror-Burnished Dunestomper-The Great Work-The Grand Evolution'
            
            local cardName, typeLine = t.obj.getName():match("([^\n]*)\n([^\n]*)")
            cardName = cardName or ""
            typeLine = typeLine or ""

            local horizontalOffset
            local verticalOffset

            if data.doubleFaceType == "werecard" and t.obj.getDescription():find("rtifact") then
                horizontalOffset = typeOffsets["artifactWerecard"][1]
                verticalOffset = typeOffsets["artifactWerecard"][2]
            elseif MOMbacks:lower():match(cardName:lower()) then
                horizontalOffset = typeOffsets["MOMback"][1]
                verticalOffset   = typeOffsets["MOMback"][2]
            else
                horizontalOffset = typeOffsets[data.doubleFaceType] and typeOffsets[data.doubleFaceType][1] or typeOffsets["default"][1]
                verticalOffset   = typeOffsets[data.doubleFaceType] and typeOffsets[data.doubleFaceType][2] or typeOffsets["default"][2]
            end

            local dfcSize = 150
            local bgFontSize = 420

            local dfcTooltip = data.doubleFaceType == "oldImport" and buttonTooltipFlipDFColdImport or
                buttonTooltipFlipDFC

            local dfcFunction = data.doubleFaceType == "oldImport" and "ReceiveReimportOrChangeActiveFace" or "ReceiveChangeActiveFace"

            dfcBGcolor = Color(0.17,0.17,0.12)
            dfcFrameColor = data.doubleFaceType == "oldImport" and Color(1, 0.3, 0) or Color(1, 0.8, 0) --hextooltip highlight color
            dfcTextColor = data.doubleFaceType == "oldImport" and Color(1, 0.8, 0) or Color(1,1,1)

            --bg
            t.obj.createButton({
                click_function = dfcFunction,
                tooltip = dfcTooltip,

                label = "●",
                function_owner = self,

                height = dfcSize,
                width = dfcSize,

                color = Color.Yellow,

                position=
                {
                    ((horizontalOffset)*flip*scaler.x),
                    0.35*flip*scaler.z,
                    (verticalOffset)*scaler.y
                },

                font_size = bgFontSize * 1.25,
                font_color = dfcBGcolor,

                rotation={0,0,90-90*flip},
                scale = {0.5,0.5,0.5}
            })

            --bg  frame
            t.obj.createButton({
                click_function = 'DoNothing',
                label = "○",
                function_owner = self,

                height = 0,
                width = 0,

                position=
                {
                    ((horizontalOffset)*flip*scaler.x),
                    0.40*flip*scaler.z,
                    (verticalOffset)*scaler.y
                },

                font_size = bgFontSize,
                font_color = dfcFrameColor:lerp(Color(0,0,0), 0.35),

                rotation={0,0,-90-90*flip},
                scale = {0.5,0.5,0.5}
            })

            local dfcLabelSymbols = {
                --structure:
                --name = {{frontSymbol1, frontSymbol2}, {backSymbol1, backSymbol2}}
                default = {{"▴",""},{"▾",""}},
                battle = {{"◀",""},{"▾",""}},
                modal = {{"▴",""},{"▴ "," ▾"}},
                werecard = {{"❂",""},{" ☾  ",""}},
                weredrazi = {{"⊙",""},{"☤","♣"}},
                discovery = {{"※",""},{"    ▴     ","     ▴    "}},
                ascendant = {{"✧",""},{"✦",""}},
                oldImport = {{"!","! !"},{"!","! !"}}
            }

            local dfcSymbolOffset = {
                default = {0.0125, 0.0125},
                battle = {0.013, 0.013},
                modal = {0.013, 0.013},
                werecard = {0.012, 0.012},
                weredrazi = {0.005, 0.040},
                discovery = {-0.003, 0.018},
                ascendant = {0.010, 0.012},
                oldImport = {0.005, -0.01}
            }

            --label symbol 2
            t.obj.createButton({
                click_function = 'DoNothing',
                label = dfcLabelSymbols[data.doubleFaceType][activeFace][2],
                function_owner = self,

                height = 0,
                width = 0,

                position=
                {
                    ((horizontalOffset)*flip*scaler.x),
                    0.40*flip*scaler.z,
                    (verticalOffset)*scaler.y
                },

                font_size = bgFontSize * 0.42,
                font_color = dfcTextColor:lerp(Color(0,0,0),0.15),

                rotation={0,0,90-90*flip},
                scale = {0.5,0.5,0.5}
            })

            --label symbol 1
            t.obj.createButton({
                click_function = 'DoNothing',
                label = dfcLabelSymbols[data.doubleFaceType][activeFace][1],
                function_owner = self,

                height = 0,
                width = 0,

                position=
                {
                    ((horizontalOffset)*flip*scaler.x),
                    0.40*flip*scaler.z,
                    (verticalOffset + dfcSymbolOffset[data.doubleFaceType][activeFace])*scaler.y
                },

                font_size = bgFontSize * 0.42,
                font_color = dfcTextColor,

                rotation={0,0,90-90*flip},
                scale = {0.5,0.5,0.5}
            })
        end
    end
end

--Propagatable Value Change Functions
function PropagateValueChange (dataTable)
    --dataTable needs target, player, varName & varDelta
    -- so for bools we want to set and for floats we want to add
    local enc = Global.getVar('Encoder')

    if type(dataTable.player) == "string" then
        local selection = Player[dataTable.player].getSelectedObjects()

        if next(selection) ~= nil then
            for key, value in pairs(selection) do
                if enc.call("APIobjectExists",{obj=value}) == true then
                    dataTable.target = value
                    UpdateEncoderDataValue (dataTable)
                end
            end
        else
            UpdateEncoderDataValue (dataTable)
        end
    end
end

function UpdateEncoderDataValue (dataTable)
    local encData = dataTable.encoder.call("APIobjGetPropData",{obj = dataTable.target, propID = pID})
    local objectData = encData["tyrantUnified"]

    if objectData[dataTable.varName] ~= nil then
        if type(dataTable.varDelta) == "number" then
            if type(objectData[dataTable.varName]) ==  "number" then
                objectData[dataTable.varName] = objectData[dataTable.varName] + dataTable.varDelta
            else
                broadcastToAll("[888888][EASY MODULES][-]\nType mismatch in value update attempt, received "..tostring(dataTable.varDelta).." against "..tostring(objectData[dataTable.varName]))
                broadcastToAll(type(dataTable.varDelta).."  "..type(objectData[dataTable.varName]))
            end
        elseif type(dataTable.varDelta) == "boolean" then
            if type(objectData[dataTable.varName]) ==  "boolean" then
                objectData[dataTable.varName] = dataTable.varDelta
            else
                broadcastToAll("[888888][EASY MODULES][-]\nType mismatch in value update attempt, received "..tostring(dataTable.varDelta).." against "..tostring(objectData[dataTable.varName]))
            end
        elseif type(dataTable.varDelta) == "string" then
            if type(objectData[dataTable.varName]) ==  "string" then
                objectData[dataTable.varName] = dataTable.varDelta
            else
                broadcastToAll("[888888][EASY MODULES][-]\nType mismatch in value update attempt, received "..tostring(dataTable.varDelta).." against "..tostring(objectData[dataTable.varName]))
            end
        else
            broadcastToAll("[888888][EASY MODULES][-]\nError in value update attempt, received "..tostring(dataTable.varDelta))
        end
    else
        broadcastToAll("[888888][EASY MODULES][-]\nOverriding nil value for: "..dataTable.varName)
        objectData[dataTable.varName] = dataTable.varDelta
    end

    encData["tyrantUnified"] = objectData
    dataTable.encoder.call("APIobjSetPropData",{obj = dataTable.target, propID = pID, data = encData})
    enc.call("APIrebuildButtons",{obj = dataTable.target})
end

function ToggleDisplayCounter (tar, ply, alt)
    local dataTable = GetClickdataTable(tar, ply, alt)
    local encData = dataTable.encoder.call("APIobjGetPropData",{obj=tar,propID=pID})
    local data = encData["tyrantUnified"]

    dataTable.varDelta = not data.displayCounters
    dataTable.varName = "displayCounters"
    PropagateValueChange(dataTable)
end

function ToggleDisplayPlusOne (tar, ply, alt)
    local dataTable = GetClickdataTable(tar, ply, alt)
    local encData = dataTable.encoder.call("APIobjGetPropData",{obj=tar,propID=pID})
    local data = encData["tyrantUnified"]
    dataTable.varDelta = not data.displayPlusOne
    dataTable.varName = "displayPlusOne"
    PropagateValueChange(dataTable)
end

function ToggleDisplayOwnership (tar, ply, alt)
    local dataTable = GetClickdataTable(tar, ply, alt)
    local encData = dataTable.encoder.call("APIobjGetPropData",{obj=tar,propID=pID})
    local data = encData["tyrantUnified"]
    dataTable.varDelta = not data.displayOwnership
    dataTable.varName = "displayOwnership"
    PropagateValueChange(dataTable)

    if not(alt) then
      tar.highlightOn(Color.fromString(ply))
      for _,obj in pairs(Player[ply].getSelectedObjects()) do
        if obj.type=='Card' then
          obj.highlightOn(Color.fromString(ply))
        end
      end
    else
      tar.highlightOff(Color.fromString(ply))
      for _,obj in pairs(Player[ply].getSelectedObjects()) do
        if obj.type=='Card' then
          obj.highlightOff(Color.fromString(ply))
        end
      end
    end
end

function ReceiveChangeActiveFace (tar, ply, alt, sel)

    if sel==nil or sel==true then
      local selection = Player[ply].getSelectedObjects()
      if next(selection) ~= nil then
        for _,tar in pairs(selection) do
          if tar.type=='Card' then
            ReceiveChangeActiveFace (tar, ply, alt, false)
          end
        end
        return
      end
    end

    local dataTable = GetClickdataTable(tar, ply, alt)
    local encData = dataTable.encoder.call("APIobjGetPropData",{obj=tar,propID=pID})
    local data = encData["tyrantUnified"]
    local cardData = CheckGetSetCardTable(tar, nil)

    if data==nil or not(data.displayDFC) then
      return
    end

    if data["doubleFaceStates"] then
        local dfcStates = tar.getStates()
        local tarScale = tar.getScale()
        local newDFCobject = tar.setState(dfcStates[1]["id"])
        newDFCobject.setScale(tarScale)
        TryTimedEncoding(newDFCobject)
        dataTable.encoder.call("APIrebuildButtons",{obj=newDFCobject})
        return
    end

    if data["ownerColor"] ~= nil and data["ownerColor"] ~= "Grey" then
        -- broadcastToAll("[888888][EASY MODULES][-]\nLibrary double-faced card detected, reimporting.")
        ReImport(tar, ply, false)
        return
    end

    data.activeFace = data.activeFace == 1 and 2 or 1

    local faceBaseMight = data.cardFaces[data.activeFace]["baseMight"]
    data.displayCounters = faceBaseMight ~= nil and faceBaseMight ~= 0 and faceBaseMight ~= "0"

    if alt == false then
        tar.flip()
        dataTable.encoder.call("APIFlip",{obj = tar})
    end

    encData["tyrantUnified"] = data
    dataTable.encoder.call("APIobjSetPropData",{obj = tar, propID = pID, data = encData})
    enc.call("APIrebuildButtons",{obj = tar})
end

function ReceiveReimportOrChangeActiveFace (tar, ply, alt)
    if alt then ReceiveChangeActiveFace(tar, ply, alt) return end

    ReImport(tar, ply, alt)
end

function ReceiveGemClick (tar, ply, alt)
    if alt == false then ReceiveControllerClick(tar, ply, alt)
    else ReceiveOwnershipClick(tar, ply, alt) end
end

function ReceiveOwnershipClick (tar, ply, alt)
    local dataTable = GetClickdataTable(tar, ply, alt)
    local encData = dataTable.encoder.call("APIobjGetPropData",{obj=tar,propID=pID})
    local data = encData["tyrantUnified"]
    dataTable.varDelta = ply
    dataTable.varName = "ownerColor"
    PropagateValueChange(dataTable)
end

function ReceiveControllerClick (tar, ply, alt)
    local dataTable = GetClickdataTable(tar, ply, alt)
    local encData = dataTable.encoder.call("APIobjGetPropData",{obj=tar,propID=pID})
    local data = encData["tyrantUnified"]
    dataTable.varDelta = ply
    dataTable.varName = "controllerColor"
    PropagateValueChange(dataTable)
end

function GetClickdataTable (tar, ply, alt)
    local enc = Global.getVar('Encoder')
    if enc ~= nil then
        local dataTable = {encoder = enc, target = tar, player = ply, alt_click = alt, varName, varDelta}
        return dataTable
    else
        local dataTable = {recursiveCall=false}
        TryAutoRegister(dataTable)
    end
end

function ReceiveCounterClick(tar,ply,alt)
    local dataTable = GetClickdataTable(tar, ply, alt)
    dataTable.varDelta = alt and -1 or 1
    dataTable.varName = "might"
    PropagateValueChange(dataTable)
end

function ReceiveTenCounterClick(tar,ply,alt)
    local dataTable = GetClickdataTable(tar, ply, alt)
    dataTable.varDelta = alt and -10 or 10
    dataTable.varName = "might"
    PropagateValueChange(dataTable)
end

function ReceivePlusOneClick(tar,ply,alt)
    local dataTable = GetClickdataTable(tar, ply, alt)
    dataTable.varDelta = alt and -1 or 1
    dataTable.varName = "plusOneCounters"
    PropagateValueChange(dataTable)
end

function ReceiveTenPlusOneClick(tar,ply,alt)
    local dataTable = GetClickdataTable(tar, ply, alt)
    dataTable.varDelta = alt and -10 or 10
    dataTable.varName = "plusOneCounters"
    PropagateValueChange(dataTable)
end

--Toolbox Functions
copyCount = 0
function MakeExactCopy (tar, ply, alt)
    --based on Exact Copy by Tipsy Hobbit (steam_id: 13465982)
    enc = Global.getVar('Encoder')
    if enc ~= nil then
        local encData = enc.call("APIobjGetPropData",{obj = tar, propID = pID})
        local data = encData["tyrantUnified"]
        local flip = enc.call("APIgetFlip",{obj=tar})
        local params = {position = tar.getPosition()}

        local horizontalOffsetMultiplier = data.exactCopyOffset % 5 + 1
        local verticalOffsetMultiplier = math.floor(data.exactCopyOffset/5)

        data.exactCopyOffset = data.exactCopyOffset + 1
        encData["tyrantUnified"] = data
        enc.call("APIobjSetPropData", {obj = tar, propID = pID, data = encData})

        local cardRight = tar.getTransformRight()
        local cardForward = tar.getTransformForward()

        if data.controllerColor ~= nil and data.controllerColor ~= "Grey" then
            controllerHand = Player[data.controllerColor].getHandTransform(1)
            if controllerHand ~= nil then
                --for some reason  right is left and forward is back
                cardRight[1] = controllerHand.right[1] * -1
                cardRight[3] = controllerHand.right[3] * -1

                cardForward[1] = controllerHand.forward[1] * -1
                cardForward[3] = controllerHand.forward[3] * -1
            end
        end

        local xOffset = (-2.4 * cardRight[1] * horizontalOffsetMultiplier) + (3.6 * cardForward[1] * verticalOffsetMultiplier)
        local zOffset = (-2.4 * cardRight[3] * horizontalOffsetMultiplier) + (3.6 * cardForward[3] * verticalOffsetMultiplier)

        params.position[1] = params.position[1] + xOffset
        params.position[2] = params.position[2] + 0.05
        params.position[3] = params.position[3] + zOffset

        local copiedCard = tar.clone(params)
        copyCount = copyCount + 1

        --alt click for regular copy
        if alt == false then
            copiedCard.setLock(true)
            local moduleData = enc.call("APIobjGetProps", {obj = tar})
            local valueData = enc.call("APIobjGetAllData",{obj = tar})

            Timer.create({
                identifier = "exactCopyTimer"..tar.guid..copyCount,
                function_name = "SetExactCopyData",
                function_owner = self,
                parameters = {copiedCard = copiedCard, valueData = valueData, moduleData = moduleData, flipData = flip, enc = enc},
                delay = 0.2
            })
        end

        Timer.destroy("resetExactCopyOffset"..tar.guid)
        Timer.create({
            identifier = "resetExactCopyOffset"..tar.guid,
            function_name = "ResetExactCopyOffset",
            function_owner = self,
            parameters = {tar = tar, enc = enc},
            delay = 3
        })
    end
end

function SetExactCopyData (dataTable)
    dataTable.enc.call("APIencodeObject",{obj=dataTable.copiedCard})
    dataTable.enc.call("APIobjSetAllData",{obj=dataTable.copiedCard, data = dataTable.valueData})
    dataTable.enc.call("APIobjSetProps",{obj=dataTable.copiedCard, data = dataTable.moduleData})
    if dataTable.flipData < 0 then enc.call("APIFlip", {obj = dataTable.copiedCard}) end
    dataTable.enc.call("APIrebuildButtons",{obj=dataTable.copiedCard})

    dataTable.copiedCard.setLock(false)
end

function ResetExactCopyOffset (dataTable)
    local encData = dataTable.enc.call("APIobjGetPropData",{obj = dataTable.tar, propID = pID})
    local data = encData["tyrantUnified"]
    data.exactCopyOffset = 0

    encData["tyrantUnified"] = data
    dataTable.enc.call("APIobjSetPropData",{obj = dataTable.tar, propID = pID, data = encData})
end

function getRiftboundImporter()
    return Global.getVar("RiftboundImporter")
end

lockReImport = false
function ReImport(tar, ply, alt)
    if lockReImport == true then
        broadcastToColor("[888888][EASY MODULES][-]\nSPAM-CLICK DETECTED\nTry again in a few seconds", ply)
        return
    end

    if tar.getName() == "" then
        broadcastToColor("[888888][EASY MODULES][-]\nERROR\nCard Object has no name", ply)
        return
    end

    local importer = getRiftboundImporter()
    if importer ~= nil then
        importer.call('reimportCard', {cardGUID = tar.getGUID(), playerColor = ply})

        lockReImport = true
        Timer.destroy("reImportTimer" .. tar.guid)
        Timer.create({
            identifier    = "reImportTimer" .. tar.guid,
            function_name = "ReEnableReImport",
            function_owner = self,
            delay = 0.5
        })
    else
        broadcastToColor("[888888][EASY MODULES][-]\nRiftbound Card Importer not found.", ply)
    end
end

function ReEnableReImport()
    lockReImport = false
end

--Parse Functions
function ParseCardData(object, enc)
    local cardData = {{nameLine = "", typeLine = "", textLines = {}, statLine = ""}} -- does this work?

    local encData = enc.call("APIobjGetPropData",{obj=object,propID=pID})
    local data = encData["tyrantUnified"]

    if data == nil then
        local dataTable = {obj = object}
        data = AutoActivate(dataTable)
        return
    end

    if data.hasParsed == false then
        data.hasParsed = true

        pcall(function()

        local nameField = object.getName():gsub('%[.-%]',''):gsub('\n%d+CMC','')    -- pieHere, remove [hexcol] from names, and the CMC (if it has it's own line)
        local stateBasedDFC = object.getStates() ~=  nil -- new DFC cards with states
        local descriptionField

        --5 different importer standards on the wall
        --5 different importer standards on the wall
        --update's out, patch it around
        --6 different importer standards on the wall

        if stateBasedDFC then
            data.doubleFaceStates = true
            local dfcStates = object.getStates()

            local activeFaceDescription = object.getName():gsub('%[.-%]',''):gsub('\n%d+ ?CMC','').."\n"..object.getDescription()
            local inactiveFaceDescription = dfcStates[1]["name"]:gsub('%[.-%]',''):gsub('\n%d+ ?CMC','').."\n"..dfcStates[1]["description"]

            if activeFaceDescription:find("b%]$") == nil then activeFaceDescription = activeFaceDescription.."\n[b][/b]" end
            if inactiveFaceDescription:find("b%]$") == nil then inactiveFaceDescription = inactiveFaceDescription.."\n[b][/b]" end

            local activeFace = dfcStates[1]["id"] == 2 and 1 or 2
            data.activeFace = activeFace

            descriptionField = activeFace == 1 and
                activeFaceDescription.."\n"..inactiveFaceDescription
                or
                inactiveFaceDescription.."\n"..activeFaceDescription
        else
            descriptionField = object.getDescription():gsub('\n\n','\n')
        end

        descriptionField=descriptionField:gsub('\n%[i%].-%[/i%]',''):gsub('\n ?\n','\n')    -- pieHere, remove italics flavour text, remove double line breaks

        if (descriptionField:find("%[%x%x%x%x%x%x") or nameField:find("%[%x%x%x%x%x%x") or nameField:find("%]%w%w%w") or descriptionField:find("%]%w%w%w")) then return end
        --these cause timeouts on the other matches and finds as well as breaking the parser

        local oldImportDFC = descriptionField:find("%/%/") ~= nil -- can't type-check DFC properly in old imports
        local generalDFC = descriptionField:find("%]\n") ~=  nil or stateBasedDFC -- new DFCs have a linebreak after the first set of stats
        -- new DFCs have the // in the name field instead (turns out this is only for flip/split), may get fixed

        if oldImportDFC or generalDFC then --correcting line breaks near stats
            --gotta fix the lack of line break in the old imports
            if oldImportDFC then
                local lineBreakIndex = descriptionField:find("%/b") + 2
                descriptionField = descriptionField:sub(1, lineBreakIndex).."\n"..descriptionField:sub(lineBreakIndex + 1, -1)
            end

            --...and in new imports as well
            while true do
                local lineBreakIndex = descriptionField:find("[^\n]%[b")
                if lineBreakIndex then
                    descriptionField = descriptionField:sub(1, lineBreakIndex).."\n"..descriptionField:sub(lineBreakIndex + 1, -1)
                else break end
            end
        end

        descriptionField = descriptionField:gsub("−","-") --no, I mean the REAL minus sign
        local descriptionLines = string.splitUsingFind(descriptionField, "\n")

        if oldImportDFC or generalDFC then --setting data into the correct fields=
            local faceIndex = 1
            local faceLine = 0
            --double-face
            for index, value in ipairs(descriptionLines) do
                faceLine = faceLine + 1
                --if descriptionLines[index]:find("CMC") then -- CMC was removed from name line in new importer
                if faceLine == 1 then
                    --but the name is always the first line in each face so this should do it
                    cardData[faceIndex]["nameLine"] = value
                elseif faceLine == 2 then
                    --split cards don't have the hiphenation in the typeline, so we use line count here as well
                    cardData[faceIndex]["typeLine"] = value
                elseif descriptionLines[index]:find("^%[") then
                    cardData[faceIndex]["statLine"] = value

                    if descriptionLines[index + 1] ~= nil then
                        faceIndex = faceIndex + 1
                        faceLine = 0
                        local cardStruct = {nameLine = "", typeLine = "", textLines = {}, statLine = ""}
                        table.insert(cardData, cardStruct)
                    end
                else
                    table.insert(cardData[faceIndex]["textLines"], value)
                end
            end
        else
            --single-face
            cardData[1]["nameLine"] = nameField:match("^(.+)\n")
            cardData[1]["typeLine"] = nameField:match("\n(.+)$")

            for index, value in ipairs (descriptionLines) do
                if value:find("%[") then
                    cardData[1]["statLine"] = value
                    descriptionLines[index] = nil
                    cardData[1]["textLines"] = descriptionLines
                end
            end
        end

        if cardData[1]["nameLine"] == nil or cardData[1]["nameLine"]:find("^%w+") == nil or cardData[1]["typeLine"] == nil then return end

        for index, value in ipairs (cardData) do

            local mightValue = value["statLine"]:match("[Mm]ight:%s*([%d%*xX]+)")
            if mightValue == nil then
                for _, textLine in ipairs(value["textLines"]) do
                    mightValue = textLine:match("[Mm]ight:%s*([%d%*xX]+)")
                    if mightValue ~= nil then break end
                end
            end
            if mightValue == nil then
                mightValue = descriptionField:match("[Mm]ight:%s*([%d%*xX]+)")
            end
            data.cardFaces[index]["baseMight"] = mightValue

        end

        if true then --plus one section, we only care about the front face
            if autoActivatePlusOne and cardData[1]["typeLine"]:find("reature") then
                local selfReferralString = {"it", cardData[1]["nameLine"]:match("^%w+")}

                for index, nameString in ipairs (selfReferralString) do
                    for innerIndex, textLine in ipairs (cardData[1]["textLines"]) do
                        if textLine:find("[%+%-]1/[%+%-]1 counters? on "..nameString) then
                            data.displayPlusOne = autoActivatePlusOne
                            break --only breaks out of one loop
                        end
                    end
                end
            end
        end

        if oldImportDFC then
            data.doubleFaceType = "oldImport"
        elseif generalDFC then
            frontFaceSplitCheck = cardData[1]["typeLine"]:find("nstant") and true or (cardData[1]["typeLine"]:find("orcery") and true)
            backFaceSplitCheck = cardData[2]["typeLine"]:find("nstant") and true or (cardData[2]["typeLine"]:find("orcery") and true)
            adventureCheck = nameField:lower():match('adventure') or descriptionField:lower():match('adventure')

            if (frontFaceSplitCheck and backFaceSplitCheck) then
                data.doubleFaceType = "split"
            else
                flipCardCheck = descriptionField:find("lip it") or descriptionField:find("lip "..cardData[1]["nameLine"]:match("^%w+"))
                if flipCardCheck ~= nil then
                    data.doubleFaceType = "flip"
                elseif nameField:lower():match('adventure') or descriptionField:lower():match('adventure') then
                    data.doubleFaceType = "adventure"
                elseif descriptionField:find("aybound") or descriptionField:find("ightbound") then
                    data.doubleFaceType = "werecard"
                elseif descriptionField:find("ransform") == nil and descriptionField:find("onvert") == nil then
                    data.doubleFaceType = "modal"
                elseif cardData[2]["typeLine"]:find("ldrazi") ~= nil then
                    data.doubleFaceType = "weredrazi"
                elseif cardData[2]["typeLine"]:find("[lL]and") ~= nil then
                    data.doubleFaceType = "discovery"
                else
                    data.doubleFaceType = "default"
                end

            end

            if data.doubleFaceType ~= "none" and data.doubleFaceType ~= "flip" and data.doubleFaceType ~= "split" and data.doubleFaceType ~= "adventure" then
                data.displayDFC = autoActivateDFC
            end

            if cardData[1]["nameLine"] and cardData[2]["nameLine"] and cardData[1]["nameLine"]==cardData[2]["nameLine"] then
                data.displayDFC = false
            end

        end

        local faceBaseMight = data.cardFaces[data.activeFace]["baseMight"]
        local hasPrintedMight = faceBaseMight ~= nil and faceBaseMight ~= 0 and faceBaseMight ~= "0"
        data.displayCounters = autoActivateMight and hasPrintedMight

        encData["tyrantUnified"] = data
        enc.call("APIobjSetPropData",{obj = object, propID = pID, data = encData})

      end)


    end
end

function string.splitUsingFind(text, separator)
    --by @BoneWhite#6514 (discord id)
    local splitTable = {}
    while true do
        local index = text:find(separator)
        if not index then
            table.insert(splitTable,text)
            break
        else
            table.insert(splitTable,text:sub(1,index-1))
            text = text:sub(index+1)
        end
    end
    return splitTable
end

--Auto Functions
function onObjectDropped (playerColor, object)
    if autoActivateModule == false or (autoActivatePlayerSettings[Player[playerColor].steam_id] ~= nil and autoActivatePlayerSettings[Player[playerColor].steam_id] == false) then return end
    TryTimedEncoding(object)
end

function onObjectSpawn(obj)
    if obj.tag == "Card" then
        CheckRevertInvertedFaces(obj)

        cardTable = CheckGetSetCardTable(obj)
    end

    if obj.tag == "Deck" then
        containerTable = CheckGetSetContainerTable(obj)
    end
end

function TryTimedEncoding(object)
    if object.tag ~= "Card" then return end
    if object.getVar('noencode') ~= nil and object.getVar('noencode') == true then return end

    local enc = Global.getVar('Encoder')
    if enc == nil then return end

    if enc.call("APIobjectExists",{obj=object}) == false then
        --noencode doesn't exist
        enc.call("APIencodeObject",{obj=object})
    end

    if enc.call("APIpropertyExists",{propID = pID}) == false then return end
    if enc.call("APIobjIsPropEnabled", {obj=object, propID = pID}) == false then
        enc.call("APIobjEnableProp",{obj=object, propID = pID})

        InitializeCardData(object, enc)

        enc.call("APIrebuildButtons",{obj=object})
        return
    end
end

function AutoActivate(dataTable)
    local enc = Global.getVar('Encoder')
    if enc ~= nil then
        if enc.call("APIpropertyExists",{propID = pID}) == false then
            return

        elseif enc.call("APIobjectExists", {obj=dataTable.obj}) ~= nil then
            local encData = enc.call("APIobjGetPropData",{obj=dataTable.obj,propID=pID})
            local data = encData["tyrantUnified"]

            if data ~= nil and data.hasStats ~= nil then return data end

            if enc.call("APIobjIsPropEnabled", {obj=dataTable.obj, propID = pID}) == false then
                enc.call("APIobjEnableProp",{obj=dataTable.obj, propID = pID})

                ParseCardData(dataTable.obj, enc)

                enc.call("APIrebuildButtons",{obj=dataTable.obj})
                return data
            end
        end
    end
end

function InitializeCardData(object, enc)
    ParseCardData(object, enc)
    TryAssignOwnership(object, enc)
end

function TryAssignOwnership(object, enc)
    local cardTable = CheckGetSetCardTable(object)
    local ownerColor = cardTable.ownerColor ~= "" and cardTable.ownerColor or (cardTable.containerID ~= "" and deckPlayerPairs[cardTable.containerID] or nil)

    local encData = enc.call("APIobjGetPropData",{obj = object, propID = pID})
    local data = encData["tyrantUnified"]

    if ownerColor ~= nil and ownerColor  ~= "" then
        data.ownerColor = ownerColor
        data.controllerColor = ownerColor
    end

    data.displayOwnership = autoActivateOwnership

    encData["tyrantUnified"] = data
    enc.call("APIobjSetPropData",{obj = object, propID = pID, data = encData})
end

--Deck Tracking Functions
deckCandidateTracker = {}
deckPlayerPairs = {}
function InitializeDeckTables()
    local colorList = Color.list

    for key, value in pairs(colorList) do
        deckCandidateTracker[value] = {}
    end
end

function onObjectLeaveContainer (container, object)
    if object.tag ~= "Card" then return end
    local containerTable = CheckGetSetContainerTable(container)
    CheckGetSetCardTable(object, containerTable)
end

function onObjectEnterContainer(container, object)
    if container.getTable("tyrantUnified") ~= nil or object.getTable("tyrantUnified") == nil then return end
    if object.tag ~= "Card" and object.tag ~= "Container" then return end

    sourceTable = CheckGetSetCardTable(object, nil)
    dataTable = {sourceTable = sourceTable, object = container}

    Timer.destroy(container.getGUID().."setDataTimer")
    Timer.create({
        identifier = container.getGUID().."setDataTimer",
        function_name = "ResetDeckTable",
        function_owner = self,
        parameters = dataTable,
        delay = 1
    })
end

function ResetDeckTable(dataTable)
    dataTable.object.setTable("tyrantUnified", dataTable.sourceTable)
end

function CheckGetSetContainerTable (container)
    local containerTable = container.getTable("tyrantUnified")
    if containerTable == nil then
        containerData = container.getCustomObject()
        containerTable = {cardBack = "", frontFace = "", backFace = "", containerID = container.guid, ownerColor = ""}
        containerTable["frontFace"] = containerData["front"] ~= nil and containerData["front"] or ""
        container.setTable("tyrantUnified", containerTable)
    end
    return containerTable
end

function CheckGetSetCardTable (card, containerTable)
    local cardTable = card.getTable("tyrantUnified")
    if cardTable == nil then
        cardData = card.getCustomObject()
        cardTable = {cardBack = "", frontFace = "", backFace = "", containerID = "", ownerColor = ""}
        cardTable["frontFace"] = cardData["front"] ~= nil and cardData["front"] or ""
        cardTable["backFace"] = cardData["back"] ~= nil and cardData["back"]or ""
    end

    if containerTable ~= nil then
        cardTable.cardBack = containerTable.cardBack
        cardTable.containerID = containerTable.containerID
        cardTable.ownerColor = containerTable.ownerColor
    end

    card.setTable("tyrantUnified", cardTable)
    return cardTable
end

function CheckRevertInvertedFaces (card)
    local cardData = card.getCustomObject()
    local faceAddress = cardData["face"] ~= nil and cardData["face"] or ""
    local backAddress = cardData["back"] ~= nil and cardData["back"] or ""
    if faceAddress:find("/back/") and backAddress:find("/front/") then
        --broadcastToAll("[888888][EASY MODULES][-]\nInverted card faces detected & switched for "..card.getName():match("(.-)\n"))
        InvertCardFaces(card)
    end
end

function InvertCardFaces (card)
    cardData = card.getCustomObject()
    initialFrontFace = cardData.face
    initialBackFace = cardData.back

    cardData.face = initialBackFace
    cardData.back = initialFrontFace

    card.setCustomObject(cardData)
    card.reload()
end

function onObjectEnterScriptingZone(zone, object)
    if object == nil or object.tag ~= "Card" then return end

    local enc = Global.getVar('Encoder')
    if enc ~= nil then
        local encoderZones
        --9 encoder update workarounds
        --9 encoder update workarounds
        --one week out, waiting around
        --10 encoder update workarounds
        local apiCheck = enc.getVar("APIlistZones")
        if apiCheck ~= nil then
            encoderZones = enc.call("APIlistZones",{})
        else
            encoderZones = enc.getTable("Zones")
        end

        if encoderZones[zone.getGUID()] ~= nil then
            local cardTable = CheckGetSetCardTable(object)
            local containerGUID = cardTable.containerID

            if containerGUID == nil or containerGUID == "" then return end

            local playerColor = encoderZones[zone.getGUID()].color
            if (deckCandidateTracker[playerColor][containerGUID]) ~= nil then
                deckCandidateTracker[playerColor][containerGUID].count = deckCandidateTracker[playerColor][containerGUID].count + 1;
                --jesus christ why does lua not have increment operators
            else
                deckCandidateTracker[playerColor][containerGUID] = {count = 1}
            end
            if deckCandidateTracker[playerColor][containerGUID].count == 7 then
                deck = getObjectFromGUID(containerGUID)
                --broadcastToAll("Deck set for ".."["..Color.fromString(playerColor):toHex(false).."]"..playerColor.."[-]")

                if deck ~= nil then
                    AddPlayerDeck(playerColor, containerGUID)
                end
            end
        end
    end
end

function AddPlayerDeck(playerColor, containerGUID)
    if deckPlayerPairs[containerGUID] ~= nil then
        deckCandidateTracker[deckPlayerPairs[containerGUID]][containerGUID].count = 0
    end
    deckPlayerPairs[containerGUID] = playerColor

    containerObject = getObjectFromGUID(containerGUID)
    if containerObject ~= nil then
        containerTable = CheckGetSetContainerTable(containerObject)
        containerTable.ownerColor = playerColor
        containerObject.setTable("tyrantUnified", containerTable)
    end
end

function DoNothing()
end
