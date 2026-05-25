--Riftbound keyword tokens for Encoder (πKeywords)
--Adapted from Keyword Abilities Module by Tipsy Hobbit//STEAM_0:1:13465982
--
-- Adding a counter or status:
--   1. Add an entry to KeywordList (unique rb_* key, name, des, val, def, bg).
--   2. val = 'number' for counters (stackable), 'boolean' for status (on/off).
--   3. Insert the key into CounterOrder or StatusOrder (keep alphabetical by name).
--   4. Optional icon: set url to a Steam Cloud image URL; omit url or set nil for
--      text-only tokens (status name centered; counters show 1 when count is 1).
--   5. bg = {r,g,b} table (0–1) for the token background colour on the card.
--   6. Reload the save so the πKeywords object re-registers with the Encoder.

pID = "πKeywords"
version = 3.14159

CounterOrder = {
  'rb_assault',
  'rb_deflect',
  'rb_hunt',
  'rb_shield',
}

StatusOrder = {
  'rb_backline',
  'rb_ganking',
  'rb_mighty',
  'rb_stun',
  'rb_tank',
  'rb_temporary',
}

KeywordList={
  rb_assault=             {name="Assault", des="", val='number', def=0,
                            bg={0.2,0.2,0.2}},
  rb_deflect=             {name="Deflect", des="", val='number', def=0,
                            bg={0.525,0.518,0.486}},
  rb_hunt=                {name="Hunt", des="", val='number', def=0,
                            bg={0.875,0.435,0.0}},
  rb_shield=              {name="Shield", des="", val='number', def=0,
                            bg={0.875,0.839,0.122}},

  rb_backline=            {name="Backline", des="", val='boolean', def=false,
                            bg={0.19,0.19,0.19}},
  rb_ganking=             {name="Ganking", des="", val='boolean', def=false,
                            bg={0.6,0.6,1.0}},
  rb_mighty=              {name="Mighty", des="", val='boolean', def=false,
                            bg={0.031,0.103,0.031}},
  rb_stun=                {name="Stun", des="", val='boolean', def=false,
                            bg={0.4,0.0,0.8}},
  rb_tank=                {name="Tank", des="", val='boolean', def=false,
                            bg={0.4,0.4,0.6}},
  rb_temporary=           {name="Temporary", des="", val='boolean', def=false,
                            bg={0.314,0.236,0.002}},
}

function keywordHasIcon(dat)
  return dat.url ~= nil and dat.url ~= ''
end

function keywordBg(dat)
  local bg = dat.bg
  if bg == nil then
    bg = {0.1, 0.1, 0.1}
  end
  -- lift very dark chip colours so white/black text both stay readable on-card
  local lum = 0.299 * bg[1] + 0.587 * bg[2] + 0.114 * bg[3]
  if lum < 0.28 then
    local t = (0.32 - lum) / math.max(1 - lum, 0.001)
    bg = {
      bg[1] + t * (1 - bg[1]),
      bg[2] + t * (1 - bg[2]),
      bg[3] + t * (1 - bg[3]),
    }
  end
  return {bg[1], bg[2], bg[3], 1}
end

function channelLuminance(c)
  if c <= 0.03928 then
    return c / 12.92
  end
  return ((c + 0.055) / 1.055) ^ 2.4
end

function relativeLuminance(bg)
  return 0.2126 * channelLuminance(bg[1]) + 0.7152 * channelLuminance(bg[2]) + 0.0722 * channelLuminance(bg[3])
end

function contrastRatio(l1, l2)
  if l1 < l2 then
    l1, l2 = l2, l1
  end
  return (l1 + 0.05) / (l2 + 0.05)
end

function contrastFontColor(bg)
  local lBg = relativeLuminance(bg)
  local crWhite = contrastRatio(1, lBg)
  local crBlack = contrastRatio(lBg, 0)
  if crWhite >= crBlack then
    return {1, 1, 1, 255}
  end
  return {0, 0, 0, 255}
end

function outlineFontColor(fnt)
  -- font_color alpha is 0–255 in TTS button API
  if fnt[1] > 0.5 then
    return {0, 0, 0, 120}
  end
  return {1, 1, 1, 120}
end

function fontColorOpaque(fnt)
  return {fnt[1], fnt[2], fnt[3], 255}
end

