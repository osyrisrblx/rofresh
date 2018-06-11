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

	public static remove(project: Project) {
		const index = this.instances.indexOf(project);
		if (index > -1) {
			this._instances.splice(index, 1);
		}
	}

	private watcher: chokidar.FSWatcher | null = null;
	public placeIds = new Array<number>();
	public directory: string;
	public sourceDir: string;
	public id = uuid();

	constructor(directory: string) {
		Project._instances.push(this);
		this.directory = path.resolve(directory);
		this.sourceDir = this.directory + "/" + SOURCE_FOLDER_NAME;
		if (!fs.existsSync(this.directory)) {
			throw new Error(util.format("Could not find project directory! [ %s ]", this.directory));
		}
		let config: IRofreshConfig = {};
		const configPath = util.format("%s/%s", this.directory, CONFIG_FILE_NAME);
		if (fs.existsSync(configPath)) {
			config = JSON.parse(fs.readFileSync(configPath, "utf8"));
		} else {
			throw new Error(util.format("Could not find %s! [ %s ]", CONFIG_FILE_NAME, configPath));
		}

		const configPlaceIds = config.placeIds;
		if (configPlaceIds) {
			this.placeIds = configPlaceIds;
			this.placeIds.forEach(value => {
				if (typeof value !== "number" || value < 0) {
					throw new Error(util.format("Bad placeId in %s! [%s]", CONFIG_FILE_NAME, value));
				}
			});
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

	public async fullSyncToStudio(client: Client) {
		client.syncChangesToStudio(await this.getChangesFromDir());
	}

	public async syncChangeToStudio(filePath: string, stats: fs.Stats) {
		console.log("change", path.relative(this.sourceDir, filePath));
		const change = await this.getChangeFromFile(filePath);
		Client.instances
			.filter(client => this.placeIds.indexOf(client.placeId) !== -1)
			.forEach(client => client.syncChangesToStudio([change]));
	}

	public async syncChangeFromStudio(change: IChange) {}

	public async syncChangesFromStudio(changes: Array<IChange>) {
		changes.forEach(change => this.syncChangeFromStudio(change));
	}

	public start() {
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
		console.log("start", this.directory, this.placeIds);
	}

	public stop() {
		if (this.watcher) {
			this.watcher.close();
			this.watcher = null;
		}
		console.log("stop", this.directory, this.placeIds);
	}
}
