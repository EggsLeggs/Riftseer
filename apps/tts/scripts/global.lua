-- Main functionality
function onload()
  buildDataStructure()
  registerObjectGUIDs()
  print('[Riftbound] global '..RIFTBOUND_GLOBAL_REV..' loaded')
  cachePlayboardZones()
  Wait.frames(function()
    cachePlayboardZones()
  end, 3)
  buildTableButtons()
  Wait.frames(function() battlefieldRefreshAll() end, 10)
  addZoneContextMenus()
  registerRecycleHotkey()
  for _,guid in pairs({'cb1610', 'a7a029', '4c02f8', 'a3e6a8', '9c553c', 'eb479b','3d4319','540e21'}) do
    pcall(function() getObjectFromGUID(guid).interactable=false end)
  end
  Wait.frames(function()
    for _,guid in pairs({'02e062','de4346','d936a8','b93b40','bfc001'}) do
      pcall(function() getObjectFromGUID(guid).interactable=false end)
    end
  end,5)

  -- flip hands on load
  Hands.disable_unused=false
  Wait.condition(function()
    local Zones=Encoder.call("APIlistZones",{})
    for guid,zone in pairs(Zones) do
      local objs=getObjectFromGUID(guid).getObjects()
      for _,obj in pairs(objs) do
        if obj.type=='Card' then
          local rot=obj.getRotation()
          rot[3]=180
          obj.setRotation(rot)
        end
      end
    end
    registerRuneRecycleMenu()
    Wait.frames(function() refreshRuneZoneRecycleButtons() end, 5)
  end,function() return Encoder~=nil end)

  -- 4pl specific vars
  revealNrow=12
  revealUp=15.5
  revealUpS=3.1
  revealRi=1.5
  banishRot=-180

  Wait.frames(function()
    redirectPlayersOffWhite()
  end, 5)
end

-- Ensure data structure exists
function buildDataStructure()
  data = {
    Green   = {deck = nil},
    Red     = {deck = nil},
    Yellow  = {deck = nil},
    Blue    = {deck = nil},
  }
end

RIFTBOUND_SEAT_COLORS = {'Green','Red','Yellow','Blue'}

function firstOpenRiftboundSeat()
  for _, color in ipairs(RIFTBOUND_SEAT_COLORS) do
    if Player[color] ~= nil and not Player[color].seated then
      return color
    end
  end
  return nil
end

function redirectPlayersOffWhite()
  for _, player in ipairs(Player.getPlayers()) do
    if player.color == 'White' and player.seated then
      local target = firstOpenRiftboundSeat()
      if target ~= nil then
        player.changeColor(target)
        broadcastToAll(
          player.steam_name..' was moved from White to '..target..'.',
          stringColorToRGB(target))
      else
        player.broadcast(
          'All Riftbound seats (Green, Red, Yellow, Blue) are taken. Ask the host to free a seat.')
        broadcastToAll(
          'No open Riftbound seat for '..player.steam_name..' (still on White).',
          {1, 0.3, 0.3})
      end
    end
  end
end

function onPlayerChangeColor(col)
  if col == 'White' then
    Wait.frames(function()
      redirectPlayersOffWhite()
    end, 1)
  end
end

function onPlayerConnect(player)
  if player ~= nil and player.color == 'White' then
    Wait.frames(function()
      redirectPlayersOffWhite()
    end, 1)
  end
end

BATTLEFIELD_CTRL_GUID = 'bfc001'

function getBattlefieldController()
  local bf = Global.getVar('Battlefield')
  if bf ~= nil then return bf end
  return getObjectFromGUID(BATTLEFIELD_CTRL_GUID)
end

function battlefieldNotifyZone(zone)
  local bf = getBattlefieldController()
  if bf == nil or zone == nil then return end
  pcall(function()
    bf.call('APIonCardZoneEvent', {zoneGuid = zone.getGUID()})
  end)
end

function battlefieldRefreshAll()
  local bf = getBattlefieldController()
  if bf == nil then return end
  pcall(function() bf.call('APIrefreshAll', {}) end)
end

function getBattlefieldZones()
  local bf = getBattlefieldController()
  if bf == nil then return {} end
  return bf.call('APIgetZones', {}) or {}
end

function getBattlefieldZone()
  local bf = getBattlefieldController()
  if bf == nil then return nil end
  return bf.call('APIgetZone', {})
end

function getBattlefieldObjects()
  local bf = getBattlefieldController()
  if bf == nil then return {} end
  return bf.call('APIgetObjects', {}) or {}
end

-- Playboard zones: three ScriptingTriggers per seat, each tagged playboard{color}.
playboardZonesByColor = {}
-- Playmat rune row per seat; ScriptingTriggers have no getNickname() in TTS Lua.
playboardRuneZoneGuids = {
  Green = '8ecbef',
  Red = 'a67f19',
  Yellow = 'b5c8e9',
  Blue = '679690',
}
-- All scripting trigger zones per seat (getObjectsWithTag does not work on zones)
playboardZoneGuidsByColor = {
  Green  = {'e045d9', '317569', '8ecbef'},
  Red    = {'d64a19', 'f6152f', 'a67f19'},
  Yellow = {'2c718e', '65d86e', 'b5c8e9'},
  Blue   = {'92d981', '6a0546', '679690'},
}
RIFTBOUND_GLOBAL_REV = 'playboard-zone-guid-v3'
runeSortSettleTime = 2
RUNE_RECYCLE_ICON_URL = 'https://steamusercontent-a.akamaihd.net/ugc/10767388204787795352/3E30EB8E9E712641D56D4DA11966E328AA4F5FAD/'
RUNE_RECYCLE_DECAL_NAME = 'rb_rune_recycle'

function playboardPlayerTag(color)
  return 'playboard' .. color
end

function playboardColorForZone(zone)
  if zone == nil then return nil end
  for _, color in ipairs(Player.getColors()) do
    if zone.hasTag(playboardPlayerTag(color)) then return color end
  end
  return nil
end

function cachePlayboardZones()
  playboardZonesByColor = {}
  for color, guids in pairs(playboardZoneGuidsByColor) do
    local zones = {}
    for _, guid in ipairs(guids) do
      local obj = getObjectFromGUID(guid)
      if obj ~= nil then
        table.insert(zones, obj)
      end
    end
    playboardZonesByColor[color] = zones
  end
end

function getPlayboardZones(color)
  if playboardZonesByColor == nil then
    cachePlayboardZones()
  end
  local zones = playboardZonesByColor[color]
  if zones == nil or #zones == 0 then
    cachePlayboardZones()
    zones = playboardZonesByColor[color] or {}
  end
  return zones
end

-- Tagged zones only report untagged cards when ignore_tags is true.
function getPlayboardZoneObjects(zone)
  return zone.getObjects(true)
end

function getPlayboardObjects(color)
  local seen = {}
  local result = {}
  for _, zone in ipairs(getPlayboardZones(color)) do
    for _, obj in ipairs(getPlayboardZoneObjects(zone)) do
      if not seen[obj] then
        seen[obj] = true
        table.insert(result, obj)
      end
    end
  end
  return result
end

function getPlayboardRuneZone(color)
  local guid = playboardRuneZoneGuids[color]
  if guid == nil then return nil end
  return getObjectFromGUID(guid)
end

function getPlayboardReadyRotationY(color)
  if props[color] and props[color].spawns and props[color].spawns.main then
    return tonumber(props[color].spawns.main.rotY)
  end
  return 0
end

function isObjectInPlayboard(obj, color)
  for _, zone in ipairs(getPlayboardZones(color)) do
    for _, o in ipairs(getPlayboardZoneObjects(zone)) do
      if o == obj then return true end
    end
  end
  return false
end

function isObjectOnAnyPlayboard(obj)
  for _, color in ipairs(Player.getColors()) do
    if isObjectInPlayboard(obj, color) then return true end
  end
  return false
end

-- Get pointers to in-game objects so we can script them
function registerObjectGUIDs()
  data["Green"]["mainDeckZone"]    = getObjectFromGUID("166036")
  data["Red"]["mainDeckZone"]      = getObjectFromGUID("2365d0")
  data["Yellow"]["mainDeckZone"]   = getObjectFromGUID("033b34")
  data["Blue"]["mainDeckZone"]     = getObjectFromGUID("c04462")

  data["Green"]["trash"]      = getObjectFromGUID("68549d")
  data["Red"]["trash"]        = getObjectFromGUID("07dd80")
  data["Yellow"]["trash"]     = getObjectFromGUID("8b439a")
  data["Blue"]["trash"]       = getObjectFromGUID("debc40")

  data["Green"]["runeZones"] = {
    getObjectFromGUID("f4a001"),
    getObjectFromGUID("f4a002"),
    getObjectFromGUID("f4a003"),
    getObjectFromGUID("f4a004"),
    getObjectFromGUID("f4a005"),
    getObjectFromGUID("f4a006"),
    getObjectFromGUID("f4a007"),
    getObjectFromGUID("f4a008"),
    getObjectFromGUID("f4a009"),
    getObjectFromGUID("f4a00a"),
    getObjectFromGUID("f4a00b"),
    getObjectFromGUID("f4a00c"),
  }

  data["Red"]["runeZones"] = {
    getObjectFromGUID("4da001"),
    getObjectFromGUID("4da002"),
    getObjectFromGUID("4da003"),
    getObjectFromGUID("4da004"),
    getObjectFromGUID("4da005"),
    getObjectFromGUID("4da006"),
    getObjectFromGUID("4da007"),
    getObjectFromGUID("4da008"),
    getObjectFromGUID("4da009"),
    getObjectFromGUID("4da00a"),
    getObjectFromGUID("4da00b"),
    getObjectFromGUID("4da00c"),
  }

  data["Yellow"]["runeZones"] = {
    getObjectFromGUID("e4a001"),
    getObjectFromGUID("e4a002"),
    getObjectFromGUID("e4a003"),
    getObjectFromGUID("e4a004"),
    getObjectFromGUID("e4a005"),
    getObjectFromGUID("e4a006"),
    getObjectFromGUID("e4a007"),
    getObjectFromGUID("e4a008"),
    getObjectFromGUID("e4a009"),
    getObjectFromGUID("e4a00a"),
    getObjectFromGUID("e4a00b"),
    getObjectFromGUID("e4a00c"),
  }

  data["Blue"]["runeZones"] = {
    getObjectFromGUID("b4a001"),
    getObjectFromGUID("b4a002"),
    getObjectFromGUID("b4a003"),
    getObjectFromGUID("b4a004"),
    getObjectFromGUID("b4a005"),
    getObjectFromGUID("b4a006"),
    getObjectFromGUID("b4a007"),
    getObjectFromGUID("b4a008"),
    getObjectFromGUID("b4a009"),
    getObjectFromGUID("b4a00a"),
    getObjectFromGUID("b4a00b"),
    getObjectFromGUID("b4a00c"),
  }

  data["Green"]["runeDeckZone"]    = getObjectFromGUID("f4d001")
  data["Red"]["runeDeckZone"]      = getObjectFromGUID("4d0001")
  data["Yellow"]["runeDeckZone"]   = getObjectFromGUID("e4d001")
  data["Blue"]["runeDeckZone"]     = getObjectFromGUID("b4d001")

  data["Green"]["playboardRuneZone"]  = getObjectFromGUID("8ecbef")
  data["Red"]["playboardRuneZone"]    = getObjectFromGUID("a67f19")
  data["Yellow"]["playboardRuneZone"] = getObjectFromGUID("b5c8e9")
  data["Blue"]["playboardRuneZone"]   = getObjectFromGUID("679690")

  data["Green"]["banishmentZone"]  = getObjectFromGUID("bf0002")
  data["Red"]["banishmentZone"]    = getObjectFromGUID("bf0001")
  data["Yellow"]["banishmentZone"] = getObjectFromGUID("bf0003")
  data["Blue"]["banishmentZone"]   = getObjectFromGUID("bf0004")

  data["Green"]["mulliganButton"] = getObjectFromGUID("3b07ae")
  data["Red"]["mulliganButton"]   = getObjectFromGUID("c53ac6")
  data["Yellow"]["mulliganButton"]= getObjectFromGUID("47645d")
  data["Blue"]["mulliganButton"]  = getObjectFromGUID("e0a3bc")

  data["Green"]["untapButton"]    = getObjectFromGUID("18fb5d")
  data["Red"]["untapButton"]      = getObjectFromGUID("86e447")
  data["Yellow"]["untapButton"]   = getObjectFromGUID("1f3e4a")
  data["Blue"]["untapButton"]     = getObjectFromGUID("e2f7ae")

  data["Green"]["channelButton"]  = getObjectFromGUID("ch0001")
  data["Red"]["channelButton"]    = getObjectFromGUID("ch0002")
  data["Yellow"]["channelButton"] = getObjectFromGUID("ch0003")
  data["Blue"]["channelButton"]   = getObjectFromGUID("ch0004")

  data["Green"]["drawButton"]     = getObjectFromGUID("26775a")
  data["Red"]["drawButton"]       = getObjectFromGUID("885f49")
  data["Yellow"]["drawButton"]    = getObjectFromGUID("305c12")
  data["Blue"]["drawButton"]      = getObjectFromGUID("b49d50")

  data["Green"]["scryButton"]     = getObjectFromGUID("614515")
  data["Red"]["scryButton"]       = getObjectFromGUID("ffa67c")
  data["Yellow"]["scryButton"]    = getObjectFromGUID("8a4c8b")
  data["Blue"]["scryButton"]      = getObjectFromGUID("4e19c8")

  data["Green"]["millButton"]     = getObjectFromGUID("57914a")
  data["Red"]["millButton"]       = getObjectFromGUID("da5d0d")
  data["Yellow"]["millButton"]    = getObjectFromGUID("67b4a5")
  data["Blue"]["millButton"]      = getObjectFromGUID("d06889")

  data["Green"]["revealButton"]   = getObjectFromGUID("d67eb4")
  data["Red"]["revealButton"]     = getObjectFromGUID("0ad181")
  data["Yellow"]["revealButton"]  = getObjectFromGUID("59ab68")
  data["Blue"]["revealButton"]    = getObjectFromGUID("c489e1")
end

props = {
  Green={spawns={
  main={posX="25.5", posZ="-5", rotY="180"},
  part={posX="22.5", posZ="-5", rotY="180"}}},

  Red={spawns={
  main={posX="-25.5", posZ="-5", rotY="180"},
  part={posX="-22.5", posZ="-5", rotY="180"}}},

  Yellow={spawns={
  main={posX="-25.5", posZ="5", rotY="0"},
  part={posX="-22.5", posZ="5", rotY="0"}}},

  Blue={spawns={
  main={posX="25.5", posZ="5", rotY="0"},
  part={posX="22.5", posZ="5", rotY="0"}}},
}

deckDirs = {Green=-1,
            Red=1,
            Yellow=-1,
            Blue=1}