local TOKEN_BOX_W = 512
local TOKEN_BOX_H = 512
local TOKEN_SCALE_MUL = 0.45

function tokenMetrics(sm)
  local ts = TOKEN_SCALE_MUL * sm
  local btnScale = {TOKEN_SCALE_MUL * sm, TOKEN_SCALE_MUL * sm, TOKEN_SCALE_MUL * sm}
  return TOKEN_BOX_W, TOKEN_BOX_H, ts, btnScale
end

-- font_size tuned to fit label within a slice of the scaled button box
function fitFontSize(label, boxW, boxH, tokenScale, heightFrac, widthFrac)
  label = label or ''
  heightFrac = heightFrac or 0.35
  widthFrac = widthFrac or 0.92
  local chars = math.max(string.len(label), 1)
  local effW = boxW * tokenScale * widthFrac
  local effH = boxH * tokenScale * heightFrac
  local byHeight = effH * 2.1
  local byWidth = (effW / chars) * 2.6
  return math.max(80, math.floor(math.min(byHeight, byWidth, 420)))
end

function counterCountLabel(val)
  if val == 1 then
    return '1'
  end
  return tostring(val)
end

function createNameBelowToken(t, dat, posB, rotB, btnScale, boxW, boxH, tokenScale, fnt, iconStyle, sm)
  local nameFs = fitFontSize(dat.name, boxW, boxH, tokenScale, 0.22, 0.95)
  local namePos = {posB[1], posB[2], posB[3] + 0.18 * sm}
  local nameColor = iconStyle and {1, 1, 1, 255} or fontColorOpaque(fnt)
  local shadowColor = iconStyle and {0, 0, 0, 120} or outlineFontColor(fnt)
  local nameW = math.floor(boxW * 0.9)
  local nameH = math.floor(boxH * 0.22)
  t.obj.createButton({
    click_function='null', function_owner=self, label=dat.name,
    position={namePos[1] - 0.005 * sm, namePos[2], namePos[3] + 0.005 * sm},
    rotation=rotB, scale=btnScale, width=nameW, height=nameH, font_size=nameFs,
    color={0, 0, 0, 0}, font_color=shadowColor, hover_color={0, 0, 0, 0},
  })
  t.obj.createButton({
    click_function='null', function_owner=self, label=dat.name,
    position=namePos, rotation=rotB, scale=btnScale, width=nameW, height=nameH, font_size=nameFs,
    color={0, 0, 0, 0}, font_color=nameColor, hover_color={0, 0, 0, 0},
  })
end

function onload()
  self.interactable=true
  self.createButton({
    click_function='registerModule', function_owner=self, label='[i]'..pID..'[/i]', tooltip='register '..pID,
    position={0,0.1,0}, rotation={0,0,0}, scale={0.5,1,0.5},
    height=250, width=900, font_size=150,  color={0.1,0.1,0.1,1}, font_color={1,1,1,1},
  })
  Wait.condition(registerModule,function() return Global.getVar('Encoder') ~= nil and true or false end)
end

function registerModule(obj,ply)
  enc = Global.getVar('Encoder')
  if enc ~= nil then

    value = {valueID='activeIcons',validType='nil',desc='',default={}}
    enc.call("APIregisterValue",value)
    value = {valueID='iconMenuOn',validType='boolean',desc='',default=false}
    enc.call("APIregisterValue",value)
    value = {valueID='iconLayout',validType='string',desc='',default='art'}
    enc.call("APIregisterValue",value)

    for k,v in pairs(KeywordList) do
      value = {
        valueID = k,
        validType = v.val,
        desc = '',
        default = v.def,
      }
      enc.call("APIregisterValue",value)
      _G['toggleStatus'..k] = function(obj,ply,alt) toggleStatus(obj,ply,alt,k) end
    end

    values={'activeIcons','iconMenuOn','iconLayout'}
    for _,k in ipairs(CounterOrder) do table.insert(values,k) end
    for _,k in ipairs(StatusOrder) do table.insert(values,k) end
    properties = {
      propID = pID,
      name = "Keywords",
      values = values,
      funcOwner = self,
      tags="basic,counter",
      activateFunc = 'toggleKeywordsMenu',
      visible_in_hand=1
    }
    enc.call("APIregisterProperty",properties)
  end
end

