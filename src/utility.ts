import child_process = require("child_process");
import http = require("http");
import fs = require("mz/fs");
import path = require("path");

const PLUGIN_FILE_NAME = "RofreshPlugin.lua";
const ROBLOX_STUDIO_PROCESS_NAME = "RobloxStudioBeta";
const MAX_FILE_RETRY = 5;
const FILE_RETRY_DELAY = 10; // ms

export function writeJson(res: http.ServerResponse, object: any) {
	res.setHeader("content-type", "application/json");
	res.write(JSON.stringify(object));
	res.end();
}

export function writeError(res: http.ServerResponse, errorMsg: string) {
	writeJson(res, { error: errorMsg });
}

export function wait(ms: number) {
	return new Promise<undefined>(resolve => setTimeout(() => resolve(), ms));
}

export async function getFileContents(filePath: string) {
	let attempt = 0;
	let fileContents: Buffer;
	do {
		attempt++;
		fileContents = await fs.readFile(filePath);
		// hack!
		if (fileContents.length === 0 && attempt <= MAX_FILE_RETRY) {
			await wait(FILE_RETRY_DELAY);
		}
	} while (fileContents.length === 0 && attempt <= MAX_FILE_RETRY);
	return fileContents;
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

function getPluginInstallPathWin32() {
	const appData = process.env.LOCALAPPDATA;
	if (appData) {
		const robloxFolder = path.join(appData, "Roblox");
		if (fs.existsSync(robloxFolder)) {
			const pluginsFolder = path.join(robloxFolder, "Plugins");
			if (!fs.existsSync(pluginsFolder)) {
				fs.mkdirSync(pluginsFolder);
			}
			return path.join(pluginsFolder, PLUGIN_FILE_NAME);
		}
	}
}

function getPluginInstallPathDarwin() {
	return undefined;
}

export enum PluginInstallResult {
	Success,
	Failure,
	PromptRestartStudio,
	AlreadyInstalled, // TODO: check version
}

/**
 * attempts to automatically install the Rofresh Roblox Studio plugin
 */
export function installPlugin(installDir?: string) {
	const pluginPath = path.join(__dirname, "..", PLUGIN_FILE_NAME);
	let installPath: string | undefined;
	if (installDir) {
		installPath = path.join(installDir, "Plugins", PLUGIN_FILE_NAME);
	} else {
		if (process.platform === "win32") {
			installPath = getPluginInstallPathWin32();
		} else if (process.platform === "darwin") {
			installPath = getPluginInstallPathDarwin();
			// TODO
			return PluginInstallResult.Failure;
		} else {
			return PluginInstallResult.Failure;
		}
	}

	// validate paths
	if (!installPath || !fs.existsSync(pluginPath)) {
		return PluginInstallResult.Failure;
	}

	// copy
	fs.writeFileSync(installPath, fs.readFileSync(pluginPath));

	if (isProcessRunningSync(ROBLOX_STUDIO_PROCESS_NAME)) {
		return PluginInstallResult.PromptRestartStudio;
	} else {
		return PluginInstallResult.Success;
	}
}
