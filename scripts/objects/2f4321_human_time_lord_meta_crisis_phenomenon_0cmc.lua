function onLoad()
  local enc=Global.getVar('Encoder')
  if enc==nil then
    self.createButton({
      click_function='spawnTokens',
      function_owner=self,
      label='T',
      tooltip='spawn token',
      position={0.77,0.28,-1.05},
      scale={0.5,0.5,0.5},
      width=300,
      height=300,
      font_size=250,
      color={0.1,0.1,0.1,0.75},
      font_color={1,1,1}
    })
  end
end
function spawnTokens()
  local jsonTxt=self.script_state
  if not(jsonTxt:find('"object":"list"')) then return end
  local json=JSON.decode(jsonTxt)
  local cardBackURL=self.getCustomObject().back
  local cPos=self.getPosition()+self.getTransformForward():scale(-3.2)
  local cRot=self.getRotation()
  for n,cardDat in ipairs(json.data) do
    local imagesuffix=''
    if cardDat.image_status~='highres_scan' then      -- cache buster for low quality images
      imagesuffix='?'..tostring(os.date("%x")):gsub('/', '')
    end
    local faceAddress,backAddress,cardName,cardDesc,backName,backDesc
    local backDat=nil
    if cardDat.image_uris then
      faceAddress=cardDat.image_uris.large:gsub('%?.*','')..imagesuffix
      cardName=cardDat.name:gsub('"','')..'\n'..cardDat.type_line..' '..cardDat.cmc..'CMC'
      cardDesc=setOracle(cardDat)
    elseif cardDat.card_faces then
      cardName=cardDat.card_faces[1].name:gsub('"','')..'\n'..cardDat.card_faces[1].type_line..' '..cardDat.cmc..'CMC DFC'
      cardDesc=setOracle(cardDat.card_faces[1])
      faceAddress=cardDat.card_faces[1].image_uris.large:gsub('%?.*','')..imagesuffix
      backAddress=cardDat.card_faces[2].image_uris.large:gsub('%?.*','')..imagesuffix
      if faceAddress:find('/back/') and backAddress:find('/front/') then
        local temp=faceAddress;faceAddress=backAddress;backAddress=temp
      end
      backName=cardDat.card_faces[2].name:gsub('"','')..'\n'..cardDat.card_faces[2].type_line..' '..cardDat.cmc..'CMC DFC'
      backDesc=setOracle(cardDat.card_faces[2])
      backDat={
        Transform={posX=0,posY=0,posZ=0,rotX=0,rotY=0,rotZ=0,scaleX=1,scaleY=1,scaleZ=1},
        Name="Card",
        Nickname=backName,
        Description=backDesc,
        Memo=cardDat.oracle_id,
        CardID=(n+10)*100,
        CustomDeck={[n+10]={FaceURL=backAddress,BackURL=cardBackURL,NumWidth=1,NumHeight=1,Type=0,BackIsHidden=true,UniqueBack=false}},
      }
    end
    local cardDat={
      Transform={posX=0,posY=0,posZ=0,rotX=0,rotY=0,rotZ=0,scaleX=1,scaleY=1,scaleZ=1},
      Name="Card",
      Nickname=cardName,
      Description=cardDesc,
      Memo=cardDat.oracle_id,
      CardID=n*100,
      CustomDeck={[n]={FaceURL=faceAddress,BackURL=cardBackURL,NumWidth=1,NumHeight=1,Type=0,BackIsHidden=true,UniqueBack=false}},
    }
    if backDat then
      cardDat.States={[2]=backDat}
    end
    spawnObjectData({data=cardDat,position=cPos,rotation=cRot})
  end
end
function setOracle(cardDat)
  local n='\n[b]'
  if cardDat.might then
    n=n..'Might: '..cardDat.might
  elseif cardDat.loyalty then
    n=n..tostring(cardDat.loyalty)
  else
    n=false
  end
  return cardDat.oracle_text..(n and n..'[/b]'or'')
end
