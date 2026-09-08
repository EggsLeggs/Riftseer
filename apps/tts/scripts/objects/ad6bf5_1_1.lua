-- a counter by Oops I baked a pie
-- based off Idan's "better notecards and counters"
--
-- Riftbound table fork: physical +1 token; light rim + dark chip. Uses a valid
-- Steam-hosted face URL (required by TTS) then hides the mesh via tint; scaled
-- to the badge. chipSizeBoost scales buttons.

MIN_VALUE = -999
MAX_VALUE = 999

local colorLightGrey = {177/255, 177/255, 177/255}
local colorDarkGrey = {40/255, 40/255, 40/255}
local rimSize = 30
local verticalSize = 130
local plusOneFontSize = 80
local plusTenStripHeight = 60
local plusTenStripScaleZ = 0.5
local chipSizeBoost = 1.0
local templateScale = 0.383333355
-- Same Steam asset as generic Counter bags; empty ImageURL triggers import popup.
local tokenFaceUrl = "https://steamusercontent-a.akamaihd.net/ugc/958597478463059274/DE73B64E1B5C6F272EA3BEE5EF458E73E48FF03D/"
local defaultTokenDiameter = 0.7

function buttonScale()
	return (1 / templateScale) * chipSizeBoost
end

function hideTokenMesh()
	pcall(function()
		self.setCustomObject({
			image = tokenFaceUrl,
			type = 0,
			thickness = 0.001,
			merge_distance_pixels = 25,
		})
	end)
	self.setColorTint({1, 1, 1, 0})
end

function fitMeshToChip(horizontalSize, vSize, sc)
	local rim = rimSize * sc
	local localW = horizontalSize + rim
	local localH = vSize + rim + 16
	local targetWorld = math.max(localW, localH) / 1000
	local s = targetWorld / defaultTokenDiameter
	s = math.max(s, 0.05)
	self.setScale({s, 1, s})
end

function onload(saved_data)
	val = 1

	if saved_data ~= "" then
		local loaded_data = JSON.decode(saved_data)
		if loaded_data[1] ~= nil then
			val = loaded_data[1]
		end
	end

	hideTokenMesh()
	createAll()
	updateVal()
end

function updateSave()
	self.script_state = JSON.encode({val})
end

function getLabel()
	if val > 0 then
		return "+"..tostring(val)
	end
	return tostring(val)
end

function getHorizontalSize(label, sc)
	local widthPerDigit = 25
	local baseWidth = 145
	return (baseWidth + (string.len(label) * widthPerDigit)) * sc
end

function createAll()
	self.clearButtons()

	local sc = buttonScale()
	local label = getLabel()
	local horizontalSize = getHorizontalSize(label, sc)
	local rim = rimSize * sc
	local vSize = verticalSize * sc
	local fsize = plusOneFontSize * sc
	local mainRot = {0, 0, 0}
	local mainPos = {0, 0.05, 0}
	local plusTenHeight = plusTenStripHeight * sc
	local plusTenStripVisual = plusTenHeight * plusTenStripScaleZ
	local plusTenZ = (vSize / 2 + plusTenStripVisual / 2) / 1000
	local plusTenPos = {0, 0.05, plusTenZ}

	self.createButton({
		click_function = "null",
		function_owner = self,
		position = mainPos,
		rotation = {0, 0, -180},
		height = vSize + rim + 16,
		width = horizontalSize + rim,
		color = colorLightGrey,
	})

	self.createButton({
		label = label.." ",
		tooltip = "+1 counter\nleft click +1\nright click -1",
		click_function = "add_subtract",
		function_owner = self,
		position = mainPos,
		rotation = mainRot,
		height = vSize,
		width = horizontalSize,
		color = colorDarkGrey,
		font_size = fsize,
		font_color = {1, 1, 1},
	})

	self.createButton({
		tooltip = "+1 counter\nleft click +10\nright click -10",
		click_function = "add_subtract10",
		function_owner = self,
		position = plusTenPos,
		rotation = mainRot,
		height = plusTenHeight,
		width = horizontalSize - (40 * sc),
		scale = {1, 1, plusTenStripScaleZ},
		color = {0.3, 0.3, 0.3, 0.4},
		hover_color = {1, 1, 1, 0.66},
	})

	self.createButton({
		label = "[ Reset ]",
		tooltip = "[ Reset ]",
		click_function = "reset_val",
		function_owner = self,
		position = {0, -0.05, -0.5},
		rotation = {180, 180, 0},
		height = 250,
		width = 1200,
		scale = {1, 1, 1},
		font_size = 250,
		font_color = {0.5, 0.5, 0.5, 95},
		color = {0, 0, 0, 0},
	})

	fitMeshToChip(horizontalSize, vSize, sc)
end

function add_subtract(_obj, _color, alt_click)
	local mod = alt_click and -1 or 1
	val = math.min(math.max(val + mod, MIN_VALUE), MAX_VALUE)
	updateSave()
	updateVal()
end

function add_subtract10(_obj, _color, alt_click)
	local mod = alt_click and -1 or 1
	val = math.min(math.max(val + mod * 10, MIN_VALUE), MAX_VALUE)
	updateSave()
	updateVal()
end

function updateVal()
	local sc = buttonScale()
	local label = getLabel()
	local horizontalSize = getHorizontalSize(label, sc)
	local rim = rimSize * sc
	local vSize = verticalSize * sc
	local fsize = plusOneFontSize * sc

	self.editButton({
		index = 1,
		label = label.." ",
		tooltip = "+1 counter\nleft click +1\nright click -1",
		font_size = fsize,
		width = horizontalSize,
		height = vSize,
	})

	self.editButton({
		index = 0,
		width = horizontalSize + rim,
		height = vSize + rim + 16,
	})

	self.editButton({
		index = 2,
		width = horizontalSize - (40 * sc),
	})

	self.setName(label)
	fitMeshToChip(horizontalSize, vSize, sc)
end

function reset_val()
	val = 1
	updateVal()
	updateSave()
end

self.max_typed_number = 999
function onNumberTyped(col, int)
	val = int
	updateVal()
	updateSave()
end

function null()
end
