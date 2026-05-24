--[[
"Riftbound Card Importer"
Originally based on "MTG Importer DX" by DXHHH101
(https://github.com/DXHHH101/TabletopSimulatorScripts/tree/main/MTGImporter)
Credit to Omes and Amuzet for the original importer architecture.

Handles all external API calls for the Riftbound deck importer.
Deck loader objects call into this module via RiftboundImporter.call(...).
]]

-- ============================================================================
-- Config / Constants
-- ============================================================================
local globalVar = "RiftboundImporter"

local DEFAULT_BACK_URL     = "https://steamusercontent-a.akamaihd.net/ugc/17923936841557333394/E61E2190D4439BC190F2B572BBD6D36C0B487565/"
local CARD_BACK_LEGEND_URL = "https://steamusercontent-a.akamaihd.net/ugc/10828317924251492828/9B8428F7932F27440F9332D8E8D9103A6EA3C155/"
local CARD_BACK_RUNE_URL   = "https://steamusercontent-a.akamaihd.net/ugc/9393316991583067772/10DEFFBA73258C75462E90EA5ACA4DC95176590C/"
local CARD_BACK_BATTLEFIELD_URL = "https://steamusercontent-a.akamaihd.net/ugc/10194552971616474255/FB2A81006CA8DE6E7E2191374D0AB9D56A19D1F4/"
local RIFTSEER_RESOLVE_URL = "https://api.riftseer.com/api/v1/cards/resolve"

local BATCH_SIZE  = 20   -- Riftseer resolve endpoint accepts up to 20 names per request
local BATCH_DELAY = 0.1

local ERROR_MESSAGE_IMPORTER = "Riftbound Importer Error: "

-- ============================================================================
-- Runtime State
-- ============================================================================
local isLocked = false

-- ============================================================================
-- Error / Status Helpers
-- ============================================================================
local function printError(str, pc)
	if pc then
		printToColor(ERROR_MESSAGE_IMPORTER .. str, pc, {r=1, g=0, b=0})
	else
		printToAll(ERROR_MESSAGE_IMPORTER .. str, {r=1, g=0, b=0})
	end
	lockImporter(false)
end

-- ============================================================================
-- Import Lock Helpers
-- ============================================================================
function isImporterLocked()
	if isLocked then
		return "Importer is currently working, please wait a moment."
	end
	return false
end

function lockImporter(state)
	isLocked = state
end

-- ============================================================================
-- Utilities
-- ============================================================================
local function chunkArray(arr, size)
	local chunks = {}
	for i = 1, #arr, size do
		local chunk = {}
		for j = i, math.min(i + size - 1, #arr) do
			chunk[#chunk+1] = arr[j]
		end
		chunks[#chunks+1] = chunk
	end
	return chunks
end

-- ============================================================================
-- Deck Object Construction
-- ============================================================================
function createDeckObject(bundledData)
	--[[
		bundledData:
			decklistArray = {
				{ name (string), description (string), imageURL (string), qty (number) }
			}
			cardBack (string, optional)

		Returns a TTS DeckCustom or Card data table, or nil if the list is empty.
	]]
	if not bundledData.decklistArray or #bundledData.decklistArray == 0 then
		return nil
	end

	local customDeck    = {}
	local deckIDs       = {}
	local cardContainer = {}
	local nextDeckKey   = 1

	for _, entry in ipairs(bundledData.decklistArray) do
		local imageURL = entry.imageURL or DEFAULT_BACK_URL
		local qty      = entry.qty or 1

		for _ = 1, qty do
			local keyStr = tostring(nextDeckKey)
			local cardID = nextDeckKey * 100
			nextDeckKey  = nextDeckKey + 1

			customDeck[keyStr] = {
				FaceURL      = imageURL,
				BackURL      = bundledData.cardBack or DEFAULT_BACK_URL,
				NumWidth     = 1,
				NumHeight    = 1,
				BackIsHidden = true,
			}

			table.insert(deckIDs, cardID)

			local card = {
				Name        = "Card",
				Nickname    = entry.name or "",
				Description = entry.description or "",
				Transform   = {posX=0,posY=0,posZ=0, rotX=0,rotY=0,rotZ=0, scaleX=1,scaleY=1,scaleZ=1},
				CardID      = cardID,
			}

			table.insert(cardContainer, card)
		end
	end

	local deckData = {
		Name      = "DeckCustom",
		Nickname  = "",
		Transform = {
			posX=0, posY=1.05, posZ=0,
			rotX=0, rotY=180,  rotZ=0,
			scaleX=1, scaleY=1, scaleZ=1,
		},
		DeckIDs          = deckIDs,
		ContainedObjects = cardContainer,
		CustomDeck       = customDeck,
	}

	if #deckData.ContainedObjects == 1 then
		local cardData = deckData.ContainedObjects[1]
		if not cardData.CustomDeck then
			cardData.CustomDeck = deckData.CustomDeck
		end
		return cardData
	else
		return deckData
	end
end

-- ============================================================================
-- Riftseer Resolve Pipeline
-- ============================================================================
function loadDeckFromRiftseer(bundledData)
	--[[
		bundledData:
			names           = {"Card Name 1", "Card Name 2", ...}  (unique)
			callerGUID      = self.getGUID()
			onSuccess       = "callbackFunctionName"
			playerColor     = playerColor
			passThroughData (any) — echoed back to the caller unchanged

		Calls caller.call(onSuccess, {
			resolvedByName  = { ["Card Name"] = <riftseer card object> },
			passThroughData = bundledData.passThroughData,
		})
	]]

	local names = bundledData.names or {}

	if #names == 0 then
		lockImporter(false)
		local caller = getObjectFromGUID(bundledData.callerGUID)
		if caller then
			caller.call(bundledData.onSuccess, {
				resolvedByName  = {},
				passThroughData = bundledData.passThroughData,
			})
		end
		return
	end

	local batches        = chunkArray(names, BATCH_SIZE)
	local batchIndex     = 1
	local resolvedByName = {}

	local headers = {
		["Content-Type"] = "application/json",
		["Accept"]       = "application/json",
	}

	local function requestNextBatch()
		if batchIndex > #batches then
			lockImporter(false)
			local caller = getObjectFromGUID(bundledData.callerGUID)
			if not caller then
				printError("Missing caller. Was the deck loader deleted?", bundledData.playerColor)
				return
			end
			caller.call(bundledData.onSuccess, {
				resolvedByName  = resolvedByName,
				passThroughData = bundledData.passThroughData,
			})
			return
		end

		local payload = json.encode({requests = batches[batchIndex]})

		WebRequest.custom(RIFTSEER_RESOLVE_URL, "POST", true, payload, headers, function(res)
			if res.response_code == 200 then
				local ok, decoded = pcall(function() return json.decode(res.text) end)
				if ok and decoded then
					-- Response: {count, results: [{request: {raw, name}, card, matchType}]}
					local results = (type(decoded) == "table" and decoded.results) or decoded
					if type(results) == "table" then
						for _, result in ipairs(results) do
							-- request is an object {raw, name}; use raw to match what we sent
							local requestName = result.request and (result.request.raw or result.request.name)
							local card        = result.card
							if card and requestName then
								resolvedByName[requestName] = card
							end
						end
					end
				else
					printError("Failed to parse Riftseer response.", bundledData.playerColor)
					lockImporter(false)
					local caller = getObjectFromGUID(bundledData.callerGUID)
					if caller then caller.call("lockSelf", false) end
					return
				end
			elseif res.response_code == 0 then
				printError("Could not reach Riftseer. (" .. (res.text or "Unknown Error") .. ")", bundledData.playerColor)
				lockImporter(false)
				local caller = getObjectFromGUID(bundledData.callerGUID)
				if caller then caller.call("lockSelf", false) end
				return
			else
				printError("Riftseer error (" .. tostring(res.response_code) .. "): " .. (res.text or ""), bundledData.playerColor)
				lockImporter(false)
				local caller = getObjectFromGUID(bundledData.callerGUID)
				if caller then caller.call("lockSelf", false) end
				return
			end

			batchIndex = batchIndex + 1
			Wait.time(requestNextBatch, BATCH_DELAY)
		end)
	end

	requestNextBatch()
end

-- ============================================================================
-- TTS Lifecycle
-- ============================================================================
function onLoad(script_state)
	self.setName("Riftbound Card Importer")
	self.setDescription("Handles API calls for the Riftbound deck importer.\nDo not move or delete.")
	Global.setVar(globalVar, self)
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
--

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
