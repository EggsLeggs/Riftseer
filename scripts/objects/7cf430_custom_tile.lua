function onLoad()
  link='https://steamcommunity.com/sharedfiles/filedetails/?id=3732199052'
  importerLink='https://steamcommunity.com/sharedfiles/filedetails/?id=3717685169'

  self.setName(link)
  self.setDescription(link)

  self.createButton({
    click_function='showLink',
    function_owner=self,
    position={0,0.1,0},
    width=10,
    height=10,
    scale={100,100,100},
    color={1,1,1,0},
    hover_color={1,1,1,0.25},
    tooltip='show link to this table\nin the steam workshop'
  })
end

function showLink()
  self.createInput({
    input_function='null',
    function_owner=self,
    label='',
    position={0,1,-2.5},
    width=4200,
    height=170,
    font_size=140,
    scale={2,2,2},
    color={0.1,0.1,0.1},
    font_color={1,1,1},
    alignment=3,
    value=link,
    tooltip='ctrl-C'
  })
  self.createInput({
    input_function='null',
    function_owner=self,
    label='',
    position={0,1,-4.8},
    width=4200,
    height=170,
    font_size=140,
    scale={2,2,2},
    color={0.1,0.1,0.1},
    font_color={1,1,1},
    alignment=3,
    value=importerLink,
    tooltip='ctrl-C'
  })

  self.clearButtons()

  self.createButton({
    click_function='hideLink',
    function_owner=self,
    position={0,0.1,0},
    width=10,
    height=10,
    scale={100,100,100},
    color={1,1,1,0},
    hover_color={1,1,1,0.25},
    tooltip='hide links'
  })
  self.createButton({
    click_function='null',
    function_owner=self,
    label='Riftbound 4-Player Table',
    position={0,1,-1.7},
    width=4000,
    height=120,
    font_size=110,
    scale={2,2,2},
    color={0,0,0,0.6},
    font_color={1,1,1}
  })
  self.createButton({
    click_function='null',
    function_owner=self,
    label='Riftbound Card Importer',
    position={0,1,-4.0},
    width=4000,
    height=120,
    font_size=110,
    scale={2,2,2},
    color={0,0,0,0.6},
    font_color={1,1,1}
  })

  wid=Wait.time(hideLink,10)
end

function hideLink()
  if wid then
    Wait.stop(wid)
  end

  self.clearInputs()
  self.clearButtons()
  self.createButton({
    click_function='showLink',
    function_owner=self,
    position={0,0.1,0},
    width=10,
    height=10,
    scale={100,100,100},
    color={1,1,1,0},
    hover_color={1,1,1,0.25},
    tooltip='show link to this table\nin the steam workshop'
  })
end

function null()
end