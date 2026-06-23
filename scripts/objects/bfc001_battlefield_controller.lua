-- Riftbound shared battlefield row (link / conquer).
version = '1.1.0'

battlefieldZones = {}
battlefieldPlayZones = {}
battlefieldZone = nil
battlefieldButtons = {}
battlefieldLinkState = {}
battlefieldClaimState = {}
battlefieldButtonHomePos = {}
battlefieldBaseZoneScale = {}
battlefieldBasePlayZoneScale = {}
battlefieldSnapCache = nil
battlefieldSnapTemplate = nil
battlefieldHighlightMatGuid = "5cb175"
BF_SLOT_IDS = {"left", "center", "right", "far"}
BF_DEFAULT_COUNT = 3
BF_MIN_COUNT = 2
BF_MAX_COUNT = 4
BF_LAYOUT_BUSY = false
-- While true, link buttons never reload() their diffuse. Held for the whole
-- layout-settle window so the burst of link/unlink (including zone-event driven
-- refreshes of moved cards) cannot fire a reload, whose async destroy/recreate
-- emits an uncatchable native "Object reference not set" error en masse.
BF_SUPPRESS_BUTTON_RELOAD = false
battlefieldCount = BF_DEFAULT_COUNT
battlefieldCountStateLoaded = false
BF_CARD_WIDTH_BASE = 3.25
BF_PLAY_WIDTH_BASE = 28.2
BF_GAP = 1.43
BF_WIDTH_PX = {
  [2] = 2004.0,
  [3] = 1313.33,
  [4] = 968.0,
}
BF_CENTER_ART_URLS = {
  empty = 'https://steamusercontent-a.akamaihd.net/ugc/14395674305976385630/804F65185097686C691F99C8E06FADF1816B09BA/',
  [2] = 'https://steamusercontent-a.akamaihd.net/ugc/17180158956492271402/C88E1F97BDEA299AB81A16227E88593C1BFED379/',
  [3] = 'https://steamusercontent-a.akamaihd.net/ugc/12179059554401516027/1D3D113DBCB2C03131E3F9D931EFFF0B4E9792E7/',
  [4] = 'https://steamusercontent-a.akamaihd.net/ugc/12963289684765275103/A908DF7A0C03A57E389629AF5E4F7A128D58F1AF/',
}
BF_ART_TARGET_GUID = nil
BF_ART_DECAL_NAME = 'rb_battlefield_center_art'
BF_ART_DECAL_POS = {x = 0.0, y = 1.02, z = -0.02}
BF_ART_DECAL_ROT = {x = 90.0, y = 180.0, z = 0.0}
BF_ART_DECAL_SCALE = {x = 84.0, y = 9.5, z = 9.5}
BF_ART_EDITABLE_TILE = true
BF_ART_TILE_POS = {x = 0.0, y = 0.961, z = -0.02}
BF_ART_TILE_ROT = {x = 0.0, y = 180.0, z = 0.0}
BF_ART_TILE_SCALE = {x = 6.17, y = 0.001, z = 6.20}
-- Piles next to the battlefield counter control, used when a populated lane is
-- removed during a destructive decrease. Same-type cards moved to one point
-- auto-stack into a deck.
BF_PILE_CARDS = {x = -50.53, y = 0.98, z = -13.23}
BF_PILE_BATTLEFIELDS = {x = -51.00, y = 0.98, z = -10.53}
BF_PILE_NONCARD = {x = -53.35, y = 1.03, z = -9.99}
BF_PILE_STACK_DY = 0.4
BF_OBJECT_Y_OFFSET = 0.35
BF_SLOT_CARD_DX = 0.9
BF_PLAY_MARGIN = 0.9
BF_ZONE_GUIDS = {
  left = "bf1d02",
  center = "bf1d01",
  right = "bf1d03",
  far = "bf1d04",
}
BF_PLAY_ZONE_GUIDS = {
  left = "bfz002",
  center = "bfz001",
  right = "bfz003",
  far = "bfz004",
}
BF_BUTTON_GUIDS = {
  left = {link = "bf2k01", claim = "bf2c01"},
  center = {link = "bf2k02", claim = "bf2c02"},
  right = {link = "bf2k03", claim = "bf2c03"},
  far = {link = "bf2k04", claim = "bf2c04"},
}
BF_FOURTH_CREATED = false
BF_BUTTON_STASH_Y = -500
BF_STASH_X = 250
BF_STASH_Z = 250
BF_HIDDEN_ZONE_SCALE = {x = 0.01, y = 0.01, z = 0.01}
BF_CARD_ZONE_Y = 1.95
BF_PLAY_ZONE_Y = 0.8
BF_ZONE_Z = -0.02
BF_HIGHLIGHT_Y = 0.92
BF_HIGHLIGHT_Z = 0
BF_HIGHLIGHT_SCALE_BASE = {7.52, 1, 2.6}
battlefieldHighlightScale = {7.52, 1, 2.6}
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
  far = {
    link = {x = 30.5, y = 1.0, z = -0.02},
    claim = {x = 35.5, y = 1.0, z = -0.02},
  },
}

function onSave()
  return JSON.encode({
    battlefieldCount = battlefieldCount,
    artGuid = BF_ART_TARGET_GUID,
    fourth = {
      zone = BF_ZONE_GUIDS.far,
      play = BF_PLAY_ZONE_GUIDS.far,
      link = BF_BUTTON_GUIDS.far.link,
      claim = BF_BUTTON_GUIDS.far.claim,
      created = BF_FOURTH_CREATED,
    },
  })
end

