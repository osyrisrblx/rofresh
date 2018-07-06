import http = require("http");
import util = require("util");

import { Change, ProjectPayload, Remove } from "../types";
import { writeJson } from "../utility";
import Project from "./Project";

class ProjectQueue {
	public changes = new Map<string, Change | Remove>();
	public initial?: boolean;
}

export default class Client {
	private static readonly _instances = new Array<Client>();
	public static readonly instances: ReadonlyArray<Client> = Client._instances;

	private sendQueue = new Map<string, ProjectQueue>();
	private response?: http.ServerResponse;

	constructor(public id: string, public placeId: number) {
		Client._instances.push(this);
		this.fullSyncAllToStudio();
	}

	private getProjectQueue(projectName: string) {
		let projectQueue = this.sendQueue.get(projectName);
		if (projectQueue === undefined) {
			projectQueue = new ProjectQueue();
			this.sendQueue.set(projectName, projectQueue);
		}
		return projectQueue;
	}

	public async fullSyncProjectToStudio(project: Project) {
		if (!project.loaded) {
			return;
		}
		const promises = new Array<Promise<Change>>();
		await Promise.all(project.partitions.map(partition => partition.addChangesRecursive(promises)));
		const changes = await Promise.all(promises);
		this.getProjectQueue(project.name).initial = true;
		this.syncToStudio(project.name, changes);
	}

	public async fullSyncAllToStudio() {
		Project.instances
			.filter(project => project.isValidPlaceId(this.placeId))
			.forEach(project => this.fullSyncProjectToStudio(project));
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

			for (const projectName of this.sendQueue.keys()) {
				const projectQueue = this.sendQueue.get(projectName);
				if (projectQueue === undefined) {
					continue;
				}
				const changes = new Array<Change | Remove>();
				for (const key of projectQueue.changes.keys()) {
					const change = projectQueue.changes.get(key);
					if (change) {
						changes.push(change);
						projectQueue.changes.delete(key);
					}
				}
				const initial = projectQueue.initial;
				if (changes.length > 0 || initial === true) {
					payload.push({ projectName, changes, initial });
					projectQueue.initial = false;
				}
			}
			if (payload.length > 0) {
				console.log(
					"send",
					payload
						.map(value =>
							util.format(
								"%s%s (%d)",
								value.projectName,
								value.initial ? "*" : "",
								value.changes ? value.changes.length : 0,
							),
						)
						.join(", "),
					util.format("[%d]", this.placeId),
				);
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

	public syncToStudio(projectName: string, changes: Array<Change | Remove>) {
		const projectQueue = this.getProjectQueue(projectName);
		for (const change of changes) {
			const changePath = [...change.path];
			if (changePath[changePath.length - 1] === "init") {
				changePath.pop();
			}
			projectQueue.changes.set(changePath.join("/") + "/" + change.type, change);
		}
		this.writeResponse();
	}

	public syncChangesFromStudio(projectName: string, changes: Array<Change>) {
		Project.instances
			.filter(project => project.name === projectName)
			.forEach(project => project.syncChangesFromStudio(changes));
	}

	public disconnect(res?: http.ServerResponse) {
		if (this.response && (res === undefined || res === this.response)) {
			this.response.end();
			this.response = undefined;
		}
	}
}
