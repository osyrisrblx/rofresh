-- Rofresh Studio Plugin

-- services
local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
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
local HEADERS = { ["client-id"] = string.gsub(HttpService:GenerateGUID(false), "-", "") }

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

local pluginId = string.gsub(HttpService:GenerateGUID(false), "-", "")
_G.rofresh = {}
_G.rofresh.pluginId = pluginId
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

local jobId

local function isJobValid(myJobId)
	return myJobId == jobId and _G.rofresh.pluginId == pluginId
end


--* main loop *--
coroutine.wrap(function()
	while RunService.Heartbeat:Wait() and _G.rofresh.pluginId == pluginId do
		local myJobId = {}
		jobId = myJobId

		_G.rofresh.debugPrint("Sending request..")
		local success, rawJsonOrError
		local isFinished = false
		coroutine.wrap(function()
			success, rawJsonOrError = pcall(function()
				return HttpService:GetAsync(SERVER_URL, true, HEADERS)
			end)
			isFinished = true
		end)()
		while isJobValid(myJobId) and not isFinished do
			RunService.Heartbeat:Wait()
		end
		if not isJobValid(myJobId) then
			return
		end
		_G.rofresh.debugPrint("Recieved response!")

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

local placeId = game.PlaceId
game:GetPropertyChangedSignal("PlaceId"):Connect(function()
	if placeId ~= game.PlaceId then
		_G.rofresh.debugPrint("PlaceId changed, restart request")
		placeId = game.PlaceId
		jobId = nil
	end
end)

print("Rofresh Studio Plugin running..")