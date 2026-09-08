--[[
"Riftbound Tokens" spawner.

Riftbound has exactly three tokens — Gold (Gear), Recruit and Sprite (both
Units) — so this is a fixed list, not a search problem. The widget is an
invisible locked BlockSquare sitting where the pile used to sit; its button is
the only part you see. Clicking it drops a fresh three-card pile on the spot.

Every click spawns another pile. A pile is drawable, so it empties as players
take tokens from it, and clicking again is how you refill — which is why this
keeps no record of what the last click produced.

The deck shape is the one 80c03d_riftbound_card_importer.lua builds: one
CustomDeck entry per card with NumWidth/NumHeight 1 and BackIsHidden, contained
objects named Card, and CardID as the deck key × 100. Copying the importer
rather than inventing a shape means the pile matches what the deck loader puts
on the table.

Nothing here carries a GUID. TTS assigns fresh ones on spawn, and hard-coding
them would collide on the second click.

Duplicated at 70c101 (left column) and 70c102 (right), the way the four score
trackers and six domain counters are: TTS gives an object script no way to
import a shared one.
]]

-- CARD_BACK_NORMAL, the same back the importer gives a spawned deck.
local CARD_BACK = "https://steamusercontent-a.akamaihd.net/ugc/17923936841557333394/E61E2190D4439BC190F2B572BBD6D36C0B487565/"

local DECK_NICKNAME    = "Riftbound Tokens"
local DECK_DESCRIPTION = "Gold, Recruit and Sprite."

-- Face art is Riot CMS, the same URLs the Riftseer API serves for these three.
local TOKENS = {
	{
		key         = 9001,
		name        = "Gold",
		description = "Riftbound Gear token",
		face        = "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/e878c39b562a4e870e93b819c6d85cdf3fdc5238-744x1039.png?accountingTag=RB",
	},
	{
		key         = 9002,
		name        = "Recruit",
		description = "Riftbound Unit token",
		face        = "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/7c3362dc6e6e6fb724ef31b061a44d2976f5b01f-744x1039.png",
	},
	{
		key         = 9003,
		name        = "Sprite",
		description = "Riftbound Unit token",
		face        = "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/055892752559d2d3d32e76f491a7a0b540e1a669-744x1039.png?accountingTag=RB",
	},
}

local IDENTITY_TRANSFORM = {
	posX = 0, posY = 0, posZ = 0,
	rotX = 0, rotY = 0, rotZ = 0,
	scaleX = 1, scaleY = 1, scaleZ = 1,
}

local function deckEntry(token)
	return {
		FaceURL      = token.face,
		BackURL      = CARD_BACK,
		NumWidth     = 1,
		NumHeight    = 1,
		BackIsHidden = true,
	}
end

-- A DeckCustom carries every card's deck entry; each contained card carries
-- only its own. Both are required — a card without its entry spawns blank.
local function tokenDeckData()
	local customDeck = {}
	local deckIDs    = {}
	local contained  = {}

	for _, token in ipairs(TOKENS) do
		local key    = tostring(token.key)
		local cardID = token.key * 100

		customDeck[key] = deckEntry(token)
		table.insert(deckIDs, cardID)
		table.insert(contained, {
			Name             = "Card",
			Nickname         = token.name,
			Description      = token.description,
			Transform        = IDENTITY_TRANSFORM,
			CardID           = cardID,
			SidewaysCard     = false,
			HideWhenFaceDown = true,
			Hands            = true,
			CustomDeck       = { [key] = deckEntry(token) },
		})
	end

	return {
		Name             = "DeckCustom",
		Nickname         = DECK_NICKNAME,
		Description      = DECK_DESCRIPTION,
		Transform        = IDENTITY_TRANSFORM,
		SidewaysCard     = false,
		HideWhenFaceDown = true,
		Hands            = false,
		DeckIDs          = deckIDs,
		CustomDeck       = customDeck,
		ContainedObjects = contained,
	}
end

function spawnTokenPile()
	local position = self.getPosition()

	spawnObjectData({
		data     = tokenDeckData(),
		-- Drop it in rather than intersecting whatever is already on the spot.
		position = { x = position.x, y = position.y + 1.5, z = position.z },
		rotation = self.getRotation(),
	})
end

function onLoad()
	-- The block is a button anchor, not a game piece: invisible, static, and
	-- not something a player can pick up or drop a card onto by accident.
	self.setColorTint({ 1, 1, 1, 0 })
	self.setLock(true)
	self.interactable = false

	self.createButton({
		click_function = "spawnTokenPile",
		function_owner = self,
		label          = "Riftbound\nTokens",
		tooltip        = "Spawn a pile of the three Riftbound tokens.",
		position       = { 0, 0.6, 0 },
		rotation       = { 0, 0, 0 },
		width          = 1100,
		height         = 620,
		font_size      = 180,
		color          = { 0.05, 0.08, 0.14, 0.92 },
		font_color     = { 0, 0.71, 1, 1 },
	})
end
