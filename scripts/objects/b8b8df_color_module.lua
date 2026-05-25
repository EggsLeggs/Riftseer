--[[Domain Module
by Tipsy Hobbit//STEAM_0:1:13465982
This module adds Domain Designators for Riftbound.
]]
pID = "RB_Domain"
version = '1.12'
Style = {}
domains={
f={c=Color(0.827,0.184,0.184),n="Fury"},
c={c=Color(0.298,0.686,0.314),n="Calm"},
m={c=Color(0.129,0.588,0.953),n="Mind"},
b={c=Color(1.000,0.596,0.000),n="Body"},
x={c=Color(0.482,0.122,0.635),n="Chaos"},
o={c=Color(0.984,0.753,0.176),n="Order"}
}
domainOrder={'f','c','m','b','x','o'}

function onload()
  Color.Add("rb_fury",domains.f.c)
  Color.Add("rb_calm",domains.c.c)
  Color.Add("rb_mind",domains.m.c)
  Color.Add("rb_body",domains.b.c)
  Color.Add("rb_chaos",domains.x.c)
  Color.Add("rb_order",domains.o.c)

  self.addContextMenuItem('Register Module', function(p)
    registerModule()
  end)
  Wait.condition(registerModule,function() return Global.getVar('Encoder') ~= nil and true or false end)
end
function registerModule(obj,ply)
  enc = Global.getVar('Encoder')
  if enc ~= nil then

    enc.call("APIremoveProperty", {propID="RB_Colors"})

    properties = {
    propID = pID,
    name = "Domain",
    values = {'rb_domain'},
    funcOwner = self,
    tags='basic,face_prop',
    activateFunc ='callEditor'
    }
    enc.call("APIregisterProperty",properties)

    value = {
    valueID = 'rb_domain',
    validType = 'pattern(^[fcmbxo]*$)',
    desc = "Domain Identity of the card.",
    default = ''
    }
    enc.call("APIregisterValue",value)

    for _,d in ipairs(domainOrder) do
      local t=domains[d]
      _G['toggle'..d]=function(obj,ply,alt) toggleStatus(obj,ply,alt,d) end
    end

    Style.proto = enc.call("APIgetStyleTable",nil)
    Style.mt = {}
    Style.mt.__index = Style.proto
    function Style.new(o)
      for k,v in pairs(Style.proto) do
        if o[k] == nil then
          o[k] = v
        end
      end
      return o
    end
  end
end
function refreshStyle()
  Style.proto = enc.call("APIgetStyleTable",nil)
end

function toggleStatus(obj,ply,alt,val)
  enc = Global.getVar('Encoder')
  if enc ~= nil then
    data = enc.call("APIobjGetPropData",{obj=obj,propID=pID})
    if string.find(data['rb_domain'],val) then
      data['rb_domain']=string.gsub(data['rb_domain'],val,'')
    else
      data['rb_domain']=data['rb_domain']..val
    end

    enc.call("APIobjSetPropData",{obj=obj,propID=pID,data=data})
    enc.call("APIrebuildButtons",{obj=obj})
  end
end

function toggleEditor(obj,ply)
  enc = Global.getVar('Encoder')
  if enc ~= nil then
    enc.call("APIsetEditing",{obj=obj,propID=pID})
    enc.call("APIrebuildButtons",{obj=obj})
  end
end
function callEditor(obj,ply,alt)
  if type(obj) == 'Table' then obj=obj[1] ply=obj[2] alt=obj[3] end
  if alt then
    enc.call("APIobjResetProp",{obj=obj,propID=pID})
  else
    enc.call("APItoggleProperty",{obj=obj,propID=pID})
    if enc.call("APIobjIsPropEnabled",{obj=obj,propID=pID}) then
      toggleEditor(obj,nil)
    else
      enc.call("APIrebuildButtons",{obj=obj})
    end
  end
end
function toggleEditClose(obj,ply)
  enc = Global.getVar('Encoder')
  if enc ~= nil then
    enc.call("APIclearEditing",{obj=obj})
    enc.call("APIrebuildButtons",{obj=obj})
  end
end

function createButtons(t)
  enc = Global.getVar('Encoder')
  if enc ~= nil then
    data = enc.call("APIobjGetPropData",{obj=t.obj,propID=pID})
    flip = enc.call("APIgetFlip",{obj=t.obj})
    scaler = {x=1,y=1,z=1}
    editing = enc.call("APIgetEditing",{obj=t.obj})

    i = 0
    for _,d in ipairs(domainOrder) do
      local a=domains[d]
      if editing == nil then
        if string.find(data['rb_domain'],d) then
          t.obj.createButton({
          label=temp, click_function='toggleEditor', function_owner=self,
          position={1.0*flip*scaler.x,0.28*flip*scaler.z,(1.4-i*0.1)*scaler.y}, height=50, width=75, font_size=0,
          rotation={0,0,90-90*flip}, color=a.c, tooltip='Domain Identity: '..a.n
          })
          i = i+1
        end
      elseif editing == pID then
        t.obj.createButton({
        label='', click_function='toggle'..d, function_owner=self,
        position={-0*flip,0.28*flip*scaler.z,(-1.2+i*0.4)*scaler.y}, height=100, width=300, font_size=0,
        rotation={0,0,90-90*flip}, color=a.c, tooltip='Domain Identity: '..a.n
        })
        i = i+1
      end
    end
  end
end
