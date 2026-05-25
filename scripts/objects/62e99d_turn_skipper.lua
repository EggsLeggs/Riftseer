local turnSkipPlayer

function onLoad()
  turnSkipPlayer = nil
  self.setColorTint({0.5, 0.5, 0.5})
end

function assignColor(color)
  if color~=nil and Player[color].seated then
    self.setColorTint(color)
    turnSkipPlayer = color
  end
end

function onPickUp(color)
  assignColor(color)
end

function onObjectEnterZone(zone, object)
  if object~=self then return end
  local hZones=Hands.getHands()
  for _,hzone in pairs(hZones) do
    if zone==hzone then
      assignColor(hzone.getValue())
    end
  end
  pcall(function()
    for _, color in pairs(Player.getAvailableColors()) do
      if zone.hasTag('playboard' .. color) then
        assignColor(color)
      end
    end
  end)
end

function onDrop(color)
  Wait.condition(function()
    if turnSkipPlayer==color and Turns.turn_color==color and self.is_face_down then
      broadcastToAll("Skipping " .. Player[color].steam_name .. "'s turn.", color.color)
      nextPlayer=Turns.getNextTurnColor()
      Wait.frames(function() Turns.turn_color=nextPlayer end, 2)
    end
  end,function() return self.resting end)
end

-- If it's turnSkipPlayer's turn and the token is flipped, skip their turn
function onPlayerTurn(player)
  if turnSkipPlayer==player.color and self.is_face_down then
    broadcastToAll("Skipping " .. player.steam_name .. "'s turn.", player.color)
    nextPlayer=Turns.getNextTurnColor()
    Wait.frames(function() Turns.turn_color=nextPlayer end, 2)
  end
end