version = '1.0.0'

MIN_BATTLEFIELDS = 2
MAX_BATTLEFIELDS = 4
DEFAULT_BATTLEFIELDS = 3

count = DEFAULT_BATTLEFIELDS
panelGuid = nil
nDownClick = 0
downSafety = true
PANEL_RIGHT_OFFSET = 3.15
PANEL_UP_OFFSET = 0.02
PANEL_MIRROR_OFFSET_X = 0.15501
PANEL_MIRROR_OFFSET_Z = 3.14000
PANEL_SCALE = {1.2, 0.08, 1.2}
PANEL_TINT = {0.05, 0.05, 0.05, 0.12}

function onSave()
	return JSON.encode({
		count = count,
		panelGuid = panelGuid,
	})
end

function onLoad(saved_state)
	local loaded = nil
	if saved_state ~= nil and saved_state ~= '' then
		local ok, decoded = pcall(function() return JSON.decode(saved_state) end)
		if ok and decoded ~= nil then loaded = decoded end
	end
	count = clampCount((loaded and loaded.count) or DEFAULT_BATTLEFIELDS)
	panelGuid = loaded and loaded.panelGuid or nil
	-- Keep Steam tile as-is; this script now manages a separate panel object.
	self.setLock(true)
	self.interactable = true
	self.clearButtons()
	self.clearInputs()
	Wait.frames(function()
		syncFromBattlefield()
		ensurePanel()
		rebuildControls()
	end, 5)
end

function clampCount(value)
	local n = tonumber(value)
	if n == nil then return count or DEFAULT_BATTLEFIELDS end
	n = math.floor(n + 0.5)
	if n < MIN_BATTLEFIELDS then n = MIN_BATTLEFIELDS end
	if n > MAX_BATTLEFIELDS then n = MAX_BATTLEFIELDS end
	return n
end

function getBattlefieldController()
	local bf = Global.getVar('Battlefield')
	if bf ~= nil then return bf end
	return getObjectFromGUID('bfc001')
end

function syncFromBattlefield()
	local bf = getBattlefieldController()
	if bf == nil then return end
	local ok, value = pcall(function()
		return bf.call('APIgetBattlefieldCount', {})
	end)
	if ok and tonumber(value) ~= nil then
		count = clampCount(value)
	end
end

function applyCount(newCount, playerColor)
	local nextCount = clampCount(newCount)
	local bf = getBattlefieldController()
	if bf == nil then
		if playerColor ~= nil then
			broadcastToColor('Battlefield controller missing.', playerColor, {1, 0.3, 0.2})
		end
		return
	end
	local reason = nil
	local ok = pcall(function()
		reason = bf.call('APIsetBattlefieldCount', {count = nextCount, color = playerColor})
	end)
	if not ok then
		if playerColor ~= nil then
			broadcastToColor('Could not change battlefield count.', playerColor, {1, 0.3, 0.2})
		end
		rebuildControls()
		return
	end
	if reason == 'busy' then
		if playerColor ~= nil then
			broadcastToColor('Battlefield layout is busy, try again in a moment.', playerColor, {1, 0.5, 0.1})
		end
		rebuildControls()
		return
	end
	if reason == 'same' then
		if playerColor ~= nil then
			broadcastToColor('Battlefields are already set to '..tostring(nextCount)..'.', playerColor, {0.7, 0.7, 0.7})
		end
		rebuildControls()
		return
	end
	count = nextCount
	rebuildControls()
end

function ensurePanel()
	local panel = panelGuid and getObjectFromGUID(panelGuid) or nil
	if panel ~= nil then
		positionPanel(panel)
		return panel
	end
	local spawned = nil
	local ok = pcall(function()
		spawned = spawnObject({
			type = 'BlockSquare',
			position = self.getPosition(),
			rotation = {0, 0, 0},
			scale = PANEL_SCALE,
			sound = false,
		})
	end)
	if not ok or spawned == nil then
		print('[Riftbound] battlefield counter: failed to spawn panel')
		return nil
	end
	spawned.setName('Battlefield Counter')
	spawned.setDescription('Adjust active battlefield lanes (2-4)')
	spawned.setLock(true)
	spawned.interactable = true
	spawned.setColorTint(PANEL_TINT)
	panelGuid = spawned.getGUID()
	positionPanel(spawned)
	return spawned
end

