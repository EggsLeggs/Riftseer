MIN_VALUE = -99
MAX_VALUE = 999

function onload(saved_data)
    light_mode = false
    tooltip_show = true
    val = 0

    if saved_data ~= "" then
        local loaded_data = JSON.decode(saved_data)
        light_mode = loaded_data[1]
        val = loaded_data[2]
        tooltip_show = loaded_data[3]
    end

    createAll()
end

function updateSave()
    local data_to_save = {light_mode, val, tooltip_show}
    saved_data = JSON.encode(data_to_save)
    self.script_state = saved_data
end

function createAll()
    s_color = {0.5, 0.5, 0.5, 95}

    if light_mode then
        f_color = {0.9,0.9,0.9,95}
    else
        f_color = {0.1,0.1,0.1,100}
    end

    if tooltip_show then
        ttText = "     " .. val .. "\n" .. self.getName()
    else
        ttText = self.getName()
    end

    self.createButton({
      label=tostring(val),
      click_function="add_subtract",
      tooltip=ttText,
      function_owner=self,
      position={0,0.05,-0.5},
      height=800,
      width=800,
      alignment = 3,
      scale={x=1.5, y=1.5, z=1.5},
      font_size=900,
      font_color=f_color,
      color={0,0,0,0}
      })

    self.createInput({
        value = self.getName(),
        input_function = "editName",
        tooltip=ttText,
        label = "Text",
        function_owner = self,
        alignment = 3,
        position = {0,0.05,1},
        width = 1600,
        height = 400,
        font_size = 350,
        scale={x=1, y=1, z=1},
        font_color= f_color,
        color = {0,0,0,0}
        })


    if tooltip_show then
        tooltipShowText = "[ Hide value in tooltip ]"
    else
        tooltipShowText = "[ Show value in tooltip ]"
    end
    self.createButton({
        label=tooltipShowText,
        tooltip=tooltipShowText,
        click_function="swap_tooltip",
        function_owner=self,
        position={0,-0.05,0.2},
        rotation={180,180,0},
        height=250,
        width=1200,
        scale={x=1, y=1, z=1},
        font_size=150,
        font_color=s_color,
        color={0,0,0,0}
        })

    if light_mode then
        lightButtonText = "[ Set dark text ]"
    else
        lightButtonText = "[ Set light text ]"
    end
    self.createButton({
        label=lightButtonText,
        tooltip=lightButtonText,
        click_function="swap_fcolor",
        function_owner=self,
        position={0,-0.05,0.6},
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
        position={0,-0.05,1.4},
        rotation={180,180,0},
        height=250,
        width=1200,
        scale={x=1, y=1, z=1},
        font_size=250,
        font_color=s_color,
        color={0,0,0,0}
        })

    self.createInput({
        value = "#",
        label = "...",
        input_function = "keepSample",
        function_owner = self,
        alignment = 3,
        position={0,-0.05,-0.8},
        rotation={180,180,0},
        width = 600,
        height = 800,
        font_size = 1200,
        scale={x=1, y=1, z=1},
        font_color=f_color,
        color = {0,0,0,0}
        })

    setTooltips()
end

function removeAll()
    self.removeInput(0)
    self.removeInput(1)
    self.removeButton(0)
    self.removeButton(1)
    self.removeButton(2)
    self.removeButton(3)
end

function reloadAll()
    removeAll()
    createAll()
    setTooltips()
    updateSave()
end

function swap_fcolor(_obj, _color, alt_click)
    light_mode = not light_mode
    reloadAll()
end

function swap_align(_obj, _color, alt_click)
    center_mode = not center_mode
    reloadAll()
end

function swap_tooltip(_obj, _color, alt_click)
    tooltip_show = not tooltip_show
    reloadAll()
    setTooltips()
end

function editName(_obj, _string, value)
    self.setName(value)
    setTooltips()
end

function add_subtract(_obj, _color, alt_click)
    mod = alt_click and -1 or 1
    new_value = math.min(math.max(val + mod, MIN_VALUE), MAX_VALUE)
    if val ~= new_value then
        val = new_value
        updateVal()
        updateSave()
    end
end

function updateVal()
    if tooltip_show then
        ttText = "     " .. val .. "\n" .. self.getName()
    else
        ttText = self.getName()
    end

    self.editButton({
        index = 0,
        label = tostring(val),
        tooltip = ttText
        })

    setTooltips()
end

function reset_val()
    val = 0
    updateVal()
    updateSave()
    setTooltips()
    editName(_obj,_string,'Text')
end

function setTooltips()
    if tooltip_show then
        ttText = "     " .. val .. "\n" .. self.getName()
    else
        ttText = self.getName()
    end

    self.editInput({
        index = 0,
        value = self.getName(),
        tooltip = ttText
        })
    self.editButton({
        index = 0,
        value = tostring(val),
        tooltip = ttText
        })
end

function null()
end

function keepSample(_obj, _string, value)
    reloadAll()
end

self.max_typed_number=999
function onNumberTyped(col,int)
  val = int
  updateVal()
  updateSave()
end