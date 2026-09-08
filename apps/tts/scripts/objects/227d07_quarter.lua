function onObjectRandomize(obj)
  if obj==self then

    local launchSpin = 180
    local spin = {}
		spin.x = math.random() * launchSpin
		spin.y = math.random() * (launchSpin - spin.x)
		spin.z = (launchSpin - spin.x - spin.y)

		--randomly invert some of the axes
		spin.x = spin.x * (math.random(0,1)*2-1)
		spin.y = spin.y * (math.random(0,1)*2-1)
		spin.z = spin.z * (math.random(0,1)*2-1)

    success = pcall(function() pow=tonumber(self.getDescription()) end)
    if not(success) or pow==nil then
      pow=30
    end
    launchVelocity={0,pow,0}

    --Use setVelocity so that mass can be ignored
    obj.setVelocity(launchVelocity)
    obj.setAngularVelocity(spin)

  end
end
