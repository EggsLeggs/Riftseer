--[[
"Riftbound Deck Loader"
Originally adapted from DXHHH101's Tabletop Simulator importer
(https://github.com/DXHHH101/TabletopSimulatorScripts)
Credit to Omes and Amuzet for the original importer architecture.

The playmat that imports Riftbound decks. Requires "Riftbound Card Importer"
(80c03d) to be present on the table.

Supported import sources:
 - piltoverarchive.com  (URL import)
 - Player Notebook      (manual decklist)
]]

-- ============================================================================
-- UI CONSTANTS / UI IDS
-- ============================================================================
local UI_ADVANCED_PANEL = "RiftboundDeckLoaderAdvancedPanel"

-- ============================================================================
-- RUNTIME STATE
-- ============================================================================
local playerColor = nil

local advanced              = false
local cardBackInput         = ""
local spawnEverythingFaceDown = false
local skipSideboard         = false

local pendingDeckSpawns = 0
local spawnStagingIndex = 0

-- ============================================================================
-- CONSTANTS (URLS, POSITIONS, CARD BACKS)
-- ============================================================================
local PILTOVERARCHIVE_API_BASE  = "https://piltoverarchive.com"
local PILTOVERARCHIVE_URL_MATCH = "piltoverarchive%.com"

-- Grid layout  (x=1.25=left, x=-1.25=right, z=-1.010=top, z=0.145=bottom)
-- Top row:    Sideboard | Battlefields | Tokens
-- Bottom row: Legend + Champion (stacked) | Runes | Maindeck
local SIDEBOARD_POSITION_OFFSET   = { 1.25, 0.1, -1.010}
local BATTLEFIELD_POSITION_OFFSET = { 0.0,  0.1, -1.010}
local TOKEN_POSITION_OFFSET       = {-1.25, 0.1, -1.010}
local LEGEND_POSITION_OFFSET      = { 1.25, 0.1,  0.145}
local CHAMPION_POSITION_OFFSET    = { 1.25, 0.1,  0.145}  -- same as legend → stacked
local RUNE_POSITION_OFFSET        = { 0.0,  0.1,  0.145}
local MAINDECK_POSITION_OFFSET    = {-1.25, 0.1,  0.145}

local CARD_BACK_NORMAL      = "https://steamusercontent-a.akamaihd.net/ugc/17923936841557333394/E61E2190D4439BC190F2B572BBD6D36C0B487565/"
local CARD_BACK_LEGEND      = "https://steamusercontent-a.akamaihd.net/ugc/10828317924251492828/9B8428F7932F27440F9332D8E8D9103A6EA3C155/"
local CARD_BACK_RUNE        = "https://steamusercontent-a.akamaihd.net/ugc/9393316991583067772/10DEFFBA73258C75462E90EA5ACA4DC95176590C/"
-- Battlefield cards spawn rotated 90° Y so the landscape front looks correct.
-- The back image must also be landscape (pre-rotated 90°) to appear portrait when flipped.
-- Replace with a URL that hosts a 90°-rotated version of the normal card back.
local CARD_BACK_BATTLEFIELD = "https://steamusercontent-a.akamaihd.net/ugc/10194552971616474255/FB2A81006CA8DE6E7E2191374D0AB9D56A19D1F4/"

local ERROR_MESSAGE_DECKLOADER = "Riftbound Deck Loader Error: "

-- ============================================================================
-- ERROR / LOGGING HELPERS
-- ============================================================================
local function printError(str, pc)
	if pc then
		printToColor(str, pc, {r=1, g=0, b=0})
	else
		printToAll(str, {r=1, g=0, b=0})
	end
	lockSelf(false)
end

-- Non-fatal warning: prints in orange-red but does NOT unlock the importer.
local function printWarn(str, pc)
	if pc then
		printToColor(str, pc, {r=1, g=0.4, b=0})
	else
		printToAll(str, {r=1, g=0.4, b=0})
	end
end

local function printInfo(str, pc)
	if pc then
		printToColor(str, pc)
	else
		printToAll(str)
	end
end

-- ============================================================================
-- MODULE DEPENDENCY
-- ============================================================================
local RiftboundImporter = nil

local function getRiftboundImporter()
	RiftboundImporter = Global.getVar("RiftboundImporter")
	if RiftboundImporter then
		return true
	else
		printError(ERROR_MESSAGE_DECKLOADER .. 'Missing "Riftbound Card Importer"', playerColor)
		return false
	end
end

-- ============================================================================
-- LOCKING / UNLOCKING
-- ============================================================================
function lockSelf(state)
	self.setLock(state)
end

local function lockImporter(state)
	if not getRiftboundImporter() then return end
	RiftboundImporter.call("lockImporter", state)
end

-- ============================================================================
-- BASIC UTILITIES
-- ============================================================================
local function trim(s)
	if not s then return "" end
	local n = s:find("%S")
	return n and s:match(".*%S", n) or ""
end

local function stringToBool(s)
	return (string.lower(s) == "true")
end

local function iterateLines(s)
	if not s or string.len(s) == 0 then
		return ipairs({})
	end
	if s:sub(-1) ~= '\n' then
		s = s .. '\n'
	end
	local pos = 1
	return function()
		if not pos then return nil end
		local p1, p2 = s:find("\r?\n", pos)
		local line
		if p1 then
			line = s:sub(pos, p1 - 1)
			pos = p2 + 1
		else
			line = s:sub(pos)
			pos = nil
		end
		return line
	end
end

local function iterateTokens(s)
	if not s or string.len(s) == 0 then
		return ipairs({})
	end
	local pos = 1
	return function()
		while pos <= #s do
			local startPos, endPos = s:find("%S+", pos)
			if not startPos then
				pos = #s + 1
				return nil
			end
			pos = endPos + 1
			return s:sub(startPos, endPos)
		end
		return nil
	end
end

local function createEmptyCardMapEntry(name)
	return {
		name            = name,
		legendQty       = 0,
		championQty     = 0,
		battlefieldQty  = 0,
		runeQty         = 0,
		sideboardQty    = 0,
		mainboardQty    = 0,
		variantImageURL = nil,
	}
end

local function addCardQty(cardMap, cardName, qtyField, qty, variantImageURL)
	if not cardMap[cardName] then
		cardMap[cardName] = createEmptyCardMapEntry(cardName)
	end
	local entry = cardMap[cardName]
	if variantImageURL and not entry.variantImageURL then
		entry.variantImageURL = variantImageURL
	end
	entry[qtyField] = (entry[qtyField] or 0) + (qty or 0)
end

local function addMetadataValues(parts, seen, value)
	if value == nil then return end
	local valueType = type(value)
	if valueType == "table" then
		if value.name or value.slug or value.value then
			addMetadataValues(parts, seen, value.name or value.slug or value.value)
		else
			for key, item in pairs(value) do
				if type(item) == "boolean" and item then
					addMetadataValues(parts, seen, key)
				else
					addMetadataValues(parts, seen, item)
				end
			end
		end
	elseif valueType == "string" or valueType == "number" then
		local text = trim(tostring(value))
		if text ~= "" and not seen[string.lower(text)] then
			seen[string.lower(text)] = true
			parts[#parts+1] = text
		end
	end
end

local function metadataString(...)
	local parts = {}
	local seen = {}
	for i = 1, select("#", ...) do
		addMetadataValues(parts, seen, select(i, ...))
	end
	return table.concat(parts, " ")
end

local function appendMetadataLine(desc, label, value)
	if value == "" then return desc end
	if desc ~= "" then desc = desc .. "\n" end
	return desc .. "[i]" .. label .. ": " .. value .. "[/i]"
end

local function makeNameKeyedCardMap(nameList)
	local cardMap = {}
	for _, cardName in ipairs(nameList or {}) do
		cardMap[cardName] = {name = cardName}
	end
	return cardMap
end

local function hasWord(haystack, needle)
	if not haystack or haystack == "" then return false end
	return haystack:find("%f[%a]" .. needle .. "%f[%A]") ~= nil
end

-- `resolved` is one `/cards/resolve` result: the oracle carries the rules, the
-- printing carries the cardboard. Which zone a card spawns into is a rules
-- question, so everything here reads the oracle.
local function classifyResolvedCard(resolved)
	local oracle = resolved and resolved.oracle
	local classificationBlob = metadataString(
		oracle and oracle.supertype,
		oracle and oracle.card_type,
		oracle and oracle.tags
	):lower()

	if hasWord(classificationBlob, "legend") then return "legend" end
	if hasWord(classificationBlob, "champion") then return "champion" end
	if hasWord(classificationBlob, "battlefield") then return "battlefield" end
	if hasWord(classificationBlob, "rune") then return "rune" end
	return "mainboard"
end

local notebookImportCategoryMap = {
	legend      = { qtyField = "legendQty"      },
	champion    = { qtyField = "championQty"    },
	champions   = { qtyField = "championQty"    },
	battlefield = { qtyField = "battlefieldQty" },
	battlefields= { qtyField = "battlefieldQty" },
	rune        = { qtyField = "runeQty"        },
	runes       = { qtyField = "runeQty"        },
	sideboard   = { qtyField = "sideboardQty"   },
	deck        = { qtyField = "mainboardQty"   },
	maindeck    = { qtyField = "mainboardQty"   },
	mainboard   = { qtyField = "mainboardQty"   },
	about       = { qtyField = nil              },
}

local function parseSectionedDeckTextToCardMap(deckText)
	local cardMap = {}
	local qtyField = "mainboardQty"
	local inAbout = false

	for line in iterateLines(deckText or "") do
		if string.len(line) > 0 and not inAbout then
			local categoryCheck = trim(line):lower():gsub(":$", "")
			local entryCheck = notebookImportCategoryMap[categoryCheck]
			if entryCheck then
				if entryCheck.qtyField == nil then
					inAbout = true
				else
					qtyField = entryCheck.qtyField
				end
			else
				local qtyStr, afterIdx = line:match("^%s*(%d+)%s*[x%*]?%s+()")
				local qty = 1
				local rest = line
				if qtyStr then
					qty  = tonumber(qtyStr) or 1
					rest = trim(line:sub(afterIdx))
				else
					rest = trim(line)
				end

				if rest ~= "" then
					local variantImageURL = nil
					-- Parse optional suffix "Card Name (SET) 123" without heavy patterns.
					local closeParenAt = rest:find("%)%s+[%w%-]+$")
					if closeParenAt then
						local openParenAt = rest:find("%(", 1, true)
						if openParenAt and openParenAt < closeParenAt then
							local baseName = trim(rest:sub(1, openParenAt - 1))
							local setCode  = trim(rest:sub(openParenAt + 1, closeParenAt - 1))
							local collNum  = trim(rest:sub(closeParenAt + 1))
							if baseName ~= "" and setCode:match("^[A-Za-z]+$") and collNum ~= "" then
								rest = baseName
								variantImageURL = "https://cdn.piltoverarchive.com/cards/" .. setCode .. "-" .. collNum .. ".webp"
							end
						end
					end
					addCardQty(cardMap, rest, qtyField, qty, variantImageURL)
				end
			end
		end
	end

	return cardMap
end

local function parseTTSCodeTextToCardMap(deckText)
	local cardMap = {}
	local invalidTokens = {}
	for rawToken in iterateTokens(deckText or "") do
		local token = trim(rawToken):gsub("[,;]", "")
		if token ~= "" then
			if token:match("^[A-Za-z0-9]+%-%d+%-%d+$") then
				addCardQty(cardMap, token, "mainboardQty", 1)
			else
				invalidTokens[#invalidTokens+1] = token
			end
		end
	end
	return cardMap, invalidTokens
end

local function countTTSCodeLikeTokens(text)
	local count = 0
	for rawToken in iterateTokens(text or "") do
		local token = trim(rawToken):gsub("[,;]", "")
		if token:match("^[A-Za-z0-9]+%-%d+%-%d+$") then
			count = count + 1
		end
	end
	return count
end

local function normalizeCollectorNumber(collector)
	local asNumber = tonumber(collector)
	if asNumber then
		return tostring(asNumber)
	end
	return trim(tostring(collector or ""))
end

local function buildCodeMetadataMapFromTTSCardMap(ttsCodeCardMap)
	local codeMetaBySet = {}
	for codeToken, entry in pairs(ttsCodeCardMap or {}) do
		local setCode, collectorNum = codeToken:match("^([A-Za-z0-9]+)%-(%d+)%-%d+$")
		if setCode and collectorNum then
			setCode = string.upper(setCode)
			local normalizedCollector = normalizeCollectorNumber(collectorNum)
			local qty = entry.mainboardQty or 0
			if qty > 0 then
				if not codeMetaBySet[setCode] then codeMetaBySet[setCode] = {} end
				codeMetaBySet[setCode][normalizedCollector] =
					(codeMetaBySet[setCode][normalizedCollector] or 0) + qty
			end
		end
	end
	return codeMetaBySet
end

-- ============================================================================
-- RIFTSEER CARD DATA → TTS ENTRY
-- ============================================================================
-- One `/cards/resolve` result becomes one TTS card: the nickname and
-- The API sends the full variant set only for art hosted in R2. Unhosted
-- printings carry `original` alone, so reading `.normal` directly finds
-- nothing and the card spawns blank. This is SIZE_FALLBACKS.normal from
-- packages/types/src/card-image.ts, the ladder every other client walks.
local function printingImageURL(printing)
	local image = printing and printing.image
	if not image then return nil end
	for _, key in ipairs({'normal', 'large', 'small', 'original'}) do
		local url = image[key]
		if type(url) == 'string' and url ~= '' then return url end
	end
	return nil
end

-- description come from the oracle, the face image from the printing resolve
-- picked. The oracle's other printings ride along so a dead image URL can fall
-- back to another edition without a second lookup.
local function resolvedCardToEntry(resolved, qty)
	local oracle   = resolved.oracle or {}
	local printing = resolved.printing or {}
	local name = oracle.name or "Unknown"

	local typeStr = metadataString(oracle.supertype, oracle.card_type)

	local desc = ""
	if oracle.text and oracle.text.plain and oracle.text.plain ~= "" then
		desc = oracle.text.plain
	end

	local statParts = {}
	if oracle.energy then statParts[#statParts+1] = "Energy: " .. tostring(oracle.energy) end
	if oracle.might  then statParts[#statParts+1] = "Might: "  .. tostring(oracle.might)  end
	if #statParts > 0 then
		if desc ~= "" then desc = desc .. "\n" end
		desc = desc .. table.concat(statParts, " | ")
	end

	desc = appendMetadataLine(desc, "Tags", metadataString(oracle.tags))

	local imageURL = printingImageURL(printing)

	local nickname = name
	if typeStr ~= "" then
		nickname = name .. "\n" .. typeStr
	end

	return {
		name        = nickname,
		description = desc,
		imageURL    = imageURL,
		printings   = oracle.printings or {},
		qty         = qty or 1,
	}
end

-- ============================================================================
-- SPAWNING
-- ============================================================================
local RIFTSEER_API_BASE = "https://api.riftseer.com"
-- Search clamps `limit` to 100 rows, so a set listing arrives in pages.
-- SET_PAGE_CAP bounds the walk in case a `total` ever outruns the rows.
local SET_PAGE_SIZE = 100
local SET_PAGE_CAP  = 2000

local function spawnDeckIfAny(decklist, options)
	if not decklist or #decklist == 0 then return nil end
	if not getRiftboundImporter() then return end

	local rotation = self.getRotation()
	rotation.z = options.isFlipped and 180 or 0
	if options.rotatePortrait then
		rotation.y = rotation.y + 90
	end

	-- Each spawn gets a unique x offset so no two piles share the same staging
	-- position at y+1000. Colliding objects at that height can cause TTS to
	-- merge them, silently swallowing one spawnObjectData callback and leaving
	-- the board locked forever. The callback's setPosition corrects the final
	-- position regardless of staging offset.
	spawnStagingIndex = spawnStagingIndex + 1
	local tempPosition = {
		x = options.position.x + (spawnStagingIndex * 10),
		y = options.position.y + 1000,
		z = options.position.z,
	}

	local function calcNewPosition(deckObj, oldPosition)
		local cardCount = 1
		if deckObj.tag == "Deck" and deckObj.getObjects then
			local objs = deckObj.getObjects()
			if objs then
				cardCount = #objs
				if cardCount > 213 then cardCount = 213 end
			end
		end
		local CARD_THICKNESS = 0.01
		local estimatedThickness = cardCount * CARD_THICKNESS
		return {
			x = oldPosition.x,
			y = oldPosition.y + (estimatedThickness / 2),
			z = oldPosition.z,
		}
	end

	local function completedDeckSpawn()
		pendingDeckSpawns = pendingDeckSpawns - 1
		if pendingDeckSpawns <= 0 then
			printInfo("Deck successfully imported!", playerColor)
			lockSelf(false)
		end
	end

	local function doSpawn(validatedDecklist)
		local function nonEmpty(s) return (s and s ~= "") and s or nil end
		local bundledData = {
			decklistArray = validatedDecklist,
			cardBack      = nonEmpty(getCardBack()) or nonEmpty(options.cardBack) or CARD_BACK_NORMAL,
		}

		local deckData = RiftboundImporter.call("createDeckObject", bundledData)
		if not deckData then
			printError(ERROR_MESSAGE_DECKLOADER .. "createDeckObject returned nil", playerColor)
			completedDeckSpawn()
			return
		end

		if deckData.ContainedObjects and #deckData.ContainedObjects > 1 then
			deckData.Nickname = options.deckName or ""
		end

		spawnObjectData({
			data     = deckData,
			position = tempPosition,
			rotation = rotation,
			callback_function = function(obj)
				obj.setPosition(calcNewPosition(obj, options.position))
				if options.scale then obj.setScale(options.scale) end
				if options.onSpawn then options.onSpawn(obj) end
				completedDeckSpawn()
			end,
		})
	end

	-- For a card whose main image URL is unreachable, walk the oracle's other
	-- printings until one of their images loads. Resolve already sent every
	-- printing with its image, so this needs no further API call.
	local function fetchPrintingFallback(entry, callback)
		local printings = entry.printings or {}
		local i = 1
		local function tryNext()
			if i > #printings then callback(nil) return end
			local printing = printings[i]
			i = i + 1
			local imgURL = printingImageURL(printing)
			if not imgURL or imgURL == entry.imageURL then tryNext() return end
			WebRequest.get(imgURL, function(imgResp)
				if imgResp.response_code == 200 then
					callback(imgURL)
				else
					tryNext()
				end
			end)
		end
		tryNext()
	end

	-- Phase 1: HEAD-check each unique non-nil image URL concurrently.
	--          For any that fail, try the card's related printings.
	-- Phase 1b: For cards whose primary resolve had no image URL at all,
	--           try their related printings directly (e.g. OPP promo runes).
	-- Spawn only once all URLs are resolved.
	local uniqueURLs = {}
	local seen = {}
	for _, entry in ipairs(decklist) do
		local url = entry.imageURL
		if url and url ~= "" and not seen[url] then
			seen[url] = true
			uniqueURLs[#uniqueURLs+1] = url
		end
	end

	-- Entries with no imageURL but with related printings to try.
	local nilImageEntries = {}
	local seenNilName = {}
	for _, entry in ipairs(decklist) do
		if (not entry.imageURL or entry.imageURL == "") and
		   entry.printings and #entry.printings > 0 and
		   not seenNilName[entry.name] then
			seenNilName[entry.name] = true
			nilImageEntries[#nilImageEntries+1] = entry
		end
	end

	if #uniqueURLs == 0 and #nilImageEntries == 0 then
		doSpawn(decklist)
		return
	end

	local resolvedURLs = {}       -- original imageURL -> final URL (nil = use card back)
	local nilEntryResolvedURLs = {} -- entry.name -> resolved URL for nil-imageURL entries
	local remaining = #uniqueURLs + #nilImageEntries

	local function onAllResolved()
		local validatedDecklist = {}
		for _, entry in ipairs(decklist) do
			local finalURL
			if entry.imageURL and entry.imageURL ~= "" then
				finalURL = resolvedURLs[entry.imageURL]
			else
				finalURL = nilEntryResolvedURLs[entry.name]
			end
			validatedDecklist[#validatedDecklist+1] = {
				name        = entry.name,
				description = entry.description,
				imageURL    = finalURL,
				qty         = entry.qty,
			}
		end
		doSpawn(validatedDecklist)
	end

	for _, url in ipairs(uniqueURLs) do
		WebRequest.get(url, function(resp)
			if resp.response_code == 200 then
				resolvedURLs[url] = url
				remaining = remaining - 1
				if remaining == 0 then onAllResolved() end
			else
				-- Find the first entry that uses this URL to try its printings.
				local failedEntry = nil
				for _, entry in ipairs(decklist) do
					if entry.imageURL == url then
						failedEntry = entry
						break
					end
				end
				if failedEntry and failedEntry.printings and #failedEntry.printings > 0 then
					fetchPrintingFallback(failedEntry, function(fallbackURL)
						resolvedURLs[url] = fallbackURL
						remaining = remaining - 1
						if remaining == 0 then onAllResolved() end
					end)
				else
					resolvedURLs[url] = nil
					remaining = remaining - 1
					if remaining == 0 then onAllResolved() end
				end
			end
		end)
	end

	-- For nil-imageURL entries, go straight to related printings.
	for _, entry in ipairs(nilImageEntries) do
		fetchPrintingFallback(entry, function(fallbackURL)
			nilEntryResolvedURLs[entry.name] = fallbackURL
			remaining = remaining - 1
			if remaining == 0 then onAllResolved() end
		end)
	end
end

-- ============================================================================
-- RIFTSEER RESOLUTION BRIDGE
-- ============================================================================
local function loadDeckFromMainModule(cardMap, callbackName, options)
	if not options then options = {} end

	-- Extract unique card names from the cardMap.
	local uniqueNames = {}
	for _, entry in pairs(cardMap) do
		if entry.name then
			uniqueNames[#uniqueNames+1] = entry.name
		end
	end

	if not getRiftboundImporter() then return end

	RiftboundImporter.call("loadDeckFromRiftseer", {
		names       = uniqueNames,
		callerGUID  = self.getGUID(),
		onSuccess   = callbackName,
		playerColor = playerColor,
		passThroughData = (function()
			local passThroughData = options.passThroughData or {}
			passThroughData.cardMap = cardMap
			passThroughData.deckName = options.deckName or passThroughData.deckName or ""
			return passThroughData
		end)(),
	})
end

local function spawnResolvedDecks(data)
	local legendList       = data.legendList or {}
	local championList     = data.championList or {}
	local battlefieldList  = data.battlefieldList or {}
	local runeList         = data.runeList or {}
	local sideboardList    = data.sideboardList or {}
	local mainboardList    = data.mainboardList or {}
	local tokenList        = data.tokenList or {}
	local deckName         = data.deckName or ""
	local shouldSpawnSideboard = data.shouldSpawnSideboard == true
	local stackChampionsOnMainDeck = data.stackChampionsOnMainDeck == true
	local shuffleMainboard = data.shuffleMainboard ~= false

	if stackChampionsOnMainDeck and #championList > 0 then
		local mergedMainboard = {}
		for _, entry in ipairs(mainboardList) do mergedMainboard[#mergedMainboard+1] = entry end
		for _, entry in ipairs(championList) do mergedMainboard[#mergedMainboard+1] = entry end
		mainboardList = mergedMainboard
		championList = {}
		shuffleMainboard = false
	end

	pendingDeckSpawns = 0
	spawnStagingIndex = 0
	local listsToSpawn = {legendList, championList, battlefieldList, runeList, mainboardList, tokenList}
	if shouldSpawnSideboard then
		listsToSpawn[#listsToSpawn + 1] = sideboardList
	end
	for _, list in ipairs(listsToSpawn) do
		if #list > 0 then pendingDeckSpawns = pendingDeckSpawns + 1 end
	end

	-- Front row
	if shouldSpawnSideboard then
		spawnDeckIfAny(sideboardList, {
			position = self.positionToWorld(SIDEBOARD_POSITION_OFFSET),
			isFlipped = spawnEverythingFaceDown,
			deckName = "Sideboard",
			cardBack = CARD_BACK_NORMAL,
		})
	end
	spawnDeckIfAny(battlefieldList, {
		position = self.positionToWorld(BATTLEFIELD_POSITION_OFFSET),
		isFlipped = spawnEverythingFaceDown,
		deckName = "Battlefields",
		cardBack = CARD_BACK_BATTLEFIELD,
		rotatePortrait = true,
		scale = {0.700, 1, 0.700},
	})
	spawnDeckIfAny(tokenList, {
		position = self.positionToWorld(TOKEN_POSITION_OFFSET),
		isFlipped = spawnEverythingFaceDown,
		deckName = "Tokens",
		cardBack = CARD_BACK_NORMAL,
	})

	-- Back row (legend + champion both spawn at LEGEND_POSITION — TTS stacks them)
	spawnDeckIfAny(legendList, {
		position = self.positionToWorld(LEGEND_POSITION_OFFSET),
		isFlipped = spawnEverythingFaceDown,
		deckName = "Legends",
		cardBack = CARD_BACK_LEGEND,
	})
	spawnDeckIfAny(championList, {
		position = self.positionToWorld(CHAMPION_POSITION_OFFSET),
		isFlipped = spawnEverythingFaceDown,
		deckName = "Champions",
		cardBack = CARD_BACK_NORMAL,
	})
	spawnDeckIfAny(runeList, {
		position = self.positionToWorld(RUNE_POSITION_OFFSET),
		isFlipped = spawnEverythingFaceDown,
		deckName = "Runes",
		cardBack = CARD_BACK_RUNE,
	})
	spawnDeckIfAny(mainboardList, {
		position = self.positionToWorld(MAINDECK_POSITION_OFFSET),
		isFlipped = true,
		deckName = deckName,
		cardBack = CARD_BACK_NORMAL,
		onSpawn = function(obj)
			if shuffleMainboard then obj.shuffle() end
		end,
	})
end

-- ============================================================================
-- POST-LOAD CALLBACKS
-- ============================================================================

function postDeckLoadTokens(bundledData)
	local resolvedByName = bundledData.resolvedByName or {}
	local passThrough = bundledData.passThroughData or {}
	local tokenNameList = passThrough.tokenNameList or {}
	local tokenList = {}
	local missingTokenCount = 0

	for _, tokenName in ipairs(tokenNameList) do
		local resolvedToken = resolvedByName[tokenName]
		if resolvedToken then
			local entry = resolvedCardToEntry(resolvedToken, 1)
			entry.qty = 1
			tokenList[#tokenList+1] = entry
		else
			missingTokenCount = missingTokenCount + 1
			printWarn("Token card not found, skipping: " .. tostring(tokenName), playerColor)
		end
	end

	spawnResolvedDecks({
		legendList = passThrough.legendList or {},
		championList = passThrough.championList or {},
		battlefieldList = passThrough.battlefieldList or {},
		runeList = passThrough.runeList or {},
		sideboardList = passThrough.sideboardList or {},
		mainboardList = passThrough.mainboardList or {},
		tokenList = tokenList,
		deckName = passThrough.deckName or "",
		shouldSpawnSideboard = passThrough.shouldSpawnSideboard == true,
		stackChampionsOnMainDeck = passThrough.stackChampionsOnMainDeck == true,
		shuffleMainboard = passThrough.shuffleMainboard ~= false,
	})
end

-- The tokens a card makes are `makes_tokens` edges on its oracle. A token that
-- itself makes tokens is not walked, so the chase stops at one level.
local function collectTokenNamesFromResolvedCard(resolved, tokenNames, seenTokenNames)
	local oracle = resolved.oracle
	if not oracle or oracle.is_token == true then return end
	local makesTokens = oracle.relationships and oracle.relationships.makes_tokens
	if type(makesTokens) ~= "table" then return end
	for _, token in ipairs(makesTokens) do
		local tokenName = trim(tostring(token.name or ""))
		local tokenKey = token.id and ("id:" .. tostring(token.id)) or ("name:" .. string.lower(tokenName))
		if tokenName ~= "" and not seenTokenNames[tokenKey] then
			seenTokenNames[tokenKey] = true
			tokenNames[#tokenNames+1] = tokenName
		end
	end
end

local function buildResolvedDeckBuckets(cardMap, resolvedByName, options)
	options = options or {}
	local legendList, championList, battlefieldList = {}, {}, {}
	local runeList, sideboardList, mainboardList    = {}, {}, {}
	local tokenNames, seenTokenNames = {}, {}

	for _, cardMapData in pairs(cardMap or {}) do
		local resolved = resolvedByName[cardMapData.name]
		if not resolved then
			printWarn("Card not found, skipping: " .. tostring(cardMapData.name), playerColor)
		else
			if options.autoClassifyMainboard then
				local qty = cardMapData.mainboardQty or 0
				if qty > 0 then
					local bucket = classifyResolvedCard(resolved)
					if bucket == "legend" then
						cardMapData.legendQty = (cardMapData.legendQty or 0) + qty
						cardMapData.mainboardQty = 0
					elseif bucket == "champion" then
						cardMapData.championQty = (cardMapData.championQty or 0) + qty
						cardMapData.mainboardQty = 0
					elseif bucket == "battlefield" then
						cardMapData.battlefieldQty = (cardMapData.battlefieldQty or 0) + qty
						cardMapData.mainboardQty = 0
					elseif bucket == "rune" then
						cardMapData.runeQty = (cardMapData.runeQty or 0) + qty
						cardMapData.mainboardQty = 0
					end
					-- bucket == "mainboard": keep mainboardQty so units/spells spawn in main deck
				end
			end

			local function push(list, qtyField)
				local qty = cardMapData[qtyField] or 0
				if qty > 0 then
					local entry = resolvedCardToEntry(resolved, qty)
					if cardMapData.variantImageURL then
						entry.imageURL  = cardMapData.variantImageURL
						entry.printings = {}
					end
					list[#list+1] = entry
				end
			end

			push(legendList,      "legendQty")
			push(championList,    "championQty")
			push(battlefieldList, "battlefieldQty")
			push(runeList,        "runeQty")
			push(sideboardList,   "sideboardQty")
			push(mainboardList,   "mainboardQty")
			collectTokenNamesFromResolvedCard(resolved, tokenNames, seenTokenNames)
		end
	end

	return {
		legendList = legendList,
		championList = championList,
		battlefieldList = battlefieldList,
		runeList = runeList,
		sideboardList = sideboardList,
		mainboardList = mainboardList,
		tokenNames = tokenNames,
	}
end

-- Callback for notebook import (Riftseer resolved from a name-keyed cardMap).
function postDeckLoad(bundledData)
	local resolvedByName = bundledData.resolvedByName or {}
	local passThrough    = bundledData.passThroughData or {}
	local cardMap        = passThrough.cardMap  or {}
	local deckName       = passThrough.deckName or ""
	local shouldSpawnSideboard = not skipSideboard
	local buckets = buildResolvedDeckBuckets(cardMap, resolvedByName)
	local tokenNames = buckets.tokenNames

	if #tokenNames > 0 then
		loadDeckFromMainModule(
			makeNameKeyedCardMap(tokenNames),
			"postDeckLoadTokens",
			{
				deckName = deckName,
				passThroughData = {
					tokenNameList = tokenNames,
					legendList = buckets.legendList,
					championList = buckets.championList,
					battlefieldList = buckets.battlefieldList,
					runeList = buckets.runeList,
					sideboardList = buckets.sideboardList,
					mainboardList = buckets.mainboardList,
					shouldSpawnSideboard = shouldSpawnSideboard,
				},
			}
		)
		return
	end

	spawnResolvedDecks({
		legendList = buckets.legendList,
		championList = buckets.championList,
		battlefieldList = buckets.battlefieldList,
		runeList = buckets.runeList,
		sideboardList = buckets.sideboardList,
		mainboardList = buckets.mainboardList,
		tokenList = {},
		deckName = deckName,
		shouldSpawnSideboard = shouldSpawnSideboard,
	})
end

function postDeckLoadTTSCodeText(bundledData)
	local resolvedByName = bundledData.resolvedByName or {}
	local passThrough = bundledData.passThroughData or {}
	local cardMap = passThrough.cardMap or {}
	local deckName = passThrough.deckName or ""
	local buckets = buildResolvedDeckBuckets(cardMap, resolvedByName, {
		autoClassifyMainboard = true,
	})
	local tokenNames = buckets.tokenNames

	local spawnOptions = {
		legendList = buckets.legendList,
		championList = buckets.championList,
		battlefieldList = buckets.battlefieldList,
		runeList = buckets.runeList,
		sideboardList = {},
		mainboardList = buckets.mainboardList,
		deckName = deckName,
		shouldSpawnSideboard = false,
		stackChampionsOnMainDeck = true,
		shuffleMainboard = false,
	}

	if #tokenNames > 0 then
		loadDeckFromMainModule(
			makeNameKeyedCardMap(tokenNames),
			"postDeckLoadTokens",
			{
				deckName = deckName,
				passThroughData = {
					tokenNameList = tokenNames,
					legendList = spawnOptions.legendList,
					championList = spawnOptions.championList,
					battlefieldList = spawnOptions.battlefieldList,
					runeList = spawnOptions.runeList,
					sideboardList = spawnOptions.sideboardList,
					mainboardList = spawnOptions.mainboardList,
					deckName = spawnOptions.deckName,
					shouldSpawnSideboard = spawnOptions.shouldSpawnSideboard,
					stackChampionsOnMainDeck = spawnOptions.stackChampionsOnMainDeck,
					shuffleMainboard = spawnOptions.shuffleMainboard,
				},
			}
		)
		return
	end

	spawnResolvedDecks({
		legendList = spawnOptions.legendList,
		championList = spawnOptions.championList,
		battlefieldList = spawnOptions.battlefieldList,
		runeList = spawnOptions.runeList,
		sideboardList = spawnOptions.sideboardList,
		mainboardList = spawnOptions.mainboardList,
		tokenList = {},
		deckName = spawnOptions.deckName,
		shouldSpawnSideboard = spawnOptions.shouldSpawnSideboard,
		stackChampionsOnMainDeck = spawnOptions.stackChampionsOnMainDeck,
		shuffleMainboard = spawnOptions.shuffleMainboard,
	})
end


-- ============================================================================
-- NOTEBOOK IMPORT
-- ============================================================================
local function readNotebookForColor(color)
	for _, tab in ipairs(Notes.getNotebookTabs()) do
		if tab.title == color and tab.color == color then
			return tab.body
		end
	end
	return nil
end

local function queryDeckNotebook(_)
	local notebookContents = readNotebookForColor(playerColor)

	if notebookContents == nil then
		printError(ERROR_MESSAGE_DECKLOADER .. "Notebook not found: " .. playerColor, playerColor)
		lockImporter(false)
		return
	elseif string.len(notebookContents) == 0 then
		printError(ERROR_MESSAGE_DECKLOADER .. "Notebook is empty. Please paste your decklist into your " .. playerColor .. " notebook.", playerColor)
		lockImporter(false)
		return
	end

	local hasSectionHeaders = false
	for line in iterateLines(notebookContents) do
		local categoryCheck = trim(line):lower():gsub(":$", "")
		if notebookImportCategoryMap[categoryCheck] then
			hasSectionHeaders = true
			break
		end
	end

	local ttsCodeLikeCount = countTTSCodeLikeTokens(notebookContents)
	-- Prefer TTS-code parsing for raw code lists that don't use section headers.
	if not hasSectionHeaders and ttsCodeLikeCount > 0 then
		local ttsCodeCardMap, invalidTokens = parseTTSCodeTextToCardMap(notebookContents)
		local ttsCodeCount = 0
		for _ in pairs(ttsCodeCardMap) do ttsCodeCount = ttsCodeCount + 1 end

		if ttsCodeCount == 0 then
			printError(ERROR_MESSAGE_DECKLOADER .. "Notebook contains no parseable cards.", playerColor)
			lockImporter(false)
			return
		end

		if #invalidTokens > 0 then
			local sample = table.concat(invalidTokens, ", ", 1, math.min(#invalidTokens, 5))
			printWarn("Ignored " .. tostring(#invalidTokens) .. " invalid tokens: " .. sample, playerColor)
		end

		local codeMetaBySet = buildCodeMetadataMapFromTTSCardMap(ttsCodeCardMap)
		local setCodes = {}
		for setCode in pairs(codeMetaBySet) do
			setCodes[#setCodes+1] = setCode
		end

		if #setCodes == 0 then
			printError(ERROR_MESSAGE_DECKLOADER .. "No valid TTS codes found in notebook.", playerColor)
			lockImporter(false)
			return
		end

		local translatedCardMap = {}
		local unresolvedCodes = {}
		local pendingSetRequests = #setCodes

		local function completeIfDone()
			if pendingSetRequests > 0 then return end

			local translatedCount = 0
			for _ in pairs(translatedCardMap) do translatedCount = translatedCount + 1 end
			if translatedCount == 0 then
				printError(ERROR_MESSAGE_DECKLOADER .. "Could not translate any TTS card codes.", playerColor)
				lockImporter(false)
				return
			end

			if #unresolvedCodes > 0 then
				local sample = table.concat(unresolvedCodes, ", ", 1, math.min(#unresolvedCodes, 5))
				printWarn("Could not resolve " .. tostring(#unresolvedCodes) .. " code(s): " .. sample, playerColor)
			end

			loadDeckFromMainModule(translatedCardMap, "postDeckLoadTTSCodeText", {
				deckName = "TTS Code Import",
			})
		end

		for _, setCode in ipairs(setCodes) do
			local byCollector = {}

			-- Every code this set never answered for is reported as unresolved, so
			-- a failed request warns once instead of losing the codes silently.
			local function finishSet()
				for collectorNum, qty in pairs(codeMetaBySet[setCode]) do
					local cardName = byCollector[collectorNum]
					if cardName and cardName ~= "" then
						addCardQty(translatedCardMap, cardName, "mainboardQty", qty)
					else
						unresolvedCodes[#unresolvedCodes+1] = setCode .. "-" .. collectorNum
					end
				end
				pendingSetRequests = pendingSetRequests - 1
				completeIfDone()
			end

			-- A page that fails keeps whatever earlier pages resolved; finishSet
			-- reports the rest as unresolved codes.
			local function failSet(warning)
				printWarn(warning, playerColor)
				finishSet()
			end

			-- A TTS code names a set and a collector number, so the listing has to
			-- be printing-shaped; the name it translates to belongs to the oracle.
			-- `unique=prints` answers with both: one row per printing in
			-- `printings`, the owning oracles in `cards`, joined on `oracle_id`.
			-- Search pages at SET_PAGE_SIZE rows, so walk the pages.
			local function requestSetPage(offset)
				local url = RIFTSEER_API_BASE .. "/api/v1/cards?q=set%3A" .. setCode ..
					"&unique=prints&limit=" .. tostring(SET_PAGE_SIZE) ..
					"&offset=" .. tostring(offset)
				WebRequest.get(url, function(res)
					if res.response_code ~= 200 then
						failSet("Failed to fetch set " .. setCode .. " while translating TTS codes.")
						return
					end

					local ok, data = pcall(function() return json.decode(res.text) end)
					if not ok or not data or type(data.printings) ~= "table" or type(data.cards) ~= "table" then
						failSet("Unexpected cards payload for set " .. setCode .. ".")
						return
					end

					local nameByOracleID = {}
					for _, card in ipairs(data.cards) do
						if card.id then nameByOracleID[card.id] = card.name end
					end

					for _, printing in ipairs(data.printings) do
						local printingSetCode = printing.set and printing.set.set_code and string.upper(printing.set.set_code) or ""
						if printingSetCode == setCode then
							local collector = normalizeCollectorNumber(printing.collector_number)
							local cardName  = printing.oracle_id and nameByOracleID[printing.oracle_id]
							if collector ~= "" and cardName and cardName ~= "" and not byCollector[collector] then
								byCollector[collector] = cardName
							end
						end
					end

					local seenSoFar = offset + #data.printings
					local total = tonumber(data.total) or seenSoFar
					if #data.printings > 0 and seenSoFar < total and seenSoFar < SET_PAGE_CAP then
						requestSetPage(seenSoFar)
						return
					end

					finishSet()
				end)
			end

			requestSetPage(0)
		end
		return
	end

	local sectionedCardMap = parseSectionedDeckTextToCardMap(notebookContents)
	local sectionedCount = 0
	for _ in pairs(sectionedCardMap) do sectionedCount = sectionedCount + 1 end
	if sectionedCount > 0 then
		loadDeckFromMainModule(sectionedCardMap, "postDeckLoad")
		return
	end

	-- If no sectioned cards were parsed, treat notebook text as TTS code text.
	local ttsCodeCardMap, invalidTokens = parseTTSCodeTextToCardMap(notebookContents)
	local ttsCodeCount = 0
	for _ in pairs(ttsCodeCardMap) do ttsCodeCount = ttsCodeCount + 1 end

	if ttsCodeCount == 0 then
		printError(ERROR_MESSAGE_DECKLOADER .. "Notebook contains no parseable cards.", playerColor)
		lockImporter(false)
		return
	end

	if #invalidTokens > 0 then
		local sample = table.concat(invalidTokens, ", ", 1, math.min(#invalidTokens, 5))
		printWarn("Ignored " .. tostring(#invalidTokens) .. " invalid tokens: " .. sample, playerColor)
	end

	loadDeckFromMainModule(ttsCodeCardMap, "postDeckLoadTTSCodeText", {
		deckName = "TTS Code Import",
	})
end

-- ============================================================================
-- PILTOVER ARCHIVE IMPORT
-- ============================================================================
local function parseDeckIDPiltover(url)
	-- Handles: /decks/view/{uuid} and /decks/{uuid}
	return url:match("piltoverarchive%.com/decks/view/([%w%-]+)")
		or url:match("piltoverarchive%.com/decks/([%w%-]+)")
end

local function queryDeckPiltover(deckUUID)
	if not deckUUID or string.len(deckUUID) == 0 then
		printError(ERROR_MESSAGE_DECKLOADER .. "Could not parse Piltover Archive deck UUID from URL.", playerColor)
		lockImporter(false)
		return
	end

	local url     = PILTOVERARCHIVE_API_BASE .. "/api/external/v1/decks/export/text"
	local headers = {["Content-Type"] = "application/json", ["Accept"] = "application/json"}
	local payload = json.encode({deckId = deckUUID})
	printInfo("Fetching decklist from Piltover Archive...", playerColor)

	WebRequest.custom(url, "POST", true, payload, headers, function(webReturn)
		if webReturn.response_code == 0 then
			printError(ERROR_MESSAGE_DECKLOADER .. "Could not reach Piltover Archive.", playerColor)
			lockImporter(false)
			return
		elseif webReturn.response_code == 404 then
			printError(ERROR_MESSAGE_DECKLOADER .. "Deck not found on Piltover Archive. Is it public?", playerColor)
			lockImporter(false)
			return
		elseif webReturn.response_code ~= 200 then
			printError(ERROR_MESSAGE_DECKLOADER .. "Piltover Archive error (" .. tostring(webReturn.response_code) .. ").", playerColor)
			lockImporter(false)
			return
		elseif not webReturn.text or string.len(webReturn.text) == 0 then
			printError(ERROR_MESSAGE_DECKLOADER .. "Empty response from Piltover Archive.", playerColor)
			lockImporter(false)
			return
		end

		local ok, data = pcall(function() return json.decode(webReturn.text) end)
		if not ok or not data or not data.text or string.len(data.text) == 0 then
			printError(ERROR_MESSAGE_DECKLOADER .. "Failed to parse response from Piltover Archive.", playerColor)
			lockImporter(false)
			return
		end

		local cardMap = parseSectionedDeckTextToCardMap(data.text)
		loadDeckFromMainModule(cardMap, "postDeckLoad")
	end)
end

-- ============================================================================
-- UI BUILD / UI HANDLERS
-- ============================================================================
local function drawUI()
	local _inputs = self.getInputs()
	local deckURL = ""

	if _inputs ~= nil then
		for _, input in pairs(self.getInputs()) do
			if input.label == "Enter a Piltover Archive deck URL, or load from Notebook." then
				deckURL = input.value
			end
		end
	end
	self.clearInputs()
	self.clearButtons()

	self.createInput({
		input_function = "onLoadDeckInput",
		function_owner = self,
		label          = "Enter a Piltover Archive deck URL, or load from Notebook.",
		alignment      = 2,
		position       = {x=0, y=0.1, z=0.925},
		width          = 1800,
		height         = 100,
		font_size      = 70,
		validation     = 1,
		value          = deckURL,
	})

	self.createButton({
		click_function = "onLoadDeckURLButton",
		function_owner = self,
		label          = "Import (URL)",
		position       = {-0.85, 0.1, 1.3},
		rotation       = {0, 0, 0},
		width          = 750,
		height         = 160,
		font_size      = 80,
		color          = {0.5, 0.5, 0.5},
		font_color     = {r=1, b=1, g=1},
		tooltip        = "Import deck from Piltover Archive (piltoverarchive.com)",
	})

	self.createButton({
		click_function = "onLoadDeckNotebookButton",
		function_owner = self,
		label          = "Import (Notebook)",
		position       = {0.85, 0.1, 1.3},
		rotation       = {0, 0, 0},
		width          = 750,
		height         = 160,
		font_size      = 80,
		color          = {0.5, 0.5, 0.5},
		font_color     = {r=1, b=1, g=1},
		tooltip        = "Import deck from your player notebook",
	})

	self.createButton({
		click_function = "onToggleAdvancedButton",
		function_owner = self,
		label          = "☰",
		position       = {1.85, 0.1, 1.3},
		rotation       = {0, 0, 0},
		width          = 160,
		height         = 160,
		font_size      = 100,
		color          = {0.5, 0.5, 0.5},
		font_color     = {r=1, b=1, g=1},
		tooltip        = "Open advanced options",
	})

	if advanced then
		self.UI.show(UI_ADVANCED_PANEL)
	else
		self.UI.hide(UI_ADVANCED_PANEL)
	end
end

function getDeckInputValue()
	for _, input in pairs(self.getInputs()) do
		if input.label == "Enter a Piltover Archive deck URL, or load from Notebook." then
			return trim(input.value)
		end
	end
	return ""
end

function importDeck(decklistType, pc)
	if not getRiftboundImporter() then return end

	local importerLock = RiftboundImporter.call("isImporterLocked")
	if importerLock then
		printError(ERROR_MESSAGE_DECKLOADER .. importerLock, pc)
		return
	end

	if self.getLock() then
		printToColor("This importer is already working, please wait until it's complete!", pc)
		return
	end

	lockImporter(true)
	lockSelf(true)

	playerColor = pc

	local deckURL = getDeckInputValue()

	if decklistType == "url" then
		if string.len(deckURL) == 0 then
			printInfo("Please enter a deck URL.", playerColor)
			lockSelf(false)
			lockImporter(false)
			return
		end

		if string.match(deckURL, PILTOVERARCHIVE_URL_MATCH) then
			printInfo("Starting deck import from Piltover Archive...", playerColor)
			local deckUUID = parseDeckIDPiltover(deckURL)
			queryDeckPiltover(deckUUID)
			return
		else
			printInfo("Unknown deck site. Please use a Piltover Archive URL (piltoverarchive.com) or use Notebook import.", playerColor)
		end

	elseif decklistType == "notebook" then
		printInfo("Starting deck import from Notebook...", playerColor)
		queryDeckNotebook()
		return
	else
		printError(ERROR_MESSAGE_DECKLOADER .. "Unknown deck source: " .. tostring(decklistType), playerColor)
	end

	lockImporter(false)
	lockSelf(false)
end

function onLoadDeckInput(_, _, _, _) end

function onLoadDeckURLButton(_, pc, _, _)
	importDeck("url", pc)
end

function onLoadDeckNotebookButton(_, pc, _, _)
	importDeck("notebook", pc)
end

function onToggleAdvancedButton(_, _, _, _)
	advanced = not advanced
	drawUI()
end

function UI_onCardBackInput(_, value, _)
	cardBackInput = value
end

function getCardBack()
	if not cardBackInput or string.len(cardBackInput) == 0 then
		return nil
	else
		return cardBackInput
	end
end

function UI_onFaceDownToggle(_, value, _)
	spawnEverythingFaceDown = stringToBool(value)
end

function UI_onSkipSideboardToggle(_, value, _)
	skipSideboard = stringToBool(value)
end

-- ============================================================================
-- LIFECYCLE
-- ============================================================================
function onLoad(script_state)
	self.setName("Riftbound Deck Loader")
	self.setVar("updateFinished", true)
	drawUI()
end

-- ============================================================================
-- json.lua  (MIT, rxi — https://github.com/rxi/json.lua)
-- ============================================================================

json = (function()
--
-- json.lua
--
-- Copyright (c) 2020 rxi
--
-- Permission is hereby granted, free of charge, to any person obtaining a copy of
-- this software and associated documentation files (the "Software"), to deal in
-- the Software without restriction, including without limitation the rights to
-- use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
-- of the Software, and to permit persons to whom the Software is furnished to do
-- so, subject to the following conditions:
--
-- The above copyright notice and this permission notice shall be included in all
-- copies or substantial portions of the Software.
--
-- THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
-- IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
-- FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
-- AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
-- LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
-- OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
-- SOFTWARE.

local json = { _version = "0.1.2" }

-------------------------------------------------------------------------------
-- Encode
-------------------------------------------------------------------------------

local encode

local escape_char_map = {
  [ "\\" ] = "\\",
  [ "\"" ] = "\"",
  [ "\b" ] = "b",
  [ "\f" ] = "f",
  [ "\n" ] = "n",
  [ "\r" ] = "r",
  [ "\t" ] = "t",
}

local escape_char_map_inv = { [ "/" ] = "/" }
for k, v in pairs(escape_char_map) do
  escape_char_map_inv[v] = k
end


local function escape_char(c)
  return "\\" .. (escape_char_map[c] or string.format("u%04x", c:byte()))
end


local function encode_nil(val)
  return "null"
end


local function encode_table(val, stack)
  local res = {}
  stack = stack or {}

  -- Circular reference?
  if stack[val] then error("circular reference") end

  stack[val] = true

  if rawget(val, 1) ~= nil or next(val) == nil then
    -- Treat as array -- check keys are valid and it is not sparse
    local n = 0
    for k in pairs(val) do
      if type(k) ~= "number" then
        error("invalid table: mixed or invalid key types")
      end
      n = n + 1
    end
    if n ~= #val then
      error("invalid table: sparse array")
    end
    -- Encode
    for i, v in ipairs(val) do
      table.insert(res, encode(v, stack))
    end
    stack[val] = nil
    return "[" .. table.concat(res, ",") .. "]"

  else
    -- Treat as an object
    for k, v in pairs(val) do
      if type(k) ~= "string" then
        error("invalid table: mixed or invalid key types")
      end
      table.insert(res, encode(k, stack) .. ":" .. encode(v, stack))
    end
    stack[val] = nil
    return "{" .. table.concat(res, ",") .. "}"
  end
end


local function encode_string(val)
  return '"' .. val:gsub('[%z\1-\31\\"]', escape_char) .. '"'
end


local function encode_number(val)
  -- Check for NaN, -inf and inf
  if val ~= val or val <= -math.huge or val >= math.huge then
    error("unexpected number value '" .. tostring(val) .. "'")
  end
  return string.format("%.14g", val)
end


local type_func_map = {
  [ "nil"     ] = encode_nil,
  [ "table"   ] = encode_table,
  [ "string"  ] = encode_string,
  [ "number"  ] = encode_number,
  [ "boolean" ] = tostring,
}


encode = function(val, stack)
  local t = type(val)
  local f = type_func_map[t]
  if f then
    return f(val, stack)
  end
  error("unexpected type '" .. t .. "'")
end


function json.encode(val)
  return ( encode(val) )
end


-------------------------------------------------------------------------------
-- Decode
-------------------------------------------------------------------------------

local parse

local function create_set(...)
  local res = {}
  for i = 1, select("#", ...) do
    res[ select(i, ...) ] = true
  end
  return res
end

local space_chars   = create_set(" ", "\t", "\r", "\n")
local delim_chars   = create_set(" ", "\t", "\r", "\n", "]", "}", ",")
local escape_chars  = create_set("\\", "/", '"', "b", "f", "n", "r", "t", "u")
local literals      = create_set("true", "false", "null")

local literal_map = {
  [ "true"  ] = true,
  [ "false" ] = false,
  [ "null"  ] = nil,
}


local function next_char(str, idx, set, negate)
  for i = idx, #str do
    if set[str:sub(i, i)] ~= negate then
      return i
    end
  end
  return #str + 1
end


local function decode_error(str, idx, msg)
  local line_count = 1
  local col_count = 1
  for i = 1, idx - 1 do
    col_count = col_count + 1
    if str:sub(i, i) == "\n" then
      line_count = line_count + 1
      col_count = 1
    end
  end
  error( string.format("%s at line %d col %d", msg, line_count, col_count) )
end


local function codepoint_to_utf8(n)
  -- http://scripts.sil.org/cms/scripts/page.php?site_id=nrsi&id=iws-appendixa
  local f = math.floor
  if n <= 0x7f then
    return string.char(n)
  elseif n <= 0x7ff then
    return string.char(f(n / 64) + 192, n % 64 + 128)
  elseif n <= 0xffff then
    return string.char(f(n / 4096) + 224, f(n % 4096 / 64) + 128, n % 64 + 128)
  elseif n <= 0x10ffff then
    return string.char(f(n / 262144) + 240, f(n % 262144 / 4096) + 128,
                       f(n % 4096 / 64) + 128, n % 64 + 128)
  end
  error( string.format("invalid unicode codepoint '%x'", n) )
end


local function parse_unicode_escape(s)
  local n1 = tonumber( s:sub(1, 4),  16 )
  local n2 = tonumber( s:sub(7, 10), 16 )
   -- Surrogate pair?
  if n2 then
    return codepoint_to_utf8((n1 - 0xd800) * 0x400 + (n2 - 0xdc00) + 0x10000)
  else
    return codepoint_to_utf8(n1)
  end
end


local function parse_string(str, i)
  local res = ""
  local j = i + 1
  local k = j

  while j <= #str do
    local x = str:byte(j)

    if x < 32 then
      decode_error(str, j, "control character in string")

    elseif x == 92 then -- `\`: Escape
      res = res .. str:sub(k, j - 1)
      j = j + 1
      local c = str:sub(j, j)
      if c == "u" then
        local hex = str:match("^[dD][89aAbB]%x%x\\u%x%x%x%x", j + 1)
                 or str:match("^%x%x%x%x", j + 1)
                 or decode_error(str, j - 1, "invalid unicode escape in string")
        res = res .. parse_unicode_escape(hex)
        j = j + #hex
      else
        if not escape_chars[c] then
          decode_error(str, j - 1, "invalid escape char '" .. c .. "' in string")
        end
        res = res .. escape_char_map_inv[c]
      end
      k = j + 1

    elseif x == 34 then -- `"`: End of string
      res = res .. str:sub(k, j - 1)
      return res, j + 1
    end

    j = j + 1
  end

  decode_error(str, i, "expected closing quote for string")
end


local function parse_number(str, i)
  local x = next_char(str, i, delim_chars)
  local s = str:sub(i, x - 1)
  local n = tonumber(s)
  if not n then
    decode_error(str, i, "invalid number '" .. s .. "'")
  end
  return n, x
end


local function parse_literal(str, i)
  local x = next_char(str, i, delim_chars)
  local word = str:sub(i, x - 1)
  if not literals[word] then
    decode_error(str, i, "invalid literal '" .. word .. "'")
  end
  return literal_map[word], x
end


local function parse_array(str, i)
  local res = {}
  local n = 1
  i = i + 1
  while 1 do
    local x
    i = next_char(str, i, space_chars, true)
    -- Empty / end of array?
    if str:sub(i, i) == "]" then
      i = i + 1
      break
    end
    -- Read token
    x, i = parse(str, i)
    res[n] = x
    n = n + 1
    -- Next token
    i = next_char(str, i, space_chars, true)
    local chr = str:sub(i, i)
    i = i + 1
    if chr == "]" then break end
    if chr ~= "," then decode_error(str, i, "expected ']' or ','") end
  end
  return res, i
end


local function parse_object(str, i)
  local res = {}
  i = i + 1
  while 1 do
    local key, val
    i = next_char(str, i, space_chars, true)
    -- Empty / end of object?
    if str:sub(i, i) == "}" then
      i = i + 1
      break
    end
    -- Read key
    if str:sub(i, i) ~= '"' then
      decode_error(str, i, "expected string for key")
    end
    key, i = parse(str, i)
    -- Read ':' delimiter
    i = next_char(str, i, space_chars, true)
    if str:sub(i, i) ~= ":" then
      decode_error(str, i, "expected ':' after key")
    end
    i = next_char(str, i + 1, space_chars, true)
    -- Read value
    val, i = parse(str, i)
    -- Set
    res[key] = val
    -- Next token
    i = next_char(str, i, space_chars, true)
    local chr = str:sub(i, i)
    i = i + 1
    if chr == "}" then break end
    if chr ~= "," then decode_error(str, i, "expected '}' or ','") end
  end
  return res, i
end


local char_func_map = {
  [ '"' ] = parse_string,
  [ "0" ] = parse_number,
  [ "1" ] = parse_number,
  [ "2" ] = parse_number,
  [ "3" ] = parse_number,
  [ "4" ] = parse_number,
  [ "5" ] = parse_number,
  [ "6" ] = parse_number,
  [ "7" ] = parse_number,
  [ "8" ] = parse_number,
  [ "9" ] = parse_number,
  [ "-" ] = parse_number,
  [ "t" ] = parse_literal,
  [ "f" ] = parse_literal,
  [ "n" ] = parse_literal,
  [ "[" ] = parse_array,
  [ "{" ] = parse_object,
}


parse = function(str, idx)
  local chr = str:sub(idx, idx)
  local f = char_func_map[chr]
  if f then
    return f(str, idx)
  end
  decode_error(str, idx, "unexpected character '" .. chr .. "'")
end


function json.decode(str)
  if type(str) ~= "string" then
    error("expected argument of type string, got " .. type(str))
  end
  local res, idx = parse(str, next_char(str, 1, space_chars, true))
  idx = next_char(str, idx, space_chars, true)
  if idx <= #str then
    decode_error(str, idx, "trailing garbage")
  end
  return res
end

    return {
        decode = json.decode,
        encode = json.encode
    }
end)()
