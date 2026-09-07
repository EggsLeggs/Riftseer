tokenJSON=[[
{
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
  "Nickname": "Treasure\nToken Artifact — Treasure 0CMC",
  "Description": "{T}, Sacrifice this artifact: Add one mana of any color.",
  "GMNotes": "",
  "Memo": "3c549374-6c37-42e0-8d88-a8555d46732d",
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
  "CardID": 18400,
  "SidewaysCard": false,
  "CustomDeck": {
    "184": {
      "FaceURL": "https://c1.scryfall.com/file/scryfall-cards/large/front/5/6/56f06ec6-634d-454b-a46a-dfefe4600d27.jpg",
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
}
]]

function onLoad()
  noencode=true
  self.createButton({
    click_function='getToken',
    function_owner=self,
    label='spawn treasure',
    position={0,0.28,-0.65},
    scale={0.5,0.5,0.5},
    width=1400,
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

  local pos=self.getPosition()+self.getTransformForward():scale(-3.2)
  local rot=self.getRotation()
  spawnObjectJSON({json=tokenJSON,position=pos,rotation=rot})
end