function battlefieldLoadSavedState()
  if self.script_state == nil or self.script_state == '' then return end
  local ok, decoded = pcall(function() return JSON.decode(self.script_state) end)
  if not ok or decoded == nil then return end
  battlefieldCount = math.max(BF_MIN_COUNT, math.min(BF_MAX_COUNT, tonumber(decoded.battlefieldCount) or BF_DEFAULT_COUNT))
  battlefieldCountStateLoaded = true
  if decoded.artGuid ~= nil and decoded.artGuid ~= '' then
    BF_ART_TARGET_GUID = decoded.artGuid
  end
  if decoded.fourth ~= nil then
    local f = decoded.fourth
    if f.zone ~= nil and f.zone ~= '' then BF_ZONE_GUIDS.far = f.zone end
    if f.play ~= nil and f.play ~= '' then BF_PLAY_ZONE_GUIDS.far = f.play end
    if f.link ~= nil and f.link ~= '' then BF_BUTTON_GUIDS.far.link = f.link end
    if f.claim ~= nil and f.claim ~= '' then BF_BUTTON_GUIDS.far.claim = f.claim end
    BF_FOURTH_CREATED = f.created and true or false
  end
end

function onLoad()
  self.interactable = false
  self.setLock(true)
  battlefieldLoadSavedState()
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
  local ids = {"bf1d02", "bf1d01", "bf1d03", "bf2k01", "bf2c01", "bf2k02", "bf2c02", "bf2k03", "bf2c03", "bfz002", "bfz001", "bfz003"}
  for _, guid in ipairs(ids) do
    if getObjectFromGUID(guid) == nil then return false end
  end
  return true
end

function registerBattlefieldGUIDs()
  battlefieldEnsureFourthSlotObjects()
  battlefieldZones = {}
  battlefieldPlayZones = {}
  battlefieldButtons = {}
  battlefieldBaseZoneScale = {}
  battlefieldBasePlayZoneScale = {}
  for _, slot in ipairs(BF_SLOT_IDS) do
    battlefieldZones[slot] = getObjectFromGUID(BF_ZONE_GUIDS[slot])
    battlefieldPlayZones[slot] = getObjectFromGUID(BF_PLAY_ZONE_GUIDS[slot])
    if battlefieldZones[slot] ~= nil then
      local s = battlefieldZones[slot].getScale()
      battlefieldBaseZoneScale[slot] = {x = s.x, y = s.y, z = s.z}
    end
    if battlefieldPlayZones[slot] ~= nil then
      local s = battlefieldPlayZones[slot].getScale()
      battlefieldBasePlayZoneScale[slot] = {x = s.x, y = s.y, z = s.z}
    end
    local b = BF_BUTTON_GUIDS[slot]
    battlefieldButtons[slot] = {
      link = b and getObjectFromGUID(b.link) or nil,
      claim = b and getObjectFromGUID(b.claim) or nil,
    }
  end
  battlefieldZone = battlefieldZones.center
end

function battlefieldCloneIfMissing(existingGuid, sourceObj, opts)
  if existingGuid ~= nil and existingGuid ~= '' then
    local existing = getObjectFromGUID(existingGuid)
    if existing ~= nil then return existingGuid end
  end
  if sourceObj == nil then return existingGuid end
  local pos = sourceObj.getPosition()
  local rot = sourceObj.getRotation()
  local clone = sourceObj.clone({
    position = {x = pos.x + (opts and opts.dx or 10), y = pos.y, z = pos.z + (opts and opts.dz or 0)},
    rotation = rot,
    snap_to_grid = false,
  })
  if clone == nil then return existingGuid end
  if opts and opts.name then clone.setName(opts.name) end
  if opts and opts.desc then clone.setDescription(opts.desc) end
  if opts and opts.lock ~= nil then clone.setLock(opts.lock) end
  if opts and opts.interactable ~= nil then clone.interactable = opts.interactable end
  return clone.getGUID()
end

function battlefieldEnsureFourthSlotObjects()
  local rightZone = getObjectFromGUID(BF_ZONE_GUIDS.right)
  local rightPlay = getObjectFromGUID(BF_PLAY_ZONE_GUIDS.right)
  local rightLink = getObjectFromGUID(BF_BUTTON_GUIDS.right.link)
  local rightClaim = getObjectFromGUID(BF_BUTTON_GUIDS.right.claim)

  BF_ZONE_GUIDS.far = battlefieldCloneIfMissing(BF_ZONE_GUIDS.far, rightZone, {
    dx = 16,
    name = 'Battlefield Far',
    desc = 'Auto-created 4th battlefield zone',
    lock = true,
    interactable = false,
  })
  BF_PLAY_ZONE_GUIDS.far = battlefieldCloneIfMissing(BF_PLAY_ZONE_GUIDS.far, rightPlay, {
    dx = 16,
    name = 'Battlefield Play Zone Far',
    desc = 'Auto-created 4th battlefield play zone',
    lock = true,
    interactable = false,
  })
  BF_BUTTON_GUIDS.far.link = battlefieldCloneIfMissing(BF_BUTTON_GUIDS.far.link, rightLink, {
    dx = 16,
    name = 'BF Link Far',
    desc = 'Auto-created 4th battlefield link button',
    lock = true,
    interactable = true,
  })
  BF_BUTTON_GUIDS.far.claim = battlefieldCloneIfMissing(BF_BUTTON_GUIDS.far.claim, rightClaim, {
    dx = 16,
    name = 'BF Conquer Far',
    desc = 'Auto-created 4th battlefield conquer button',
    lock = true,
    interactable = true,
  })

  BF_FOURTH_CREATED = (
    getObjectFromGUID(BF_ZONE_GUIDS.far) ~= nil and
    getObjectFromGUID(BF_PLAY_ZONE_GUIDS.far) ~= nil and
    getObjectFromGUID(BF_BUTTON_GUIDS.far.link) ~= nil and
    getObjectFromGUID(BF_BUTTON_GUIDS.far.claim) ~= nil
  )
end

function setupBattlefield()
  registerBattlefieldGUIDs()
  if battlefieldZones.left == nil or battlefieldButtons.left.link == nil then
    print('[Riftbound] Battlefield controller: missing zones or buttons (check save GUIDs)')
    return
  end
  buildBattlefieldTableButtons()
  battlefieldApplyInitialGeometry(battlefieldCount)
  battlefieldRefreshAllSlotButtons()
  print('[Riftbound] Battlefield controller '..version..' loaded ('..tostring(battlefieldCount)..' battlefields)')
end

