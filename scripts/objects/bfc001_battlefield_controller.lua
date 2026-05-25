-- Riftbound shared battlefield row (link / conquer).
version = '1.0.0'

battlefieldZones = {}
battlefieldZone = nil
battlefieldButtons = {}
battlefieldLinkState = {}
battlefieldClaimState = {}
battlefieldButtonHomePos = {}
battlefieldHighlightMatGuid = "5cb175"
BF_BUTTON_STASH_Y = -500
BF_HIGHLIGHT_Y = 0.92
BF_HIGHLIGHT_Z = 0
BF_HIGHLIGHT_SCALE = {7.52, 1, 2.6}
BF_HIGHLIGHT_ALPHA = 0.05
BF_TEXT_OFFSET_Z = 4.20
BF_TEXT_MAX_WIDTH = 27.40
BF_TEXT_MAX_FONT = 32
BF_TEXT_MIN_FONT = 24
BF_TEXT_TABLE_Y = 0.9611349
BF_TEXT_WIDTH_PER_CHAR = 0.019
BF_LINK_BUTTON_TIP = '[b]Link / Unlink[/b]\n[i]left click[/i] to link\n[i]right click[/i] to unlink'
BF_CONQUER_BUTTON_TIP = '[b]Conquer / Unclaim[/b]\n[i]left click[/i] to conquer\n[i]right click[/i] to unclaim'
BF_DIFFUSE_LINK_READY = 'https://steamusercontent-a.akamaihd.net/ugc/13941062534459188082/661B8211A49ED70CFF04E341639CA1076123ABDD/'
BF_DIFFUSE_LINK_LOCKED = 'https://steamusercontent-a.akamaihd.net/ugc/15433159385786284733/0727B1207E1F2F384BA83E89D6CA9E8BABD0D03E/'
BF_LINK_BUTTON_ROT = {0, 90, 0}
BF_CLAIM_BUTTON_ROT = {0, 180, 0}
drawDelay = 0.1
battlefieldButtonHomeDefaults = {
  left = {
    link = {x = -32.13, y = 1.0, z = -0.02},
    claim = {x = -27.13, y = 1.0, z = -0.02},
  },
  center = {
    link = {x = -2.5, y = 1.0, z = -0.02},
    claim = {x = 2.5, y = 1.0, z = -0.02},
  },
  right = {
    link = {x = 27.13, y = 1.0, z = -0.02},
    claim = {x = 32.13, y = 1.0, z = -0.02},
  },
}

function onLoad()
  self.interactable = false
  self.setLock(true)
  battlefieldInitLinkState()
  battlefieldInitClaimState()
  Global.setVar('Battlefield', self)
  Wait.condition(function()
    setupBattlefield()
  end, function()
    return battlefieldGUIDsReady()
  end, 30, function()
    print('[Riftbound] Battlefield controller: missing zones or buttons (check save GUIDs)')
  end)
end

function battlefieldGUIDsReady()
  local ids = {
    "bf1d02", "bf1d01", "bf1d03",
    "bf2k01", "bf2c01", "bf2k02", "bf2c02", "bf2k03", "bf2c03",
  }
  for _, guid in ipairs(ids) do
    if getObjectFromGUID(guid) == nil then return false end
  end
  return true
end

function registerBattlefieldGUIDs()
  battlefieldZones = {
    left   = getObjectFromGUID("bf1d02"),
    center = getObjectFromGUID("bf1d01"),
    right  = getObjectFromGUID("bf1d03"),
  }
  battlefieldZone = battlefieldZones.center
  battlefieldButtons = {
    left   = {link = getObjectFromGUID("bf2k01"), claim = getObjectFromGUID("bf2c01")},
    center = {link = getObjectFromGUID("bf2k02"), claim = getObjectFromGUID("bf2c02")},
    right  = {link = getObjectFromGUID("bf2k03"), claim = getObjectFromGUID("bf2c03")},
  }
end

function setupBattlefield()
  registerBattlefieldGUIDs()
  if battlefieldZones.left == nil or battlefieldButtons.left.link == nil then
    print('[Riftbound] Battlefield controller: missing zones or buttons (check save GUIDs)')
    return
  end
  buildBattlefieldTableButtons()
  battlefieldRefreshAllSlotButtons()
  print('[Riftbound] Battlefield controller '..version..' loaded')
end

-- Global script forwards zone / drop events here.
function APIslotForZoneGuid(params)
  if params == nil or params.zoneGuid == nil then return nil end
  for slot, zone in pairs(battlefieldZones) do
    if zone ~= nil and zone.getGUID() == params.zoneGuid then return slot end
  end
  return nil