function toggleKeywordsMenu(obj,ply)
  enc = Global.getVar('Encoder')
  if enc ~= nil then
    enc.call("APItoggleProperty",{obj=obj,propID=pID})
    if enc.call("APIobjIsPropEnabled",{obj=obj,propID=pID}) then
      iconMenuOn = true
      enc.call("APIobjSetValueData",{obj=obj,valueID='iconMenuOn',data={iconMenuOn=iconMenuOn}})
      checkConflictingMenus(obj)
    else
      resetDecals(obj)
      local data   = enc.call("APIobjGetPropData",{obj=obj,propID=pID})
      for key,dat in pairs(KeywordList) do
        if KeywordList[key].val=='number' then
          data[key]=0
        elseif KeywordList[key].val=='boolean' then
          data[key]=false
        end
      end
      data['iconMenuOn'] = false
      enc.call("APIobjSetPropData",{obj=obj,propID=pID,data=data})
    end
    enc.call("APIrebuildButtons",{obj=obj})
  end
end

function checkConflictingMenus(obj)
    enc = Global.getVar('Encoder')
    if enc ~= nil then
        keywordsData = enc.call("APIobjGetPropData",{obj=obj,propID="MorphinTime"})
        if keywordsData ~= nil then
            if keywordsData['subMenuOpen'] then
                keywordsData['subMenuOpen'] = false
                enc.call("APIobjSetPropData",{obj=obj,propID="MorphinTime",data=keywordsData})
            end
        end
    end
end

function toggleIconMenu(obj,ply)
  enc = Global.getVar('Encoder')
  local ico = enc.call("APIobjGetValueData",{obj=obj,valueID='iconMenuOn'})
  local iconMenuOn = ico['iconMenuOn']
  iconMenuOn = not iconMenuOn

  if iconMenuOn then
    checkConflictingMenus(obj)
  end

  enc.call("APIobjSetValueData",{obj=obj,valueID='iconMenuOn',data={iconMenuOn=iconMenuOn}})
  enc.call("APIrebuildButtons",{obj=obj})
end

function toggleStatus(obj,ply,alt,key)
  enc = Global.getVar('Encoder')
  if enc ~= nil then
    local data   = enc.call("APIobjGetPropData",{obj=obj,propID=pID})
    local activeIcons = data['activeIcons']

    if KeywordList[key].val == 'boolean' then
      if alt ~= true then
        if data[key] ~= true then
          data[key] = true
          table.insert(activeIcons,key)
          updateDecals=true
        end
      else
        if data[key] ~= false then
          data[key] = false
          activeIcons = rmFromTable(activeIcons,key)
          updateDecals=true
      end
    end

    elseif KeywordList[key].val == 'color' then
      if data[key] ~= '' then
        data[key] = ''
      else
        data[key] = KeywordList[key].func ~= nil and KeywordList[key].func() or ply
      end

    elseif KeywordList[key].val == 'number' then
      if alt ~= true then
        if data[key]==0 then
          table.insert(activeIcons,key)
          updateDecals=true
        end
        data[key] = data[key]+1
      else
        if data[key]==1 then
          activeIcons = rmFromTable(activeIcons,key)
          updateDecals=true
        end
        data[key] = data[key]-1
        if data[key]<0 then data[key]=0 end
      end
    end

    data['activeIcons'] = activeIcons
    enc.call("APIobjSetPropData",{obj=obj,propID=pID,data=data})
    enc.call("APIrebuildButtons",{obj=obj})
  end
end

function rmFromTable(oldList,key)
  local newList={}
  for i,k in pairs(oldList) do
    if k~=key then
      table.insert(newList,k)
    end
  end
  return newList
end

function toggleLayout(obj,ply)
  local lay = enc.call("APIobjGetValueData",{obj=obj,valueID='iconLayout'})
  iconLayout = lay['iconLayout']
  if iconLayout=='above' then
    iconLayout='art'
  else
    iconLayout='above'
  end
  updateDecals=true
  enc.call("APIobjSetValueData",{obj=obj,valueID='iconLayout',data={iconLayout=iconLayout}})
  enc.call("APIrebuildButtons",{obj=obj})
end

function resetDecals(obj)
  local decals = obj.getDecals()
  local ndecals = {}
  if decals~=nil then
    for i,d in pairs(decals) do
      if not isKeyword(d.name) then
        table.insert(ndecals,d)
      end
    end
    obj.setDecals(ndecals)
  end