--------------------------------------------------------------------------------
--------------------------------------------------------------------------------
function onPlayerDisconnect(player)   -- flip cards in hand if disconnected
  for handInd=1,player.getHandCount() do
    objs=player.getHandObjects(handInd)
    for _,obj in pairs(objs) do
      local rot=obj.getRotation()
      rot[3]=180
      obj.setRotation(rot)
    end
  end
end

--------------------------------- TABLE BUTTONS --------------------------------
function buildTableButtons()
  -- support variables
  nAlt = 3
  drawDelay = 0.1  -- changing the draw delay might cause problems
  for color, playerData in pairs(data) do
    createTableButton(playerData["drawButton"],  "Draw", "playerDraw",  "Draw")
    createTableButton(playerData["scryButton"],  "Predict", "playerPredict",  "Predict")
    createTableButton(playerData["millButton"],  "Mill", "playerMill",  "Mill")
    createTableButton(playerData["untapButton"], "Ready","playerUntap", "Ready")
    createTableButton(playerData["channelButton"], "Channel", "playerChannel", "Channel")
    createTableButtonM(playerData["mulliganButton"], "Mulligan", "playerMulligan", "Mulligan")
    createTableButtonR(playerData["revealButton"])
    data[color]["mulliganNumber"] = 4

    playerData["drawButton"].max_typed_number=99
    playerData["scryButton"].max_typed_number=99
    playerData["millButton"].max_typed_number=99
    playerData["channelButton"].max_typed_number=99
    playerData["revealButton"].max_typed_number=99
  end
end

function onObjectNumberTyped(obj,ply,int)
  local txt=' card'
  if int>1 then
    txt=' cards'
  end
  for color, playerData in pairs(data) do
    if obj==playerData["drawButton"] and color==ply then
      local deck=getDeckFromZone(playerData["mainDeckZone"])
      if deck==nil then return end
      if int>deck.getQuantity() then int=deck.getQuantity() end
      if int>0 then
        Player[ply].broadcast('drawing '..int..txt,ply)
        Wait.time(function() draw1(ply) end, drawDelay, int)
      end
    end
    if obj==playerData["scryButton"] and color==ply then
      local deck=getDeckFromZone(playerData["mainDeckZone"])
      if deck==nil then return end
      if int>deck.getQuantity() then int=deck.getQuantity() end
      if int>0 then
        Player[ply].broadcast('predicting '..int..txt,ply)
        Wait.time(function() scry1(ply) end, drawDelay, int)
      end
    end
    if obj==playerData["millButton"] and color==ply then
      local deck=getDeckFromZone(playerData["mainDeckZone"])
      if deck==nil then return end
      if int>deck.getQuantity() then int=deck.getQuantity() end
      if int>0 then
        Player[ply].broadcast('milling '..int..txt,ply)
        Wait.time(function() mill1(ply) end, drawDelay, int)
      end
    end
    if obj==playerData["channelButton"] and color==ply then
      local remaining=getRuneDeckRemaining(ply)
      local maxAdd=remaining-runeChannelQueueLength(ply)
      if int>maxAdd then int=maxAdd end
      if int>0 then
        local runeTxt=' rune'
        if int>1 then runeTxt=' runes' end
        Player[ply].broadcast('channeling '..int..runeTxt,ply)
        channelExecute(ply, int)
      end
    end
    if obj==playerData["revealButton"] and color==ply then
      local deck=getDeckFromZone(playerData["mainDeckZone"])
      if deck==nil then return end
      if int>deck.getQuantity() then int=deck.getQuantity() end
      if int>0 then
        Player[ply].broadcast('revealing '..int..txt,ply)
        if obj.getRotation().z==0 then
          Wait.time(function() revealFan(obj,ply) end, drawDelay, int)
        elseif obj.getRotation().z==180 then
          Wait.time(function() revealStack(obj,ply) end, drawDelay, int)
        end
      end
    end

  end
end

-- Creates a button with given funcionality on the object
function createTableButton(object, name, clickFunction, ttip)
  object.tooltip=false
  object.interactable=true
  object.setLock(true)
  object.setName(name)
  if name=='Ready' then
    ttip = '[b]'..ttip..'[/b]'
  elseif name=='Channel' then
    ttip = '                  [b]'..ttip..'[/b]'..'\n       [i]left click[/i] for 1 rune'..
           '\n     [i]right click[/i] for 2 runes\nor [i]type[/i] the desired amount'
  else
    ttip = '                  [b]'..ttip..'[/b]'..'\n       [i]left click[/i] for 1 card'..
           '\n     [i]right click[/i] for '..tostring(nAlt)..' cards\nor [i]type[/i] the desired amount'
  end
  return object.createButton({
    click_function = clickFunction,
    tooltip = ttip,
    width = 600,
    height = 600,
    position = {0, 0.1, 0},
    font_size = 250,
    color = {1, 1, 1, 0},
    font_color = {1, 1, 1, 100},
  })
end

function createTableButtonM(object, name, clickFunction, ttip)
  object.tooltip=false
  object.interactable=false
  object.setLock(true)
  object.setName(name)
  return object.createButton({
    click_function = clickFunction,
    tooltip = '           [b]Mulligan[/b]\n      [i]click[/i] - draw 4 cards',
    width = 2500,
    height = 850,
    position = {0, 0.1, 0},
    font_size = 250,
    color = {1, 1, 1, 0},
    font_color = {1, 1, 1, 100},
	  hover_color = {1, 1, 1, 0.1},
	  press_color = {1, 0, 0, 0.2},
  })
end

function createTableButtonR(object)
  object.tooltip=false
  object.interactable=true
  rot=object.getRotation()
  rot[3]=0
  object.setRotation(rot)
  object.setLock(true)
  object.setName('Reveal')
  object.memo=tostring(os.time())
  object.setGMNotes('0')
  return object.createButton({
    click_function = 'revealFan',
    tooltip = '                  [b]fanned-out reveal[/b]\n[i]left click[/i] or [i]type[/i] number to reveal cards\n       [i]right click[/i] to swap button mode',
    function_owner = self,
    width = 600,
    height = 600,
    position = {0, 0.1, 0},
    color = {1, 1, 1, 0}
  }),
  object.createButton({
    click_function = 'revealStack',
    tooltip = '                     [b]stacked reveal[/b]\n[i]left click[/i] or [i]type[/i] number to reveal cards\n       [i]right click[/i] to swap button mode',
    function_owner = self,
    width = 600,
    height = 600,
    position = {0, -0.1, 0},
    rotation = {0, 0, 180},
    color = {1, 1, 1, 0},
    font_color = {1, 1, 1, 100}
  })
end

-- Scripting hotkeys
function onScriptingButtonDown(index, playerColor)
  if index == 10 then
    if Turns.enable then
      if playerColor == Turns.turn_color then
        Player[playerColor].broadcast('keybind 0: end turn',{0.7,0.7,0.7})
        Turns.turn_color=Turns.getNextTurnColor()
      end
    else
      Player[playerColor].broadcast('keybind 0: enable turns',{0.7,0.7,0.7})
      Turns.enable = true
      Turns.turn_color = playerColor
    end
  elseif index == 1 then
    Player[playerColor].broadcast('keybind 1: ready',{0.7,0.7,0.7})
    playerUntap(data[playerColor]["untapButton"], playerColor, false)
  elseif index == 2 then
    Player[playerColor].broadcast('keybind 2: draw',{0.7,0.7,0.7})
    playerDraw(data[playerColor]["drawButton"],   playerColor, false)
  elseif index == 3 then
    Player[playerColor].broadcast('keybind 3: predict',{0.7,0.7,0.7})
    playerPredict(data[playerColor]["scryButton"],   playerColor, false)
  elseif index == 4 then
    Player[playerColor].broadcast('keybind 4: mill',{0.7,0.7,0.7})
    playerMill(data[playerColor]["millButton"],   playerColor, false)
  elseif index == 5 then
    Player[playerColor].broadcast('keybind 5: revealFan',{0.7,0.7,0.7})
    local obj=data[playerColor]["revealButton"]
    revealFan(obj,playerColor)
  elseif index ==6 then
    Player[playerColor].broadcast('keybind 6: revealStack',{0.7,0.7,0.7})
    local obj=data[playerColor]["revealButton"]
    revealStack(obj,playerColor)
  elseif index == 7 then
    Player[playerColor].broadcast('keybind 7: move to trash',{0.7,0.7,0.7})
    move2trash(playerColor)
  elseif index == 8 then
    Player[playerColor].broadcast('keybind 8: move to banishment',{0.7,0.7,0.7})
    move2banishment(playerColor)
  elseif index == 9 then
    Player[playerColor].broadcast('keybind 9: move to bottom of deck',{0.7,0.7,0.7})
    move2botDeck(playerColor)
  end
end

