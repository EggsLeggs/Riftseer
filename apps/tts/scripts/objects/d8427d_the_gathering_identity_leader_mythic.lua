json1=[[{
  "GUID": "347d55",
  "Name": "Card",
  "Transform": {
    "posX": 0,
    "posY": 0,
    "posZ": 0,
    "rotX": 0,
    "rotY": 0,
    "rotZ": 0,
    "scaleX": 1.0,
    "scaleY": 1.0,
    "scaleZ": 1.0
  },
  "Nickname": "Goblin\nToken Creature — Goblin 0CMC",
  "Description": "\n[b]1/1[/b]",
  "GMNotes": "",
  "Memo": "4465eff4-5851-4721-a248-866c686c2ab8",
  "ColorDiffuse": {
    "r": 0.713235259,
    "g": 0.713235259,
    "b": 0.713235259
  },
  "LayoutGroupSortIndex": 0,
  "Value": 0,
  "Locked": false,
  "Grid": true,
  "Snap": true,
  "IgnoreFoW": false,
  "MeasureMovement": false,
  "DragSelectable": true,
  "Autoraise": true,
  "Sticky": true,
  "Tooltip": true,
  "GridProjection": false,
  "HideWhenFaceDown": true,
  "Hands": true,
  "CardID": 3900,
  "SidewaysCard": false,
  "CustomDeck": {
    "39": {
      "FaceURL": "https://c1.scryfall.com/file/scryfall-cards/large/front/e/5/e55d42ad-63b1-4468-8da0-c245db4d0ae3.jpg",
      "BackURL": "https://steamusercontent-a.akamaihd.net/ugc/1646591393626667202/25E9E2A96F478D59E8961BBE161CC0D29908C5A6/",
      "NumWidth": 1,
      "NumHeight": 1,
      "BackIsHidden": true,
      "UniqueBack": false,
      "Type": 0
    }
  },
  "LuaScript": "",
  "LuaScriptState": "",
  "XmlUI": ""
}]]

json2=[[{
  "GUID": "683847",
  "Name": "Card",
  "Transform": {
    "posX": 0,
    "posY": 0,
    "posZ": 0,
    "rotX": 0,
    "rotY": 0,
    "rotZ": 0,
    "scaleX": 1.0,
    "scaleY": 1.0,
    "scaleZ": 1.0
  },
  "Nickname": "Goblin\nToken Creature — Goblin 0CMC",
  "Description": "\n[b]1/1[/b]",
  "GMNotes": "",
  "Memo": "4465eff4-5851-4721-a248-866c686c2ab8",
  "ColorDiffuse": {
    "r": 0.713235259,
    "g": 0.713235259,
    "b": 0.713235259
  },
  "LayoutGroupSortIndex": 0,
  "Value": 0,
  "Locked": false,
  "Grid": true,
  "Snap": true,
  "IgnoreFoW": false,
  "MeasureMovement": false,
  "DragSelectable": true,
  "Autoraise": true,
  "Sticky": true,
  "Tooltip": true,
  "GridProjection": false,
  "HideWhenFaceDown": true,
  "Hands": true,
  "CardID": 5400,
  "SidewaysCard": false,
  "CustomDeck": {
    "54": {
      "FaceURL": "https://c1.scryfall.com/file/scryfall-cards/large/front/6/0/60f874f9-7ac2-4d1a-97e3-722db719cd1c.jpg",
      "BackURL": "https://steamusercontent-a.akamaihd.net/ugc/1646591393626667202/25E9E2A96F478D59E8961BBE161CC0D29908C5A6/",
      "NumWidth": 1,
      "NumHeight": 1,
      "BackIsHidden": true,
      "UniqueBack": false,
      "Type": 0
    }
  },
  "LuaScript": "",
  "LuaScriptState": "",
  "XmlUI": ""
}]]

json3=[[{
  "GUID": "2293e3",
  "Name": "Card",
  "Transform": {
    "posX": 0,
    "posY": 0,
    "posZ": 0,
    "rotX": 0,
    "rotY": 0,
    "rotZ": 0,
    "scaleX": 1.0,
    "scaleY": 1.0,
    "scaleZ": 1.0
  },
  "Nickname": "Goblin\nToken Creature — Goblin 0CMC",
  "Description": "\n[b]1/1[/b]",
  "GMNotes": "",
  "Memo": "4465eff4-5851-4721-a248-866c686c2ab8",
  "ColorDiffuse": {
    "r": 0.713235259,
    "g": 0.713235259,
    "b": 0.713235259
  },
  "LayoutGroupSortIndex": 0,
  "Value": 0,
  "Locked": false,
  "Grid": true,
  "Snap": true,
  "IgnoreFoW": false,
  "MeasureMovement": false,
  "DragSelectable": true,
  "Autoraise": true,
  "Sticky": true,
  "Tooltip": true,
  "GridProjection": false,
  "HideWhenFaceDown": true,
  "Hands": true,
  "CardID": 4200,
  "SidewaysCard": false,
  "CustomDeck": {
    "42": {
      "FaceURL": "https://c1.scryfall.com/file/scryfall-cards/large/front/e/d/ed418a8b-f158-492d-a323-6265b3175292.jpg",
      "BackURL": "https://steamusercontent-a.akamaihd.net/ugc/1646591393626667202/25E9E2A96F478D59E8961BBE161CC0D29908C5A6/",
      "NumWidth": 1,
      "NumHeight": 1,
      "BackIsHidden": true,
      "UniqueBack": false,
      "Type": 0
    }
  },
  "LuaScript": "",
  "LuaScriptState": "",
  "XmlUI": ""
}]]


