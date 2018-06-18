-- Rofresh Studio Plugin

-- services
local HttpService = game:GetService("HttpService")
local Selection = game:GetService("Selection")

-- imports
local Project = require(script.Project)

-- config constants
local PORT = 8888
local MAX_REQUESTS_PER_MINUTE = 60
local DEBUG = false
local OUTPUT_PREFIX = "[Rofresh]"

-- static constants
local URL_TEMPLATE = "http://localhost:%d"
local SERVER_URL = string.format(URL_TEMPLATE, PORT)
local HEADERS = { ["client-id"] = HttpService:GenerateGUID(false) }

-- error constants
local HTTP_NOT_ENABLED = "Http requests are not enabled. Enable via game settings"
local CURL_CONNECT_ERROR = "CURL error (curl_easy_perform): Couldn't connect to server (7)"
local CURL_TIMEOUT_ERROR = "CURL error (curl_easy_perform): Timeout was reached (28)"
local CURL_NOTHING_ERROR = "CURL error (curl_easy_perform): Server returned nothing (no headers, no data) (52)"
local CURL_RECEIVE_ERROR = "CURL error (curl_easy_perform): Failure when receiving data from the peer (56)"

-- output helper functions
local function wrapPrinter(printer)
	return function(...)
		printer(OUTPUT_PREFIX, ...)
	end
end
local print = wrapPrinter(print)
local warn = wrapPrinter(warn)

local function debugPrint(...)
	if DEBUG then
		print(...)
	end
end

local localTag = HttpService:GenerateGUID(false)
_G.rofresh = {}
_G.rofresh.tag = localTag
_G.rofresh.debugPrint = debugPrint

--* plugin object creation *--
do
	local toolbar = plugin:CreateToolbar("Rofresh")

	local syncSelectionButton = toolbar:CreateButton("Sync Selection", "", "")
	syncSelectionButton.ClickableWhenViewportHidden = true
	syncSelectionButton.Click:Connect(function()
		local changes = {}
		for _, selected in pairs(Selection:Get()) do
			debugPrint("syncSelection", selected:GetFullName())
			for _, descendant in pairs(selected:GetDescendants()) do
				if descendant:IsA("LuaSourceContainer") then
					local project = nil
					table.insert(changes, project:getChangeFromScript(descendant))
				end
			end
		end
		--[[
		HttpService:PostAsync(SERVER_URL, HttpService:JSONEncode({
			projectName = "",
			changes = changes,
		}), Enum.HttpContentType.ApplicationJson, false, HEADERS)
		]]
	end)

	-- TODO: remove
	local debugButton = toolbar:CreateButton("Debug", "", "")
	debugButton.ClickableWhenViewportHidden = true
	debugButton.Click:Connect(function()
		DEBUG = not DEBUG
		print("debug", DEBUG)
	end)
end

local httpEnabled = true

--* main loop *--
coroutine.wrap(function()
	while _G.rofresh.tag == localTag and wait() do
		-- check game.PlaceId
		if game.PlaceId == 0 then
			warn("game.PlaceId cannot be 0")
			while game.PlaceId == 0 do
				game:GetPropertyChangedSignal("PlaceId"):Wait()
			end
		end
		if _G.rofresh.tag ~= localTag then return end

		local success, rawJsonOrError = pcall(function()
			return HttpService:GetAsync(SERVER_URL, true, HEADERS)
		end)
		if _G.rofresh.tag ~= localTag then return end

		if success then
			if not httpEnabled then
				httpEnabled = true
				print("HttpEnabled, begin sync..")
			end

			local payloadOrError
			success, payloadOrError = pcall(function()
				return HttpService:JSONDecode(rawJsonOrError)
			end)
			if success then
				local payload = payloadOrError
				if not payload.error then
					for i = 1, #payload do
						local projectPayload = payload[i]
						assert(projectPayload.projectName and projectPayload.projectName ~= "")
						assert(projectPayload.changes)

						local project = Project.instances[projectPayload.projectName]
						if not project then
							project = Project.new(projectPayload.projectName, projectPayload.tagOverride)
						end

						if projectPayload.initialPaths then
							project:initialize(projectPayload.initialPaths)
						end

						if projectPayload.changes then
							project:processChanges(projectPayload.changes)
						end
					end
				else
					-- do throttle
					success = false
					warn("Server Error", payload.error)
				end
			else
				warn("JSON Error", payloadOrError, #rawJsonOrError, rawJsonOrError)
			end
		else
			-- HttpService.HttpEnabled prompt
			if rawJsonOrError == HTTP_NOT_ENABLED then
				httpEnabled = false
				Selection:Set({HttpService})
				local prop
				while prop ~= "HttpEnabled" do
					prop = HttpService.Changed:Wait()
				end
				if _G.rofresh.tag ~= localTag then return end
				-- bypass throttle
				success = true
			elseif  rawJsonOrError ~= CURL_CONNECT_ERROR
				and rawJsonOrError ~= CURL_TIMEOUT_ERROR
				and rawJsonOrError ~= CURL_NOTHING_ERROR
				and rawJsonOrError ~= CURL_RECEIVE_ERROR then
				-- silence known common server errors
				warn("Connection Error", rawJsonOrError)
			end
		end

		-- dont waste requests
		if not success then
			wait(60/MAX_REQUESTS_PER_MINUTE)
		end
	end
	print("Rofresh ended.")
end)()

print("Rofresh Studio Plugin running..")