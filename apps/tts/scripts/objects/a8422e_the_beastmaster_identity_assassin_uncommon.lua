json1=[[{
  "GUID": "",
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
  "Nickname": "Beast\nToken Creature — Beast 0CMC",
  "Description": "\n[b]4/4[/b]",
  "GMNotes": "",
  "Memo": "695b14a0-920a-47bd-bd4a-7989862cdd0a",
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
  "CardID": 15700,
  "SidewaysCard": false,
  "CustomDeck": {
    "157": {
      "FaceURL": "https://c1.scryfall.com/file/scryfall-cards/large/front/a/4/a4210312-e617-4e72-bf80-2c8d42b7777d.jpg",
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
  "GUID": "",
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
  "Nickname": "Beast\nToken Creature — Beast 0CMC",
  "Description": "\n[b]4/4[/b]",
  "GMNotes": "",
  "Memo": "695b14a0-920a-47bd-bd4a-7989862cdd0a",
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
  "CardID": 16100,
  "SidewaysCard": false,
  "CustomDeck": {
    "161": {
      "FaceURL": "https://c1.scryfall.com/file/scryfall-cards/large/front/9/2/920f4eca-4e0c-4cbc-9a9b-a5b4b447d49d.jpg",
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
    click_function='getToken',
    function_owner=self,
    label='spawn some beasts',
    position={0,0.28,-0.65},
    scale={0.5,0.5,0.5},
    width=1800,
    height=300,
    font_size=200,
    color={0.1,0.1,0.1,0.75},
    hover_color={0.5,0.1,0.1,0.75},
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

function getToken(obj,ply)
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

  local pos=self.getPosition()+self.getTransformForward():scale(-3.2)+self.getTransformRight():scale(-1.2)
  local rot=self.getRotation()
  spawnObjectJSON({json=json1,position=pos,rotation=rot})

  local pos=self.getPosition()+self.getTransformForward():scale(-3.2)+self.getTransformRight():scale(1.2)
  local rot=self.getRotation()
  spawnObjectJSON({json=json2,position=pos,rotation=rot})

end