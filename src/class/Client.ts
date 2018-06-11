import http = require("http");

import { IChange } from "../types";
import { writeJson } from "../utility";
import Project from "./Project";

export default class Client {
	private static readonly _instances = new Array<Client>();
	public static readonly instances: ReadonlyArray<Client> = Client._instances;

	private changeQueue = new Map<string, IChange>();
	private response?: http.ServerResponse;

	constructor(public id: string, public placeId: number) {
		Client._instances.push(this);
		this.fullSyncToStudio();
	}

	public fullSyncToStudio() {
		Project.instances
			.filter(project => project.placeIds.has(this.placeId))
			.forEach(project => project.fullSyncToStudio(this));
	}

	public remove() {
		const index = Client._instances.indexOf(this);
		if (index > -1) {
			Client._instances.splice(index, 1);
		}
	}

	public writeResponse() {
		if (this.response && this.changeQueue.size !== 0) {
			const changes = new Array<IChange>();
			while (this.changeQueue.size !== 0) {
				const key = this.changeQueue.keys().next().value;
				const change = this.changeQueue.get(key);
				this.changeQueue.delete(key);
				if (change) {
					changes.push(change);
				}
			}

			const res = this.response;
			this.response = undefined;
			writeJson(res, changes);
		}
	}

	public setResponse(res: http.ServerResponse) {
		this.disconnect();
		this.response = res;
		this.writeResponse();
	}

	public async syncChangesToStudio(changes: Array<IChange>) {
		changes.forEach(change => this.changeQueue.set(change.path.join("/") + "/" + change.type, change));
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