end

function isKeyword(str)
  for key, dat in pairs(KeywordList) do
    if dat.name == str then
      return true
    end
  end
  return false
end

function updateActiveIcons(data,obj)
  local activeIcons = data['activeIcons']
  local prevActiveIcons = activeIcons
  for i,key in pairs(activeIcons) do
    if data[key]==0 or data[key]==false then
      activeIcons = rmFromTable(activeIcons,key)
    end
  end
  data['activeIcons'] = activeIcons
  enc.call("APIobjSetValueData",{obj=obj,valueID='activeIcons',data={activeIcons=activeIcons}})

  if table.concat(activeIcons)~=table.concat(prevActiveIcons) then
    updateDecals=true
  end

  return activeIcons
end

function createKeywordTokenButtons(t, key, val, posB, posD, rotB, rotD, sm, flip)
  local dat = KeywordList[key]
  local bg = keywordBg(dat)
  local fnt = contrastFontColor(bg)
  local hasIcon = keywordHasIcon(dat)
  local boxW, boxH, tokenScale, btnScale = tokenMetrics(sm)
  local ttip = '[b]'..dat.name..'[/b]'
  if dat.val == 'number' and val ~= 0 then
    ttip = val..' '..ttip
  end
  if dat.des ~= '' then
    ttip = ttip..': '..dat.des
  end

  if dat.val == 'number' then
    local countLab = counterCountLabel(val)
    local countFs = fitFontSize(countLab, boxW, boxH, tokenScale, 0.38, 0.65)

    if hasIcon then
      if updateDecals then
        t.obj.addDecal({
          name=dat.name,
          url=dat.url,
          position=posD,
          rotation=rotD,
          scale=btnScale,
        })
      end
      t.obj.createButton({
        click_function='toggleStatus'..key, function_owner=self, label='[b]'..countLab..'[/b]', tooltip=ttip,
        position=posB, rotation=rotB, scale=btnScale, width=boxW, height=boxH, font_size=countFs,
        color={0.1, 0.1, 0.1, 0.85}, font_color={1, 1, 1, 1}, hover_color={0.1, 0.1, 0.1, 0.85},
      })
      createNameBelowToken(t, dat, posB, rotB, btnScale, boxW, boxH, tokenScale, fnt, true, sm)
    else
      t.obj.createButton({
        click_function='toggleStatus'..key, function_owner=self, label='[b]'..countLab..'[/b]', tooltip=ttip,
        position=posB, rotation=rotB, scale=btnScale, width=boxW, height=boxH, font_size=countFs,
        color=bg, font_color=fnt, hover_color={bg[1]*0.85, bg[2]*0.85, bg[3]*0.85, 1},
      })
      createNameBelowToken(t, dat, posB, rotB, btnScale, boxW, boxH, tokenScale, fnt, false, sm)
    end

  elseif dat.val == 'boolean' then
    local nameFs = fitFontSize(dat.name, boxW, boxH, tokenScale, 0.42, 0.9)

    if hasIcon then
      if updateDecals then
        t.obj.addDecal({
          name=dat.name,
          url=dat.url,
          position=posD,
          rotation=rotD,
          scale=btnScale,
        })
      end
      t.obj.createButton({
        click_function='toggleStatus'..key, function_owner=self, label='', tooltip=ttip,
        position=posB, rotation=rotB, scale=btnScale, width=boxW, height=boxH, font_size=1,
        color={0, 0, 0, 0}, font_color={1, 1, 1, 100}, hover_color={0, 0, 0, 0},
      })
    else
      t.obj.createButton({
        click_function='toggleStatus'..key, function_owner=self, label=dat.name, tooltip=ttip,
        position=posB, rotation=rotB, scale=btnScale, width=boxW, height=boxH, font_size=nameFs,
        color=bg, font_color=fnt, hover_color={bg[1]*0.85, bg[2]*0.85, bg[3]*0.85, 1},
      })
    end
  end
end

