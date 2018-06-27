-- Project class

-- services
local CollectionService = game:GetService("CollectionService")

-- constants
local TAG_PREFIX = ".Rofresh_"
local CONTAINER_NAME = "init"

-- utility functions
local function existsIn(array, value)
	for i = 1, #array do
		if value == array[i] then
			return true
		end
	end
	return false
end

local function findFirstChildOfNameAndClass(parent, name, classNames)
	if typeof(classNames) == "string" then
		classNames = {classNames}
	end
	for _, child in pairs(parent:GetChildren()) do
		local success, condition = pcall(function()
			return child.Name == name and existsIn(classNames, child.ClassName)
		end)
		if success and condition then
			return child
		end
	end
end

local function findOnPath(path, className)
	local name = table.remove(path)
	local parent = game
	for i = 1, #path do
		parent = parent:FindFirstChild(path[i])
		if not parent then
			return
		end
	end
	return findFirstChildOfNameAndClass(parent, name, className)
end

-- class definition
local Project = {}
Project.instances = {}
Project.__index = Project

function Project.new(id, tagOverride)
	local self = setmetatable({}, Project)
	Project.instances[id] = self
	self.id = id
	self.tag = tagOverride or TAG_PREFIX .. id
	return self
end

local function getPathStr(object)
	local pathStr = object.Name .. "." .. object.ClassName
	local parent = object.Parent
	while parent and parent ~= game do
		pathStr = parent.Name .. "." .. pathStr
		parent = parent.Parent
	end
	return pathStr
end

function Project:unsync(object)
	if CollectionService:HasTag(object, self.tag) then
		local children = object:GetChildren()
		if #children > 0 then
			local folder = Instance.new("Folder")
			CollectionService:AddTag(object, self.tag)
			folder.Name = object.Name
			folder.Parent = object.Parent
			for _, child in pairs(children) do
				child.Parent = folder
			end
			object:Destroy()
		else
			local parent = object.Parent
			object:Destroy()
			if parent and parent:IsA("Folder") and #parent:GetChildren() == 0 then
				self:unsync(parent)
			end
		end
	end
end

function Project:getScriptObject(path, className, isContainer)
	local name = table.remove(path)
	if not name then
		return
	end
	local parent = game
	for i = 1, #path do
		local object = parent:FindFirstChild(path[i])
		if not object then
			if parent == game then
				object = game:GetService(path[i])
			else
				object = Instance.new("Folder", parent)
			end
			CollectionService:AddTag(object, self.tag)
			object.Name = path[i]
		end
		parent = object
	end

	local scriptObject = findFirstChildOfNameAndClass(parent, name, className)
	if not scriptObject then
		if isContainer then
			local folder = findFirstChildOfNameAndClass(parent, name, {"Folder", "Script", "LocalScript", "ModuleScript"})
			if folder then
				scriptObject = Instance.new(className)
				CollectionService:AddTag(scriptObject, self.tag)
				scriptObject.Name = name
				for _, child in pairs(folder:GetChildren()) do
					child.Parent = scriptObject
				end
				folder:Destroy()
				scriptObject.Parent = parent
			else
				scriptObject = Instance.new(className, parent)
				CollectionService:AddTag(scriptObject, self.tag)
				scriptObject.Name = name
			end
		else
			scriptObject = Instance.new(className, parent)
			CollectionService:AddTag(scriptObject, self.tag)
			scriptObject.Name = name
		end
	end

	return scriptObject
end

function Project:processChanges(changes, initial)
	local paths = {}
	for _, change in pairs(changes) do
		local doCreate = change.source ~= nil
		local isContainer = false
		if change.path[#change.path] == CONTAINER_NAME then
			table.remove(change.path)
			isContainer = true
		end
		local pathStr = table.concat(change.path, ".") .. "." .. change.type
		paths[pathStr] = true
		if doCreate then
			_G.rofresh.debugPrint("ADD", pathStr)
			local scriptObject = self:getScriptObject(change.path, change.type, isContainer)
			if scriptObject then
				CollectionService:AddTag(scriptObject, self.tag)
				scriptObject.Source = change.source
			end
		else
			_G.rofresh.debugPrint("REMOVE", pathStr)
			local scriptObject = findOnPath(change.path, change.type)
			if scriptObject then
				self:unsync(scriptObject)
			end
		end
	end
	if initial then
		local syncObjects = CollectionService:GetTagged(self.tag)
		for _, object in pairs(syncObjects) do
			if object:IsA("LuaSourceContainer") then
				local pathStr = getPathStr(object)
				if not paths[pathStr] then
					_G.rofresh.debugPrint("REMOVE", pathStr)
					self:unsync(object)
				end
			end
		end
	end
end

function Project:getPathFromScript(script)
	local path = {}
	local object = script
	while object ~= game do
		table.insert(path, 1, object.Name)
		object = object.Parent
	end
	return path
end

function Project:getChangeFromScript(script)
	return {
		type = script.ClassName,
		source = script.Source,
		path = self:getPathFromScript(script)
	}
end

return Project