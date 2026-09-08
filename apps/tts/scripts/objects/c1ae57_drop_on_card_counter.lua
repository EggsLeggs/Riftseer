function onLoad(saved_data)
  picounter=0
  if saved_data ~= "" then
    local loaded_data = JSON.decode(saved_data)
    picounter = loaded_data[1]
  end
  createButtons()
  collisionObjs={}
end

function updateSave()
  local data_to_save = {picounter}
  saved_data = JSON.encode(data_to_save)
  self.script_state = saved_data
end

self.max_typed_number=999
function onNumberTyped(ply, int)
  picounter=int
  updateSave()
  createButtons()
end

function createButtons()
  self.clearButtons()

  self.createButton({
    label='Drop-On-Card Counter',
    click_function='null',
    position={0,0.05,1.15},
    width=0,
    height=0,
    font_size=230,
    scale={0.5,0.5,0.5},
    color={0,0,0,0},
    font_color={0,0,0,100}
  })

  pos = Vector(0,0.1,-0.65)
  bpars={
    click_function='null',
    function_owner=self,
    label=tostring(picounter),
    position=pos,
    rotation=Vector(0,0,0),
    width=0,
    height=0,
    font_size=1000,
    scale={1.15,1.15,1.15},
    color={0,0,0,0},
    hover_color={0,0,0,0},
    font_color={0,0,0,100},
  }
  for i=-1,1,1 do         -- outline
    for j=-1,1,1 do
      opars=bpars
      opars.position=pos+Vector(0.02*i,0,0.02*j)
      self.createButton(bpars)
    end
  end

  bpars.position=Vector(-0.05,0,-0.55)
  bpars.font_color={0.1,0.1,0.1,90}
  self.createButton(bpars)    -- shadow

  bpars.click_function='add_subtract'
  bpars.position=pos
  bpars.width=600
  bpars.height=600
  bpars.font_color={1,1,1,100}
  self.createButton(bpars)    -- the button
end

function add_subtract(obj,ply,alt)
  new_value = math.min(math.max(picounter + (alt and -1 or 1), 0), 999)
  if picounter ~= new_value then
    picounter = new_value
    updateSave()
    createButtons()
  end
end

function null()
end

-- the onDrop part, finally
prevGuid = nil
propID = "πCounter"
function onCollisionEnter(co)
	obj = co.collision_object
	if obj.tag == "Card" and obj.getGUID()~=prevGuid and not(obj.spawning) then
    prevGuid=obj.getGUID()
    table.insert(collisionObjs,co)
    nRunning=0
    Wait.frames(enableCounter,1)
  end
end

function enableCounter()

  -- only encode 1 object, the one that's closest in position to the drop-on counter
  nRunning=nRunning+1
  if nRunning>1 then return end
  local mag=20
  for _,co in pairs(collisionObjs) do
    local coobj=co.collision_object
    posdif=coobj.getPosition()-self.getPosition()
    if posdif:magnitude()<mag then
      obj=coobj
      mag=posdif:magnitude()
    end
  end

  -- encode
  enc=Global.getVar('Encoder')
  if enc then
    if enc.call("APIpropertyExists",{propID = propID}) then
      toggleProp(obj)
      self.destruct()
    else
      broadcastToAll('πCounter encoder module necessary and not found at this table')
    end
  else
    broadcastToAll('Card Encoder necessary and not found at this table')
  end

end

script="self.max_typed_number=999 function onNumberTyped(ply, int) enc = Global.getVar('Encoder') if enc ~= nil then enc.call('APIobjSetValueData',{obj=self,valueID='picounter',data={picounter=int}}) enc.call('APIrebuildButtons',{obj=self}) return true end end"
function toggleProp(obj)
  enc = Global.getVar('Encoder')
  if enc then
    enc.call("APIencodeObject",{obj=obj})
    local objRot=obj.getRotation()
    local cardFlip=1
    if objRot[3]>90 and objRot[3]<270 then cardFlip=-1 end
    local encFlip = enc.call("APIgetFlip",{obj=obj})
    if encFlip~=cardFlip then
      enc.call("APIFlip",{obj=obj})
    end
    enc.call("APIobjEnableProp",{obj=obj,propID=propID})
    enc.call("APIobjSetValueData",{obj=obj,valueID='picounter',data={picounter=picounter}})
    obj.setLuaScript(script)
    obj=obj.reload()
    Wait.condition(function()
      if cardFlip==-1 then obj.hide_when_face_down=false end
      enc.call("APIobjUpdateThis",{obj=obj})
      enc.call("APIrebuildButtons",{obj=obj})
    end, function() return not(obj.spawning) end)
  end
end