-- Auto-enable the πCounter property when dragged from the bag.
-- toggleProp (the πCounter activateFunc) replaces this script with the
-- onNumberTyped handler and reloads, so this only runs on a fresh spawn.
function onLoad(saved_data)
	local script = "self.max_typed_number=999 function onNumberTyped(ply, int) enc = Global.getVar('Encoder') if enc ~= nil then enc.call('APIobjSetValueData',{obj=self,valueID='picounter',data={picounter=int}}) enc.call('APIrebuildButtons',{obj=self}) return true end end"
	Wait.condition(
		function()
			local enc = Global.getVar('Encoder')
			if enc.call("APIobjectExists", {obj=self}) then return end
			enc.call("APIencodeObject", {obj=self})
			enc.call("APIobjEnableProp", {obj=self, propID="πCounter"})
			enc.call("APIobjSetValueData", {obj=self, valueID='picounter', data={picounter=0}})
			local obj = self
			obj.setLuaScript(script)
			obj = obj.reload()
			Wait.condition(function()
				enc.call("APIobjUpdateThis", {obj=obj})
				enc.call("APIrebuildButtons", {obj=obj})
			end, function() return not(obj.spawning) end)
		end,
		function()
			local enc = Global.getVar('Encoder')
			return enc ~= nil and enc.call("APIpropertyExists", {propID="πCounter"})
		end
	)
end
