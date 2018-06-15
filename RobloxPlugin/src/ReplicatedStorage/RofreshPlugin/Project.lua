local CollectionService = game:GetService("CollectionService")

-- Project constants
local TAG_PREFIX = "Rofresh."
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
		if child.Name == name and existsIn(classNames, child.ClassName) then
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

local states = game.ServerStorage:FindFirstChild("States") or Instance.new("Folder", game.ServerStorage)
states.Name = "States"
states:ClearAllChildren()
local function saveState()
	local sandbox = game.ServerScriptService:FindFirstChild("Sandbox")
	if sandbox then
		local folder = Instance.new("Folder", states)
		folder.Name = tostring(#states:GetChildren())
		sandbox:Clone().Parent = folder
	end
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

function Project:initialize(initialPaths)
	print("initialize", initialPaths)
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
			self:unsync(parent)
		end
	end
end


-- [ ReplicatedStorage, FolderA, FolderB, Network, init ]

function Project:getScriptObject(path, className, isContainer)
	local name = table.remove(path)
	local parent = game
	for i = 1, #path do
		local object = parent:FindFirstChild(path[i])
		if not object then
			object = Instance.new("Folder", parent)
			CollectionService:AddTag(object, self.tag)
			object.Name = path[i]
		end
		parent = object
	end

	local scriptObject = findFirstChildOfNameAndClass(parent, name, className)
	if not scriptObject then
		if isContainer then
			local folder = findFirstChildOfNameAndClass(parent, name, "Folder")
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

function Project:processChanges(changes)
	for _, change in pairs(changes) do
		local doCreate = change.source ~= nil
		local isContainer = false
		if changes.path[#changes.path] == CONTAINER_NAME then
			table.remove(changes.path)
			isContainer = true
		end
		if doCreate then
			print("ADD", table.concat(change.path, "."), change.type)
			local scriptObject = self:getScriptObject(change.path, change.type, isContainer)
			if scriptObject then
				scriptObject.Source = change.source
			end
		else
			print("REMOVE", table.concat(change.path, "."), change.type)
			local scriptObject = findOnPath(change.path, change.type)
			if scriptObject then
				self:unsync(scriptObject)
			end
		end
		saveState()
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