end

function APIonCardZoneEvent(params)
  local slot = APIslotForZoneGuid(params)
  if slot == nil then return end
  Wait.frames(function() battlefieldRefreshSlotButtons(slot) end, 5)
end

function APIrefreshAll(params)
  battlefieldRefreshAllSlotButtons()
end

function APIgetZones(params)
  return battlefieldZones
end

function APIgetZone(params)
  return battlefieldZone
end

function APIgetObjects(params)
  local seen = {}
  local result = {}
  for _, slot in ipairs({"left", "center", "right"}) do
    local zone = battlefieldZones[slot]
    if zone ~= nil then
      for _, obj in ipairs(zone.getObjects(true)) do
        if not seen[obj] then
          seen[obj] = true
          table.insert(result, obj)
        end
      end
    end
  end
  return result
end

function battlefieldInitLinkState()
  battlefieldLinkState = {}
  for _, slot in ipairs({"left", "center", "right"}) do
    battlefieldLinkState[slot] = {linked = false, cardGuid = nil, textNeg = nil, textPos = nil}
  end
end

function battlefieldInitClaimState()
  battlefieldClaimState = {}
  for _, slot in ipairs({"left", "center", "right"}) do
    battlefieldClaimState[slot] = {claimed = false, ownerColor = nil, highlightGuid = nil}
  end
end

function battlefieldPlayerTint(playerColor)
  local rgb = stringColorToRGB(playerColor)
  return {rgb.r, rgb.g, rgb.b, BF_HIGHLIGHT_ALPHA}
end

function battlefieldRemoveClaimHighlight(slot)
  local state = battlefieldClaimState[slot]
  if state == nil then return end
  if state.highlightGuid ~= nil then
    pcall(function()
      local highlight = getObjectFromGUID(state.highlightGuid)
      if highlight ~= nil then highlight.destruct() end
    end)
  end
  state.claimed = false
  state.ownerColor = nil
  state.highlightGuid = nil
end

function battlefieldClaimHighlightPosition(slot)
  local zone = battlefieldZones[slot]
  if zone == nil then return nil end
  return {x = zone.getPosition().x, y = BF_HIGHLIGHT_Y, z = BF_HIGHLIGHT_Z}
end

function battlefieldPinClaimHighlight(highlight, pos)
  if highlight == nil or pos == nil then return end
  highlight.setScale(BF_HIGHLIGHT_SCALE)
  highlight.setRotation({0, 0, 0})
  highlight.setPosition(pos)
  highlight.interactable = false
  highlight.setLock(true)
end

function battlefieldRebuildClaimButton(slot)
  local buttons = battlefieldButtons[slot]
  if buttons == nil or buttons.claim == nil then return end
  createBattlefieldTableButton(buttons.claim, 'Conquer', 'battlefieldClaimClick', BF_CONQUER_BUTTON_TIP)
  buttons.claim.setRotation(BF_CLAIM_BUTTON_ROT)
  local home = battlefieldButtonHome(slot, 'claim')
  if home ~= nil then
    buttons.claim.setPosition(home)
    buttons.claim.interactable = true
  end
end

function battlefieldSpawnClaimHighlight(slot, playerColor)
  local ref = getObjectFromGUID(battlefieldHighlightMatGuid)
  if ref == nil then return nil end
  local pos = battlefieldClaimHighlightPosition(slot)
  if pos == nil then return nil end
  local highlight = ref.clone({position = pos, snap_to_grid = false})
  if highlight == nil then return nil end
  local guid = highlight.getGUID()
  pcall(function() highlight.setLuaScript("") end)
  battlefieldPinClaimHighlight(highlight, pos)
  pcall(function() highlight.setColorTint(battlefieldPlayerTint(playerColor)) end)
  highlight.setName("BF Highlight " .. slot)
  highlight.setDescription("")
  Wait.frames(function()
    local h = getObjectFromGUID(guid)
    if h ~= nil then battlefieldPinClaimHighlight(h, pos) end
  end, 2)
  return highlight
end

function battlefieldUnclaimSlot(slot)
  local state = battlefieldClaimState[slot]
  if state == nil or not state.claimed then return end
  battlefieldRemoveClaimHighlight(slot)
  battlefieldRebuildClaimButton(slot)
end

