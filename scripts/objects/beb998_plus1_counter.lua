-- +1 Counter infinite bag (beb998)

local BAG_MESH = "https://steamusercontent-a.akamaihd.net/ugc/1588037098367519126/93C14BA324B2B68CE1E3E955845F9367BF1FBF8C/"
local BAG_DIFFUSE = "https://steamusercontent-a.akamaihd.net/ugc/9252197006818994342/232DF325489B599A7526D4044F792521CACA8D7A/"

function onLoad()
	self.setCustomObject({
		mesh = BAG_MESH,
		diffuse = BAG_DIFFUSE,
		type = 7,
		material = 0,
		collision = true,
	})
	self.setColorTint({1, 1, 1, 1})
end
