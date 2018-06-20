-- simple benchmarking module

local prevTime

local function round(num, numDecimalPlaces)
	local mult = 10^(numDecimalPlaces or 0)
	return math.floor(num * mult + 0.5) / mult
end

return function(label, n)
	if not label then
		label = "UNKNOWN" .. (n and  ("[" .. n .. "]") or "")
	end
	local nowTime = tick()
	local diffStr = ""
	if prevTime then
		local diff = nowTime - prevTime
		assert(diff > 0)
		diffStr = "(+" .. round(diff, 4) .. ")"
	end
	_G.rofresh.debugPrint("[BENCHMARK]", label, nowTime, diffStr)
	prevTime = nowTime
end