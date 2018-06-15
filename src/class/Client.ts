import http = require("http");

import { IChange, IProjectPayload } from "../types";
import { writeJson } from "../utility";
import Project from "./Project";

export default class Client {
	private static readonly _instances = new Array<Client>();
	public static readonly instances: ReadonlyArray<Client> = Client._instances;

	private sendQueue = new Map<string, Map<string, IChange>>();
	private response?: http.ServerResponse;

	constructor(public id: string, public placeId: number) {
		Client._instances.push(this);
		console.log("client", id, placeId);
		this.fullSyncToStudio();
	}

	public fullSyncToStudio() {
		Project.instances
			.filter(project => project.placeIds.has(this.placeId))
			.forEach(project => project.fullSyncToStudio(this));
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
			const payload = new Array<IProjectPayload>();
			this.sendQueue.forEach((projectQueue, projectId) => {
				const changes = new Array<IChange>();
				projectQueue.forEach((change, path) => {
					changes.push(change);
					projectQueue.delete(path);
				});
				if (changes.length > 0) {
					payload.push({ projectId, changes });
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

	public async syncToStudio(projectId: string, changes: Array<IChange>) {
		let projectQueue = this.sendQueue.get(projectId);
		if (!projectQueue) {
			projectQueue = new Map<string, IChange>();
			this.sendQueue.set(projectId, projectQueue);
		}

		changes.forEach(change => {
			const changePath = [...change.path];
			if (changePath[changePath.length - 1] === "init") {
				changePath.pop();
			}
			const changeKey = changePath.join(".") + "." + change.type;
			console.log("changeKey", changeKey);
			projectQueue!.set(changeKey, change);
		});
		this.writeResponse();
	}

	public async syncChangesFromStudio(projectId: string, changes: Array<IChange>) {
		console.log("syncChangesFromStudio", projectId, changes.length);
		Project.instances
			.filter(project => project.id === projectId)
			.forEach(project => project.syncChangesFromStudio(changes));
	}

	public disconnect(res?: http.ServerResponse) {
		if (this.response && (!res || res === this.response)) {
			this.response.end();
			this.response = undefined;
		}
	}
}