function createButtons(t)
  enc = Global.getVar('Encoder')
  if enc ~= nil then

    local data = enc.call("APIobjGetPropData",{obj=t.obj,propID=pID})
    local flip = enc.call("APIgetFlip",{obj=t.obj})
    local scaler = {x=1,y=1,z=1}
    local iconMenuOn  = data['iconMenuOn']
    local layout      = data['iconLayout']
    activeIcons = updateActiveIcons(data,t.obj)

    if updateDecals then
      resetDecals(t.obj)
    end

    nIcons = #activeIcons
    for i,key in pairs(activeIcons) do
      iconN=i
      val = data[key]
      if (KeywordList[key].val=='number' and val~=0) or (KeywordList[key].val=='boolean' and val~=false) then
        if layout=='above' then
          nPerRow = 5
          gridY = math.floor((iconN-1)/nPerRow)
          gridX = iconN-nPerRow*gridY-1
          posD = {(-1)*(1-1/nPerRow-gridX*(2/nPerRow))*flip*scaler.x,0.3*flip*scaler.z,(-1.55-1/nPerRow-gridY*2/nPerRow)}
          posB = {     (1-1/nPerRow-gridX*(2/nPerRow))*flip*scaler.x,0.8*flip*scaler.z,(-1.55-1/nPerRow-gridY*2/nPerRow)}
          sm = 4/nPerRow
        else
          if nIcons==1 then
            posD = {(-1)*(0)*flip*scaler.x,0.3*flip*scaler.z,(-0.5)}
            posB = {     (0)*flip*scaler.x,0.8*flip*scaler.z,(-0.5)}
            sm = 1.5
          elseif nIcons==2 then
            gridY = math.floor((iconN-1)/2)
            gridX = iconN-2*gridY-1
            posD = {(-1)*(0.3-gridX*0.6)*flip*scaler.x,0.3*flip*scaler.z,(-0.5+gridY*0.6)}
            posB = {     (0.3-gridX*0.6)*flip*scaler.x,0.8*flip*scaler.z,(-0.5+gridY*0.6)}
            sm = 1.25
          elseif nIcons==3 then
            gridY = math.floor((iconN-1)/3)
            gridX = iconN-3*gridY-1
            posD = {(-1)*(0.6-gridX*0.6)*flip*scaler.x,0.3*flip*scaler.z,(-0.5+gridY*0.6)}
            posB = {     (0.6-gridX*0.6)*flip*scaler.x,0.8*flip*scaler.z,(-0.5+gridY*0.6)}
            sm = 1.25
          elseif nIcons==4 then
            gridY = math.floor((iconN-1)/2)
            gridX = iconN-2*gridY-1
            posD = {(-1)*(0.3-gridX*0.6)*flip*scaler.x,0.3*flip*scaler.z,(-0.8+gridY*0.6)}
            posB = {     (0.3-gridX*0.6)*flip*scaler.x,0.8*flip*scaler.z,(-0.8+gridY*0.6)}
            sm = 1.25
          else
            gridY = math.floor((iconN-1)/3)
            gridX = iconN-3*gridY-1
            posD = {(-1)*(0.6-gridX*0.6)*flip*scaler.x,0.3*flip*scaler.z,(-0.8+gridY*0.6)}
            posB = {     (0.6-gridX*0.6)*flip*scaler.x,0.8*flip*scaler.z,(-0.8+gridY*0.6)}
            sm = 1.25
          end
        end

        rotD = {180-flip*90,90+flip*90,0}
        rotB = {0,0,90-90*flip}
        createKeywordTokenButtons(t, key, val, posB, posD, rotB, rotD, sm, flip)
      end
    end

    updateDecals=false

    if not iconMenuOn then

      t.obj.createButton({
      label="[b]>>>[/b]", click_function='toggleIconMenu', function_owner=self,
      position={0.875*flip*scaler.x,0.28*flip*scaler.z,-1.485*scaler.y}, scale={0.5,1,0.3}, height=0, width=0, font_size=200,
      rotation={0,0,90-90*flip},color={0,0,0,0},font_color={0,0,0,50},
      })
      t.obj.createButton({
      label=">>>", click_function='toggleIconMenu', function_owner=self,
      position={0.875*flip*scaler.x,0.28*flip*scaler.z,-1.485*scaler.y}, scale={0.5,1,0.3}, height=350, width=450, font_size=200,
      rotation={0,0,90-90*flip},color={0,0,0,0},font_color={1,1,1,50},hover_color={0.1,0.1,0.1,1/50},tooltip="Keywords Menu",
      })

    else

      t.obj.createButton({
      label="<<<", click_function='toggleIconMenu', function_owner=self,
      position={0.875*flip*scaler.x,0.28*flip*scaler.z,-1.485*scaler.y}, scale={0.5,1,0.3}, height=350, width=450, font_size=200,
      rotation={0,0,90-90*flip},color={0.1,0.1,0.1,1},font_color={1,1,1,1},tooltip="Keywords Menu",
      })
      t.obj.createButton({
      label='layout:\n'..layout, click_function='toggleLayout', function_owner=self,
      position={2.9*flip*scaler.x,0.28*flip*scaler.z,0*scaler.y}, scale={0.5,0.5,0.5}, height=300, width=600, font_size=100,
      rotation={0,0,90-90*flip},color={0.1,0.1,0.1,0.8},font_color={1,1,1,0.5},tooltip="Change location of icons relative to the card",
      })

      t.obj.createButton({
      label="Counters", click_function='null', function_owner=self, scale={0.5,1,0.5}, height=0, width=0, font_size=180,
      position={1.7*flip,0.28*flip*scaler.z,(-1.6)*scaler.y},
      rotation={0,0,90-90*flip}, tooltip='', color={0,0,0,0}, font_color={1,1,1,100},
      })
      t.obj.createButton({
      label="Status Effects", click_function='null', function_owner=self, scale={0.5,1,0.5}, height=0, width=0, font_size=180,
      position={2.9*flip,0.28*flip*scaler.z,(-1.6)*scaler.y},
      rotation={0,0,90-90*flip}, tooltip='', color={0,0,0,0}, font_color={1,1,1,100},
      })

      local i = 1
      local j = 1
      for _, key in ipairs(CounterOrder) do
        val = data[key]
        if val ~= nil then
          if val ~= 0 then
            t.obj.createButton({
            label= KeywordList[key].name, click_function='toggleStatus'..key, function_owner=self, scale={0.5,1,0.5}, height=200, width=1100, font_size=160,
            position={1.7*flip,0.28*flip*scaler.z,(-1.6+i*0.2)*scaler.y},
            rotation={0,0,90-90*flip}, color={0.1,0.1,0.1,1}, font_color={1,1,0},tooltip='[b]'..tostring(val).."[/b]\nleft click to increase\nright click to decrease"
            })
          else
            t.obj.createButton({
            label= KeywordList[key].name, click_function='toggleStatus'..key, function_owner=self, scale={0.5,1,0.5}, height=200, width=1100, font_size=160,
            position={1.7*flip,0.28*flip*scaler.z,(-1.6+i*0.2)*scaler.y},
            rotation={0,0,90-90*flip}, color={0.1,0.1,0.1,1}, font_color={1,1,1,0.75},tooltip="left click to increase\nright click to decrease"
            })
          end
          i=i+1
        end
      end
      for _, key in ipairs(StatusOrder) do
        val = data[key]
        if val ~= nil then
          if val == true then
            t.obj.createButton({
            label= KeywordList[key].name, click_function='toggleStatus'..key, function_owner=self, scale={0.5,1,0.5}, height=200, width=1100, font_size=160,
            position={2.9*flip,0.28*flip*scaler.z,(-1.6+j*0.2)*scaler.y},
            rotation={0,0,90-90*flip}, color={0.1,0.1,0.1,1}, font_color={1,1,0},tooltip="left click to turn on\nright click to turn off"
            })
          else
            t.obj.createButton({
            label= KeywordList[key].name, click_function='toggleStatus'..key, function_owner=self, scale={0.5,1,0.5}, height=200, width=1100, font_size=160,
            position={2.9*flip,0.28*flip*scaler.z,(-1.6+j*0.2)*scaler.y},
            rotation={0,0,90-90*flip}, color={0.1,0.1,0.1,1}, font_color={1,1,1,0.75},tooltip="left click to turn on\nright click to turn off"
            })
          end
          j=j+1
        end
      end
    end
  end
end

function null() end

function onObjectSpawn(obj)
  enc = Global.getVar('Encoder')
  if enc ~= nil then
    if enc.call("APIobjIsPropEnabled",{obj=obj,propID=pID}) then
      local t = {obj=obj}
      createButtons(t)
    else
      resetDecals(obj)
    end
  end
end
