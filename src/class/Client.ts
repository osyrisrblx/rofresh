import http = require("http");

import { Change, ProjectPayload, Remove } from "../types";
import { writeJson } from "../utility";
import Project from "./Project";

export default class Client {
	private static readonly _instances = new Array<Client>();
	public static readonly instances: ReadonlyArray<Client> = Client._instances;

	private sendQueue = new Map<string, Map<string, Change | Remove>>();
	private response?: http.ServerResponse;

	constructor(public id: string, public placeId: number) {
		Client._instances.push(this);
		this.fullSyncToStudio();
	}

	public fullSyncToStudio() {
		Project.instances.filter(project => project.isValidPlaceId(this.placeId)).forEach(project => {
			project.fullSyncToStudio(this);
		});
	}

	public remove() {
		this.disconnect();
		const index = Client.instances.indexOf(this);
		if (index > -1) {
			Client._instances.splice(index, 1);
		}
	}

	public writeResponse() {
		if (this.response) {
			const payload = new Array<ProjectPayload>();
			this.sendQueue.forEach((projectQueue, projectName) => {
				const changes = new Array<Change | Remove>();
				projectQueue.forEach((change, path) => {
					changes.push(change);
					projectQueue.delete(path);
				});
				if (changes.length > 0) {
					payload.push({ projectName, changes });
				}
			});
			if (payload.length > 0) {
				const res = this.response;
				this.response = undefined;
				writeJson(res, payload);
			}
		}
	}

	public setResponse(res: http.ServerResponse) {
		this.disconnect();
		this.response = res;
		this.writeResponse();
	}

	public async syncToStudio(projectName: string, changes: Array<Change | Remove>) {
		let projectQueue = this.sendQueue.get(projectName);
		if (!projectQueue) {
			projectQueue = new Map<string, Change>();
			this.sendQueue.set(projectName, projectQueue);
		}

		changes.forEach(change => {
			const changePath = [...change.path];
			if (changePath[changePath.length - 1] === "init") {
				changePath.pop();
			}
			projectQueue!.set(changePath.join("/") + "/" + change.type, change);
		});
		this.writeResponse();
	}

	public async syncChangesFromStudio(projectName: string, changes: Array<Change>) {
		Project.instances
			.filter(project => project.name === projectName)
			.forEach(project => project.syncChangesFromStudio(changes));
	}

	public disconnect(res?: http.ServerResponse) {
		if (this.response && (!res || res === this.response)) {
			this.response.end();
			this.response = undefined;
		}
	}
}