function battlefieldClampCount(n)
  local value = tonumber(n) or BF_DEFAULT_COUNT
  if value < BF_MIN_COUNT then value = BF_MIN_COUNT end
  if value > BF_MAX_COUNT then value = BF_MAX_COUNT end
  return math.floor(value + 0.5)
end

function battlefieldActiveSlots(count)
  local n = battlefieldClampCount(count or battlefieldCount)
  local result = {}
  for i = 1, n do table.insert(result, BF_SLOT_IDS[i]) end
  return result
end

function battlefieldWidthRatio(count)
  local px = BF_WIDTH_PX[count] or BF_WIDTH_PX[BF_DEFAULT_COUNT]
  return px / BF_WIDTH_PX[BF_DEFAULT_COUNT]
end

function battlefieldLayoutForCount(count)
  local n = battlefieldClampCount(count)
  local ratio = battlefieldWidthRatio(n)
  local playWidth = BF_PLAY_WIDTH_BASE * ratio
  local cardWidth = BF_CARD_WIDTH_BASE * ratio
  local step = playWidth + BF_GAP
  local xs = {}
  for i = 1, n do
    xs[i] = (i - (n + 1) / 2) * step
  end
  return {
    count = n,
    cardWidth = cardWidth,
    playWidth = playWidth,
    xs = xs,
  }
end

function battlefieldIndexOf(list, value)
  for i, v in ipairs(list or {}) do
    if v == value then return i end
  end
  return nil
end

-- GUIDs of the controller's own helper objects, which must never be collected,
-- moved or piled as if they were game pieces.
function battlefieldHelperGuidSet()
  local set = {}
  if BF_ART_TARGET_GUID ~= nil and BF_ART_TARGET_GUID ~= '' then set[BF_ART_TARGET_GUID] = true end
  if battlefieldHighlightMatGuid ~= nil and battlefieldHighlightMatGuid ~= '' then
    set[battlefieldHighlightMatGuid] = true
  end
  for _, slot in ipairs(BF_SLOT_IDS) do
    local b = BF_BUTTON_GUIDS[slot]
    if b ~= nil then
      if b.link ~= nil then set[b.link] = true end
      if b.claim ~= nil then set[b.claim] = true end
    end
    -- Also exclude the live button references' CURRENT guids: a link button
    -- that has been reload()'d has a new guid not present in BF_BUTTON_GUIDS,
    -- and would otherwise be miscounted as lane content (and piled on removal).
    local live = battlefieldButtons[slot]
    if live ~= nil then
      for _, key in ipairs({'link', 'claim'}) do
        local btn = live[key]
        if btn ~= nil then
          local g = nil
          local ok = pcall(function() g = btn.getGUID() end)
          if ok and g ~= nil and g ~= '' then set[g] = true end
        end
      end
    end
  end
  return set
end

function battlefieldIsHelperObject(obj, helperSet, guid)
  if obj == nil then return true end
  if guid ~= nil and helperSet[guid] then return true end
  local t = nil
  pcall(function() t = obj.type end)
  if t == '3DText' or t == '3D Text' then return true end
  -- Dice (e.g. the turn-decider dice) are not lane content: never count them
  -- for occupancy, and never move or pile them during a layout change.
  if t == 'Dice' or t == 'Die' then return true end
  local internalName = nil
  pcall(function() internalName = obj.name end)
  if type(internalName) == 'string' and internalName:sub(1, 3) == 'Die' then return true end
  local name = ''
  pcall(function() name = obj.getName() or '' end)
  if name == 'Battlefield Center Art' then return true end
  if name:sub(1, 13) == 'BF Highlight ' then return true end
  return false
end