function move2botDeck(ply)
  local objs=Player[ply].getSelectedObjects()
  local cards={}
  for _,obj in pairs(objs) do
    if obj.type=='Card' or obj.type=='Deck' then
      local rot=obj.getRotation()
      rot[3]=180
      obj.setRotationSmooth(rot,false,true)
      table.insert(cards,obj)
    end
  end
  Wait.time(function()
    if #cards>1 then
      targpos=vector(0,0,0)
      for _,c in pairs(cards) do
        targpos=targpos+c.getPosition()
      end
      targpos=targpos:scale(1/#cards)
      for _,c in pairs(cards) do
        c.setPositionSmooth(targpos,false,true)
      end
    end
    local gr=group(cards)
    gr=gr[1]
    if gr==nil then
      pcall(function()
        gr=hoveredObjs[ply]
      end)
    end
    if gr==nil or not(gr.type=='Card' or gr.type=='Deck') then return end
    local rot=gr.getRotation()
    rot[3]=180
    gr.interactable=false
    gr.use_gravity=false
    gr.shuffle()
    local deck = getDeckFromZone(data[ply]["mainDeckZone"])
    if deck==nil then
      deck = getCardFromZone(data[ply]["mainDeckZone"])
    end
    Wait.time(function()
      gr.use_gravity=true
      gr.interactable=true
      gr.shuffle()
      if gr.type=='Card' then
        handTrigger(gr)
      end
      gr.shuffle()
      if deck~=nil then
        local pos=deck.getPosition()
        pos[2]=1
        gr.setPositionSmooth(pos,false,true)
        gr.setRotationSmooth(deck.getRotation(),false,true)
        deck.setPositionSmooth(deck.getPosition()+Vector(0,2,0),false,true)
      else
        local rot = gr.getRotation()
        rot.z=180
        local pos = data[ply]["mainDeckZone"].getPosition()
        pos[2]=1
        gr.setRotationSmooth(rot,false,true)
        gr.setPositionSmooth(pos,false,true)
      end
    end, 1)
  end, 0.25)
end

function registerRecycleHotkey()
  addHotkey('Recycle hovered card (suggest C)', recycleHotkey, false)
end

-- Register a persistent menu with the Encoder so encoded rune-zone cards
-- get the recycle button re-added whenever the Encoder rebuilds their buttons.
function registerRuneRecycleMenu()
  pcall(function()
    Encoder.call("APIregisterMenu", {
      menuID = 'RBRuneRecycle',
      funcOwner = Global,
      activateFunc = 'runeZoneMenuButtons',
      visible_in_hand = 0,
    })
  end)
end

-- Called by the Encoder's buildButtons for every encoded card.
function runeZoneMenuButtons(t)
  local obj = t.obj
  if obj == nil or obj.type ~= 'Card' then return end
  if colorForObjectInRuneZone(obj) ~= nil then
    addRuneRecycleButton(obj)
  else
    removeRuneRecycleDecal(obj)
  end
end

-- Place the recycle icon decal + transparent click button on a card.
-- Safe to call multiple times: the decal is skipped if already present.
function addRuneRecycleButton(obj)
  if obj == nil then return end
  local decals = obj.getDecals() or {}
  local hasDecal = false
  for _,d in pairs(decals) do
    if d.name == RUNE_RECYCLE_DECAL_NAME then hasDecal = true; break end
  end
  if not hasDecal then
    obj.addDecal({
      name     = RUNE_RECYCLE_DECAL_NAME,
      url      = RUNE_RECYCLE_ICON_URL,
      position = {-0.7, 0.3, -1.3},
      rotation = {90, 180, 0},
      scale    = {0.35, 0.35, 0.35},
    })
  end
  obj.createButton({
    label          = '',
    click_function = 'runeRecycleButtonClick',
    function_owner = Global,
    tooltip        = 'Recycle this rune',
    position       = {0.7, 0.28, -1.3},
    rotation       = {0, 0, 0},
    scale          = {0.35, 0.35, 0.35},
    width          = 350,
    height         = 350,
    font_size      = 1,
    color          = {0, 0, 0, 0},
    hover_color    = {1, 1, 1, 0.2},
    press_color    = {1, 1, 1, 0.4},
  })
end

-- Remove only the recycle decal, leaving other decals intact.
function removeRuneRecycleDecal(obj)
  if obj == nil then return end
  local decals = obj.getDecals()
  if decals == nil then return end
  local ndecals = {}
  for _,d in pairs(decals) do
    if d.name ~= RUNE_RECYCLE_DECAL_NAME then
      table.insert(ndecals, d)
    end
  end
  obj.setDecals(ndecals)
end

-- Button callback: recycle the rune card, reusing the existing recycle logic.
function runeRecycleButtonClick(obj, playerColor, altClick)
  if obj == nil then return end
  if recycleCard(playerColor, obj) then
    Player[playerColor].broadcast('recycling '..obj.getName():gsub('\n',' | '), playerColor)
  end
end

-- Add recycle buttons to cards already sitting in rune zones at load time
-- (for non-encoded cards; encoded ones will be handled by the Encoder Menu).
function refreshRuneZoneRecycleButtons()
  for color, playerData in pairs(data) do
    local zones = playerData["runeZones"]
    if zones then
      for _,zone in ipairs(zones) do
        if zone ~= nil then
          for _,obj in pairs(zone.getObjects()) do
            if obj.type == 'Card' then
              local isEncoded = false
              if Encoder ~= nil then
                local ok, e = pcall(function()
                  return Encoder.call("APIobjectExists", {obj=obj})
                end)
                if ok then isEncoded = e end
              end
              if not isEncoded then
                addRuneRecycleButton(obj)
              end
            end
          end
        end
      end
    end
  end
end

function recycleHotkey(playerColor, hoveredObject, pointerPosition, isKeyUp)
  if isKeyUp then return end
  local obj = hoveredObject
  if obj==nil then
    pcall(function() obj = hoveredObjs[playerColor] end)
  end
  if obj==nil then return end
  if obj.type=='Card' then
    recycleCardContext(playerColor, nil, obj)
  elseif obj.type=='Deck' then
    recycleTopCardsContext(1)(playerColor, nil, obj)
  end
end

function recycleZoneForDestination(playerColor, destination)
  if data[playerColor]==nil then return nil end
  if destination=='rune' then
    return data[playerColor]["runeDeckZone"]
  end
  if destination=='main' then
    return data[playerColor]["mainDeckZone"]
  end
  return nil
end

function getTopRestingCardFromZone(zone, skipObj)
  if zone==nil then return nil end
  local card=nil
  local highY=0
  for _,obj in pairs(zone.getObjects()) do
    if obj~=skipObj and obj.type=='Card' and obj.use_gravity and obj.getPosition().y>highY then
      card=obj
      highY=obj.getPosition().y
    end
  end
  return card
end

function recycleMoveObjectToBottomZone(obj, zone)
  if obj==nil or zone==nil or not(obj.type=='Card' or obj.type=='Deck') then return false end
  obj.setHiddenFrom({})
  local rot=obj.getRotation()
  rot.z=180
  obj.setRotationSmooth(rot,false,true)
  obj.interactable=false
  obj.use_gravity=false
  local target = getDeckFromZone(zone)
  if target==nil then
    target = getTopRestingCardFromZone(zone, obj)
  end
  Wait.time(function()
    if obj==nil then return end
    obj.use_gravity=true
    obj.interactable=true
    if obj.type=='Card' then
      handTrigger(obj)
    end
    if target~=nil and target~=obj then
      local pos=target.getPosition()
      pos[2]=1
      obj.setPositionSmooth(pos,false,true)
      obj.setRotationSmooth(target.getRotation(),false,true)
      target.setPositionSmooth(target.getPosition()+Vector(0,2,0),false,true)
    else
      local pos=zone.getPosition()
      pos[2]=1
      obj.setPositionSmooth(pos,false,true)
      obj.setRotationSmooth(rot,false,true)
    end
  end, 0.25)
  return true
end

function recycleCard(playerColor, card)
  local destination = recycleDestinationForCard(card)
  if destination==nil then return false end
  return recycleMoveObjectToBottomZone(card, recycleZoneForDestination(playerColor, destination))
end

function recycleCardContext(playerColor, objectPosition, obj)
  if obj==nil then
    pcall(function() obj = hoveredObjs[playerColor] end)
  end
  if obj==nil or obj.type~='Card' then return end
  if recycleCard(playerColor, obj) then
    Player[playerColor].broadcast('recycling '..obj.getName():gsub('\n',' | '), playerColor)
  end
end

function getTopRecycleEntries(deck, count)
  local entries={}
  if deck==nil or deck.type~='Deck' then return entries end
  for i,entry in ipairs(deck.getObjects()) do
    if i>count then break end
    local destination = recycleDestinationForDeckEntry(entry)
    if destination==nil then break end
    table.insert(entries, {destination=destination})
  end
  return entries
end

function recycleTopCardsContext(count)
  return function(playerColor, objectPosition, deck)
    recycleTopCardsFromPile(playerColor, deck, count)
  end
end

function recycleTopCardsFromPile(playerColor, deck, count)
  if deck==nil then
    pcall(function() deck = hoveredObjs[playerColor] end)
  end
  if deck==nil or deck.type~='Deck' then return end
  local entries = getTopRecycleEntries(deck, count)
  if #entries<count then return end
  recycleNextTopCardFromPile(playerColor, deck, count)
end

function recycleNextTopCardFromPile(playerColor, pile, remaining)
  if remaining<=0 or pile==nil then return end
  if pile.type=='Card' then
    Wait.condition(function()
      recycleCard(playerColor, pile)
    end, function() return pile==nil or not(pile.spawning) end, 1)
    return
  end
  if pile.type~='Deck' then return end
  local entries = getTopRecycleEntries(pile, 1)
  local entry = entries[1]
  if entry==nil then return end
  local takePos = pile.getPosition()
  takePos.y = takePos.y + 2
  local takeRot = pile.getRotation()
  takeRot.z = 180
  pile.takeObject({
    top = true,
    position = takePos,
    rotation = takeRot,
    smooth = false,
    callback_function = function(card)
      Wait.frames(function()
        local zone = recycleZoneForDestination(playerColor, entry.destination)
        recycleMoveObjectToBottomZone(card, zone)
        local nextPile = pile
        if pile~=nil and pile.remainder~=nil then
          nextPile = pile.remainder
        end
        Wait.time(function()
          recycleNextTopCardFromPile(playerColor, nextPile, remaining-1)
        end, 0.35)
      end, 1)
    end
  })
end

hoveredObjs={}
function onObjectHover(ply,obj)
  hoveredObjs[ply]=obj
end

function move2trash(ply)
  local objs=Player[ply].getSelectedObjects()
  local cards={}
  for _,obj in pairs(objs) do
    if obj.type=='Card' or obj.type=='Deck' then
      table.insert(cards,obj)
    end
  end
  local gr=group(cards)
  gr=gr[1]
  if gr==nil then
    pcall(function()
      gr=hoveredObjs[ply]
    end)
  end
  if gr==nil or not(gr.type=='Card' or gr.type=='Deck') then return end
  gr.interactable=false
  gr.use_gravity=false
  Wait.time(function()
    gr.interactable=true
    gr.use_gravity=true
    if gr.type=='Card' then
      handTrigger(gr)
    end
    local trashZone = data[ply]["trash"]
    local rot = gr.getRotation()
    rot.z=0
    rot.y=trashZone.getRotation().y+banishRot
    local pos = trashZone.getPosition()
    pos[2]=3
    gr.setRotationSmooth(rot,false,true)
    gr.setPositionSmooth(pos,false,true)
  end, 1)
end


function move2banishment(ply)
  local objs=Player[ply].getSelectedObjects()
  local cards={}
  for _,obj in pairs(objs) do
    if obj.type=='Card' or obj.type=='Deck' then
      table.insert(cards,obj)
    end
  end
  local gr=group(cards)
  gr=gr[1]
  if gr==nil then
    pcall(function()
      gr=hoveredObjs[ply]
    end)
  end
  if gr==nil or not(gr.type=='Card' or gr.type=='Deck') then return end
  gr.interactable=false
  gr.use_gravity=false
  Wait.time(function()
    gr.interactable=true
    gr.use_gravity=true
    if gr.type=='Card' then
      handTrigger(gr)
    end
    local banishZone = data[ply]["banishmentZone"]
    local rot = gr.getRotation()
    rot.z=0
    rot.y=banishZone.getRotation().y+banishRot
    local pos = banishZone.getPosition()
    pos[2]=3
    gr.setRotationSmooth(rot,false,true)
    gr.setPositionSmooth(pos,false,true)
  end, 1)
end

------------------------------------ REVEAL ------------------------------------
function revealFan(button, ply, alt)
  if button ~= data[ply]["revealButton"] then return end
  if alt then
    local rot=button.getRotation()
    rot[3]=180
    button.setRotation(rot)
    return
  end
  local card=getCardFromZone(data[ply]["mainDeckZone"])
  local hexPrefix = '['..Color[ply]:toHex()..']'
  buttonPress(button,drawDelay)
  if card==nil then return end
  local mainDeckZone=data[ply]["mainDeckZone"]
  local now=os.time()
  local lastT=tonumber(button.memo)
  local nRevealed=tonumber(button.getGMNotes())
  if now-lastT>10 then
    nRevealed=0
  end
  button.memo=tostring(now)
  local nUp=math.floor(nRevealed/revealNrow)
  local nSide=nRevealed-nUp*revealNrow
  local forw= mainDeckZone.getTransformForward()
  local righ= mainDeckZone.getTransformRight()
  local pos = mainDeckZone.getPosition()+forw:scale(revealUp+revealUpS*nUp)+righ:scale(deckDirs[ply]*2.25*(nSide+revealRi))
  local rot = mainDeckZone.getRotation()
  rot[2]=rot[2]+180
  rot[3]=0
  checkPosMove(pos,mainDeckZone)
  card.setPositionSmooth(pos,false,true)
  card.setRotationSmooth(rot,false,true)
  card.highlightOn(stringColorToRGB(ply),10)
  nRevealed=nRevealed+1
  button.setGMNotes(tostring(nRevealed))
  broadcastToAll(hexPrefix..'[b]'..nRevealed..':[/b][-] '..card.getName():gsub('\n',' | '))
end

function revealStack(button, ply, alt)
  if button ~= data[ply]["revealButton"] then return end
  if alt then
    local rot=button.getRotation()
    rot[3]=0
    button.setRotation(rot)
    return
  end
  local card=getCardFromZone(data[ply]["mainDeckZone"])
  local hexPrefix = '['..Color[ply]:toHex()..']'
  buttonPress(button,drawDelay)
  if card==nil then return end
  local mainDeckZone=data[ply]["mainDeckZone"]
  local now=os.time()
  local lastT=tonumber(button.memo)
  local nRevealed=tonumber(button.getGMNotes())
  if now-lastT>10 then
    nRevealed=0
  end
  button.memo=tostring(now)
  local righ= mainDeckZone.getTransformRight()
  local pos = mainDeckZone.getPosition()+vector(0,2,0)+righ:scale(deckDirs[ply]*2.4)
  local rot = mainDeckZone.getRotation()
  rot[2]=rot[2]+180
  rot[3]=0
  card.setPositionSmooth(pos,false,true)
  card.setRotationSmooth(rot,false,true)
  nRevealed=nRevealed+1
  button.setGMNotes(tostring(nRevealed))
  broadcastToAll(hexPrefix..'[b]'..nRevealed..':[/b][-] '..card.getName():gsub('\n',' | '))
end

function checkPosMove(pos,mainDeckZone)
  local raycastPos=pos
  raycastPos[2]=1
  local raycastPars={
    origin= raycastPos,
    type = 3,
    size = {1,4,1.5},
    direction = vector(0,0,1),
    max_distance=0
  }
  local raycastOutput = Physics.cast(raycastPars)
  for _,raycastHit in pairs(raycastOutput) do
    local hitObj = raycastHit.hit_object
    if hitObj.type=='Card' or hitObj.type=='Deck' then
      local objPos=hitObj.getPosition()
      if math.abs(objPos.z)>7 then
        local relPos=mainDeckZone.positionToLocal(pos)
        local relPosObj=mainDeckZone.positionToLocal(objPos)
        local newRelPos = relPosObj
        newRelPos[3]=relPos[3]+3.1/mainDeckZone.getScale().z
        local newPos=mainDeckZone.positionToWorld(newRelPos)
        checkPosMove(newPos,mainDeckZone)
        hitObj.setPositionSmooth(newPos,false,true)
      end
    end
  end
end

----------------------------------- MULLIGAN -----------------------------------
function playerMulligan(button, playerColor, alt)
  if button == data[playerColor]["mulliganButton"] then

    if nMullClick==nil then
      nMullClick=1
    else
      nMullClick=nMullClick+1
    end
    Wait.time(function()
      nMullClick=0
    end,0.5)

    local proceed=true
    for _, v in ipairs(getPlayboardObjects(playerColor)) do
      if (v.type=='Card' or v.type=='Deck') and nMullClick<2 then
        proceed=false
      end
    end
    if not(proceed) then
      if mulliganSatety==nil then mulliganSatety=true end
      if mulliganSatety then
        Player[playerColor].broadcast('Cards detected in the play area = accidental mulligan press in the middle of a game?\n'..
                                      'If you still wish to mulligan, [b]double click[/b] the button.')
        mulliganSatety=false
        Wait.time(function() mulliganSatety=true end, 10)
      end
      return
    end

    buttonCooldown(button, 2)

    local runeDeck = getDeckFromZone(data[playerColor]["runeDeckZone"])
    if runeDeck~=nil then
      Wait.time(function() runeDeck.shuffle() end, 0.1, 7)
    end

    local deck = getDeckFromZone(data[playerColor]["mainDeckZone"])
    if deck~=nil then
      data[playerColor]["mulliganNumber"] = 4
      local objs=Player[playerColor].getHandObjects(1)
      for _,obj in pairs(objs) do
        if obj.tag=='Card' then
          deck.putObject(obj)
        end
      end
      Wait.time(function() deck.shuffle() end, 0.1, 7)

      Wait.time(function()
        deck.deal(data[playerColor]["mulliganNumber"], playerColor, 1)
      end, 0.8)
      -- Wait.time(function() sortHands(playerColor) end, 1.5)

    end
  end
end

------------------------------------- READY ------------------------------------
-- stolen from Untapper Tool by Tipsy Hobbit//STEAM_0:1:13465982
function playerUntap(button, playerColor, alt)
  if data[playerColor] == nil then return end
  if button == data[playerColor]["untapButton"] then
    buttonPress(button,drawDelay*0.75)
    local enc = Global.getVar("Encoder")
    local keywordPrefix = 'rb_'
    local stunCounterKey = keywordPrefix..'stuncounter'
    local frozenKey = keywordPrefix..'frozen'
    local exertKey = keywordPrefix..'exert'
    local readyRotY = getPlayboardReadyRotationY(playerColor)
    local rr = nil
    local untaps = true
    for _, v in ipairs(getPlayboardObjects(playerColor)) do
      untaps = true
      local flash = false
      if v.type == 'Card' or v.type == 'Deck' then
        if enc ~= nil then
          if enc.call("APIobjectExists",{obj=v}) then
            local encdat = enc.call("APIobjGetAllData",{obj=v})
            if encdat[stunCounterKey] ~= nil and untaps then
              if encdat[stunCounterKey] > 0 then
                flash = true
                untaps = false
                encdat[stunCounterKey] = encdat[stunCounterKey]-1
                enc.call("APIobjSetAllData",{obj=v,data=encdat})
                enc.call("APIrebuildButtons",{obj=v})
              end
            end
            if encdat[frozenKey] ~= nil then
              if encdat[frozenKey] == true then
                flash = true
                untaps = false
              end
            end
            if encdat[exertKey] ~= nil then
              if encdat[exertKey] == true then
                flash = true
                untaps = false
                encdat[exertKey] = false
                enc.call("APIobjSetAllData",{obj=v,data=encdat})
                enc.call("APIrebuildButtons",{obj=v})
              end
            end
          end
        end
        if untaps == false and flash == true then
          Wait.time(function() v.highlightOn(playerColor,0.1) end,0.2,3)
        elseif untaps == true then
          rr = v.getRotation()
          v.setRotationSmooth({x=rr.x,y=readyRotY,z=rr.z})
        end
      end
    end
    local bf = Global.getVar('Battlefield')
    if bf ~= nil then
      pcall(function()
        bf.call('APIreadyCardsForColor', {color=playerColor, rotY=readyRotY})
      end)
    end
  end
end

------------------------------------ CHANNEL -----------------------------------
channelMovingCards = channelMovingCards or {}
runeDragRotation = runeDragRotation or {}
runeChannelReserve = runeChannelReserve or {}
runeChannelQueue = runeChannelQueue or {}
runeChannelPumping = runeChannelPumping or {}

function onObjectPickUp(player_color, obj)
  if obj==nil or obj.type~='Card' then return end
  runeDragRotation[obj.getGUID()] = obj.getRotation()
end

function onObjectDrop(player_color, obj)
  if obj==nil then return end
  if obj.type == 'Card' then
    Wait.frames(function() battlefieldRefreshAll() end, 5)
  end
  if obj.type~='Card' then return end
  local guid = obj.getGUID()
  if channelMovingCards[guid] then return end
  local savedRot = runeDragRotation[guid]
  if savedRot==nil then return end
  Wait.frames(function()
    if obj==nil then
      runeDragRotation[guid] = nil
      return
    end
    if colorForObjectInRuneZone(obj)~=nil then
      obj.setRotation(savedRot)
    else
      runeDragRotation[guid] = nil
    end
  end, 3)
end

function playerChannel(button, playerColor, alt)
  if button == data[playerColor]["channelButton"] then
    if not(alt) then
      buttonPress(button,drawDelay*0.75)
      channelExecute(playerColor, 1)
    else
      buttonPress(button,drawDelay*nAlt)
      buttonCooldown(button, drawDelay*nAlt)
      channelExecute(playerColor, 2)
    end
  end
end

function getRuneDeckRemaining(color)
  local zone = data[color]["runeDeckZone"]
  if zone==nil then return 0 end
  local count = 0
  for _,obj in pairs(zone.getObjects()) do
    if obj.type=='Deck' then
      return obj.getQuantity()
    elseif obj.type=='Card' and obj.use_gravity then
      count = count + 1
    end
  end
  return count
end

function countRunesInZone(zone)
  if zone==nil then return 0 end
  local n = 0
  for _,obj in pairs(zone.getObjects()) do
    if obj.type=='Card' then n = n + 1 end
  end
  return n
end

function countEmptyRuneSlots(color)
  local zones = data[color]["runeZones"]
  if zones==nil then return 0 end
  local n = 0
  for _,zone in ipairs(zones) do
    if countRunesInZone(zone)==0 then n = n + 1 end
  end
  return n
end

function objectFieldSafe(obj, methodName)
  if obj == nil then return nil end
  local ok, val = pcall(function()
    local fn = obj[methodName]
    if fn == nil then return nil end
    return fn(obj)
  end)
  if ok then return val end
  return nil
end

function isRuneCard(card)
  if card==nil or card.type~='Card' then return false end
  return cardMatchesSearchType(cardSearchDataFromObject(card), 'rune')
end

function cardSearchDataFromObject(card)
  return {
    nickname = objectFieldSafe(card, 'getNickname'),
    name = objectFieldSafe(card, 'getName'),
    gm_notes = objectFieldSafe(card, 'getGMNotes'),
    lua_script_state = objectFieldSafe(card, 'getLuaScriptState'),
    tags = objectFieldSafe(card, 'getTags'),
    Tags = objectFieldSafe(card, 'getTags'),
    description = objectFieldSafe(card, 'getDescription')
  }
end

function cardSearchDataFromDeckEntry(entry)
  if entry==nil then return {} end
  return {
    nickname = entry.nickname or entry.Nickname or entry.name or entry.Name,
    name = entry.name or entry.Name or entry.nickname or entry.Nickname,
    gm_notes = entry.gm_notes or entry.GMNotes,
    lua_script_state = entry.lua_script_state or entry.LuaScriptState,
    tags = entry.tags or entry.Tags,
    Tags = entry.Tags or entry.tags,
    description = entry.description or entry.Description
  }
end

function cardMatchesAnySearchType(cardData, searchTypes)
  for _,searchType in ipairs(searchTypes) do
    if cardMatchesSearchType(cardData, searchType) then return true end
  end
  return false
end

function isEncodedTokenCard(card)
  if Encoder==nil or card==nil or card.type~='Card' then return false end
  local ok, exists = pcall(function() return Encoder.call("APIobjectExists",{obj=card}) end)
  if not ok or not exists then return false end
  local okData, tokenData = pcall(function()
    return Encoder.call("APIobjGetPropData",{obj=card,propID="RB_Token"})
  end)
  return okData and tokenData~=nil and tokenData.rb_token==true
end

function recycleDestinationForCardData(cardData, card)
  if cardData==nil then return nil end
  if isEncodedTokenCard(card) then return nil end
  if cardMatchesAnySearchType(cardData, {'token', 'legend', 'battlefield'}) then return nil end
  if cardMatchesSearchType(cardData, 'rune') then return 'rune' end
  return 'main'
end

function recycleDestinationForCard(card)
  if card==nil or card.type~='Card' then return nil end
  return recycleDestinationForCardData(cardSearchDataFromObject(card), card)
end

function recycleDestinationForDeckEntry(entry)
  return recycleDestinationForCardData(cardSearchDataFromDeckEntry(entry), nil)
end

function findNonRuneCardsInPlayboardRuneArea(color)
  local zone = getPlayboardRuneZone(color)
  if zone==nil then return {} end
  local bad = {}
  local ok, objs = pcall(function() return getPlayboardZoneObjects(zone) end)
  if not ok or objs==nil then return bad end
  for _, obj in ipairs(objs) do
    if obj~=nil and obj.type=='Card' and not isRuneCard(obj) then
      table.insert(bad, obj)
    end
  end
  return bad
end

function flashCardsRedDiscardStyle(cards)
  for _, card in ipairs(cards) do
    if card~=nil then
      Wait.time(function()
        Wait.time(function()
          if card~=nil then card.highlightOn({1,0,0},0.05) end
        end, 0.1, 10)
      end, 2)
    end
  end
  Wait.time(function()
    for _, card in ipairs(cards) do
      if card~=nil then card.highlightOff() end
    end
  end, 3.5)
end

function runeChannelError(color, msg)
  print(msg)
  Player[color].broadcast(msg, color)
end

function countChannelRuneZoneRefs(color)
  local zones = data[color]["runeZones"]
  if zones==nil then return 0 end
  local n = 0
  for _, zone in ipairs(zones) do
    n = n + countRunesInZone(zone)
  end
  return n
end

function collectChannelRuneCards(color)
  local zones = data[color]["runeZones"]
  if zones==nil then return {} end
  local seen = {}
  local cards = {}
  for _, zone in ipairs(zones) do
    for _, obj in pairs(zone.getObjects()) do
      if obj.type=='Card' then
        local guid = obj.getGUID()
        if not seen[guid] then
          seen[guid] = true
          table.insert(cards, obj)
        end
      end
    end
  end
  return cards
end

function compactChannelRuneSlots(color)
  local zones = data[color]["runeZones"]
  if zones==nil then return end
  local seen = {}
  local entries = {}
  for _, zone in ipairs(zones) do
    for _, obj in pairs(zone.getObjects()) do
      if obj.type=='Card' then
        local guid = obj.getGUID()
        if not seen[guid] then
          seen[guid] = true
          local name = (obj.getName() or ''):gsub("\n.*",""):lower()
          table.insert(entries, {
            card=obj,
            domain=getRuneDomainSortKey(obj),
            name=name,
          })
        end
      end
    end
  end
  if #entries==0 then return end
  table.sort(entries, function(a, b)
    if a.domain~=b.domain then return a.domain<b.domain end
    return a.name<b.name
  end)
  local readyRotY = getPlayboardReadyRotationY(color)
  for i, entry in ipairs(entries) do
    local zone = zones[i]
    if zone~=nil and entry.card~=nil then
      local card = entry.card
      local guid = card.getGUID()
      channelMovingCards[guid] = true
      runeDragRotation[guid] = nil
      local pos = zone.getPosition()
      pos.y = 2
      card.setRotation({x=0, y=readyRotY, z=0})
      card.setPosition(pos)
      Wait.time(function()
        if card~=nil then
          channelMovingCards[card.getGUID()] = nil
        end
      end, 0.5)
    end
  end
  runeChannelReserve[color] = nil
  ensureRuneChannelReserve(color)
end

-- When all channel slots are reserved, try to free space or explain why channel failed.
function tryRecoverRuneChannelSlots(color)
  local bad = findNonRuneCardsInPlayboardRuneArea(color)
  if #bad>0 then
    flashCardsRedDiscardStyle(bad)
    runeChannelError(color,
      'Cannot channel: the rune area has cards that are not runes. Move or remove them first.')
    return false
  end

  local zones = data[color]["runeZones"]
  if zones==nil then return false end
  local runes = collectChannelRuneCards(color)
  local nSlots = #zones
  local zoneRefs = countChannelRuneZoneRefs(color)

  -- Unique runes < slots, or one card overlapping two zones (refs > unique count).
  if #runes < nSlots or zoneRefs > #runes then
    compactChannelRuneSlots(color)
    return true
  end

  runeChannelError(color,
    'Cannot channel: no empty rune slots ('..#runes..' runes, '..nSlots..' slots).')
  return false
end

function ensureRuneChannelReserve(color)
  if runeChannelReserve[color]~=nil then return runeChannelReserve[color] end
  local zones = data[color]["runeZones"]
  if zones==nil then return nil end
  local counts = {}
  for i,zone in ipairs(zones) do
    counts[i] = countRunesInZone(zone)
  end
  runeChannelReserve[color] = counts
  return counts
end

function reserveNextRuneSlot(color)
  local zones = data[color]["runeZones"]
  if zones==nil then return nil end
  local slotCounts = ensureRuneChannelReserve(color)
  if slotCounts==nil then return nil end
  for i=1,#zones do
    if slotCounts[i]==0 then
      slotCounts[i] = 1
      return {zone=zones[i], stack=0}
    end
  end
  return nil
end

function placeChanneledRune(color, slot)
  local card = getCardFromZone(data[color]["runeDeckZone"])
  if card==nil then return false end
  local zone = slot.zone
  if zone==nil then return false end
  local guid = card.getGUID()
  channelMovingCards[guid] = true
  runeDragRotation[guid] = nil
  local readyRotY = getPlayboardReadyRotationY(color)
  local pos = zone.getPosition()
  pos.y = 2 + 0.15 * (slot.stack or 0)
  card.setRotation({x=0, y=readyRotY, z=0})
  card.setPosition(pos)
  card.use_gravity = true
  Wait.time(function()
    if card~=nil then
      channelMovingCards[card.getGUID()] = nil
    end
  end, 0.5)
  return true
end

function runeChannelQueueLength(color)
  local q = runeChannelQueue[color]
  if q==nil then return 0 end
  return #q
end

function enqueueRuneChannels(color, count)
  if count<=0 then return 0 end
  if runeChannelQueue[color]==nil then
    runeChannelQueue[color] = {}
    runeChannelReserve[color] = nil
  end
  local queued = 0
  for _=1,count do
    local slot = reserveNextRuneSlot(color)
    if slot==nil then
      if not tryRecoverRuneChannelSlots(color) then break end
      slot = reserveNextRuneSlot(color)
      if slot==nil then break end
    end
    table.insert(runeChannelQueue[color], slot)
    queued = queued + 1
  end
  return queued
end

function pumpRuneChannelQueue(color)
  if runeChannelPumping[color] then return end
  runeChannelPumping[color] = true

  local function step()
    local q = runeChannelQueue[color]
    if q==nil or #q==0 then
      runeChannelPumping[color] = false
      runeChannelReserve[color] = nil
      runeChannelQueue[color] = nil
      return
    end

    if getRuneDeckRemaining(color)<=0 then
      runeChannelQueue[color] = nil
      runeChannelPumping[color] = false
      runeChannelReserve[color] = nil
      Player[color].broadcast('no runes left in the rune deck',color)
      return
    end

    local slot = table.remove(q, 1)
    if not placeChanneledRune(color, slot) then
      runeChannelQueue[color] = nil
      runeChannelPumping[color] = false
      runeChannelReserve[color] = nil
      Player[color].broadcast('no runes left in the rune deck',color)
      return
    end

    Wait.time(step, drawDelay)
  end

  step()
end

function channelExecute(playerColor, count)
  local remaining = getRuneDeckRemaining(playerColor)
  local queuedAlready = runeChannelQueueLength(playerColor)
  local maxAdd = remaining - queuedAlready
  if maxAdd<=0 then
    if queuedAlready==0 then
      Player[playerColor].broadcast('no runes left in the rune deck',playerColor)
    end
    return
  end
  if count>maxAdd then count = maxAdd end
  enqueueRuneChannels(playerColor, count)
  pumpRuneChannelQueue(playerColor)
end

runeDomainOrder = {'f','c','m','b','x','o'}

function isRuneZone(zone)
  if zone==nil then return false end
  for _,col in pairs(Player.getAvailableColors()) do
    local zones = data[col] and data[col]["runeZones"]
    if zones then
      for _,z in ipairs(zones) do
        if z==zone then return true end
      end
    end
  end
  return false
end

function colorForRuneZone(zone)
  if zone==nil then return nil end
  for _,col in pairs(Player.getAvailableColors()) do
    local zones = data[col] and data[col]["runeZones"]
    if zones then
      for _,z in ipairs(zones) do
        if z==zone then return col end
      end
    end
  end
  return nil
end

function colorForObjectInRuneZone(obj)
  if obj==nil then return nil end
  for _,oZone in pairs(obj.getZones()) do
    local c = colorForRuneZone(oZone)
    if c then return c end
  end
  return nil
end

function getRuneDomainSortKey(card)
  if Encoder==nil or card==nil then return 99 end
  local ok, exists = pcall(function() return Encoder.call("APIobjectExists",{obj=card}) end)
  if not ok or not exists then return 99 end
  local ok2, d = pcall(function() return Encoder.call("APIobjGetPropData",{obj=card,propID="RB_Domain"}) end)
  if not ok2 or d==nil or d.rb_domain==nil or d.rb_domain=='' then return 99 end
  for i,letter in ipairs(runeDomainOrder) do
    if string.find(d.rb_domain,letter) then return i end
  end
  return 99
end

function sortRuneZones(color, onComplete)
  local zones = data[color] and data[color]["runeZones"]
  if zones==nil then
    if onComplete~=nil then onComplete() end
    return
  end
  local seen = {}
  local entries = {}
  for _,zone in ipairs(zones) do
    for _,obj in pairs(zone.getObjects()) do
      if obj.type=='Card' then
        local guid = obj.getGUID()
        if not seen[guid] then
          seen[guid] = true
          local name = (obj.getName() or ''):gsub("\n.*",""):lower()
          table.insert(entries,{card=obj,domain=getRuneDomainSortKey(obj),name=name})
        end
      end
    end
  end
  if #entries==0 then
    if onComplete~=nil then onComplete() end
    return
  end
  table.sort(entries,function(a,b)
    if a.domain~=b.domain then return a.domain<b.domain end
    return a.name<b.name
  end)
  local nSlots = #zones
  for i,entry in ipairs(entries) do
    local slotIdx = ((i-1) % nSlots) + 1
    local stack = math.floor((i-1)/nSlots)
    local zone = zones[slotIdx]
    if zone~=nil and entry.card~=nil then
      channelMovingCards[entry.card.getGUID()] = true
      local pos = zone.getPosition()
      pos.y = 2 + 0.15*stack
      entry.card.setPositionSmooth(pos,false,true)
      local guid = entry.card.getGUID()
      Wait.time(function() channelMovingCards[guid] = nil end, runeSortSettleTime)
    end
  end
  if onComplete~=nil then
    Wait.time(onComplete, runeSortSettleTime)
  end
end

function sortRuneZonesCallback(color)
  return function(ply) sortRuneZones(color) end
end

function playerDraw(button, playerColor, alt)
  if button == data[playerColor]["drawButton"] then
    if not(alt) then
      buttonPress(button,drawDelay*0.75)
      draw1(playerColor)
    else
      buttonPress(button,drawDelay*nAlt)
      buttonCooldown(button, drawDelay*nAlt)
      Wait.time(function() draw1(playerColor) end, drawDelay, nAlt)
    end
  end
end

function draw1(playerColor)
  local card=getCardFromZone(data[playerColor]['mainDeckZone'])
  if card~=nil then
    --interactTrigger(card)
    Wait.condition(function() card.deal(1,playerColor,1) end,
                   function() return not(card.spawning) end)
  end
end

------------------------------------- MILL -------------------------------------
function playerMill(button, playerColor, alt)
  if button == data[playerColor]["millButton"] then
    if not(alt) then
      buttonPress(button,drawDelay*0.75)
      mill1(playerColor)
    else
      buttonPress(button,drawDelay*nAlt)
      buttonCooldown(button, drawDelay*nAlt)
      Wait.time(function() mill1(playerColor) end, drawDelay, nAlt)
    end
  end
end

function mill1(playerColor)
  local card=getCardFromZone(data[playerColor]['mainDeckZone'])
  if card~=nil then
    local trashPos = data[playerColor]["trash"].getPosition()
    local targPos = {x=trashPos.x,y=3,z=trashPos.z}
    --interactTrigger(card)
    local cardRot = card.getRotation()
    cardRot.z = 0
    card.setRotationSmooth(cardRot,false,true)
    card.setPositionSmooth(targPos,false,true)
    Wait.time(function() checkMoveSuccess(card,targPos,playerColor) end, 0.5)
  end
end

------------------------------------- PREDICT ----------------------------------
function playerPredict(button, playerColor, alt)
  if button == data[playerColor]["scryButton"] then
    if not(alt) then
      buttonPress(button,drawDelay*0.75)
      scry1(playerColor)
    else
      buttonPress(button,drawDelay*nAlt)
      buttonCooldown(button, drawDelay*nAlt)
      Wait.time(function() scry1(playerColor) end, drawDelay, nAlt)
    end
  end
end

function scry1(playerColor)
  local card=getCardFromZone(data[playerColor]['mainDeckZone'])
  if card~=nil then
    Wait.condition(function()
      card.deal(1,playerColor,2)
      Encoder.call("APIencodeObject",{obj=card})
      Encoder.call("APIobjEnableProp",{obj=card,propID="πScry"})
    end, function() return not(card.spawning) end)
  end
end

-- deal() works stupidly with non-primary hand
-- (card arrives and floats for 5 seconds before taking formation with other cards)
-- using setPositionSmooth() does not have this problem but
-- using default hand position always sends the card into the middle, changing the order of cards
-- so.. the function below gets the right-ish side of the zone
function getHand2Pos(playerColor)
  local pos = Player[playerColor].getHandTransform(2).position
  local sca = Player[playerColor].getHandTransform(2).scale
  local rig = Player[playerColor].getHandTransform(2).right
  local targPos = pos:add(rig:scale(sca.x*0.55))
  -- {x=pos.x+sca.x*rig.x*0.65,y=pos.y+sca.x*rig.y*0.65+1.5,z=pos.z+sca.x*rig.z*0.65}
  return targPos
end

----------------------------------- UNIVERSAL ----------------------------------

-- this should get the highest resting card from the library zones
-- works if there are extra cards flipped face up on top of the deck
-- (personally, I play with a bunch of decks that keep the top card of the library revealed)
-- works if there is just one card remaining in the zone, too
function getCardFromZone(zone)
  local card = nil
  local highY = 0
  local highObj = nil
  local objects = zone.getObjects()
  for i,obj in pairs(objects) do
    if obj.type=='Deck' or (obj.type=='Card' and obj.use_gravity) then
      if obj.getPosition().y>highY then
        highY=obj.getPosition().y
        highObj=obj
      end
    end
  end
  if highObj~=nil then
    if highObj.type=='Deck' then     -- pull one card from the top of the deck
      local deck = highObj
      local cardPresent, card = pcall(deck.takeObject)
      if cardPresent and card.type=='Card' then
        deck.setLock(true)
        Wait.frames(function() deck.setLock(false) end, 1)
        card.use_hands = true
        gravityTrigger(card)
        return card
      end
    elseif highObj.type=='Card' then
      local card=highObj
      card.use_hands = true
      gravityTrigger(card)
      return card
    end
  end
  return card   -- if nil?
end

function getDeckFromZone(zone)
  local deck = nil
  local objects = zone.getObjects()
  for i,obj in pairs(objects) do
    if obj.type=='Deck' then
      deck = obj
      return deck
    end
  end
  return deck
end

-- button press animation
function buttonPress(button,T)
  local posUp = button.getPosition()
  local posDown = button.getPosition()
  posUp.y=1
  posDown.y=0.9
  local downT = T
  if downT<0.05 then downT=0.05 end
  button.setPositionSmooth(posDown,false,true)
  Wait.time(function() button.setPositionSmooth(posUp,false,true) end, downT)
end

 -- rotate all buttons on the object upside down for the cooldown timer
function buttonCooldown(button,T)
  buts = button.getButtons()
  for i,but in pairs(buts) do
    local oldRot = but.rotation
    local ind = but.index
    button.editButton({index=ind,rotation={x=oldRot.x,y=oldRot.y,z=180}})
    Wait.time(function() button.editButton({index=ind,rotation={x=oldRot.x,y=oldRot.y,z=0}}) end, T)
  end
end

-- check that the card made it to it's target, if not, teleport it
function checkMoveSuccess(card,targetPos,playerColor)
  if card==nil then   -- the card is gone, probably stacked into a deck already
    return
  end
  -- use hands orientation to determine which coordinate to use to check position
  -- currently only set up to work with hands rotated 0,90,180,270 degrees
  local handForw=Player[playerColor].getHandTransform(2).forward
  local posDiff = 0
  if math.abs(handForw.z)>0.5 then
    posDiff = math.abs(card.getPosition().z - targetPos.z)
  elseif math.abs(handForw.x)>0.5 then
    posDiff = math.abs(card.getPosition().x - targetPos.x)
  end
  if posDiff>1 then
    card.setPosition(targetPos)
  end
end

-- for hiding cards
function allBut(playerColor)
  local players = {}
  for key, color in pairs(Color.list) do
    if color ~= playerColor then
      table.insert(players,color)
    end
  end
  return players
end
function unhide(card)
  if card~=nil then
    card.setHiddenFrom({})
  end
end

-- turns off gravity on the card for a few frames (prevents it from falling back onto a deck)
function gravityTrigger(obj)
  if obj~=nil then
    obj.use_gravity=false
    Wait.time(function() gravOn(obj) end, 0.2)
  end
end
function gravOn(obj)
  if obj~=nil then
    obj.use_gravity=true
  end
end

function interactTrigger(obj)
  if obj~=nil then
    obj.interactable = false
    Wait.time(function() interactOn(obj) end, 0.2)
  end
end
function interactOn(obj)
  if obj~=nil then
    obj.interactable = true
  end
end

function handTrigger(obj)
  if obj~=nil then
    obj.use_hands=false
    Wait.time(function() handOn(obj) end, 0.1)
  end
end
function handOn(obj)
  if obj~=nil then
    obj.use_hands=true
  end
end

function null()
end

--------------------------------- CONTEXT MENU ---------------------------------

function getObjectContextFlags(obj, skipZone)
  local flags = {
    inHandZone = false,
    inPlayZone = false,
    inDeckZone = false,
    runeColor = nil
  }
  if obj==nil then return flags end
  local encZones = nil
  if Encoder~=nil then
    local ok, zones = pcall(function() return Encoder.call("APIlistZones",{}) end)
    if ok then encZones = zones end
  end
  for _,oZone in pairs(obj.getZones()) do
    if oZone~=skipZone then
      if encZones~=nil then
        local encZone=encZones[oZone.getGUID()]
        if encZone and encZone.name:match('_1') then
          flags.inHandZone=true
        end
      end
      if playboardColorForZone(oZone)~=nil then
        flags.inPlayZone=true
      end
      for _,col in pairs(Player.getAvailableColors()) do
        if data[col]~=nil and oZone==data[col]["mainDeckZone"] then
          flags.inDeckZone=true
        end
      end
      if flags.runeColor==nil then
        flags.runeColor = colorForRuneZone(oZone)
      end
    end
  end
  return flags
end

function addRecycleContextMenuItems(obj)
  if obj==nil then return end
  if obj.type=='Card' then
    if recycleDestinationForCard(obj)~=nil then
      obj.addContextMenuItem('Recycle', recycleCardContext)
    end
  elseif obj.type=='Deck' then
    if #getTopRecycleEntries(obj, 1)>=1 then
      obj.addContextMenuItem('Recycle top card', recycleTopCardsContext(1))
    end
    if #getTopRecycleEntries(obj, 3)>=3 then
      obj.addContextMenuItem('Recycle top 3 cards', recycleTopCardsContext(3))
    end
  end
end

function refreshObjectContextMenu(obj, skipZone, forceHandZone)
  if obj==nil or not(obj.type=='Card' or obj.type=='Deck') then return end
  local flags = getObjectContextFlags(obj, skipZone)
  if forceHandZone then flags.inHandZone=true end
  obj.clearContextMenu()
  if obj.type=='Card' then
    -- obj.addContextMenuItem('Encoder Menu',toggleEncMenu)
  end
  if obj.type=='Card' and flags.inPlayZone then
    obj.addContextMenuItem('Make Token Copy',cardToken)
  end
  if obj.type=='Card' and flags.inHandZone then
    obj.addContextMenuItem('Sort Hand by Energy',sortHands)
    obj.addContextMenuItem('Random Discard',randomDiscard)
  end
  if obj.type=='Card' and flags.runeColor~=nil then
    obj.addContextMenuItem('Sort by rune type', sortRuneZonesCallback(flags.runeColor))
  end
  if obj.type=='Deck' and flags.inDeckZone then
    obj.addContextMenuItem('Reveal until Type/Tag',deckSeachType)
    obj.setScale({1,1,1})
  end
  addRecycleContextMenuItems(obj)
end

function addZoneContextMenus()
  local seen={}
  for _,obj in ipairs(getObjects()) do
    if obj.type=='Card' or obj.type=='Deck' then
      refreshObjectContextMenu(obj)
      seen[obj.getGUID()]=true
    end
  end
  for color, playerData in pairs(data) do
    for _,obj in pairs(Player[color].getHandObjects(1)) do
      refreshObjectContextMenu(obj, nil, true)
      seen[obj.getGUID()]=true
    end
    local runeZones = playerData["runeZones"]
    if runeZones then
      for _,zone in ipairs(runeZones) do
        if zone~=nil then
          zone.addContextMenuItem('Sort by rune type', sortRuneZonesCallback(color))
        end
      end
    end
  end
end

-- Global
addContextMenuItem('have a response',function(c)
    broadcastToAll(Player[c].steam_name..' has a response!',stringColorToRGB(c))
  end)
addContextMenuItem('could you not',function(c)
    broadcastToAll(Player[c].steam_name..' asks: [999999]"Could you not?"[-]',stringColorToRGB(c))
  end)
addContextMenuItem('hand counts',function(c)
    local s='number of cards in hands:'
    for _,p in pairs(Player.getPlayers()) do
      local n=#p.getHandObjects()
      if n<10 then n='0'..n end
      s=s..'\n['..Color[p.color]:toHex()..']'..n
    end
    Player[c].broadcast(s..'[-]',{0.7,0.7,0.7})
  end)

function onObjectSpawn(obj)
  if obj==nil or not(obj.type=='Card' or obj.type=='Deck') then return end
  Wait.condition(function()
    if obj~=nil then refreshObjectContextMenu(obj) end
  end, function() return obj==nil or not(obj.spawning) end, 1)
end

-- zone specific context menu items
function onObjectEnterZone(zone,obj)
  if obj==nil or not(obj.type=='Card' or obj.type=='Deck') then return end
  if obj.type == 'Card' then
    battlefieldNotifyZone(zone)
  end
  refreshObjectContextMenu(obj)
  -- For non-encoded cards entering a rune zone, add the recycle button directly.
  -- Encoded cards get the button via the Encoder's RBRuneRecycle Menu registration.
  if obj.type == 'Card' and colorForRuneZone(zone) ~= nil then
    Wait.condition(function()
      if obj == nil then return end
      local isEncoded = false
      if Encoder ~= nil then
        local ok, e = pcall(function()
          return Encoder.call("APIobjectExists", {obj=obj})
        end)
        if ok then isEncoded = e end
      end
      if not isEncoded then
        obj.clearButtons()
        addRuneRecycleButton(obj)
      end
    end, function() return obj == nil or obj.resting end, 5)
  end
end

function onObjectLeaveZone(zone,obj)
  if obj==nil or not(obj.type=='Card' or obj.type=='Deck') then return end
  if obj.type == 'Card' then
    battlefieldNotifyZone(zone)
  end
  refreshObjectContextMenu(obj, zone)
  -- For non-encoded cards leaving a rune zone, remove the button/decal if the
  -- card is no longer in any rune zone. Encoded cards are cleaned up by the
  -- Encoder's RBRuneRecycle Menu callback when buttons are rebuilt elsewhere.
  if obj.type == 'Card' and colorForRuneZone(zone) ~= nil then
    Wait.frames(function()
      if obj == nil then return end
      if colorForObjectInRuneZone(obj) ~= nil then return end
      local isEncoded = false
      if Encoder ~= nil then
        local ok, e = pcall(function()
          return Encoder.call("APIobjectExists", {obj=obj})
        end)
        if ok then isEncoded = e end
      end
      removeRuneRecycleDecal(obj)
      if not isEncoded then
        obj.clearButtons()
      end
    end, 5)
  end
end

function toggleEncMenu(ply)
  objs=Player[ply].getSelectedObjects()
  for i,obj in pairs(objs) do
    obj.setLock(true)
    Encoder.call("APIencodeObject",{obj=obj})
    local objRot=obj.getRotation()
    local cardFlip=1
    if objRot[3]>90 and objRot[3]<270 then cardFlip=-1 end
    local encFlip = Encoder.call("APIgetFlip",{obj=obj})
    if encFlip~=cardFlip then
      Encoder.call("APIFlip",{obj=obj})
    end
    Encoder.call("APIobjToggleMenu",{obj=obj,menuID='πMenu'})
    Encoder.call("APIrebuildButtons",{obj=obj})
    Wait.frames(function() obj.setLock(false) end, 1)
  end
end

function cardToken(ply)
  objs=Player[ply].getSelectedObjects()
  card=objs[1]
  Player[ply].clearSelectedObjects()
  if card.type~='Card' then return end
  local newPos=card.getPosition()+card.getTransformForward():scale(-3.2)
  local cardDat=card.getData()
  cardDat.Transform.posX=newPos.x
  cardDat.Transform.posY=newPos.y+0.1
  cardDat.Transform.posZ=newPos.z
  Encoder.call("APIencodeObject",{obj=card})
  local flip = Encoder.call("APIgetFlip",{obj=card})
  local moduleData = Encoder.call("APIobjGetProps", {obj = card})
  local valueData = Encoder.call("APIobjGetAllData",{obj = card})
  local tCard=spawnObjectData({data=cardDat})
  Wait.Condition(function()
    if tCard==nil or Encoder==nil then return end
    Encoder.call("APIencodeObject",{obj=tCard})
    Encoder.call("APIobjSetAllData",{obj=tCard, data = valueData})
    Encoder.call("APIobjSetProps",{obj=tCard, data = moduleData})
    if flip < 0 then Encoder.call("APIFlip", {obj = tCard}) end
    Encoder.call("APIobjEnableProp",{obj=tCard,propID="RB_Token"})
    Encoder.call("APIrebuildButtons",{obj=tCard})
    refreshObjectContextMenu(tCard)
  end,function() return tCard==nil or not(tCard.spawning) end)
end

-- sort hands by energy cost, then by might ascending (none first)
function sortHands(ply)
  Player[ply].clearSelectedObjects()
  for handInd=1,Player[ply].getHandCount() do
    local cards=Player[ply].getHandObjects(handInd)
    local entries={}
    local poss={}
    for i,card in ipairs(cards) do
      if card.type=="Card" then
        local desc=card.getDescription()
        local energy=tonumber(desc:match("Energy: (%d+)"))
        local might=tonumber(desc:match("Might: (%d+)"))
        table.insert(entries,{id=i,energy=energy,might=might})
        table.insert(poss,card.getPosition())
      end
    end
    table.sort(entries,function(a,b)
      local ea=a.energy or math.huge
      local eb=b.energy or math.huge
      if ea~=eb then return ea<eb end
      if a.might==nil and b.might==nil then return false end
      if a.might==nil then return true end
      if b.might==nil then return false end
      return a.might<b.might
    end)

    for i,v in ipairs(entries) do
      cards[v.id].setHiddenFrom(allBut(ply))
      cards[v.id].setLock(true)
      Wait.frames(function()
        cards[v.id].setPositionSmooth(poss[i],false,false)
      end,1)
    end

    Wait.frames(function()
      Wait.condition(function()
        for i,v in ipairs(entries) do
          cards[v.id].setLock(false)
          cards[v.id].setPosition(poss[i])
          Wait.frames(function() cards[v.id].setHiddenFrom({}) end, 20)
        end
      end, function()
        local doneMoving=true
        for _,card in pairs(cards) do
          if card.isSmoothMoving() then
            doneMoving=false
          end
        end
        return doneMoving
      end)
    end, 5)

  end
end

function randomDiscard(ply)
  local cards=Player[ply].getHandObjects(1)
  Player[ply].clearSelectedObjects()
  local discardN=math.random(#cards)
  Wait.time(function()
    discardN=math.random(#cards)
    cards[discardN].highlightOn({1,1,1},0.1)
  end,0.1,20)
  Wait.time(function()
    Wait.time(function()
      cards[discardN].highlightOn({1,0,0},0.05)
    end,0.1,10)
  end,2)
  Wait.time(function()
    discardCard(cards[discardN],ply)
  end,3)
end

function discardCard(card, playerColor)
  Player[playerColor].clearSelectedObjects()
  local trashPos = data[playerColor]["trash"].getPosition()
  local target  = {x=trashPos.x, y=3, z=trashPos.z}
  local cardRot = card.getRotation()
  cardRot.z = 0
  card.setRotationSmooth(cardRot,false,true)
  Wait.time(function() handTrigger(card) card.setPositionSmooth(target,false,true) end, 0.2)
  Wait.time(function() checkMoveSuccess(card,target,playerColor) end, 0.5)
end

--------------------------------------------------------------------------------
-- deck context menu UI
-- function deckScry(ply)
--   Player[ply].clearSelectedObjects()
--   local UIactive = UI.getAttribute('GetValuePanel','active')
--   local usingCol = UI.getAttribute('GetValuePanel','visibility')
--   if UIactive=="False" then UIactive=false else UIactive=true end
--   if UIactive and usingCol~=ply then
--     if Turns.turn_color~=ply then
--       Player[ply].broadcast(usingCol..' is currently using the interface')
--       return
--     else
--       Player[usingCol].broadcast("It is "..ply.."'s turn and they need to use the interface")
--     end
--   end
--
--   UI.setAttribute('GetValuePanel','visibility',ply)
--   UI.setAttribute('GetValuePanel','active','True')
--   -- UI.show('GetValuePanel')
--   UI.setAttribute('CMtext','text','enter amount\nto scry for')
-- end
--
-- function deckMill(ply)
--   Player[ply].clearSelectedObjects()
--   local UIactive = UI.getAttribute('GetValuePanel','active')
--   local usingCol = UI.getAttribute('GetValuePanel','visibility')
--   if UIactive=="False" then UIactive=false else UIactive=true end
--   if UIactive and usingCol~=ply then
--     if Turns.turn_color~=ply then
--       Player[ply].broadcast(usingCol..' is currently using the interface')
--       return
--     else
--       Player[usingCol].broadcast("It is "..ply.."'s turn and they need to use the interface")
--     end
--   end
--
--   UI.setAttribute('GetValuePanel','visibility',ply)
--   UI.setAttribute('GetValuePanel','active','True')
--   -- UI.show('GetValuePanel')
--   UI.setAttribute('CMtext','text','enter amount\nto mill for')
-- end

function CMgetVal(ply,txt)
  CMVal=txt
end

function CMcancel(ply)
  UI.setAttribute('GetValuePanel','active','False')
end

function CMokay(player)
  UI.setAttribute('GetValuePanel','active','False')
  ply=player.color
  if data[ply]==nil then
    Player[ply].broadcast('Your color is '..ply..'. Are you seated at the table?')
    return
  end
  local deck = getDeckFromZone(data[ply]["mainDeckZone"])
  if deck==nil then
    Player[ply].broadcast('no deck found in the deck zone')
    return
  end
  local funTxt = UI.getAttribute('CMtext','text')
  if CMVal=='' or CMVal==nil then return end
  if funTxt:match('scry') then
    enterScryVal(deck,ply,CMVal)
  end
  if funTxt:match('mill') then
    enterMillVal(deck,ply,CMVal)
  end
end

function enterScryVal(deck,ply,CMVal)
  local val = tonumber(CMVal)
  local maxVal = deck.getQuantity()
  if maxVal<val then
    Player[ply].broadcast('You only have '..maxVal..' cards left in your deck',ply)
    val=maxVal
  end
  if val>0 then
    local rot=deck.getRotation()
    rot.z=180
    deck.setRotation(rot)
    Wait.time(function() scry1(ply) end, drawDelay, val)
    Player[ply].broadcast('predicting '..val..' cards',ply)
  else
    Player[ply].broadcast('you entered a strange value',ply)
  end
end

function enterMillVal(deck,ply,CMVal)
  local val = tonumber(CMVal)
  local maxVal = deck.getQuantity()
  if maxVal<val then
    Player[ply].broadcast('You only have '..maxVal..' cards left in your deck',ply)
    val=maxVal
  end
  if val>0 then
    local rot=deck.getRotation()
    rot.z=180
    deck.setRotation(rot)
    Wait.time(function() mill1(ply) end, drawDelay, val)
    Player[ply].broadcast('milling '..val..' cards',ply)
  else
    Player[ply].broadcast('you entered a strange value',ply)
  end
end

function acceptRevealedCard(card,ply)

    if ply~=card.getGMNotes() then return end
    cardToPlay=nil
    if Encoder.call('APIobjectExists',{obj=card}) then
      Encoder.call('APIenableEncoding',{obj=card})
    end
    card.setGMNotes('')
    card.clearButtons()
    if cDeck then     -- put any other revealed cards onto libBot
      moveCDeckToBot(cDeck,ply)
    end

    if repeatSearchX~=nil then
      repeatN=repeatN+1
      if repeatN<repeatSearchX then
        Wait.time(function()
          local deck = getDeckFromZone(data[ply]["mainDeckZone"])
          revealUntilType(deck,ply,searchTypes)
        end,1)
      else
        repeatSearchX=nil
      end
    end

end

function declineRevealedCard(card,ply)

    if ply~=card.getGMNotes() then return end
    cardToPlay=nil
    if Encoder.call('APIobjectExists',{obj=card}) then
      Encoder.call('APIenableEncoding',{obj=card})
    end
    card.setGMNotes('')
    card.clearButtons()
    local waitT=1
    if cDeck then       -- add the card to other revealed cards and then put all on libBot
      doneRevealing=false
      local cDeckPos=cDeck.getPosition()
      cDeckPos[2]=cDeckPos[2]+0.1
      card.setPositionSmooth(cDeckPos,false,true)
      card.setRotationSmooth(cDeck.getRotation(),false,true)
      Wait.time(function() moveCDeckToBot(cDeck,ply) end, 1)
      waitT=2
    else                -- move just the one cards on libBot
      local pos=data[ply]["mainDeckZone"].getPosition()
      pos.y=0.96
      local rot=card.getRotation()
      rot.z=180
      Wait.time(function() card.setPositionSmooth(pos,false,true) end, 0.25)
      card.setRotationSmooth(rot,false,true)
    end

    if repeatSearchX~=nil then
      repeatN=repeatN+1
      if repeatN<repeatSearchX then
        Wait.time(function()
          local deck = getDeckFromZone(data[ply]["mainDeckZone"])
          revealUntilType(deck,ply,searchTypes)
        end,waitT)
      else
        repeatSearchX=nil
      end
    end

end

function moveCDeckToBot(cDeck,ply)
  if cDeck==nil then cDeck=cDeckBackup end
  cDeck.clearButtons()
  local rot=cDeck.getRotation()
  rot.z=180
  cDeck.setRotationSmooth(rot,false,true)     -- flip to z=180
  local deck = getDeckFromZone(data[ply]["mainDeckZone"])
  if deck==nil then
    deck = getCardFromZone(data[ply]["mainDeckZone"])
  end
  cDeck.shuffle()
  Wait.time(function()
    doneRevealing=true
    cDeck.shuffle()
    if deck~=nil then
      -- Wait.time(function() deck.putObject(cDeck) end, 0.2)
      cDeck.setPositionSmooth(deck.getPosition(),false,true)
      cDeck.setRotationSmooth(deck.getRotation(),false,true)
      deck.setPositionSmooth(deck.getPosition()+Vector(0,2,0),false,true)
      cDeck=nil
    else
      local rot = cDeck.getRotation()
      rot.z=180
      local pos = data[ply]["mainDeckZone"].getPosition()
      pos[2]=1
      cDeck.setRotationSmooth(rot,false,true)
      cDeck.setPositionSmooth(pos,false,true)
      cDeck=nil
    end
  end, 0.25)
end

-- keep track of the revealed pile while it moves back to the deck
function onObjectEnterContainer(container, enter_object)
  if enter_object.type=="Card" then
    enter_object.setHiddenFrom({})    -- if hidden card enters a library, unhide
    enter_object.use_hands=true
    enter_object.use_gravity=true
  end

  if cDeck==nil then return end
  for _,col in pairs(Player.getAvailableColors()) do
    local lib = getDeckFromZone(data[col]["mainDeckZone"])
    if container==lib or enter_object==lib then
      cDeck=nil
      return
    end
  end
  if cDeck==enter_object then
    Wait.condition(function() cDeck=container end,function() return not(container.spawning) end)
  end

  if doneRevealing==true then   -- for when players put the revealed pile on the bottom by hand
    if cDeck==enter_object or cDeck==container then
      cDeckBackup=cDeck
      cDeck=nil
    end
  end
end



--------------------------------------------------------------------------------
-- revealUntilType
function deckSeachType(ply)
  Player[ply].clearSelectedObjects()
  local UIactive = UI.getAttribute('SearchTypePanel','active')
  local usingCol = UI.getAttribute('SearchTypePanel','visibility')
  if UIactive=="False" then UIactive=false else UIactive=true end
  if UIactive and usingCol~=ply then
    if Turns.turn_color~=ply then
      Player[ply].broadcast('Only one person at the table can use this function at a time.\n'..
                             usingCol..' is currently using the interface')
      Player[usingCol].broadcast('Only one person at the table can use this function at a time.\n'..
                             ply..' wants to use the interface')
      return
    else
      Player[usingCol].broadcast("It is "..ply.."'s turn and they need to use the interface")
    end
  end

  searchTypeOrder={'champion','unit','gear','rune','spell'}
  searchTypeVect={}
  for _,cardType in ipairs(searchTypeOrder) do
    searchTypeVect[cardType]=false
  end
  seachTypeCustom=''
  repeatSearchX=nil

  UI.setAttribute('repeatX','text','')
  UI.setAttribute('typeCustom','text','')
  for _,cardType in ipairs(searchTypeOrder) do
    UI.setAttribute(cardType,'isOn','False')
    UI.setAttribute(cardType,'textColor','rgb(1,1,1)')
  end

  UI.setAttribute('SearchTypePanel','visibility',ply)
  UI.setAttribute('SearchTypePanel','active','True')
end

function STcancel(ply)
  UI.setAttribute('SearchTypePanel','active','False')
end

function STokay(player)
  UI.setAttribute('SearchTypePanel','active','False')
  ply=player.color
  if data[ply]==nil then
    Player[ply].broadcast('Your color is '..ply..'. Are you seated at the table?')
    return
  end
  local deck = getDeckFromZone(data[ply]["mainDeckZone"])
  if deck==nil then
    Player[ply].broadcast('no deck found in your deck zone')
    return
  end
  searchTypes={}
  for _,cardType in ipairs(searchTypeOrder) do
    if searchTypeVect[cardType] then
      table.insert(searchTypes,cardType)
    end
  end
  if seachTypeCustom~='' then
    table.insert(searchTypes,seachTypeCustom)
  end
  enterSearchTypes(deck,ply,searchTypes)
end

function UItypeToggle(player,val,id)
  searchTypeVect[id]=(val=="True")
end

function UItypeCustom(player,val,id)
  seachTypeCustom=val
end

function UIrepeatSearchType(player,val,id)
  repeatSearchX=tonumber(val)
  repeatN=0
end

function enterSearchTypes(deck,ply,searchTypes)
  if #searchTypes>0 then
    local rot=deck.getRotation()
    rot.z=180
    deck.setRotation(rot)
    revealUntilType(deck,ply,searchTypes)
  else
    Player[ply].broadcast('you did not select any card types or tags to look for',ply)
  end
end

function normalizeCardSearchText(value)
  if value==nil then return '' end
  if type(value)=='table' then
    local parts={}
    for k,v in pairs(value) do
      if type(v)=='boolean' and v then
        table.insert(parts,normalizeCardSearchText(k))
      else
        table.insert(parts,normalizeCardSearchText(v))
      end
    end
    return table.concat(parts,' ')
  end
  local text=tostring(value):lower():gsub('%[.-%]',' ')
  return text
end

function getDescriptionSearchMetadata(description)
  local metadata={}
  if description==nil then return metadata end
  for line in tostring(description):gmatch('[^\r\n]+') do
    local clean=line:gsub('%[.-%]','')
    local lower=clean:lower()
    if lower:match('^%s*tags?:') or lower:match('^%s*subtypes?:') or lower:match('^%s*types?:') then
      table.insert(metadata,clean)
    end
  end
  return metadata
end

function getNicknameSearchMetadata(nickname)
  local metadata={}
  if nickname==nil then return metadata end
  local firstLine=true
  for line in tostring(nickname):gmatch('[^\r\n]+') do
    if firstLine then
      firstLine=false
    else
      table.insert(metadata,line)
    end
  end
  if #metadata==0 then
    table.insert(metadata,nickname)
  end
  return metadata
end

function cardMatchesSearchType(card,searchType)
  local needle=normalizeCardSearchText(searchType)
  if needle=='' then return false end
  local haystack=normalizeCardSearchText({
    getNicknameSearchMetadata(card.nickname or card.name),
    card.gm_notes,
    card.lua_script_state,
    card.tags,
    card.Tags,
    getDescriptionSearchMetadata(card.description)
  })
  return haystack:find(needle,1,true)~=nil
end

function APIcardMatchesSearchType(params)
  if params == nil then return false end
  return cardMatchesSearchType(params.card, params.searchType)
end

function revealUntilType(deck,playerColor,searchTypes)

  if deck==nil then return end

  if cardToPlay~=nil then
    Player[playerColor].broadcast("You need to decline (✗) or accept (✓) the previous card.",{0.7,0.7,0.7})
    return
  end

  nCards=0
  cardFound=false
  for _,card in pairs(deck.getObjects()) do
    nCards=nCards+1
    for _,searchType in ipairs(searchTypes) do
      if cardMatchesSearchType(card,searchType) then
        cardFound=true
        break
      end
    end
    if cardFound then break end
  end

  if not(cardFound) then
    Player[playerColor].broadcast('No valid cards found, skipping the procedure',playerColor)
    repeatSearchX=nil
    return
  end

  mainDeckZone = data[playerColor]["mainDeckZone"]
  mainDeckPos  = mainDeckZone.getPosition()
  cDeck   = nil
  cardToPlay = nil
  deckDir = deckDirs[playerColor]

  -- move any objects in the area out of the way -------------------------------
  local origPos=mainDeckPos+mainDeckZone.getTransformRight():scale(3.75*deckDir)
  origPos[2]=1
  local raycastPars={
    origin=origPos,
    direction = vector(0,0,1),
    type = 3,
    size = {5,4,3},
    max_distance=0,
  }
  local raycastOutput = Physics.cast(raycastPars)
  for _,raycastHit in pairs(raycastOutput) do
    local hitObj = raycastHit.hit_object
    if hitObj.type=='Card' or hitObj.type=='Deck' then
      local hitObjPos=hitObj.getPosition()
      local hitObjRelPos=mainDeckZone.positionToLocal(hitObjPos)
      local origRelPos=mainDeckZone.positionToLocal(raycastPars.origin)
      local newObjRelPos=hitObjRelPos
      if hitObjRelPos[3]<(origRelPos[3]-0.1) then
        newObjRelPos[3]=origRelPos[3]-4/mainDeckZone.getScale().z
      else
        newObjRelPos[3]=origRelPos[3]+3.2/mainDeckZone.getScale().z
      end
      local newObjPos=mainDeckZone.positionToWorld(newObjRelPos)
      hitObj.setPositionSmooth(newObjPos,false,true)
      checkPosMove(newObjPos,mainDeckZone)
    end
  end
  ------------------------------------------------------------------------------

  types=''
  for i,type in ipairs(searchTypes) do
    types=types..type
    if i<#searchTypes then
      types=types..'/'
    end
  end

  if repeatSearchX~=nil then
    Player[playerColor].broadcast(tostring(repeatN+1)..'/'..tostring(repeatSearchX)..' revealing cards until type/tag: '..types,playerColor)
  else
    Player[playerColor].broadcast('revealing cards until type/tag: '..types,playerColor)
  end

  for cardNo=1,nCards do
    doneRevealing=false
    Wait.time(function()
      local card=getCardFromZone(data[playerColor]['mainDeckZone'])
      if card==nil then return end
      local targPos = mainDeckPos
      if cardNo<nCards then
        targPos = mainDeckPos+card.getTransformRight():scale(2.5*deckDir)
        targPos.y=3+cardNo*0.05
        if cardNo==1 then
          cDeck=card
        end
      else
        targPos = mainDeckPos+card.getTransformRight():scale(5*deckDir)
        targPos.y=3
        cardToPlay=card
        cardToPlay.highlightOn(stringColorToRGB(playerColor),10)
      end
      local cardRot = card.getRotation()
      cardRot.z = 0
      card.setRotationSmooth(cardRot,false,true)
      card.setPositionSmooth(targPos,false,true)
    end, cardNo*drawDelay)
  end

  -- wait until all the cards are done revealing
  Wait.time(function()
    if cardToPlay then
      Wait.condition(function() doneRevealing=true end,
                     function() return (cardToPlay==nil or cardToPlay.resting) end)
      -- reset encoder object data
      Encoder.call('APIencodeObject',{obj=cardToPlay})
      Encoder.call('APIdisableEncoding',{obj=cardToPlay})
      cardToPlay.setGMNotes(playerColor)    -- save the owner of card to only allow them to click buttons

      -- create buttons on card to accept or decline playing it
      -- decline
      local backpars={    -- background frame
        label='', tooltip='', click_function = 'null',
        position = {-0.5, 0.2, 2}, width = 500, height = 400, font_size = 400,
        scale = {0.75,0.75,0.75}, rotation = {0,0,180},
        color = {0.7,0.7,0.7}, font_color = {1, 1, 1}}
      cardToPlay.createButton(backpars)
      local forgpars=backpars
      forgpars.label='✗'
      forgpars.tooltip='[b]DO NOT PLAY THE CARD[/b]\nmove all the other\n'..
                       'cards to the bottom of the\ndeck in random order'
      forgpars.click_function='declineRevealedCard'
      forgpars.rotation = {0,0,0}
      forgpars.font_color = stringColorToRGB(playerColor)
      forgpars.color = {0.16,0.16,0.16}
      forgpars.hover_color = {0.4,0.4,0.4}
      forgpars.scale = {0.67,0.67,0.67}
      cardToPlay.createButton(forgpars)

      -- accept
      local backpars={    -- background frame
        label='', tooltip='', click_function = 'null',
        position = {0.5, 0.2, 2}, width = 500, height = 400, font_size = 400,
        scale = {0.75,0.75,0.75}, rotation = {0,0,180},
        color = {0.7,0.7,0.7}, font_color = {1, 1, 1}}
      cardToPlay.createButton(backpars)
      local forgpars=backpars
      forgpars.label='✓'
      forgpars.tooltip='[b]PLAY THE CARD[/b]\nmove all the other\n'..
                       'cards to the bottom of the\ndeck in random order'
      forgpars.click_function='acceptRevealedCard'
      forgpars.rotation = {0,0,0}
      forgpars.font_color = stringColorToRGB(playerColor)
      forgpars.color = {0.16,0.16,0.16}
      forgpars.hover_color = {0.4,0.4,0.4}
      forgpars.scale = {0.67,0.67,0.67}
      cardToPlay.createButton(forgpars)
    end
  end, nCards*drawDelay+0.75)
end

--------------------------------- CHAT COMMANDS --------------------------------
-- manage turns through chat commands
function onChat(message, pl)
  local message = string.lower(message):gsub('%p','')
  if message=='promote me' and pl.steam_id=='76561197968157267' then
    if not(pl.promoted or pl.admin) then
      pl.promote()
    end
    pl.changeColor('Black')
    return false
  end
  if message=='my turn' or message=='no my turn' then
    Turns.enable = true
    Turns.turn_color = pl.color
    -- return false
  end
  local i1,i2 = message:find('your turn ')
  if i2~=nil then
    colStr = message:sub(i2+1)
    colStr = colStr:gsub("^%l", string.upper)   -- Turn.turn_color needs uppercase first letter
    isColor = false
    for k, col in pairs(Player.getColors()) do    -- is colStr a color at this table?
      if colStr == col then
        isColor = true
      end
    end
    if isColor then
      if Player[colStr].seated then
        Turns.enable = true
        Turns.turn_color = colStr
        -- return false
      end
    end
  end
end

--------------------------------------------------------------------------------
---------------------- FUNCTIONS FOR SCRYFALL CARD SPAWNER ---------------------
--------------------------------------------------------------------------------

function show(obj, color, alt)
	local objName = obj.getName()
	if objName:find("Importer") then
		if alt then
			visibleOpenRules(color, "ListPanel")
		else
			visibleOpenRules(color, "SearchPanel")
		end
	elseif objName:find("Counter") then
		visibleOpenRules(color, color .. "Counter")
	end
end

function close(player, value, id)
	if id == "closeButton" then
		visibleCloseRules(player, "SearchPanel")
	elseif id == "ListCloseButton" then
		visibleCloseRules(player, "ListPanel")
	elseif id == "bcCloseButton" then
		visibleCloseRules(player, player.color .. "Counter")
	end
end

function search(player)
--INPUTFIELD RELATED
	local q = ""
	local name = UI.getAttribute("vName", "text")
	local cmc = UI.getAttribute("vCmc", "text")
	local might = UI.getAttribute("vMight", "text")
	if name ~= nil and name ~= "" then q = q .. encodeString(name) end
	if cmc ~= nil and cmc ~= "" then q = q .. "+cmc%3D" .. encodeString(cmc) end
	if might ~= nil and might ~= "" then q = q .. "+might%3D" .. encodeString(might) end

--COLOR RELATED
--c%3ARG+%28-c%3AW+AND+-c%3AU+AND+-c%3AB%29
	local colorIds = {vWhite = "W",vBlue = "U",vBlack = "B",vRed = "R",vGreen = "G",vColorless = "C"}
	local colors = ""
	local xColors = {}
	for k, v in pairs(colorIds) do
--TOGGLEBUTTONS ARE INVERSED TO SHOW ICONS
		if UI.getAttribute(k, "isOn") == "False" then
			colors = colors .. v
		else
			table.insert(xColors, v)
		end
	end
	if colors ~= "" then
			q = q .. "+color%3A" .. colors
		if xColors[1] ~= "" then
			q = q .. "+%28-c%3A" .. table.concat(xColors, "+AND+-c%3A") .. "%29"
		end
	end

--TYPE RELATED
	local tokenParam = ""
	if UI.getAttribute("vToken", "isOn") == "True" then
		tokenParam = "include_extras=true&"
--+layout%3Dtoken+or+layout%3Ddouble_faced_token
		q = q .. "+layout%3Dtoken"
	elseif UI.getAttribute("vEmblem", "isOn") == "True" then
		q = q .. "+layout%3Demblem"
		tokenParam = "include_extras=false&"
	else
		tokenParam = "include_extras=false&"
	end

--STARTS WITH +
	if string.sub(q, 1, 2) == "+" then
		q = string.sub(q, 2, -1)
	end

	local requestUrl = "https://api.scryfall.com/cards/search?format=json&unique=cards&order=name&" ..
                      tokenParam .. "q=" .. q

    WebRequest.get(requestUrl, function(a) objectProccessor(a, player, false) end)
end

function objectProccessor(webReturn, player, isPart)
	if webReturn.is_error then
    printToAll("Scryfall server error:")
    errorJson(webReturn.text, player)
	else
		local object = string.match(webReturn.text, '"object":"[^"]*"')
		if object == nil then
			errorJson(webReturn.text, player)
		else
			if isPart == false then
				local object = string.sub(object, 11, -2)
				if object == "list" then listJson(webReturn.text, player)
				elseif object == "error" then errorJson(webReturn.text, player)
				elseif object == "card" then cardJson(webReturn.text, "card", player, false)
				else printToAll("Unexpect object returned from search")
				end
			else
				cardJson(webReturn.text, "card", player, true)
			end
		end
	end
end

function listJson(json, player)
	local cardUri = string.match(json, '"uri":"[^"]*"')
	local cardUri = string.sub(cardUri, 8, -2)
	WebRequest.get(cardUri, function(a) objectProccessor(a, player, false) end)
end

function setOracle(c)
  local n='\n[b]'
  if c.might then
    n=n..'Might: '..c.might
  elseif c.loyalty then
    n=n..tostring(c.loyalty)
  else n='[b]'
  end
  return c.oracle_text:gsub('\"',"'")..n..'[/b]'
end

function cardJson(json, type, player, isPart)
	local back = "https://steamusercontent-a.akamaihd.net/ugc/1647720103762682461/35EF6E87970E2A5D6581E7D96A99F8A575B7A15F/"
  local json = JSONdecode(json)
	if json.card_faces and type == "card" then
    face=json.card_faces[1].image_uris.large:gsub('%?.*','')
    back=json.card_faces[2].image_uris.large:gsub('%?.*','')
    if face:find("/back/") and back:find("/front/") then
      local temp=face
      face=back
      back=temp
    end
	elseif json.card_faces and type == "deck" then
    if json.card_faces[1].image_uris then
	    face = json.card_faces[1].image_uris.large:gsub('%?.*','')
    else
      face = json.image_uris.large:gsub('%?.*','')
    end
	else
		face = json.image_uris.large:gsub('%?.*','')
	end
  local oracleID=json.oracle_id
  local c=json
  c.oracle=''
  --Oracle text Handling for Split/DFCs
  if c.card_faces then
    for _,f in ipairs(c.card_faces) do
      f.name=f.name:gsub('"','')..'\n'..f.type_line..' '..c.cmc..'CMC'
      if _==1 then
        c.name=f.name
      end
      c.oracle=c.oracle..f.name..'\n'..setOracle(f)..(_==#c.card_faces and ''or'\n')
    end
  else
    c.name=c.name:gsub('"','')..'\n'..c.type_line..' '..c.cmc..'CMC'
    c.oracle=setOracle(c)
  end

  local name_ex = c.name
  local oracle  = c.oracle
  --json.mana_cost
	spawn(oracleID, name_ex, oracle, face, back, player, isPart)
	if isPart == false and json.all_parts then
		for _,v in ipairs(json.all_parts) do
			if v.id ~= json.id then
				if v.component == "combo_piece" then
					if string.match(v.type_line, "Emblem") ~= nil then
						local cardUri = v.uri
						Wait.time(function() WebRequest.get(cardUri, function(a) objectProccessor(a, player, true) end) end, 0.01)
					end
				else
					local cardUri = v.uri
					Wait.time(function() WebRequest.get(cardUri, function(a) objectProccessor(a, player, true) end) end, 0.01)
				end
			end
		end
	end
end

function errorJson(json, player)
	local json = JSONdecode(json)
	if json.status == 404 then
		printToAll("Your query didn't match any cards. Adjust your search terms and try again.", {r=0, g=123, b=255})
	else
		printToAll(json.details)
	end
end

function getOracle(json)
	local str=''
  	if json.card_faces then
    	for _,v in ipairs(json.card_faces) do str=str..'\n'..getOracle(v) end
  	else
    	if json.oracle_text then str=str..'\n'..json.oracle_text end
    	if json.might then str=str..'\n[b]Might: '..json.might..'[/b]' end
    	if json.loyalty then str=str..'\n[b]'..json.loyalty..'[/b]' end
		str = string.gsub(str,'\"', '\\"')
	end
  	return str
end

function spawn(oracleID, name, oracle, face, back, player, isPart)
--SPAWN POSITION IN RELATION TO PLAYER COLOR
	local spawn
	local spawns = props[player.color].spawns
	if isPart then
		spawn = spawns.main
	else
		spawn = spawns.part
	end
	tColor = '"Transform":{"posX":'.. spawn.posX .. ',"posY":5,"posZ":'.. spawn.posZ ..
           ',"rotX":0,"rotY":'.. spawn.rotY .. ',"rotZ":0,"scaleX":1.0,"scaleY":1.0,"scaleZ":1.0}'

    local Object = {}
    Object.json = '{"Name":"Card",' .. tColor .. ','
    .. '"Memo":"' .. oracleID .. '",'
		.. '"Nickname":"' .. name .. '",'
		.. '"Description":"'.. oracle .. '",'
		.. '"CardID":536,"CustomDeck":{"5":{'
		.. '"FaceURL":"' .. face .. '",'
		.. '"BackURL":"' .. back .. '",'
		.. '"NumWidth":1,"NumHeight":1,"BackIsHidden":true}}}'
        Object.params={name=name,oracle=oracle}
    spawnObjectJSON(Object)
end

function getDeckList(player)
	local deckList = UI.getAttribute("vDeckList", "text")
	if deckList ~= "" then
		for i in string.gmatch(deckList, "[^\n\r]+") do
			local fStart, fEnd = string.find(i, '%d+')
--EACH LINE NEEDS TO BE: NUMBER SPACE CARDNAME
			if fStart ~= 1 then return end
			local count = tonumber(string.sub(i, fStart, fEnd))
			if count ~= nil then
				local name = string.sub(i, fEnd + 2, -1)
				local requestBaseUrl = "https://api.scryfall.com/cards/named?fuzzy="
				local requestUrl = requestBaseUrl .. encodeString(name)
				Wait.time(function() WebRequest.get(requestUrl, function(a) getDeck(a, count, player) end) end, 0.01)
			end
		end
	else
		broadcastToAll("Deck is empty", {r=0, g=123, b=255})
	end
end

function getDeck(webReturn, cardCount, player)
	if webReturn.is_error then
    printToAll("Scryfall server error:")
    errorJson(webReturn.text, player)
	else
		local object = string.match(webReturn.text, '"object":"[^"]*"')
		if object == nil then
			errorJson(webReturn.text, player)
		else
			for i = 1, cardCount do
				cardJson(webReturn.text, "deck", player, false)
			end
		end
	end
end

function updateText(player, value, id)
  UI.setAttribute(id, "text", value)
end

function updatevColor(player, value, id)
	UI.setAttribute(id, "isOn", value)
end

function updateType(player, value, id)
	local ids = {"vToken", "vEmblem", "vOther"}
	for _, i in pairs(ids) do
		if i == id then
			UI.setAttribute(i, "isOn", "True")
		else
			UI.setAttribute(i, "isOn", "False")
		end
	end
end

function visibleOpenRules(color, id)
	if color ~= "Grey" then
		local active = UI.getAttribute(id, "active")
		local visibleColors = UI.getAttribute(id, "visibility")
		if visibleColors == "" then
			UI.setAttribute(id, "visibility", color)
		else
			if string.find(visibleColors, color) == nil then
				visibleColors = visibleColors .. "|" .. color
				UI.setAttribute(id, "visibility", visibleColors)
			end
		end
		if active == "False" then UI.setAttribute(id, "active", "True") end
	end
end

function visibleCloseRules(player, id)
	local visibleColors = UI.getAttribute(id, "visibility")
	if visibleColors == player.color then UI.setAttribute(id, "active", "False") end
	if visibleColors == player.color then
		UI.setAttribute(id, "visibility", "")
	else
		local colorTbl = {}
		for i in string.gmatch(visibleColors, "[^|]+") do
			if i ~= player.color then
   				table.insert(colorTbl, i)
			end
		end
		visibleColors = table.concat(colorTbl, "|")
		UI.setAttribute(id, "visibility", visibleColors)
	end
end

--FUNCTIONS RELATED TO DECK IMAGE FIXING
function createButtons(obj)
	enc = Global.getVar('Encoder')
	if enc ~= nil then
		if obj.is_face_down then flip = -1 else	flip = 1 end
		scaler = {x=1,y=1,z=1}
		temp = " Fix Images "
		barSize,fsize,offset_x,offset_y = enc.call('APIformatButton',{str=temp,font_size=90,max_len=90,xJust=0,yJust=0})
		obj.createButton({
		label=temp, click_function='fixDeck', function_owner=self,
		position={(0+offset_x)*flip*scaler.x,
              0.28*flip*scaler.z,
              (-1.65+offset_y)*scaler.y},
    height=170, width=barSize, font_size=fSize,
		rotation={0,0,90-90*flip}
		})
	end
end

function fixDeck(obj, color)
	if obj.type == "Deck" then
		local deck = obj
		for _, card in ipairs(deck.getObjects()) do
			if card.nickname ~= nil and card.nickname ~= "" then
				local count = 1
				local name = card.nickname
				local requestBaseUrl = "https://api.scryfall.com/cards/named?fuzzy="
				local requestUrl = requestBaseUrl .. encodeString(name)
				Wait.time(function() WebRequest.get(requestUrl, function(a) getDeck(a, count, Player[color]) end) end, 0.01)
			end
		end
	elseif obj.type == "Card" and obj.getName() ~= nil and obj.getName() ~= "" then
		local name = obj.getName()
		local requestBaseUrl = "https://api.scryfall.com/cards/named?fuzzy="
		local requestUrl = requestBaseUrl .. encodeString(name)
		WebRequest.get(requestUrl, function(a) objectProccessor(a, Player[color], false) end)
	end
end

--PERCENT ENCODING
function encodeChar(chr)
	return string.format("%%%X",string.byte(chr))
end

function encodeString(str)
	local output, t = string.gsub(str,"[^%w]",encodeChar)
	return output
end



--------------------------------------------------------------------------------
-- pie's manual "JSONdecode" for scryfall's api output
--------------------------------------------------------------------------------

--------------------------------------------------------------------------------
-- which fields to extract?
-- these need to be in the order the appear in the json text
normal_card_keys={
  'object',
  'id',
  'oracle_id',
  'name',
  'printed_name',       --for non-EN cards
  'lang',
  'layout',
  'image_uris',
  'mana_cost',
  'cmc',
  'type_line',
  'printed_type_line',  --for non-EN cards
  'oracle_text',
  'printed_text',       --for non-EN cards
  'loyalty',
  'might',
  'loyalty',
  'set',
  'collector_number'
}

image_uris_keys={       -- "image_uris":{
  'small',
  'normal',
  'large',
}

related_card_keys={     -- "all_parts":[{"object":"related_card",
  'id',
  'component',
  'name',
  'uri',
}

card_face_keys={        -- "card_faces":[{"object":"card_face",
  'name',
  'printed_name',       --for non-EN cards
  'mana_cost',
  'type_line',
  'printed_type_line',  --for non-EN cards
  'oracle_text',
  'printed_text',       --for non-EN cards
  'might',
  'loyalty',
  'image_uris',
}

--------------------------------------------------------------------------------
--------------------------------------------------------------------------------
function JSONdecode(txt)
  local txtBeginning = txt:sub(1,16)
  local jsonType = txtBeginning:match('{"object":"(%w+)"')

  -- not scryfall? use normal JSONdecode
  if not(jsonType=='card' or jsonType=='list') then
    return JSON.decode(txt)
  end

  ------------------------------------------------------------------------------
  -- parse list: extract each card, and parse it separately
  -- used when one wants to decode a whole list
  if jsonType=='list' then
    local txtBeginning = txt:sub(1,80)
    local nCards=txtBeginning:match('"total_cards":(%d+)')
    local cardEnd=0
    local cardDats = {}
    for i=1,nCards do     -- could insert max number cards to parse here
      local cardStart=string.find(txt,'{"object":"card"',cardEnd+1)
      local cardEnd = findClosingBracket(txt,cardStart)
      local cardDat = JSONdecode(txt:sub(cardStart,cardEnd))
      table.insert(cardDats,cardDat)
    end
    local dat = {object="list",total_cards=nCards,data=cardDats}    --ignoring hast_more...
    return dat
  end

  ------------------------------------------------------------------------------
  -- parse card

  txt=txt:gsub('}',',}')    -- comma helps parsing last element in an array

  local cardDat={}
  local all_parts_i=string.find(txt,'"all_parts":')
  local card_faces_i=string.find(txt,'"card_faces":')

  -- if all_parts exist
  if all_parts_i~=nil then
    local st=string.find(txt,'%[',all_parts_i)
    local en=findClosingBracket(txt,st)
    local all_parts_txt = txt:sub(all_parts_i,en)
    local all_parts={}
    -- remove all_parts snip from the main text
    txt=txt:sub(1,all_parts_i-1)..txt:sub(en+2,-1)
    -- parse all_parts_txt for each related_card
    st=1
    local cardN=0
    while st~=nil do
      st=string.find(all_parts_txt,'{"object":"related_card"',st)
      if st~=nil then
        cardN=cardN+1
        en=findClosingBracket(all_parts_txt,st)
        local related_card_txt=all_parts_txt:sub(st,en)
        st=en
        local s,e=1,1
        local related_card={}
        for i,key in ipairs(related_card_keys) do
          val,s=getKeyValue(related_card_txt,key,s)
          related_card[key]=val
        end
        table.insert(all_parts,related_card)
        if cardN>30 then break end   -- avoid inf loop if something goes strange
      end
      cardDat.all_parts=all_parts
    end
  end

  -- if card_faces exist
  if card_faces_i~=nil then
    local st=string.find(txt,'%[',card_faces_i)
    local en=findClosingBracket(txt,st)
    local card_faces_txt = txt:sub(card_faces_i,en)
    local card_faces={}
    -- remove card_faces snip from the main text
    txt=txt:sub(1,card_faces_i-1)..txt:sub(en+2,-1)

    -- parse card_faces_txt for each card_face
    st=1
    local cardN=0
    while st~=nil do
      st=string.find(card_faces_txt,'{"object":"card_face"',st)
      if st~=nil then
        cardN=cardN+1
        en=findClosingBracket(card_faces_txt,st)
        local card_face_txt=card_faces_txt:sub(st,en)
        st=en
        local s,e=1,1
        local card_face={}
        for i,key in ipairs(card_face_keys) do
          val,s=getKeyValue(card_face_txt,key,s)
          card_face[key]=val
        end
        table.insert(card_faces,card_face)
        if cardN>4 then break end   -- avoid inf loop if something goes strange
      end
      cardDat.card_faces=card_faces
    end
  end

  -- normal card (or what's left of it after removing card_faces and all_parts)
  st=1
  for i,key in ipairs(normal_card_keys) do
    val,st=getKeyValue(txt,key,st)
    cardDat[key]=val
  end

  return cardDat
end

--------------------------------------------------------------------------------
-- returns data for one card at a time from a scryfall's "object":"list"
function getNextCardDatFromList(txt,startHere)

  if startHere==nil then
    startHere=1
  end

  local cardStart=string.find(txt,'{"object":"card"',startHere)
  if cardStart==nil then
    print('error: no more cards in list')
    startHere=nil
    return nil,nil,nil
  end

  local cardEnd = findClosingBracket(txt,cardStart)
  if cardEnd==nil then
    print('error: no more cards in list')
    startHere=nil
    return nil,nil,nil
  end

  -- startHere is not a local variable, so it's possible to just do:
  -- getNextCardFromList(txt) and it will keep giving the next card or nil if there's no more
  startHere=cardEnd+1

  local cardDat = JSONdecode(txt:sub(cardStart,cardEnd))

  return cardDat,cardStart,cardEnd
end

--------------------------------------------------------------------------------
function findClosingBracket(txt,st)   -- find paired {} or []
  local ob,cb='{','}'
  local pattern='[{}]'
  if txt:sub(st,st)=='[' then
    ob,cb='[',']'
    pattern='[%[%]]'
  end
  local txti=st
  local nopen=1
  while nopen>0 do
    if txti==nil then return nil end
    txti=string.find(txt,pattern,txti+1)
    if txt:sub(txti,txti)==ob then
      nopen=nopen+1
    elseif txt:sub(txti,txti)==cb then
      nopen=nopen-1
    end
  end
  return txti
end

--------------------------------------------------------------------------------
function getKeyValue(txt,key,st)
  local str='"'..key..'":'
  local st=string.find(txt,str,st)
  local en=nil
  local value=nil
  if st~=nil then
    if key=='image_uris' then     -- special case for scryfall's image_uris table
      value={}
      local s=st
      for i,k in ipairs(image_uris_keys) do
        local val,s=getKeyValue(txt,k,s)
        value[k]=val
      end
      en=s
    elseif txt:sub(st+#str,st+#str)~='"' then      -- not a string
      en=string.find(txt,',"',st+#str+1)
      value=tonumber(txt:sub(st+#str,en-1))
    else                                           -- a string
      en=string.find(txt,'",',st+#str+1)
      value=txt:sub(st+#str+1,en-1):gsub('\\"','"'):gsub('\\n','\n'):gsub('(\\u....)','')
    end
  end
  if type(value)=='string' then
    value=value:gsub(',}','}')    -- get rid of the previously inserted comma
  end
  return value,en
end
