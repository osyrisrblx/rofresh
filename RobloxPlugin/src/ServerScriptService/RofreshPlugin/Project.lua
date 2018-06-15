local CollectionService = game:GetService("CollectionService")

-- Project constants
local TAG_PREFIX = "Rofresh."
local CONTAINER_NAME = "init"

-- utility functions
local function findFirstChildOfNameAndClass(parent, name, className)
	for _, child in pairs(parent:GetChildren()) do
		if child.Name == name and child.ClassName == className then
			return child
		end
	end
end

-- class definition
local Project = {}
Project.instances = {}
Project.__index = Project

function Project.new(id, tagOverride)
	Project.instances[id] = Project
	self.id = id
	self.tag = tagOverride or TAG_PREFIX .. id
end

function Project:initialize(initialPaths)
	print("initialize", initialPaths)
end

function Project:unsync(scriptObject)
	assert(scriptObject:IsA("LuaSourceContainer"))
	CollectionService:RemoveTag(scriptObject, self.tag)
	local children = scriptObject:GetChildren()
	if #children > 0 then
		local folder = Instance.new("Folder")
		folder.Name = scriptObject.Name
		folder.Parent = scriptObject.Parent
		for _, child in pairs(children) do
			child.Parent = folder
		end
	else
		local parent = scriptObject.Parent
		scriptObject:Destroy()
		repeat
			if CollectionService:HasTag(parent, self.tag) then
				local parentChildren = parent:GetChildren()
				if #parentChildren == 0 then
					parent:Destroy()
				else
					local hasTaggedChild = false
					for _, parentChild in pairs(parentChildren) do
						if CollectionService:HasTag(parentChild, self.tag) then
							hasTaggedChild = true
						end
					end
					if not hasTaggedChild then
						CollectionService:RemoveTag(parent, self.tag)
					end
					break
				end
			end
			parent = parent.Parent
		until false
	end
end


-- [ ReplicatedStorage, FolderA, FolderB, Network, init ]

function Project:getScriptObject(path, className, doCreate)
	local name = table.remove(path)
	local isContainer = false
	if name == CONTAINER_NAME then
		isContainer = true
		name = table.remove(path)
	end
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
			if folder and doCreate then
				scriptObject = Instance.new(className, parent)
				CollectionService:AddTag(scriptObject, self.tag)
				scriptObject.Name = name
				for _, child in pairs(folder:GetChildren()) do
					child.Parent = scriptObject
				end
			end
		elseif doCreate then
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
		local scriptObject = self:getScriptObject(change.path, change.type, doCreate)
		if scriptObject then
			if doCreate then
				scriptObject.Source = change.source
			else
				scriptObject:Destroy()
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