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
		const changes = new Array<Promise<Change>>();
		await Promise.all(project.partitions.map(partition => partition.addChangesRecursive(changes)));
		this.getProjectQueue(project.name).initial = true;
		this.syncToStudio(project.name, await Promise.all(changes));
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

			let totalChanges = 0;
			let totalProjects = 0;

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
						totalChanges++;
						projectQueue.changes.delete(key);
					}
				}
				if (changes.length > 0 || projectQueue.initial) {
					totalProjects++;
					payload.push({ projectName, changes, initial: projectQueue.initial });
					projectQueue.initial = false;
				}
			}

			if (payload.length > 0) {
				console.log(
					"send",
					payload.map(value => value.projectName + (value.initial ? "*" : "")).toString(),
					util.format("totalChanges: %d", totalChanges),
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

	public async syncToStudio(projectName: string, changes: Array<Change | Remove>) {
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

	public async syncChangesFromStudio(projectName: string, changes: Array<Change>) {
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
