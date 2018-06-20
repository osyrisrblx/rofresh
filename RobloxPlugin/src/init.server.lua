-- Rofresh Studio Plugin

-- services
local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local Selection = game:GetService("Selection")

-- imports
local Project = require(script.Project)
local Benchmark = require(script.Benchmark)

-- config constants
local PORT = 8888
local MAX_REQUESTS_PER_MINUTE = 60
local DEBUG = true
local OUTPUT_PREFIX = "[Rofresh]"

-- static constants
local URL_TEMPLATE = "http://localhost:%d"
local SERVER_URL = string.format(URL_TEMPLATE, PORT)
local HEADERS = { ["client-id"] = string.gsub(HttpService:GenerateGUID(false), "-", "") }

-- error constants
local HTTP_NOT_ENABLED = "Http requests are not enabled. Enable via game settings"
local CURL_PREFIX = "CURL error (curl_easy_perform): "
local CURL_CONNECT_ERROR = CURL_PREFIX .. "Couldn't connect to server (7)"
local CURL_TIMEOUT_ERROR = CURL_PREFIX .. "Timeout was reached (28)"
local CURL_NOTHING_ERROR = CURL_PREFIX .. "Server returned nothing (no headers, no data) (52)"
local CURL_RECEIVE_ERROR = CURL_PREFIX .. "Failure when receiving data from the peer (56)"

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

-- plugin object creation
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

local n = 0

-- main loop
coroutine.wrap(function()
	Benchmark("START")
	while RunService.Heartbeat:Wait() and _G.rofresh.pluginId == pluginId do
		n = n + 1
		local myJobId = {}
		jobId = myJobId

		Benchmark("SEND", n)
		local success, rawJsonOrError
		local isFinished = false
		coroutine.wrap(function()
			success, rawJsonOrError = pcall(function()
				return HttpService:GetAsync(SERVER_URL, true, HEADERS)
			end)
			Benchmark("REAL RECIEVE", n)
			isFinished = true
		end)()
		while isJobValid(myJobId) and not isFinished do
			RunService.Heartbeat:Wait()
		end
		if not isJobValid(myJobId) then
			return
		end
		Benchmark("RECIEVE " .. string.len(rawJsonOrError), n)

		if success then
			if not httpEnabled then
				httpEnabled = true
				print("HttpEnabled, begin sync..")
			end

			local payloadOrError
			success, payloadOrError = pcall(function()
				return HttpService:JSONDecode(rawJsonOrError)
			end)
			Benchmark("DECODED", n)
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

						if projectPayload.changes or projectPayload.initial then
							project:processChanges(projectPayload.changes, projectPayload.initial)
						end
					end
					Benchmark("PROCESSED", n)
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
		Benchmark("DONE", n)

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