--[[
"Infinite 'Bag' Riftbound Deck Loader" by DXHHH101
Adapted for Riftbound TCG.
]]

local ScriptVersion = "1.0.0"

-- ============================================================================
-- LIFECYCLE
-- ============================================================================
local function patchFirstPulledObject()
	self.takeObject({
		position = self.getPosition() + Vector(0, -1000, 0),
		smooth = false,
		callback_function = function(obj)
			local objGUID = obj.getGUID()
			local cancelWait = false
			obj.setLock(true)

			self.setName("[00B4FF]Riftbound Deck Loader[-] [EF8B06]DX[-]")

			Wait.frames(function()
				self.setDescription(obj.getDescription())
			end, 1)

			Wait.condition(
				function()
					if cancelWait then
						return
					end

					local newObjectRef = getObjectFromGUID(objGUID)
					if not newObjectRef or newObjectRef.isDestroyed() then
						return
					end

					self.reset()
					newObjectRef.setLock(false)

					Wait.frames(function()
						self.setDescription(newObjectRef.getDescription())
						self.putObject(newObjectRef)
					end, 1)

				end,
				function()
					local newObjectRef = getObjectFromGUID(objGUID)

					if not newObjectRef or newObjectRef.isDestroyed() then
						return false
					end

					local updateFinished = newObjectRef.getVar("updateFinished")

					if updateFinished == true then
						return true
					elseif updateFinished == "kill" then
						newObjectRef.destruct()
						cancelWait = true
						return true
					end

					return false
				end,
				20,
				function()
					local newObjectRef = getObjectFromGUID(objGUID)
					if newObjectRef and not newObjectRef.isDestroyed() then
						self.setName("[00B4FF]Riftbound Deck Loader[-] [EF8B06]DX[-]")
						newObjectRef.destruct()
					end
				end
			)
		end
	})
end

function onLoad(script_state)
	patchFirstPulledObject()
end