function onLoad()
  noencode=true

  self.createButton({
    click_function='white',
    function_owner=self,
    position={-0.8,0.28,-0.63},
    scale={0.5,0.5,0.5},
    width=350,
    height=350,
    font_size=200,
    color={1,1,1,0.8},
    font_color={1,1,1},
    tooltip='double click'
  })
  self.createButton({
    click_function='blue',
    function_owner=self,
    position={-0.4,0.28,-0.63},
    scale={0.5,0.5,0.5},
    width=350,
    height=350,
    font_size=200,
    color={0,0,1,0.9},
    font_color={1,1,1},
    tooltip='double click'
  })
  self.createButton({
    click_function='black',
    function_owner=self,
    position={0,0.28,-0.63},
    scale={0.5,0.5,0.5},
    width=350,
    height=350,
    font_size=200,
    color={0.1,0.1,0.1,0.95},
    font_color={1,1,1},
    tooltip='double click'
  })
  self.createButton({
    click_function='red',
    function_owner=self,
    position={0.4,0.28,-0.63},
    scale={0.5,0.5,0.5},
    width=350,
    height=350,
    font_size=200,
    color={1,0,0,0.9},
    font_color={1,1,1},
    tooltip='double click'
  })
  self.createButton({
    click_function='green',
    function_owner=self,
    position={0.8,0.28,-0.63},
    scale={0.5,0.5,0.5},
    width=350,
    height=350,
    font_size=200,
    color={0,0.5,0,0.9},
    font_color={1,1,1},
    tooltip='double click'
  })

  self.createButton({
    click_function='noScript',
    function_owner=self,
    label='×',
    position={0.85,0.28,-1.05},
    scale={0.5,0.5,0.5},
    width=300,
    height=300,
    font_size=200,
    color={0.1,0.1,0.1,0.75},
    hover_color={0.5,0.1,0.1,0.75},
    font_color={1,1,1},
    tooltip='double click'
  })
end

function noScript()
  if prevT==nil then prevT=os.time()-5 end
  nowT=os.time()
  if nowT-prevT>0.3 then
    nClick=1
    prevT=nowT
    return
  else
    if nClick==nil then nClick=0 end
    nClick=nClick+1
  end
  if nClick<2 then return end
  self.clearButtons()
end

function white(obj,ply)
  if prevT==nil then prevT=os.time()-5 end
  nowT=os.time()
  if nowT-prevT>0.3 then
    nClick=1
    prevT=nowT
    return
  else
    if nClick==nil then nClick=0 end
    nClick=nClick+1
  end
  if nClick<2 then return end

  self.editButton({
    index=0,
    width=0,height=0
  })
end

function blue(obj,ply)
  if prevT==nil then prevT=os.time()-5 end
  nowT=os.time()
  if nowT-prevT>0.3 then
    nClick=1
    prevT=nowT
    return
  else
    if nClick==nil then nClick=0 end
    nClick=nClick+1
  end
  if nClick<2 then return end

  self.editButton({
    index=1,
    width=0,height=0
  })
end

function black(obj,ply)
  if prevT==nil then prevT=os.time()-5 end
  nowT=os.time()
  if nowT-prevT>0.3 then
    nClick=1
    prevT=nowT
    return
  else
    if nClick==nil then nClick=0 end
    nClick=nClick+1
  end
  if nClick<2 then return end

  self.editButton({
    index=2,
    width=0,height=0
  })
end

function green(obj,ply)
  if prevT==nil then prevT=os.time()-5 end
  nowT=os.time()
  if nowT-prevT>0.3 then
    nClick=1
    prevT=nowT
    return
  else
    if nClick==nil then nClick=0 end
    nClick=nClick+1
  end
  if nClick<2 then return end
  self.editButton({
    index=4,
    width=0,height=0
  })
end

function red(obj,ply)
  if prevT==nil then prevT=os.time()-5 end
  nowT=os.time()
  if nowT-prevT>0.3 then
    nClick=1
    prevT=nowT
    return
  else
    if nClick==nil then nClick=0 end
    nClick=nClick+1
  end
  if nClick<2 then return end

  self.editButton({
    index=3,
    width=0,height=0
  })

  local pos=self.getPosition()+self.getTransformForward():scale(-3.2)+self.getTransformRight():scale(-2.4)
  local rot=self.getRotation()
  spawnObjectJSON({json=json1,position=pos,rotation=rot})

  local pos=self.getPosition()+self.getTransformForward():scale(-3.2)
  local rot=self.getRotation()
  spawnObjectJSON({json=json2,position=pos,rotation=rot})

  local pos=self.getPosition()+self.getTransformForward():scale(-3.2)+self.getTransformRight():scale(2.4)
  local rot=self.getRotation()
  spawnObjectJSON({json=json3,position=pos,rotation=rot})
end