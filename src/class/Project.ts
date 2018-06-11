import chokidar = require("chokidar");
import fs = require("mz/fs");
import path = require("path");
import util = require("util");
import uuid = require("uuid/v4");

import { IChange, IRofreshConfig } from "../types";
import Client from "./Client";
import Language from "./Language";

export const CONFIG_FILE_NAME = "rofresh.json";
export const SOURCE_FOLDER_NAME = "src";

export const FILE_TYPE_EXTENSIONS: Array<[string, string]> = [
	["client", "LocalScript"],
	["", "ModuleScript"],
	["server", "Script"],
];

function getFileTypeByExtension(ext: string) {
	for (const pair of FILE_TYPE_EXTENSIONS) {
		if (pair[0] === ext) {
			return pair[1];
		}
	}
	return "";
}

/*
function getFileExtensionByType(type: string) {
	for (const pair of FILE_TYPE_EXTENSIONS) {
		if (pair[1] === type) {
			return pair[0];
		}
	}
	return "";
}
*/

export default class Project {
	private static readonly _instances = new Array<Project>();
	public static readonly instances: ReadonlyArray<Project> = Project._instances;

	private isRunning = false;
	private watcher: chokidar.FSWatcher | undefined;
	private configWatcher: chokidar.FSWatcher | undefined;
	private config: IRofreshConfig = {};

	public readonly placeIds = new Set<number>();
	public readonly directory: string;
	public readonly sourceDir: string;
	public readonly id = uuid();

	constructor(directory: string) {
		Project._instances.push(this);
		this.directory = path.resolve(directory);
		this.sourceDir = path.join(this.directory, SOURCE_FOLDER_NAME);
		if (!fs.existsSync(this.directory)) {
			throw new Error(util.format("Could not find project directory! [ %s ]", this.directory));
		}
		let config: IRofreshConfig = {};
		const configPath = path.join(this.directory, CONFIG_FILE_NAME);
		this.configWatcher = chokidar
			.watch(configPath, {
				ignoreInitial: true,
			})
			.on("change", (filePath, stats) => this.readConfig(configPath))
			.on("unlink", (filePath: string) => this.remove());
		this.readConfig(configPath);
	}

	private async readConfig(configPath: string) {
		console.log("readConfig", configPath);
		// reset before attempting to read
		this.config = {};
		// this.placeIds.clear();

		if (await fs.exists(configPath)) {
			let fileContents: string | undefined;
			try {
				fileContents = await fs.readFile(configPath, "utf8");
				this.config = JSON.parse(fileContents);
			} catch (e) {
				if (fileContents && fileContents.length === 0) {
					setTimeout(() => this.readConfig(configPath), 100);
				} else {
					// TODO: emit error
					console.log(util.format("Could not parse JSON [ %s ]", configPath));
				}
				return;
			}
		} else {
			this.remove();
			return;
		}

		const configPlaceIds = this.config.placeIds;
		if (configPlaceIds) {
			if (!configPlaceIds.reduce((accum, value) => accum && typeof value === "number" && value > 0, true)) {
				// TODO: emit error
				console.log(util.format("Invalid configuration: placeIds [ %s ]", configPath));
				return;
			}

			[...this.placeIds]
				.filter(placeId => configPlaceIds.indexOf(placeId) === -1)
				.forEach(placeId => this.placeIds.delete(placeId));
			configPlaceIds
				.filter(placeId => !this.placeIds.has(placeId))
				.forEach(placeId => this.placeIds.add(placeId));
			console.log(this.directory, [...this.placeIds].toString());
		}
	}

	private async getChangeFromFile(filePath: string) {
		const ext = path.extname(filePath);
		const fullName = path.basename(filePath, ext);
		const fileTypeExt = path
			.extname(fullName)
			.replace(/^\.+/, "")
			.toLowerCase();
		const changePath = path.relative(this.sourceDir, filePath).split(path.sep);
		changePath.pop();
		changePath.push(path.basename(fullName, "." + fileTypeExt));

		let changeSource: string | undefined;
		for (const lang of Language.instances) {
			if (ext === lang.ext) {
				changeSource = (await lang.getSource(filePath)).toString();
			}
		}

		if (!changeSource) {
			throw new Error("Could not find applicable Language for filePath! [ " + filePath + " ]");
		}

		const change: IChange = {
			path: changePath,
			source: changeSource,
			type: getFileTypeByExtension(fileTypeExt),
		};
		return change;
	}

	private async getChangesFromDir(dir = this.directory, changes: Array<IChange> = new Array<IChange>()) {
		for (const fileName of await fs.readdir(dir)) {
			const filePath = path.resolve(dir, fileName);
			if ((await fs.stat(filePath)).isDirectory()) {
				await this.getChangesFromDir(filePath, changes);
			} else if (!filePath.match(Language.ignoreRegExp)) {
				changes.push(await this.getChangeFromFile(filePath));
			}
		}
		return changes;
	}

	public remove() {
		const index = Project._instances.indexOf(this);
		if (index > -1) {
			Project._instances.splice(index, 1);
		}

		// cleanup
		if (this.watcher) {
			this.watcher.close();
			this.watcher = undefined;
		}
		if (this.configWatcher) {
			this.configWatcher.close();
			this.configWatcher = undefined;
		}
	}

	public async fullSyncToStudio(client: Client) {
		client.syncChangesToStudio(await this.getChangesFromDir());
	}

	public async syncChangeToStudio(filePath: string, stats: fs.Stats) {
		console.log("change", path.relative(this.sourceDir, filePath));
		const change = await this.getChangeFromFile(filePath);
		Client.instances
			.filter(client => this.placeIds.has(client.placeId))
			.forEach(client => client.syncChangesToStudio([change]));
	}

	public async syncChangeFromStudio(change: IChange) {}

	public async syncChangesFromStudio(changes: Array<IChange>) {
		changes.forEach(change => this.syncChangeFromStudio(change));
	}

	public start() {
		if (!this.isRunning) {
			console.log("watch", this.directory, [...this.placeIds].toString());
			this.isRunning = true;
			this.watcher = chokidar
				.watch(this.sourceDir, {
					ignoreInitial: true,
					ignored: (filePath: string, stat?: fs.Stats) =>
						stat &&
						!stat.isDirectory() &&
						!Language.instances
							.map(lang => lang.ext)
							.reduce((accum, ext) => accum || filePath.endsWith(ext), false),
				})
				.on("change", (filePath, stats) => this.syncChangeToStudio(filePath, stats))
				.on("add", (filePath, stats) => this.syncChangeToStudio(filePath, stats))
				.on("unlink", (filePath: string) => {});
		}
	}

	public stop() {
		if (this.isRunning) {
			console.log("stop watch", this.directory, [...this.placeIds].toString());
			this.isRunning = false;
			if (this.watcher) {
				this.watcher.close();
				this.watcher = undefined;
			}
		}
	}
}
