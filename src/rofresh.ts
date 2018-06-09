import http = require("http");

import Client from "./class/Client";
import Project from "./class/Project";
import { IClientBody } from "./types";
import { writeError } from "./utility";

const PORT = 8888;

function onRequest(request: http.IncomingMessage, response: http.ServerResponse) {
	const clientId = request.headers.id;
	const placeIdStr = request.headers["roblox-id"];
	if (clientId && typeof clientId === "string") {
		if (placeIdStr && typeof placeIdStr === "string") {
			const placeId = parseInt(placeIdStr, 10);
			if (placeId) {
				const client = Client.get(clientId, placeId);
				if (client) {
					client.setResponse(response);
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

let server: http.Server | undefined;
let isRunning = false;

/**
 * stops rofresh
 */
export function stop() {
	console.log("stop");
	Project.instances.forEach(project => project.stop());
	Client.instances.forEach(client => {
		client.disconnect();
		client.remove();
	});
	if (server) {
		server.close();
		server = undefined;
	}
	isRunning = false;
}

/**
 * starts rofresh
 */
export function start() {
	console.log("start");
	if (isRunning) {
		stop();
	}
	server = http.createServer(onRequest).listen(PORT);
	Project.instances.forEach(project => project.start());
	isRunning = true;
}
