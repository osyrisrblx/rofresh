-- Rofresh Studio Plugin

-- services
local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local Selection = game:GetService("Selection")

-- early out
if not RunService:IsEdit() then return end

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
local CLIENT_ID = string.gsub(HttpService:GenerateGUID(false), "-", "")
local HEADERS = { ["client-id"] = CLIENT_ID }
local POLL_REQUEST = {
	Url = SERVER_URL,
	Method = "GET",
	Headers = HEADERS
}

-- error constants
local HTTP_NOT_ENABLED = "Http requests are not enabled. Enable via game settings"

local KNOWN_ERRORS = {
	"HttpError: InvalidUrl",
	"HttpError: DnsResolve",
	"HttpError: ConnectFail",
	"HttpError: OutOfMemory",
	"HttpError: Timedout",
	"HttpError: TooManyRedirects",
	"HttpError: InvalidRedirect",
	"HttpError: NetFail",
	"HttpError: Aborted",
	"HttpError: SslConnectFail",
	"HttpError: Unknown",
}

local function isKnownError(errorMsg)
	for i = 1, #KNOWN_ERRORS do
		if errorMsg == KNOWN_ERRORS[i] then
			return true
		end
	end
	return false
end

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

local httpEnabled = true

local jobId

local function isJobValid(myJobId)
	return myJobId == jobId and _G.rofresh.pluginId == pluginId
end

local n = 0

-- main loop
coroutine.wrap(function()
	while RunService.Heartbeat:Wait() and _G.rofresh.pluginId == pluginId do
		n = n + 1
		local myJobId = {}
		jobId = myJobId

		local success, responseOrError
		local isFinished = false
		coroutine.wrap(function()
			success, responseOrError = pcall(function()
				return HttpService:RequestAsync(POLL_REQUEST)
			end)
			isFinished = true
		end)()
		while isJobValid(myJobId) and not isFinished do
			RunService.Heartbeat:Wait()
		end
		if not isJobValid(myJobId) then
			return
		end

		if success then
			local response = responseOrError

			if not httpEnabled then
				httpEnabled = true
				print("HttpEnabled, begin sync..")
			end

			if response.Success then
				if string.len(response.Body) > 0 then
					local payloadOrError
					success, payloadOrError = pcall(function()
						return HttpService:JSONDecode(response.Body)
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

								if projectPayload.changes or projectPayload.initial then
									project:processChanges(projectPayload.changes, projectPayload.initial)
								end
							end
						else
							-- do throttle
							success = false
							warn("Server Error", payload.error)
						end
					else
						warn("JSON Error", payloadOrError, #response.Body, response.Body)
					end
				else
					success = false
				end
			else
				warn("Response Failure", response.StatusCode, response.StatusMessage)
			end
		else
			-- HttpService.HttpEnabled prompt
			if responseOrError == HTTP_NOT_ENABLED then
				httpEnabled = false
				Selection:Set({ HttpService })
				local prop
				while prop ~= "HttpEnabled" do
					prop = HttpService.Changed:Wait()
				end
				-- bypass throttle
				success = true
			else
				if not isKnownError(responseOrError) then
					warn("Http Error", responseOrError)
				end
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
		_G.rofresh.debugPrint("PlaceId changed, restarting request")
		placeId = game.PlaceId
		jobId = nil
	end
end)

print("Rofresh Studio Plugin running..")