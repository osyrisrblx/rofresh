import child_process = require("child_process");
import http = require("http");

export function writeJson(res: http.ServerResponse, object: any) {
	res.setHeader("content-type", "application/json");
	res.write(JSON.stringify(object));
	res.end();
}

export function writeError(res: http.ServerResponse, errorMsg: string) {
	writeJson(res, { error: errorMsg });
}

const WIN32_CMD = "tasklist";
const WIN32_SUFFIX = ".exe";
const DARWIN_CMD = "ps -ax | grep ";

export function isProcessRunningSync(name: string) {
	let cmd = "";
	if (process.platform === "win32") {
		cmd = WIN32_CMD;
		name += WIN32_SUFFIX;
	} else if (process.platform === "darwin") {
		cmd = DARWIN_CMD + name;
	} else {
		return false;
	}
	return (
		child_process
			.execSync(cmd)
			.toString()
			.toLowerCase()
			.indexOf(name.toLowerCase()) > -1
	);
}
