import http = require("http");
import fs = require("mz/fs");
import path = require("path");

import Client from "./class/Client";
import Project from "./class/Project";
import { IClientBody } from "./types";
import { isProcessRunningSync, writeError } from "./utility";

const PORT = 8888;
const PLUGIN_FILE_NAME = "RofreshPlugin.lua";
const ROBLOX_STUDIO_PROCESS_NAME = "RobloxStudioBeta";

let server: http.Server | undefined;
let running = false;

export enum PluginInstallResult {
	Success,
	Failure,
	PromptRestartStudio,
	AlreadyInstalled, // TODO: check version
}

function onRequest(request: http.IncomingMessage, response: http.ServerResponse) {
	const clientId = request.headers.id;
	const placeIdStr = request.headers["roblox-id"];
	if (clientId && typeof clientId === "string") {
		if (placeIdStr && typeof placeIdStr === "string") {
			const placeId = parseInt(placeIdStr, 10);
			if (placeId) {
				let client = Client.instances.filter(value => value.id === clientId)[0];
				if (client) {
					if (client.placeId !== placeId) {
						client.placeId = placeId;
						client.fullSyncToStudio();
					}
				} else {
					client = new Client(clientId, placeId);
				}
				if (client) {
					if (request.method === "GET") {
						client.setResponse(response);
					} else if (request.method === "POST") {
						// TODO
						let data = "";
						request
							.on("close", () => client.disconnect(response))
							.on("data", chunk => (data += chunk.toString()))
							.on("end", () => {
								let clientBody: IClientBody | undefined;
								try {
									clientBody = JSON.parse(data);
								} catch (e) {}
								if (clientBody) {
									const changes = clientBody.changes;
									const projectId = clientBody.projectId;
									if (changes && changes.length > 0 && projectId) {
										client.syncChangesFromStudio(projectId, changes);
									}
								}
							});
					}
				} else {
					writeError(response, "Client placeId mismatch!");
				}
			} else {
				writeError(response, "placeId must be a number!");
			}
		} else {
			writeError(response, "Bad placeId!");
		}
	} else {
		writeError(response, "Bad clientId!");
	}
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

/**
 * is rofresh currently running
 */
export function isRunning() {
	return running;
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

/**
 * adds a project directory to rofresh
 */
export function addProject(dir: string, onlyIfNone = false) {
	if (!onlyIfNone || Project.instances.length === 0) {
		if (!Project.instances.reduce((accum, value) => accum || value.directory === dir, false)) {
			const project = new Project(dir);
			if (running) {
				project.start();
			}
		}
	}
}

/**
 * removes a project directory from rofresh
 */
export function removeProject(dir: string) {
	dir = path.resolve(dir);
	Project.instances.filter(project => project.directory === dir).forEach(project => {
		project.stop();
		project.remove();
	});
}

/**
 * stops rofresh
 */
export function stop() {
	if (running) {
		console.log("stop");
		running = false;
		Project.instances.forEach(project => project.stop());
		Client.instances.forEach(client => {
			client.disconnect();
			client.remove();
		});
		if (server) {
			server.close();
			server = undefined;
		}
	}
}

/**
 * starts rofresh
 */
export function start() {
	if (!running) {
		console.log("start");
		running = true;
		server = http.createServer(onRequest).listen(PORT);
		Project.instances.forEach(project => project.start());
	}
}
