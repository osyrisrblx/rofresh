import fs = require("mz/fs");
import path = require("path");

import Client from "./class/Client";
import Project from "./class/Project";
import Server from "./class/Server";
import { IClientBody } from "./types";
import { isProcessRunningSync, writeError, writeJson } from "./utility";

const PORT = 8888;

const server = new Server();
server.enabled = false;

server.get("/", (request, response) => {
	const clientId = request.headers["client-id"];
	const placeIdStr = request.headers["roblox-id"];
	if (clientId && typeof clientId === "string") {
		if (placeIdStr && typeof placeIdStr === "string") {
			const placeId = parseInt(placeIdStr, 10);
			if (!isNaN(placeId)) {
				let client = Client.instances.filter(value => value.id === clientId)[0];
				if (client) {
					if (client.placeId !== placeId) {
						client.placeId = placeId;
						client.fullSyncToStudio();
					}
				} else {
					client = new Client(clientId, placeId);
					if (client.placeId === 0) {
						writeError(response, "placeId must not be 0");
					}
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
});

server.post("/", (request, response) => {
	writeJson(response, {
		hello: "world",
		url: request.url,
	});
});

server.listen(PORT);

export const PLUGIN_URL = "https://www.roblox.com/";

export { installPlugin, PluginInstallResult } from "./utility";

/**
 * is rofresh currently running
 */
export function isRunning() {
	return server.enabled;
}

/**
 * adds a project directory to rofresh
 */
export function addProject(dir: string, onlyIfNone = false) {
	if (!onlyIfNone || Project.instances.length === 0) {
		if (!Project.instances.reduce((accum, value) => accum || value.directory === dir, false)) {
			const project = new Project(dir);
			if (server.enabled) {
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
	if (server.enabled) {
		console.log("stop");
		server.enabled = false;
		Project.instances.forEach(project => project.stop());
		Client.instances.forEach(client => client.remove());
	}
}

/**
 * starts rofresh
 */
export function start() {
	if (!server.enabled) {
		console.log("start");
		server.enabled = true;
		Project.instances.forEach(project => project.start());
	}
}