function positionPanel(panel)
	local base = self.getPosition()
	local rot = self.getRotation()
	local pos = {
		x = base.x + PANEL_MIRROR_OFFSET_X,
		y = base.y + PANEL_UP_OFFSET,
		z = base.z + PANEL_MIRROR_OFFSET_Z,
	}
	panel.setPosition(pos)
	panel.setRotation({x = rot.x, y = rot.y + 360, z = rot.z})
	panel.setScale(PANEL_SCALE)
	panel.setColorTint(PANEL_TINT)
end

function rebuildControls()
	local panel = ensurePanel()
	if panel == nil then return end
	panel.clearButtons()
	panel.clearInputs()

	panel.createButton({
		label = 'Battlefields (2-4)',
		click_function = 'noop',
		function_owner = self,
		position = {0, 0.26, -0.70},
		rotation = {0, 0, 0},
		height = 0,
		width = 0,
		font_size = 158,
		font_color = {0.95, 0.95, 0.95, 100},
		color = {0, 0, 0, 0},
		tooltip = '',
	})

	panel.createButton({
		label = '▼',
		click_function = 'countDown',
		function_owner = self,
		position = {-0.62, 0.26, 0},
		rotation = {0, 0, 0},
		height = 315,
		width = 315,
		font_size = 218,
		color = {0.12, 0.12, 0.12, 0.95},
		font_color = {1, 1, 1, 1},
		tooltip = 'Decrease battlefield count',
	})

	panel.createButton({
		label = '▲',
		click_function = 'countUp',
		function_owner = self,
		position = {0.62, 0.26, 0},
		rotation = {0, 0, 0},
		height = 315,
		width = 315,
		font_size = 218,
		color = {0.12, 0.12, 0.12, 0.95},
		font_color = {1, 1, 1, 1},
		tooltip = 'Increase battlefield count',
	})

	panel.createInput({
		input_function = 'onCountTyped',
		function_owner = self,
		position = {0, 0.26, 0},
		rotation = {0, 0, 0},
		width = 218,
		height = 195,
		font_size = 143,
		value = tostring(count),
		validation = 2, -- integer
		alignment = 3, -- center
		tooltip = 'Type 2, 3, or 4',
	})
end

function isLayoutBusy()
	local bf = getBattlefieldController()
	if bf == nil then return false end
	local busy = false
	pcall(function() busy = bf.call('APIisLayoutBusy', {}) end)
	return busy and true or false
end

function decreaseIsDestructive()
	local bf = getBattlefieldController()
	if bf == nil then return false end
	local destructive = false
	pcall(function() destructive = bf.call('APIdecreaseIsDestructive', {}) end)
	return destructive and true or false
end

function countDown(_, playerColor, _)
	if count <= MIN_BATTLEFIELDS then return end
	if isLayoutBusy() then
		broadcastToColor('Battlefield layout is busy, try again in a moment.', playerColor, {1, 0.5, 0.1})
		return
	end

	-- Count rapid clicks (reset after 0.5s), mirroring the mulligan double-tap.
	nDownClick = (nDownClick or 0) + 1
	Wait.time(function() nDownClick = 0 end, 0.5)

	if decreaseIsDestructive() and nDownClick < 2 then
		if downSafety == nil then downSafety = true end
		if downSafety then
			broadcastToColor(
				'All lanes are occupied - removing the rightmost lane will pile its cards by the counter.\n'..
				'If you still want to remove a lane, [b]double-click[/b] the down button.',
				playerColor, {1, 0.5, 0.1})
			downSafety = false
			Wait.time(function() downSafety = true end, 10)
		end
		return
	end

	applyCount(count - 1, playerColor)
end

function countUp(_, playerColor, _)
	if count >= MAX_BATTLEFIELDS then return end
	if isLayoutBusy() then
		broadcastToColor('Battlefield layout is busy, try again in a moment.', playerColor, {1, 0.5, 0.1})
		return
	end
	applyCount(count + 1, playerColor)
end

function onCountTyped(_, playerColor, inputValue, stillEditing)
	if stillEditing then return end
	local typed = tonumber(inputValue)
	if typed == nil or math.floor(typed) ~= typed then
		broadcastToColor('Enter a whole number: 2, 3, or 4.', playerColor, {1, 0.5, 0.1})
		rebuildControls()
		return
	end
	if typed < MIN_BATTLEFIELDS or typed > MAX_BATTLEFIELDS then
		broadcastToColor('Battlefields must be between 2 and 4.', playerColor, {1, 0.5, 0.1})
		rebuildControls()
		return
	end
	applyCount(typed, playerColor)
end

function noop()
end
