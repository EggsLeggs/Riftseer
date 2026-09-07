function onload(saved_data)
    f_size = 300
    light_mode = true
    center_mode = true
    tooltip_show = true
    if saved_data ~= "" then
        local loaded_data = JSON.decode(saved_data)
        light_mode = loaded_data[1]
        center_mode = loaded_data[2]
        tooltip_show = loaded_data[3]
        f_size = loaded_data[4]
    end
    createAll()
end

function updateSave()
    local data_to_save = {light_mode, center_mode, tooltip_show, f_size}
    saved_data = JSON.encode(data_to_save)
    self.script_state = saved_data
end

function createAll()
    s_color = {0.5, 0.5, 0.5, 95}

    if light_mode then
        f_color = {1,1,1,95}
    else
        f_color = {0,0,0,95}
    end

    if center_mode then
        f_align = 3
    else
        f_align = 1
    end

    if tooltip_show then
        ttText = self.getName() .. "\n----------\n" .. self.getDescription()
    else
        ttText = ""
    end

    self.createButton({
        label="+",
        tooltip="increase font size",
        click_function="upFontSize",
        function_owner=self,
        position={2.1,0.06,-1.35},
        rotation={0,0,0},
        height=200,
        width=200,
        scale={x=1, y=1, z=1},
        font_size=300,
        font_color={f_color[1],f_color[2],f_color[1],25},
        color={0,0,0,0},
        hover_color={0,0,0,1/25}
    })
    self.createButton({
        label="-",
        tooltip="decrease font size",
        click_function="downFontSize",
        function_owner=self,
        position={2.1,0.06,-1},
        rotation={0,0,0},
        height=200,
        width=200,
        scale={x=1, y=1, z=1},
        font_size=300,
        font_color={f_color[1],f_color[2],f_color[1],25},
        color={0,0,0,0},
        hover_color={0,0,0,1/25}
    })

    self.createInput({
        value = self.getDescription(),
        label = "\ntype here\n[sub](flip for settings)[/sub]",
        input_function = "editDesc",
        function_owner = self,
        alignment = f_align,
        position = {0,0.05,0},
        width = 1900,
        height = 1300,
        font_size = f_size,
        scale={x=1, y=1, z=1},
        font_color=f_color,
        color = {0,0,0,0},
        tooltip = ttText
        })

    self.createButton({
        label="- Notecard Settings -",
        tooltip="- Notecard Settings -",
        click_function="null",
        function_owner=self,
        position={0,-0.05,-1.1},
        rotation={180,180,0},
        height=300,
        width=800,
        scale={x=1, y=1, z=1},
        font_size=140,
        font_color=s_color,
        color={0,0,0,0}
    })

    self.createButton({
        label='[ Reset ]',
        tooltip='[ Reset ]',
        click_function="reset",
        function_owner=self,
        position={0,-0.05,-0.7},
        rotation={180,180,0},
        height=250,
        width=600,
        scale={x=1, y=1, z=1},
        font_size=100,
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
        position={0,-0.05,-0.3},
        rotation={180,180,0},
        height=250,
        width=800,
        scale={x=1, y=1, z=1},
        font_size=100,
        font_color=s_color,
        color={0,0,0,0}
    })

    if center_mode then
        centerButtonText = "[ Set left align ]"
    else
        centerButtonText = "[ Set center align ]"
    end
    self.createButton({
        label=centerButtonText,
        tooltip=centerButtonText,
        click_function="swap_align",
        function_owner=self,
        position={0,-0.05,0.1},
        rotation={180,180,0},
        height=250,
        width=800,
        scale={x=1, y=1, z=1},
        font_size=100,
        font_color=s_color,
        color={0,0,0,0}
        })

    if tooltip_show then
        tooltipShowText = "[ Hide description in tooltip ]"
    else
        tooltipShowText = "[ Show description in tooltip ]"
    end
    self.createButton({
        label=tooltipShowText,
        tooltip=tooltipShowText,
        click_function="swap_tooltip",
        function_owner=self,
        position={0,-0.05,0.5},
        rotation={180,180,0},
        height=250,
        width=800,
        scale={x=1, y=1, z=1},
        font_size=100,
        font_color=s_color,
        color={0,0,0,0}
        })

    self.createButton({
        label = "Sample",
        click_function = "null",
        function_owner = self,
        alignment = f_align,
        position={0,-0.05,1},
        rotation={180,180,0},
        width = 0,
        height = 0,
        font_size = f_size,
        scale={x=1, y=1, z=1},
        font_color=f_color,
        color = {0,0,0,0}
        })

    setTooltips()
end

function null()
end

function removeAll()
    self.removeInput(0)
    for ind=0,7 do
      self.removeButton(ind)
    end
end

function reloadAll()
    removeAll()
    createAll()
    setTooltips()
    updateSave()
end

function reset()
  f_size = 300
  light_mode = true
  center_mode = true
  tooltip_show = true
  reloadAll()
end

function upFontSize()
  f_size = math.ceil(f_size*4/3)
  reloadAll()
end
function downFontSize()
  f_size = math.ceil(f_size*3/4)
  reloadAll()
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

function editDesc(_obj, _string, value)
    self.setDescription(value)
    setTooltips()
end

function setTooltips()
    title = self.getName()
    if title == "" then
        title = "Notecard"
    end
    desc = self.getDescription()

    if tooltip_show then
        ttText = desc
    else
        ttText = ""
    end

    self.editInput({
        index = 0,
        value = self.getDescription(),
        tooltip = ttText
        })
end

function null()
end

function keepSample(_obj, _string, value)
    reloadAll()
end