function battlefieldClaimSlot(slot, playerColor)
  local card, reason = getBattlefieldCardInSlot(slot)
  if card == nil then
    battlefieldWarnNoCard(slot, reason, playerColor)
    return
  end
  battlefieldUnclaimSlot(slot)
  local highlight = nil
  local ok, result = pcall(function()
    return battlefieldSpawnClaimHighlight(slot, playerColor)
  end)
  if ok then highlight = result end
  if highlight == nil then
    broadcastToColor("Could not create battlefield highlight.", playerColor, {1, 0.4, 0})
    battlefieldRebuildClaimButton(slot)
    return
  end
  local state = battlefieldClaimState[slot]
  state.claimed = true
  state.ownerColor = playerColor
  state.highlightGuid = highlight.getGUID()
  battlefieldRebuildClaimButton(slot)
end

function isBattlefieldCard(obj)
  if obj == nil or obj.type ~= "Card" then return false end
  local name = obj.getName() or ""
  local ok, matched = pcall(function()
    return Global.call('APIcardMatchesSearchType', {
      card = {
        name = name,
        nickname = name,
        description = obj.getDescription(),
        gm_notes = obj.getGMNotes(),
      },
      searchType = 'battlefield',
    })
  end)
  if ok and matched then return true end
  local typeline = name:match("\n(.*)") or ""
  if typeline:lower():find("battlefield", 1, true) then return true end
  local desc = (obj.getDescription() or ""):lower()
  if desc:find("battlefield", 1, true) then return true end
  return false
end

function getBattlefieldAbilityText(card)
  local desc = (card.getDescription() or ""):gsub("%[.-%]", "")
  if desc:gsub("%s", "") ~= "" then return desc end
  return (card.getName() or ""):gsub("\n.*", "")
end

