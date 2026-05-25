-- a counter by Oops I baked a pie
-- based off Idan's "better notecards and counters"

MIN_VALUE = -999
MAX_VALUE = 999

function onload(saved_data)
  light_mode = true
  valM = 1
  fsize = 500

  if saved_data ~= "" then
    local loaded_data = JSON.decode(saved_data)
    valM = loaded_data[1] or valM
    fsize = loaded_data[3] or loaded_data[2] or fsize
  end

  createAll()
  updateVal()
end

function updateSave()
  local data_to_save = {valM, fsize}
  saved_data = JSON.encode(data_to_save)
  self.script_state = saved_data
end

function createAll()
  s_color = {0.5, 0.5, 0.5, 95}
  if light_mode then
    f_color = {0.9, 0.9, 0.9, 95}
  else
    f_color = {0.05, 0.05, 0.05, 100}
  end

  ttext1  = '\n+1 left click\n-1 right click\n10 button below'
  ttext10 = '\n+10 left click\n-10 right click'

  self.createButton({
    label='+1',
    tooltip='might:'..ttext1,
    click_function="add_subtractM",
    function_owner=self,
    position={0,0.05,0},
    height=400,
    width=900,
    alignment = 3,
    scale={x=1.5, y=1.5, z=1.5},
    font_size=fsize,
    font_color=f_color,
    color={0,0,0,0},
    hover_color = {1,1,1,0.2},
    press_color = {0,0,0,0.2}
  })

  self.createButton({
    tooltip='might:'..ttext10,
    click_function="add_subtractM10",
    function_owner=self,
    position={0,0.05,0.8},
    height=200,
    width=900,
    alignment = 3,
    scale={x=1.5, y=1.5, z=1.5},
    font_size=fsize,
    font_color=f_color,
    color={0,0,0,0},
    hover_color = {1,1,1,0.2},
    press_color = {0,0,0,0.2}
  })

  lightButtonText = "[ swap text color ]"
  self.createButton({
    label=lightButtonText,
    tooltip=lightButtonText,
    click_function="swap_fcolor",
    function_owner=self,
    position={0,-0.05,0.5},
    rotation={180,180,0},
    height=150,
    width=1200,
    scale={x=1, y=1, z=1},
    font_size=150,
    font_color=s_color,
    color={0,0,0,0}
  })

  self.createButton({
    label="[ Reset ]",
    tooltip="[ Reset ]",
    click_function="reset_val",
    function_owner=self,
    position={0,-0.05,-0.5},
    rotation={180,180,0},
    height=250,
    width=1200,
    scale={x=1, y=1, z=1},
    font_size=250,
    font_color=s_color,
    color={0,0,0,0}
  })
end

function swap_fcolor(_obj, _color, alt_click)
  light_mode = not light_mode
  self.removeButton(0)
  self.removeButton(1)
  self.removeButton(2)
  self.removeButton(3)
  createAll()
end

function add_subtractM(_obj, _color, alt_click)
  local mod = alt_click and -1 or 1
  valM = math.min(math.max(valM + mod, MIN_VALUE), MAX_VALUE)
  updateSave()
  updateVal()
end

function add_subtractM10(_obj, _color, alt_click)
  local mod = alt_click and -1 or 1
  valM = math.min(math.max(valM + mod*10, MIN_VALUE), MAX_VALUE)
  updateSave()
  updateVal()
end

function updateVal()
  if valM>0 then
    labelM = '+'..tostring(valM)
  else
    labelM = tostring(valM)
  end

  updatefsize()

  self.editButton({
    index = 0,
    label = labelM,
    tooltip = 'might\nleft click +1\nright click -1',
    font_size=fsize
  })

  self.setName(labelM)
end

function updatefsize()
  if #labelM>8 then
    fsize=300
  elseif #labelM>7 then
    fsize=350
  elseif #labelM>6 then
    fsize=400
  elseif #labelM>5 then
    fsize=450
  else
    fsize=500
  end
  updateSave()
end

function reset_val()
  valM = 1
  updateVal()
  updateSave()
end

self.max_typed_number=999
function onNumberTyped(col,int)
  valM = int
  updateVal()
  updateSave()
end

function null()
end
