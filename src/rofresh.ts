import http = require("http");
import path = require("path");

import Client from "./class/Client";
import Language from "./class/Language";
import Project from "./class/Project";
import Server from "./class/Server";
import { ClientPayload } from "./types";
import { writeJson, writeJsonDebug } from "./utility";

const PORT = 8888;

const server = new Server();
server.enabled = false;

function getClient(req: http.IncomingMessage) {
	const clientId = req.headers["client-id"];
	const placeIdStr = req.headers["roblox-id"];
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

	let client = Client.instances.filter(value => value.id === clientId)[0];
	if (client) {
		if (client.placeId !== placeId) {
			client.placeId = placeId;
			client.fullSyncAllToStudio();
		}
	} else {
		client = new Client(clientId, placeId);
	}

	return client;
}

server.get("/", (req, res) => getClient(req).setResponse(res));

server.get("/projects", (req, res) => {
	const client = getClient(req);
	writeJson(
		res,
		Project.instances.filter(project => project.isValidPlaceId(client.placeId)).map(project => project.name),
	);
});

server.get("/debug", (req, res) => {
	writeJsonDebug(res, {
		clients: Client.instances,
		languages: Language.instances,
		projects: Project.instances,
	});
});

server.listen(PORT);

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
export function addProject(dir: string) {
	dir = path.resolve(dir);
	if (!Project.instances.some(p => p.directory === dir)) {
		const project = new Project(dir);
		if (server.enabled) {
			project.start();
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
		console.log("stop", "server");
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
		console.log("start", "server");
		server.enabled = true;
		Project.instances.forEach(project => project.start());
	}
}
