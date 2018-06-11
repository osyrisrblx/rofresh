local HttpService = game:GetService("HttpService")
local Selection = game:GetService("Selection")

local PORT = 8888
local URL_TEMPLATE = "http://localhost:%d"
local SERVER_URL = string.format(URL_TEMPLATE, PORT)
local CLIENT_ID = HttpService:GenerateGUID(false)
local HEADERS = { id = CLIENT_ID }
local OUTPUT_PREFIX = "[Rofresh]"

-- errors
local HTTP_NOT_ENABLED = "Http requests are not enabled. Enable via game settings"
local CURL_CONNECT_ERROR = "CURL error (curl_easy_perform): Couldn't connect to server (7)"
local CURL_TIMEOUT_ERROR = "CURL error (curl_easy_perform): Timeout was reached (28)"
local CURL_NOTHING_ERROR = "CURL error (curl_easy_perform): Server returned nothing (no headers, no data) (52)"

local function wrapPrinter(printer)
	return function(...)
		printer(OUTPUT_PREFIX, ...)
	end
end
local print = wrapPrinter(print)
local warn = wrapPrinter(warn)

local function findFirstChildOfNameAndClass(parent, name, className)
	for _, child in pairs(parent:GetChildren()) do
		if child.Name == name and child.ClassName == className then
			return child
		end
	end
end

local function getScriptObject(path, className)
	local name = table.remove(path)
	local parent = game
	for i = 1, #path do
		local object = parent:FindFirstChild(path[i])
		if not object then
			object = Instance.new("Folder", parent)
			object.Name = path[i]
		end
		parent = object
	end
	local scriptObject = findFirstChildOfNameAndClass(parent, name, className)
	if not scriptObject then
		scriptObject = Instance.new(className, parent)
		scriptObject.Name = name
	end
	return scriptObject
end

coroutine.wrap(function()
	while wait() do
		local success, rawJsonOrError = pcall(function()
			return HttpService:GetAsync(SERVER_URL, true, HEADERS)
		end)

		if success then
			local payloadOrError
			success, payloadOrError = pcall(function()
				return HttpService:JSONDecode(rawJsonOrError)
			end)
			if success then
				if not payloadOrError.error then
					for _, change in pairs(payloadOrError) do
						local scriptObject = getScriptObject(change.path, change.type)
						if scriptObject then
							print("Write", scriptObject:GetFullName())
							scriptObject.Source = change.source
						end
					end
				else
					warn("Server Error", payloadOrError.error)
				end
			else
				warn("JSON Error", payloadOrError)
			end
		else
			if rawJsonOrError == HTTP_NOT_ENABLED then
				Selection:Set({HttpService})
				local prop
				while prop ~= "HttpEnabled" do
					prop = HttpService.Changed:Wait()
				end
				-- bypass throttle
				success = true
			elseif  rawJsonOrError ~= CURL_CONNECT_ERROR
				and rawJsonOrError ~= CURL_TIMEOUT_ERROR
				and rawJsonOrError ~= CURL_NOTHING_ERROR then
				warn("Connection Error", rawJsonOrError)
			end
		end

		-- dont waste requests
		if not success then
			wait(1)
		end
	end
end)()

local function getPathFromScript(script)
	local path = {}
	local object = script
	while object ~= game do
		table.insert(path, 1, object.Name)
		object = object.Parent
	end
	return path
end

local function getChangeFromScript(script)
	return {
		type = script.ClassName,
		source = script.Source,
		path = getPathFromScript(script)
	}
end

local function syncSelection()
	local changes = {}
	for _, selected in pairs(Selection:Get()) do
		print("syncSelection", selected:GetFullName())
		for _, descendant in pairs(selected:GetDescendants()) do
			if descendant:IsA("LuaSourceContainer") then
				table.insert(changes, getChangeFromScript(descendant))
			end
		end
	end
	--[[
	HttpService:PostAsync(SERVER_URL, HttpService:JSONEncode({
		projectId = "",
		changes = changes,
	}), Enum.HttpContentType.ApplicationJson, false, HEADERS)
	]]
end

local button = plugin:CreateToolbar("Rofresh"):CreateButton("Sync Selection", "", "")
button.ClickableWhenViewportHidden = true
button.Click:Connect(syncSelection)

print("Rofresh Studio Plugin running..")