-- Collect the real game pieces sitting in a slot's card zone (bf1d0X) and play
-- area (bfz00X). Helper objects (link text, claim highlight, art tile, buttons)
-- are filtered out. Call only AFTER battlefieldClearTransientState so dangling
-- references to destroyed text/highlight objects cannot be captured.
function battlefieldCollectSlot(slot)
  local helperSet = battlefieldHelperGuidSet()
  local zone = battlefieldZones[slot]
  local play = battlefieldPlayZones[slot]
  local zoneObjs = {}
  local playObjs = {}
  local seen = {}

  local function classify(list, obj)
    if obj == nil then return end
    local guid = nil
    local ok = pcall(function() guid = obj.getGUID() end)
    if not ok or guid == nil or guid == '' then return end
    if seen[guid] then return end
    if battlefieldIsHelperObject(obj, helperSet, guid) then return end
    seen[guid] = true
    local t = nil
    pcall(function() t = obj.type end)
    local isCard = (t == 'Card' or t == 'Deck')
    local isBf = false
    if t == 'Card' then
      pcall(function() isBf = isBattlefieldCard(obj) end)
    end
    local locked = false
    pcall(function() locked = obj.getLock() end)
    local pos = nil
    pcall(function() pos = obj.getPosition() end)
    table.insert(list, {
      obj = obj,
      guid = guid,
      isCard = isCard,
      isBf = isBf,
      locked = locked,
      pos = pos and {x = pos.x, y = pos.y, z = pos.z} or {x = 0, y = BF_PLAY_ZONE_Y, z = BF_ZONE_Z},
    })
  end

  if zone ~= nil then
    for _, obj in ipairs(zone.getObjects(true)) do classify(zoneObjs, obj) end
  end
  if play ~= nil then
    for _, obj in ipairs(play.getObjects()) do classify(playObjs, obj) end
  end
  local cardCount = 0
  for _, e in ipairs(zoneObjs) do if e.isCard then cardCount = cardCount + 1 end end
  for _, e in ipairs(playObjs) do if e.isCard then cardCount = cardCount + 1 end end
  return {
    zoneObjs = zoneObjs,
    playObjs = playObjs,
    isEmpty = (#zoneObjs == 0 and #playObjs == 0),
    cardCount = cardCount,
    hasCards = (cardCount > 0),
  }
end

-- Gravity-safe smooth move (mirrors recycleMoveObjectToBottomZone in global.lua):
-- unlock, drop gravity, glide to target, then relock or restore gravity.
function battlefieldPlaceObject(obj, pos, lock)
  if obj == nil or pos == nil then return end
  local guid = nil
  local ok = pcall(function() guid = obj.getGUID() end)
  if not ok or guid == nil or guid == '' then return end
  pcall(function()
    obj.setLock(false)
    obj.use_gravity = false
    obj.setPositionSmooth(pos, false, true)
  end)
  Wait.time(function()
    local o = getObjectFromGUID(guid)
    if o == nil then return end
    if lock then
      pcall(function() o.setLock(true) end)
    else
      pcall(function() o.use_gravity = true end)
    end
  end, 0.5)
end

-- Move a slot's card-zone (bf1d0X) pieces onto the destination zone centre,
-- keeping each piece's height/depth and lightly stacking any extras on x.
function battlefieldMoveSlotCards(entries, zone)
  if zone == nil then return end
  local base = zone.getPosition()
  for k, entry in ipairs(entries or {}) do
    local pos = {
      x = base.x + (k - 1) * BF_SLOT_CARD_DX,
      y = entry.pos.y,
      z = entry.pos.z,
    }
    battlefieldPlaceObject(entry.obj, pos, entry.locked)
  end
end

-- Increase path: lanes shrank, so re-space the play-area pieces evenly across
-- the new (narrower) width, preserving left-to-right order, z and y.
function battlefieldMovePlayObjsSpaced(entries, centerX, playWidth)
  local list = entries or {}
  local n = #list
  if n == 0 then return end
  table.sort(list, function(a, b) return (a.pos.x or 0) < (b.pos.x or 0) end)
  local usable = math.max((playWidth or BF_PLAY_WIDTH_BASE) * BF_PLAY_MARGIN, 0)
  for k, entry in ipairs(list) do
    local x
    if n == 1 then
      x = centerX
    else
      x = centerX - usable / 2 + (usable / (n - 1)) * (k - 1)
    end
    battlefieldPlaceObject(entry.obj, {x = x, y = entry.pos.y, z = entry.pos.z}, entry.locked)
  end
end

-- Decrease path: lanes widened, but keep the existing spacing - just shift every
-- piece by the lane's centre delta, preserving z and y.
function battlefieldMovePlayObjsTranslated(entries, deltaX)
  for _, entry in ipairs(entries or {}) do
    battlefieldPlaceObject(entry.obj, {x = (entry.pos.x or 0) + deltaX, y = entry.pos.y, z = entry.pos.z}, entry.locked)
  end
end

-- Pile a removed lane's contents next to the counter: battlefields, other cards
-- and non-card objects each get their own stack point.
function battlefieldPileSlotPayload(payload)
  local stacks = {bf = 0, card = 0, other = 0}
  local function pile(entry)
    local base, key
    if entry.isBf then
      base, key = BF_PILE_BATTLEFIELDS, 'bf'
    elseif entry.isCard then
      base, key = BF_PILE_CARDS, 'card'
    else
      base, key = BF_PILE_NONCARD, 'other'
    end
    local pos = {x = base.x, y = base.y + stacks[key] * BF_PILE_STACK_DY, z = base.z}
    stacks[key] = stacks[key] + 1
    battlefieldPlaceObject(entry.obj, pos, false)
  end
  for _, entry in ipairs(payload.zoneObjs or {}) do pile(entry) end
  for _, entry in ipairs(payload.playObjs or {}) do pile(entry) end
end

-- Pick which slot to drop when decreasing: prefer the rightmost lane with no
-- cards (truly empty first, then card-free clutter); if every lane has cards,
-- the rightmost lane (which forces piling).
function battlefieldChooseRemovedSlot(oldSlots, payloadBySlot)
  for i = #oldSlots, 1, -1 do
    local p = payloadBySlot[oldSlots[i]]
    if p ~= nil and p.isEmpty then return oldSlots[i] end
  end
  for i = #oldSlots, 1, -1 do
    local p = payloadBySlot[oldSlots[i]]
    if p ~= nil and not p.hasCards then return oldSlots[i] end
  end
  return oldSlots[#oldSlots]
end

-- Re-establish a slot's link/claim once its battlefield card has stopped moving
-- (so getBattlefieldCardInSlot can actually find it). Best-effort: if the card
-- is gone (e.g. piled) it simply does nothing.
function battlefieldRestoreSlotState(destSlot, cap)
  local function restore()
    if cap.linked then
      pcall(function() battlefieldLinkSlot(destSlot, cap.ownerColor, true) end)
    end
    if cap.claimed and cap.ownerColor ~= nil then
      pcall(function() battlefieldClaimSlot(destSlot, cap.ownerColor) end)
    end
  end
  local cardGuid = cap.cardGuid
  if cardGuid == nil then
    restore()
    return
  end
  Wait.condition(restore, function()
    local card = getObjectFromGUID(cardGuid)
    if card == nil then return true end
    local moving = false
    pcall(function() moving = card.isSmoothMoving() end)
    return not moving
  end, 3, restore)
end

-- Snapshot link/claim state before clearing it, so it can be re-established at
-- the destination slot after pieces move.
function battlefieldCaptureSlotState()
  local captured = {}
  for _, slot in ipairs(BF_SLOT_IDS) do
    local link = battlefieldLinkState[slot]
    local claim = battlefieldClaimState[slot]
    captured[slot] = {
      linked = (link ~= nil and link.linked) or false,
      cardGuid = link ~= nil and link.cardGuid or nil,
      claimed = (claim ~= nil and claim.claimed) or false,
      ownerColor = claim ~= nil and claim.ownerColor or nil,
    }
  end
  return captured
end

function battlefieldHideInactiveSlots(layout)
  local activeMap = {}
  for i = 1, layout.count do
    activeMap[BF_SLOT_IDS[i]] = true
  end
  for _, slot in ipairs(BF_SLOT_IDS) do
    if not activeMap[slot] then
      local z = battlefieldZones[slot]
      local pz = battlefieldPlayZones[slot]
      if z ~= nil then
        z.setPosition({x = BF_STASH_X, y = BF_CARD_ZONE_Y, z = BF_STASH_Z})
        z.setScale(BF_HIDDEN_ZONE_SCALE)
      end
      if pz ~= nil then
        pz.setPosition({x = BF_STASH_X, y = BF_PLAY_ZONE_Y, z = BF_STASH_Z})
        pz.setScale(BF_HIDDEN_ZONE_SCALE)
      end
      battlefieldSetSlotButtonsVisible(slot, false)
    end
  end
end

function battlefieldApplyGeometry(layout)
  for i = 1, layout.count do
    local slot = BF_SLOT_IDS[i]
    local x = layout.xs[i]
    local zone = battlefieldZones[slot]
    local playZone = battlefieldPlayZones[slot]
    local buttons = battlefieldButtons[slot]
    if zone ~= nil then
      zone.setPosition({x = x, y = BF_CARD_ZONE_Y, z = BF_ZONE_Z})
      local baseScale = battlefieldBaseZoneScale[slot]
      if baseScale ~= nil then zone.setScale(baseScale) end
    end
    if playZone ~= nil then
      playZone.setPosition({x = x, y = BF_PLAY_ZONE_Y, z = BF_ZONE_Z})
      local baseScale = battlefieldBasePlayZoneScale[slot]
      local y = baseScale and baseScale.y or playZone.getScale().y
      local z = baseScale and baseScale.z or playZone.getScale().z
      playZone.setScale({x = layout.playWidth, y = y, z = z})
    end
    if battlefieldButtonHomePos[slot] == nil then battlefieldButtonHomePos[slot] = {} end
    battlefieldButtonHomePos[slot].link = {x = x - 2.5, y = 1.0, z = BF_ZONE_Z}
    battlefieldButtonHomePos[slot].claim = {x = x + 2.5, y = 1.0, z = BF_ZONE_Z}
    if buttons ~= nil then
      local link = buttons.link
      local claim = buttons.claim
      -- A button can be a destroyed reference if a manual link/unlink reload is
      -- still in flight; touching it throws an uncatchable native error.
      if link ~= nil then
        pcall(function()
          link.setPosition({x = x - 2.5, y = 1.0, z = BF_ZONE_Z})
          link.interactable = true
        end)
      end
      if claim ~= nil then
        pcall(function()
          claim.setPosition({x = x + 2.5, y = 1.0, z = BF_ZONE_Z})
          claim.interactable = true
        end)
      end
    end
  end
  battlefieldHideInactiveSlots(layout)
end

function battlefieldUpdateGlobalSnaps(layout)
  if battlefieldSnapCache == nil then
    battlefieldBuildSnapCache()
  end
  local base = battlefieldSnapCache or {}
  local template = battlefieldSnapTemplate or {
    position = {x = 0, y = 2.0, z = BF_ZONE_Z},
    rotation = {x = 0, y = 270, z = 0},
    rotation_snap = true,
  }
  local y = (template.position and template.position.y) or 2.0
  local z = (template.position and template.position.z) or BF_ZONE_Z
  local rotation = template.rotation or {x = 0, y = 270, z = 0}
  local rotationSnap = template.rotation_snap
  if rotationSnap == nil then rotationSnap = true end

  local merged = {}
  for _, sp in ipairs(base) do table.insert(merged, sp) end
  for i = 1, layout.count do
    table.insert(merged, {
      position = {x = layout.xs[i], y = y, z = z},
      rotation = {x = rotation.x or 0, y = rotation.y or 270, z = rotation.z or 0},
      rotation_snap = rotationSnap,
    })
  end
  Global.setSnapPoints(merged)
end

function battlefieldLooksLikeCoreSnap(sp)
  if sp == nil or sp.position == nil then return false end
  local x = tonumber(sp.position.x) or 0
  local z = tonumber(sp.position.z) or 0
  if math.abs(z - BF_ZONE_Z) > 1.0 then return false end
  return (math.abs(x + 29.63) < 3.0 or math.abs(x) < 3.0 or math.abs(x - 29.63) < 3.0)
end

function battlefieldBuildSnapCache()
  local snaps = Global.getSnapPoints() or {}
  local others = {}
  local core = {}
  for _, sp in ipairs(snaps) do
    if battlefieldLooksLikeCoreSnap(sp) then
      table.insert(core, sp)
    else
      table.insert(others, sp)
    end
  end
  table.sort(core, function(a, b)
    local ax = (a.position and a.position.x) or 0
    local bx = (b.position and b.position.x) or 0
    return ax < bx
  end)
  battlefieldSnapCache = others
  battlefieldSnapTemplate = core[1] or {
    position = {x = 0, y = 2.0, z = BF_ZONE_Z},
    rotation = {x = 0, y = 270, z = 0},
    rotation_snap = true,
  }
end

function battlefieldApplyArt(count)
  local url = BF_CENTER_ART_URLS[count]
  if url == nil then return end

  if BF_ART_EDITABLE_TILE then
    battlefieldApplyArtToEditableTile(url)
    return
  end

  local ok = pcall(function()
    for _, obj in ipairs(getAllObjects()) do
      if obj ~= nil and obj.getName() == 'Battlefield Center Art' then
        obj.destruct()
      end
    end
    local decals = Global.getDecals() or {}
    local kept = {}
    for _, decal in ipairs(decals) do
      if decal ~= nil and decal.name ~= BF_ART_DECAL_NAME then
        table.insert(kept, decal)
      end
    end
    table.insert(kept, {
      name = BF_ART_DECAL_NAME,
      url = url,
      position = BF_ART_DECAL_POS,
      rotation = BF_ART_DECAL_ROT,
      scale = BF_ART_DECAL_SCALE,
    })
    Global.setDecals(kept)
  end)
  if not ok then
    print('[Riftbound] Battlefield controller: failed to apply center art decal for '..tostring(count))
  end
end

function battlefieldEnsureEditableArtTile()
  local existing = nil
  if BF_ART_TARGET_GUID ~= nil and BF_ART_TARGET_GUID ~= '' then
    existing = getObjectFromGUID(BF_ART_TARGET_GUID)
  end
  if existing ~= nil then return existing end

  for _, obj in ipairs(getAllObjects()) do
    if obj ~= nil and obj.getName() == 'Battlefield Center Art' then
      BF_ART_TARGET_GUID = obj.getGUID()
      return obj
    end
  end

  local spawned = nil
  local ok = pcall(function()
    spawned = spawnObject({
      type = 'Custom_Tile',
      position = BF_ART_TILE_POS,
      rotation = BF_ART_TILE_ROT,
      scale = BF_ART_TILE_SCALE,
      sound = false,
    })
  end)
  if not ok or spawned == nil then
    print('[Riftbound] Battlefield controller: could not spawn editable center art tile')
    return nil
  end
  spawned.setName('Battlefield Center Art')
  spawned.setDescription('Auto-managed battlefield art tile')
  BF_ART_TARGET_GUID = spawned.getGUID()
  return spawned
end

function battlefieldApplyArtToEditableTile(url)
  local tile = battlefieldEnsureEditableArtTile()
  if tile == nil then return end

  local ok = pcall(function()
    -- Remove previous decal path artifact when using editable tile.
    local decals = Global.getDecals() or {}
    local kept = {}
    for _, decal in ipairs(decals) do
      if decal ~= nil and decal.name ~= BF_ART_DECAL_NAME then
        table.insert(kept, decal)
      end
    end
    Global.setDecals(kept)

    tile.setCustomObject({
      image = url,
      type = 0,
      thickness = 0.001,
      stackable = false,
    })
    local reloaded = tile.reload()
    if reloaded ~= nil then
      tile = reloaded
      BF_ART_TARGET_GUID = tile.getGUID()
      tile.setName('Battlefield Center Art')
      tile.setDescription('Auto-managed battlefield art tile')
    end
    tile.setPosition(BF_ART_TILE_POS)
    tile.setRotation(BF_ART_TILE_ROT)
    tile.setScale(BF_ART_TILE_SCALE)
    tile.interactable = false
    tile.setLock(true)
    tile.tooltip = false
  end)
  if not ok then
    print('[Riftbound] Battlefield controller: failed to apply editable center art tile')
  end
end

function battlefieldClearTransientState(skipReload)
  for _, slot in ipairs(BF_SLOT_IDS) do
    battlefieldUnlinkSlot(slot, skipReload)
    battlefieldUnclaimSlot(slot)
  end
end

-- Apply lane geometry + art for a count without moving any pieces. Used at load
-- and whenever only the visual layout (not the lane count) needs refreshing.
function battlefieldApplyInitialGeometry(count)
  local n = battlefieldClampCount(count)
  local layout = battlefieldLayoutForCount(n)
  battlefieldUpdateHighlightScaleForLayout(layout)
  battlefieldApplyGeometry(layout)
  battlefieldUpdateGlobalSnaps(layout)
  battlefieldApplyArt(n)
  battlefieldReconcileClaimHighlights(n)
end

-- Change the number of active battlefield lanes, moving pieces to follow.
-- Returns a reason string: 'busy', 'same' or 'applied'. requestColor is the
-- player who triggered the change (messaging is handled by the caller).
function battlefieldApplyLayout(count, requestColor)
  local target = battlefieldClampCount(count)
  local oldCount = battlefieldClampCount(battlefieldCount)

  if BF_LAYOUT_BUSY then return 'busy' end
  if target == oldCount then return 'same' end
  BF_LAYOUT_BUSY = true
  -- Suppress button reloads for the entire settle window (moves, relinks, and
  -- the zone-event refreshes they trigger), then resume normal reloads.
  BF_SUPPRESS_BUTTON_RELOAD = true
  Wait.time(function() BF_SUPPRESS_BUTTON_RELOAD = false end, 4)

  -- Guarantee the busy flag clears even if something below throws, so the
  -- counter can never get stuck reporting "busy". Clear the flag first, then
  -- run the (throwable) visual refresh.
  Wait.time(function()
    BF_LAYOUT_BUSY = false
    pcall(function() battlefieldReconcileClaimHighlights(battlefieldClampCount(battlefieldCount)) end)
    pcall(function() battlefieldRefreshAllSlotButtons() end)
  end, 1.2)

  local oldSlots = battlefieldActiveSlots(oldCount)
  local newSlots = battlefieldActiveSlots(target)
  local oldLayout = battlefieldLayoutForCount(oldCount)
  local newLayout = battlefieldLayoutForCount(target)
  local increasing = target > oldCount

  -- The whole move is wrapped so a single bad object reference logs a readable
  -- message and never surfaces as a bare native error; the busy flag clears via
  -- the scheduled reset above regardless.
  local bodyOk, bodyErr = pcall(function()
    -- Capture link/claim, clear it (destroys text/highlights, unlocks linked
    -- cards), THEN collect payloads so no destroyed helper refs are captured.
    local captured = battlefieldCaptureSlotState()
    battlefieldClearTransientState(true)
    local payloadBySlot = {}
    for _, slot in ipairs(oldSlots) do
      payloadBySlot[slot] = battlefieldCollectSlot(slot)
    end

    -- Decide the surviving source slots (and which one, if any, is removed).
    local survivors = {}
    local removedSlot = nil
    if increasing then
      for _, slot in ipairs(oldSlots) do table.insert(survivors, slot) end
    else
      removedSlot = battlefieldChooseRemovedSlot(oldSlots, payloadBySlot)
      for _, slot in ipairs(oldSlots) do
        if slot ~= removedSlot then table.insert(survivors, slot) end
      end
    end


    -- Reposition lanes and swap centre art before moving pieces.
    battlefieldUpdateHighlightScaleForLayout(newLayout)
    battlefieldApplyGeometry(newLayout)
    battlefieldUpdateGlobalSnaps(newLayout)
    battlefieldApplyArt(target)

    -- Removed lane: move whatever it holds to the side piles so nothing is left
    -- floating, but only warn everyone when actual cards were displaced.
    if removedSlot ~= nil then
      local removedPayload = payloadBySlot[removedSlot]
      if removedPayload ~= nil and not removedPayload.isEmpty then
        battlefieldPileSlotPayload(removedPayload)
        if removedPayload.hasCards then
          broadcastToAll(
            'A populated battlefield lane was removed - its cards were moved to the side piles by the battlefield counter. Check ownership before continuing.',
            {1, 0.6, 0.1})
        end
      end
    end

    -- Move each surviving lane's pieces to its destination geometry, and note
    -- which destination slots need their link/claim re-established.
    local relinkPlan = {}
    for i, srcSlot in ipairs(survivors) do
      local destSlot = newSlots[i]
      if destSlot ~= nil then
        local payload = payloadBySlot[srcSlot]
        if payload ~= nil then
          battlefieldMoveSlotCards(payload.zoneObjs, battlefieldZones[destSlot])
          if increasing then
            battlefieldMovePlayObjsSpaced(payload.playObjs, newLayout.xs[i], newLayout.playWidth)
          else
            local oldIndex = battlefieldIndexOf(oldSlots, srcSlot) or i
            local oldCenterX = oldLayout.xs[oldIndex] or newLayout.xs[i]
            battlefieldMovePlayObjsTranslated(payload.playObjs, newLayout.xs[i] - oldCenterX)
          end
        end
        local cap = captured[srcSlot]
        if cap ~= nil and (cap.linked or cap.claimed) then
          relinkPlan[destSlot] = cap
        end
      end
    end

    battlefieldCount = target
    battlefieldZone = battlefieldZones.center or battlefieldZones[newSlots[1]] or battlefieldZone

    -- Re-establish link/claim once each moved card has settled into its zone.
    -- The busy flag + final refresh were already scheduled above.
    for destSlot, cap in pairs(relinkPlan) do
      battlefieldRestoreSlotState(destSlot, cap)
    end
  end)

  if not bodyOk then
    print('[Riftbound] battlefieldApplyLayout error: ' .. tostring(bodyErr))
    battlefieldCount = target
  end

  return 'applied'
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
  if BF_LAYOUT_BUSY then return end
  local slot = APIslotForZoneGuid(params)
  if slot == nil then return end
  Wait.frames(function()
    local ok, err = pcall(function() battlefieldRefreshSlotButtons(slot) end)
    if not ok then
      print('[Riftbound] zone-event refresh error (' .. tostring(slot) .. '): ' .. tostring(err))
    end
  end, 5)
end

function APIrefreshAll(params)
  battlefieldRefreshAllSlotButtons()
end

function APIgetBattlefieldCount(params)
  return battlefieldCount
end

function APIisLayoutBusy(params)
  return BF_LAYOUT_BUSY
end

-- Count active lanes that hold no cards/decks. Non-card clutter (buttons, dice,
-- tokens) does not make a lane "full" for the purpose of the decrease warning.
function APICardFreeSlotCount(params)
  local n = 0
  for _, slot in ipairs(battlefieldActiveSlots()) do
    if not battlefieldCollectSlot(slot).hasCards then n = n + 1 end
  end
  return n
end

-- True when decreasing by one would have to pile a lane that holds cards (i.e.
-- every lane has cards). Used by the counter to gate behind a double-tap confirm.
function APIdecreaseIsDestructive(params)
  if battlefieldClampCount(battlefieldCount) <= BF_MIN_COUNT then return false end
  return APICardFreeSlotCount({}) == 0
end

function APIsetCenterArtGuid(params)
  if params == nil then return false end
  local guid = params.guid
  if guid == nil or guid == '' then return false end
  BF_ART_TARGET_GUID = guid
  battlefieldApplyArt(battlefieldCount)
  return true
end

function APIsetBattlefieldCount(params)
  if params == nil then return 'error' end
  return battlefieldApplyLayout(params.count, params.color)
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
  for _, slot in ipairs(battlefieldActiveSlots()) do
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

function isBattlefieldEnvironmentCard(obj)
  if obj == nil or obj.type ~= 'Card' then return false end
  local typeline = (obj.getName() or ''):match('\n(.*)') or ''
  if typeline:lower():find('battlefield', 1, true) then return true end
  local desc = (obj.getDescription() or ''):lower()
  if desc:find('battlefield', 1, true) then return true end
  return false
end

function APIreadyCardsForColor(params)
  local playerColor = params and params.color
  local readyRotY = params and params.rotY
  if playerColor == nil or readyRotY == nil then return end

  for _, slot in ipairs(battlefieldActiveSlots()) do
    local state = battlefieldClaimState[slot]
    if state and state.claimed and state.ownerColor == playerColor then
      local playZone = battlefieldPlayZones[slot]
      if playZone ~= nil then
        for _, obj in ipairs(playZone.getObjects()) do
          if (obj.type == 'Card' or obj.type == 'Deck') and not isBattlefieldEnvironmentCard(obj) then
            local rr = obj.getRotation()
            obj.setRotationSmooth({x = rr.x, y = readyRotY, z = rr.z})
          end
        end
      end
    end
  end
end

function battlefieldInitLinkState()
  battlefieldLinkState = {}
  for _, slot in ipairs(BF_SLOT_IDS) do
    battlefieldLinkState[slot] = {linked = false, cardGuid = nil, textNeg = nil, textPos = nil}
  end
end

function battlefieldInitClaimState()
  battlefieldClaimState = {}
  for _, slot in ipairs(BF_SLOT_IDS) do
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
  -- Called from deferred callbacks; the clone can be transiently invalid.
  pcall(function()
    highlight.setScale(battlefieldHighlightScale)
    highlight.setRotation({0, 0, 0})
    highlight.setPosition(pos)
    highlight.interactable = false
    highlight.setLock(true)
  end)
end

function battlefieldUpdateHighlightScaleForLayout(layout)
  local ratio = 1
  if layout ~= nil and layout.playWidth ~= nil and BF_PLAY_WIDTH_BASE > 0 then
    ratio = layout.playWidth / BF_PLAY_WIDTH_BASE
  end
  battlefieldHighlightScale = {
    BF_HIGHLIGHT_SCALE_BASE[1] * ratio,
    BF_HIGHLIGHT_SCALE_BASE[2],
    BF_HIGHLIGHT_SCALE_BASE[3],
  }
end

function battlefieldReconcileClaimHighlights(activeCount)
  for i, slot in ipairs(BF_SLOT_IDS) do
    local state = battlefieldClaimState[slot]
    if state ~= nil then
      if i > activeCount then
        battlefieldUnclaimSlot(slot)
      elseif state.claimed and state.highlightGuid ~= nil then
        local highlight = getObjectFromGUID(state.highlightGuid)
        local pos = battlefieldClaimHighlightPosition(slot)
        if highlight ~= nil and pos ~= nil then
          battlefieldPinClaimHighlight(highlight, pos)
        else
          battlefieldUnclaimSlot(slot)
        end
      end
    end
  end
end

function battlefieldRebuildClaimButton(slot)
  local buttons = battlefieldButtons[slot]
  if buttons == nil or buttons.claim == nil then return end
  if not createBattlefieldTableButton(buttons.claim, 'Conquer', 'battlefieldClaimClick', BF_CONQUER_BUTTON_TIP) then return end
  pcall(function()
    buttons.claim.setRotation(BF_CLAIM_BUTTON_ROT)
    local home = battlefieldButtonHome(slot, 'claim')
    if home ~= nil then
      buttons.claim.setPosition(home)
      buttons.claim.interactable = true
    end
  end)
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
    if playerColor ~= nil then
      broadcastToColor("Could not create battlefield highlight.", playerColor, {1, 0.4, 0})
    end
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
  local objs = nil
  local gotObjs = pcall(function() objs = zone.getObjects(true) end)
  if not gotObjs or objs == nil then return false end
  for _, obj in ipairs(objs) do
    local t = nil
    pcall(function() t = obj.type end)
    if t == "Card" then return true end
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
      -- A button can be mid-reload (its old reference destroyed) when several
      -- lanes re-link at once; touching that stale reference throws a native
      -- null-ref, so guard it. The reload's own finish callback re-homes it.
      pcall(function()
        if visible then
          btn.setPosition(home)
          btn.interactable = true
        else
          btn.setPosition({x = home.x, y = BF_BUTTON_STASH_Y, z = home.z})
          btn.interactable = false
        end
      end)
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
  for _, slot in ipairs(battlefieldActiveSlots()) do
    battlefieldRefreshSlotButtons(slot)
  end
  for i = battlefieldCount + 1, #BF_SLOT_IDS do
    battlefieldSetSlotButtonsVisible(BF_SLOT_IDS[i], false)
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

function battlefieldUnlinkSlot(slot, skipReload)
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
  battlefieldSetLinkButtonLinked(slot, false, skipReload)
end

function battlefieldRebuildLinkButton(slot)
  local btn = battlefieldRefreshLinkButtonRef(slot)
  if btn == nil then return end
  if not createBattlefieldTableButton(btn, 'Link', 'battlefieldLinkClick', BF_LINK_BUTTON_TIP) then return end
  pcall(function()
    btn.setRotation(BF_LINK_BUTTON_ROT)
    local home = battlefieldButtonHome(slot, 'link')
    if home ~= nil then
      btn.setPosition(home)
      btn.interactable = true
    end
  end)
end

function battlefieldFinishLinkButtonVisual(slot)
  -- Runs from deferred reload callbacks; wrap so a transient bad reference logs
  -- instead of surfacing as a bare native error.
  local ok, err = pcall(function()
    battlefieldRebuildLinkButton(slot)
    if battlefieldSlotHasCard(slot) then
      battlefieldSetSlotButtonsVisible(slot, true)
    end
  end)
  if not ok then
    print('[Riftbound] link button finish error (' .. tostring(slot) .. '): ' .. tostring(err))
  end
end

function battlefieldSetLinkButtonLinked(slot, linked, skipReload)
  local btn = battlefieldButtons[slot] and battlefieldButtons[slot].link
  if btn == nil then return end
  -- During a layout change many lanes link/unlink at once. The diffuse swap uses
  -- reload(), whose async destroy/recreate can emit an uncatchable native error
  -- when done en masse. Skip it: just rebuild the click button in place (no
  -- GUID churn). A lane that stays linked keeps its existing LOCKED texture.
  if skipReload or BF_SUPPRESS_BUTTON_RELOAD then
    -- No reload happens, so the existing button keeps its click function and
    -- diffuse; rebuilding it here only risks touching a still-settling button
    -- reference (the native error we traced). Geometry + the settle-window
    -- refresh handle its position/visibility, so leave the button untouched.
    return
  end
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
  -- Automated re-link (no triggering player) passes nil; broadcasting to a nil
  -- colour throws a native null-reference, so skip the warning in that case.
  if playerColor == nil then return end
  if reason == "multiple" then
    broadcastToColor("Only one Battlefield card per slot.", playerColor, {1, 0.4, 0})
  elseif reason == "not_battlefield" then
    broadcastToColor("That zone does not contain a Battlefield card.", playerColor, {1, 0.4, 0})
  else
    broadcastToColor("Place a Battlefield card in the "..slot.." slot before linking.", playerColor, {1, 0.4, 0})
  end
end

function battlefieldLinkSlot(slot, playerColor, skipReload)
  local card, reason = getBattlefieldCardInSlot(slot)
  if card == nil then
    battlefieldWarnNoCard(slot, reason, playerColor)
    return
  end
  battlefieldUnlinkSlot(slot, skipReload)
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
  battlefieldSetLinkButtonLinked(slot, true, skipReload)
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
  if object == nil then return nil end
  -- This runs inside the deferred button-reload chain, where `object` may be a
  -- reference that was just destroyed by reload(); calling methods on it throws
  -- a native null-ref. Guard it - the reload's follow-up re-runs this with the
  -- fresh button once it resolves.
  -- Returns whether the (re)build succeeded; callers must not touch `object`
  -- further if this is false. createButton's own return is version-dependent,
  -- so we report the pcall result rather than its value.
  local ok = pcall(function()
    object.clearButtons()
    object.tooltip = false
    object.interactable = true
    object.setLock(true)
    object.setName(name)
    object.createButton({
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
  end)
  return ok
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
