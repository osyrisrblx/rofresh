import fs = require("mz/fs");
import path = require("path");

import Client from "./class/Client";
import Project from "./class/Project";
import Server from "./class/Server";
import { IClientBody } from "./types";
import { writeJson } from "./utility";

const PORT = 8888;

const server = new Server();
server.enabled = false;

server.get("/", (request, response) => {
	const clientId = request.headers["client-id"];
	const placeIdStr = request.headers["roblox-id"];
	if (!clientId || typeof clientId !== "string") {
		throw new Error("Bad clientId!");
	}

	if (!placeIdStr || typeof placeIdStr !== "string") {
		throw new Error("Bad placeId!");
	}

	const placeId = parseInt(placeIdStr, 10);
	if (typeof placeId !== "number" || isNaN(placeId)) {
		throw new Error("placeId must be a number!");
	}

	if (placeId === 0) {
		throw new Error("placeId must not be 0");
	}

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
 * determines if rofresh is currently running
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
