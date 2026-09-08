function onLoad()
  noencode=true
  val=0
  self.createButton({
    click_function='counter',
    function_owner=self,
    label=tostring(val),
    position={0,0.28,-0.65},
    scale={0.5,0.5,0.5},
    width=900,
    height=900,
    font_size=900,
    color={0,0,0,0},
    hover_color={0,0,0,0},
    font_color={1,1,1,75},
    tooltip='seed counter'
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

function counter(obj,ply,alt)
  mod = alt and -1 or 1
  val = math.min(math.max(val + mod, 0), 99)
  self.editButton({index=0,label=tostring(val)})
end

self.max_typed_number=99
function onNumberTyped(col,int)
  val = int
  self.editButton({index=0,label=tostring(val)})
return true
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
