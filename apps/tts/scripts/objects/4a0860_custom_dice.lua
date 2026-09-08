player = "Black"
timesRolled = 0
side = "Unset"
text = " Unset "
randomized = false

function onObjectRandomize( Object , player_color )
 if Object.getGUID() == self.getGUID() then
  if player_color != player then
   changePlayer(player_color)
  end
  if not randomized then
   randomized = true
   startLuaCoroutine(self, 'afterDrop')
  end
 end
end

function afterDrop()
 while not self.resting do
  coroutine.yield(0) -- Always yield 0 to resume
 end
 randomized = false
 printDiceFace()
 coroutine.yield(1) -- Yield anything other than 0 to break out
end

function printDiceFace()
 local value = self.getValue()
 if value == 1 then
  side = "Planeswalk"
 elseif value == 6 then
  side = "Chaos"
 else
  side = "Nothing"
 end
 text = player.." paid "..timesRolled.." mana for "..side.."."
 printToAll(text, self.getColorTint())
 timesRolled = timesRolled + 1
end

function changePlayer(new)
 player = new
 timesRolled = 0
 local rgb = stringColorToRGB(player)
 local color = {rgb["r"], rgb["g"], rgb["b"]}
 self.setColorTint(color)
end

function onPlayerTurn(new)
  player = new
  timesRolled = 0
end