function battlefieldLongestLineLength(text)
  local maxLen = 0
  for line in string.gmatch(text or "", "[^\n]+") do
    if #line > maxLen then maxLen = #line end
  end
  return math.max(maxLen, #(text or ""))
end

function battlefieldComputeFontSize(text)
  local lineLen = battlefieldLongestLineLength(text)
  if lineLen == 0 then return BF_TEXT_MIN_FONT end
  local font = BF_TEXT_MAX_FONT
  while lineLen * font * BF_TEXT_WIDTH_PER_CHAR > BF_TEXT_MAX_WIDTH and font > BF_TEXT_MIN_FONT do
    font = font - 2
  end
  return font
end

function battlefieldSlotHasCard(slot)
  local zone = battlefieldZones[slot]
  if zone == nil then return false end
  for _, obj in ipairs(zone.getObjects(true)) do
    if obj.type == "Card" then return true end
  end
  return false
end

function battlefieldButtonHome(slot, key)
  local saved = battlefieldButtonHomePos[slot] and battlefieldButtonHomePos[slot][key]
  if saved ~= nil and saved.y > -100 then return saved end
  local defaults = battlefieldButtonHomeDefaults[slot]
  return defaults and defaults[key]
end

function battlefieldSaveButtonHomePositions()
  for slot, buttons in pairs(battlefieldButtons) do
    if battlefieldButtonHomePos[slot] == nil then battlefieldButtonHomePos[slot] = {} end
    for _, key in ipairs({"link", "claim"}) do
      local btn = buttons[key]
      if btn ~= nil then
        local pos = btn.getPosition()
        if pos.y > -100 then
          battlefieldButtonHomePos[slot][key] = {x = pos.x, y = pos.y, z = pos.z}
        end
      end
    end
  end
end

function battlefieldSetSlotButtonsVisible(slot, visible)
  local buttons = battlefieldButtons[slot]
  if buttons == nil then return end
  for _, key in ipairs({"link", "claim"}) do
    local btn = buttons[key]
    local home = battlefieldButtonHome(slot, key)
    if btn ~= nil and home ~= nil then
      if visible then
        btn.setPosition(home)
        btn.interactable = true
      else
        btn.setPosition({x = home.x, y = BF_BUTTON_STASH_Y, z = home.z})
        btn.interactable = false
      end
    end
  end
end

function battlefieldRefreshSlotButtons(slot)
  local show = battlefieldSlotHasCard(slot)
  battlefieldSetSlotButtonsVisible(slot, show)
  if not show then
    battlefieldUnlinkSlot(slot)
    battlefieldUnclaimSlot(slot)
  end
end

function battlefieldRefreshAllSlotButtons()
  for _, slot in ipairs({"left", "center", "right"}) do
    battlefieldRefreshSlotButtons(slot)
  end
end

function getBattlefieldCardInSlot(slot)
  local zone = battlefieldZones[slot]
  if zone == nil then return nil, "empty" end
  local found = nil
  local anyCard = false
  for _, obj in ipairs(zone.getObjects(true)) do
    if obj.type == "Card" then
      anyCard = true
      if isBattlefieldCard(obj) then
        if found ~= nil then return nil, "multiple" end
        found = obj
      end
    end
  end
  if found ~= nil then return found end
  if anyCard then return nil, "not_battlefield" end
  return nil, "empty"
end

function battlefieldSpawnText(zone, offsetZ, text, fontSize)
  local worldPos = zone.getPosition() + zone.getTransformForward():scale(offsetZ)
  worldPos.y = BF_TEXT_TABLE_Y
  local rot = zone.getRotation()
  rot.x = 90
  if offsetZ > 0 then
    rot.y = rot.y + 180
  end
  local textObj = spawnObject({
    type = "3DText",
    position = worldPos,
    rotation = rot,
    sound = false,
  })
  textObj.TextTool.setValue(text)
  textObj.TextTool.setFontSize(fontSize)
  textObj.interactable = false
  textObj.setLock(true)
  return textObj
end

function battlefieldClearSlotText(slot)
  local state = battlefieldLinkState[slot]
  if state == nil then return end
  for _, key in ipairs({"textNeg", "textPos"}) do
    local guid = state[key]
    state[key] = nil
    if guid ~= nil then
      pcall(function()
        local textObj = getObjectFromGUID(guid)
        if textObj ~= nil then textObj.destruct() end
      end)
    end
  end
end

function battlefieldRefreshLinkButtonRef(slot)
  local btn = battlefieldButtons[slot] and battlefieldButtons[slot].link
  if btn == nil then return nil end
  local guid
  local ok = pcall(function() guid = btn.getGUID() end)
  if not ok then return nil end
  local fresh = getObjectFromGUID(guid)
  if fresh ~= nil then battlefieldButtons[slot].link = fresh end
  return battlefieldButtons[slot].link
end

function battlefieldUnlinkSlot(slot)
  local state = battlefieldLinkState[slot]
  if state == nil or not state.linked then return end
  battlefieldClearSlotText(slot)
  if state.cardGuid ~= nil then
    pcall(function()
      local card = getObjectFromGUID(state.cardGuid)
      if card ~= nil then card.setLock(false) end
    end)
  end
  state.linked = false
  state.cardGuid = nil
  battlefieldSetLinkButtonLinked(slot, false)
end

function battlefieldRebuildLinkButton(slot)
  local btn = battlefieldRefreshLinkButtonRef(slot)
  if btn == nil then return end
  createBattlefieldTableButton(btn, 'Link', 'battlefieldLinkClick', BF_LINK_BUTTON_TIP)
  btn.setRotation(BF_LINK_BUTTON_ROT)
  local home = battlefieldButtonHome(slot, 'link')
  if home ~= nil then
    btn.setPosition(home)
    btn.interactable = true
  end
end

function battlefieldFinishLinkButtonVisual(slot)
  battlefieldRebuildLinkButton(slot)
  if battlefieldSlotHasCard(slot) then
    battlefieldSetSlotButtonsVisible(slot, true)
  end
end

function battlefieldSetLinkButtonLinked(slot, linked)
  local btn = battlefieldButtons[slot] and battlefieldButtons[slot].link
  if btn == nil then return end
  local guid
  local gok = pcall(function() guid = btn.getGUID() end)
  if not gok then return end
  local diffuse = linked and BF_DIFFUSE_LINK_LOCKED or BF_DIFFUSE_LINK_READY
  Wait.frames(function()
    local b = getObjectFromGUID(guid)
    if b == nil then
      battlefieldFinishLinkButtonVisual(slot)
      return
    end
    battlefieldButtons[slot].link = b
    local newBtn = nil
    local ok = pcall(function()
      local custom = b.getCustomObject()
      if custom == nil then return end
      custom.diffuse = diffuse
      b.setCustomObject(custom)
      newBtn = b.reload()
    end)
    if not ok then
      battlefieldFinishLinkButtonVisual(slot)
      return
    end
    local newGuid = nil
    if newBtn ~= nil then
      pcall(function() newGuid = newBtn.getGUID() end)
    end
    if newGuid ~= nil then
      Wait.condition(
        function() battlefieldFinishLinkButtonVisual(slot) end,
        function()
          local fresh = getObjectFromGUID(newGuid)
          if fresh ~= nil then
            battlefieldButtons[slot].link = fresh
            return true
          end
          return false
        end,
        10,
        function() battlefieldFinishLinkButtonVisual(slot) end
      )
    else
      Wait.frames(function() battlefieldFinishLinkButtonVisual(slot) end, 3)
    end
  end, 1)
end

function battlefieldWarnNoCard(slot, reason, playerColor)
  if reason == "multiple" then
    broadcastToColor("Only one Battlefield card per slot.", playerColor, {1, 0.4, 0})
  elseif reason == "not_battlefield" then
    broadcastToColor("That zone does not contain a Battlefield card.", playerColor, {1, 0.4, 0})
  else
    broadcastToColor("Place a Battlefield card in the "..slot.." slot before linking.", playerColor, {1, 0.4, 0})
  end
end

function battlefieldLinkSlot(slot, playerColor)
  local card, reason = getBattlefieldCardInSlot(slot)
  if card == nil then
    battlefieldWarnNoCard(slot, reason, playerColor)
    return
  end
  battlefieldUnlinkSlot(slot)
  local zone = battlefieldZones[slot]
  local text = getBattlefieldAbilityText(card)
  local fontSize = battlefieldComputeFontSize(text)
  local textNeg = battlefieldSpawnText(zone, -BF_TEXT_OFFSET_Z, text, fontSize)
  local textPos = battlefieldSpawnText(zone, BF_TEXT_OFFSET_Z, text, fontSize)
  local state = battlefieldLinkState[slot]
  state.linked = true
  state.cardGuid = card.getGUID()
  state.textNeg = textNeg.getGUID()
  state.textPos = textPos.getGUID()
  card.setLock(true)
  battlefieldSetLinkButtonLinked(slot, true)
end

function buttonPress(button, T)
  local posUp = button.getPosition()
  local posDown = button.getPosition()
  posUp.y = 1
  posDown.y = 0.9
  local downT = T
  if downT < 0.05 then downT = 0.05 end
  local guid = button.getGUID()
  button.setPositionSmooth(posDown, false, true)
  Wait.time(function()
    local b = getObjectFromGUID(guid)
    if b ~= nil then b.setPositionSmooth(posUp, false, true) end
  end, downT)
end

function createBattlefieldTableButton(object, name, clickFunction, ttip)
  object.clearButtons()
  object.tooltip = false
  object.interactable = true
  object.setLock(true)
  object.setName(name)
  return object.createButton({
    click_function = clickFunction,
    function_owner = self,
    tooltip = ttip,
    width = 600,
    height = 600,
    position = {0, 0.1, 0},
    font_size = 250,
    color = {1, 1, 1, 0},
    font_color = {1, 1, 1, 100},
  })
end

function buildBattlefieldTableButtons()
  for slot, buttons in pairs(battlefieldButtons) do
    if buttons.link ~= nil then
      createBattlefieldTableButton(buttons.link, 'Link', 'battlefieldLinkClick', BF_LINK_BUTTON_TIP)
      buttons.link.setRotation(BF_LINK_BUTTON_ROT)
    end
    if buttons.claim ~= nil then
      createBattlefieldTableButton(buttons.claim, 'Conquer', 'battlefieldClaimClick', BF_CONQUER_BUTTON_TIP)
      buttons.claim.setRotation(BF_CLAIM_BUTTON_ROT)
    end
  end
  battlefieldSaveButtonHomePositions()
  battlefieldRefreshAllSlotButtons()
end

function battlefieldButtonSlot(button, action)
  if button == nil then return nil end
  local btnGuid
  local gok = pcall(function() btnGuid = button.getGUID() end)
  if not gok then return nil end
  for slot, buttons in pairs(battlefieldButtons) do
    local ref = buttons[action]
    if ref ~= nil then
      local refGuid
      local rok = pcall(function() refGuid = ref.getGUID() end)
      if rok and refGuid == btnGuid then return slot end
    end
  end
  return nil
end

function battlefieldLinkClick(button, playerColor, alt)
  local slot = battlefieldButtonSlot(button, 'link')
  if slot == nil then return end
  buttonPress(button, drawDelay * 0.75)
  local ok, err = pcall(function()
    if alt then
      battlefieldUnlinkSlot(slot)
    else
      battlefieldLinkSlot(slot, playerColor)
    end
  end)
  if not ok then
    print("battlefield link error: " .. tostring(err))
    battlefieldFinishLinkButtonVisual(slot)
  end
end

function battlefieldClaimClick(button, playerColor, alt)
  local slot = battlefieldButtonSlot(button, 'claim')
  if slot == nil then return end
  buttonPress(button, drawDelay * 0.75)
  local ok, err = pcall(function()
    if alt then
      battlefieldUnclaimSlot(slot)
    else
      battlefieldClaimSlot(slot, playerColor)
    end
  end)
  if not ok then
    print("battlefield claim error: " .. tostring(err))
    battlefieldRebuildClaimButton(slot)
  end
end
