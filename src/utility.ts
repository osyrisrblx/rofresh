import http = require("http");
import child_process = require("mz/child_process");
import fs = require("mz/fs");
import path = require("path");

const PLUGIN_FILE_NAME = "RofreshPlugin.rbxmx";
const ROBLOX_STUDIO_PROCESS_NAME = "RobloxStudioBeta";
const MAX_FILE_RETRY = 5;
const FILE_RETRY_DELAY = 10; // ms

const LATEST_PLUGIN_VERSION = 1;

function decircularJson(object: any) {
	let cache: Array<any> | null = new Array<any>();
	const result = JSON.stringify(object, (_, value) => {
		if (typeof value === "object" && value !== null) {
			if (cache!.indexOf(value) !== -1) {
				try {
					return JSON.parse(JSON.stringify(value));
				} catch (error) {
					return;
				}
			}
			cache!.push(value);
		}
		return value;
	});
	cache = null;
	return result;
}

export function writeJsonDebug(res: http.ServerResponse, object: any) {
	res.setHeader("content-type", "application/json");
	res.write(decircularJson(object));
	res.end();
}

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

export async function isProcessRunning(name: string) {
	let cmd = "";
	if (process.platform === "win32") {
		cmd = WIN32_CMD;
		name += WIN32_SUFFIX;
	} else if (process.platform === "darwin") {
		cmd = DARWIN_CMD + name;
	} else {
		return false;
	}
	const [stdout, stderr] = await child_process.exec(cmd);
	return (
		stdout
			.toString()
			.toLowerCase()
			.indexOf(name.toLowerCase()) > -1
	);
}

async function getPluginFolderWin32() {
	const appData = process.env.LOCALAPPDATA;
	if (appData) {
		const robloxFolder = path.join(appData, "Roblox");
		if (await fs.exists(robloxFolder)) {
			const pluginsFolder = path.join(robloxFolder, "Plugins");
			if (!(await fs.exists(pluginsFolder))) {
				await fs.mkdir(pluginsFolder);
			}
			return pluginsFolder;
		}
	}
}

async function getPluginFolderDarwin() {
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
export async function installPlugin(installDir?: string) {
	const pluginPath = path.join(__dirname, "..", PLUGIN_FILE_NAME);
	if (!(await fs.exists(pluginPath))) {
		throw new Error("Plugin file missing!");
	}

	let pluginFolder: string | undefined;
	if (installDir) {
		pluginFolder = path.join(installDir, "Plugins", PLUGIN_FILE_NAME);
	} else {
		if (process.platform === "win32") {
			pluginFolder = await getPluginFolderWin32();
		} else if (process.platform === "darwin") {
			pluginFolder = await getPluginFolderDarwin();
			// TODO
			return PluginInstallResult.Failure;
		} else {
			return PluginInstallResult.Failure;
		}
	}

	if (pluginFolder === undefined) {
		return PluginInstallResult.Failure;
	}

	const pluginFileExt = path.extname(PLUGIN_FILE_NAME);
	const pluginFileBaseName = path.basename(PLUGIN_FILE_NAME, pluginFileExt);
	const installPath = path.join(pluginFolder, pluginFileBaseName + "_" + LATEST_PLUGIN_VERSION + pluginFileExt);
	let currentFound = false;
	for (const fileName of await fs.readdir(pluginFolder)) {
		const filePath = path.join(pluginFolder, fileName);
		const matches = fileName.match(new RegExp("^" + PLUGIN_FILE_NAME + "_(\\d+)$"));
		if (!matches) {
			continue;
		}
		const version = parseInt(matches[1], 10);
		if (!isNaN(version)) {
			if (!currentFound && version >= LATEST_PLUGIN_VERSION) {
				currentFound = true;
			} else {
				fs.unlink(filePath);
			}
		}
	}

	if (currentFound) {
		return PluginInstallResult.Success;
	}

	// copy
	await fs.writeFile(installPath, await fs.readFile(pluginPath));
	if (await isProcessRunning(ROBLOX_STUDIO_PROCESS_NAME)) {
		return PluginInstallResult.PromptRestartStudio;
	} else {
		return PluginInstallResult.Success;
	}
}
