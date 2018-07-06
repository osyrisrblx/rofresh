import chokidar = require("chokidar");
import fs = require("mz/fs");
import path = require("path");
import util = require("util");

import { PathReporter } from "io-ts/lib/PathReporter";
import { Change, Remove, RofreshConfig, RofreshConfigIO } from "../types";
import { getFileContents } from "../utility";
import Client from "./Client";
import Partition from "./Partition";

const CONFIG_FILE_NAME = "rofresh.json";
const DEFAULT_PARTITIONS = {
	default: {
		path: "src",
		target: "",
	},
};

export default class Project {
	private static readonly _instances = new Array<Project>();
	public static readonly instances: ReadonlyArray<Project> = Project._instances;

	private configWatcher?: chokidar.FSWatcher;
	private isRunning = false;
	private allowAnyPlaceId = false;

	private _placeIds = new Set<number>();
	public readonly placeIds: ReadonlySet<number> = this._placeIds;

	public readonly directory: string;
	public readonly partitions = new Array<Partition>();
	public name = "";
	public loaded = false;

	constructor(directory: string) {
		Project._instances.push(this);
		this.directory = path.resolve(directory);
		this.setup();
	}

	private async setup() {
		if (!(await fs.exists(this.directory))) {
			throw new Error(util.format("Could not find project directory! [ %s ]", this.directory));
		}
		const configPath = path.join(this.directory, CONFIG_FILE_NAME);
		this.configWatcher = chokidar
			.watch(configPath, {
				ignoreInitial: true,
			})
			.on("change", () => this.readConfig(configPath))
			.on("unlink", () => this.remove());
		this.readConfig(configPath);
	}

	public remove() {
		const index = Project.instances.indexOf(this);
		if (index > -1) {
			Project._instances.splice(index, 1);
		}

		// cleanup
		this.stop();
		if (this.configWatcher) {
			this.configWatcher.close();
			this.configWatcher = undefined;
		}
	}

	public isValidPlaceId(placeId: number) {
		return this.allowAnyPlaceId || this.placeIds.has(placeId);
	}

	private async applyConfig(config: RofreshConfig) {
		let restartAll = false;
		const restartIds = new Set<number>();
		this.name = config.name;
		// normalize falsey -> false
		if (config.allowAnyPlaceId === undefined) {
			config.allowAnyPlaceId = false;
		}
		restartAll = restartAll || config.allowAnyPlaceId !== this.allowAnyPlaceId;
		this.allowAnyPlaceId = config.allowAnyPlaceId === true;
		if (!this.allowAnyPlaceId && config.placeIds) {
			for (const placeId of this.placeIds) {
				if (config.placeIds.indexOf(placeId) === -1) {
					this._placeIds.delete(placeId);
				}
			}

			for (const placeId of config.placeIds) {
				if (!this.placeIds.has(placeId)) {
					this._placeIds.add(placeId);
					restartIds.add(placeId);
				}
			}
		}

		const configPartitions = new Array<{
			name: string;
			path: string;
			target: string;
		}>();

		// resolve paths
		const partitionMap = config.partitions || DEFAULT_PARTITIONS;
		for (const name in partitionMap) {
			configPartitions.push({
				name,
				path: path.resolve(this.directory, partitionMap[name].path),
				target: partitionMap[name].target,
			});
		}

		// remove old partitions
		for (let i = this.partitions.length - 1; i >= 0; i--) {
			const part = this.partitions[i];
			let found = false;
			for (const info of configPartitions) {
				if (part.name === info.name && part.directory === info.path && part.target === info.target) {
					found = true;
					break;
				}
			}
			if (!found) {
				this.partitions.splice(i, 1);
				part.stop();
				// TODO: clean studio files for old partitions?
			}
		}

		// add new partitions
		for (const info of configPartitions) {
			let found = false;
			for (const part of this.partitions) {
				if (part.name === info.name && part.directory === info.path && part.target === info.target) {
					found = true;
					break;
				}
			}
			if (!found && (await fs.exists(info.path))) {
				const partition = new Partition(this, info.name, info.path, info.target);
				this.partitions.push(partition);
				if (this.isRunning && !restartAll) {
					partition.start();
				}
			}
		}

		if (restartAll && this.isRunning) {
			this.partitions.forEach(partition => partition.stop());
			this.partitions.forEach(partition => partition.start());
		} else if (this.isRunning) {
			Client.instances
				.filter(client => restartIds.has(client.placeId))
				.forEach(client => this.partitions.forEach(partition => partition.fullSyncToStudio(client)));
		}
		this.loaded = true;
	}

	private async readConfig(configPath: string) {
		let configJson: object;
		if (await fs.exists(configPath)) {
			const fileContents = await getFileContents(configPath);
			try {
				configJson = JSON.parse(fileContents.toString());
			} catch (e) {
				console.log(util.format("Could not parse JSON ( %s )", configPath));
				return;
			}
		} else {
			// no config, no project
			this.remove();
			return;
		}

		const configIO = RofreshConfigIO.decode(configJson).map(config => this.applyConfig(config));
		if (configIO.isLeft()) {
			console.warn("Config Error", PathReporter.report(configIO));
		}
	}

	public async distributeChangeToStudio(change: Change | Remove) {
		Client.instances
			.filter(client => this.isValidPlaceId(client.placeId))
			.forEach(client => client.syncToStudio(this.name, [change]));
	}

	public async syncChangeFromStudio(change: Change) {}
	public async syncChangesFromStudio(changes: Array<Change>) {}

	public start() {
		if (!this.isRunning) {
			console.log("start", "project", this.directory);
			this.isRunning = true;
			this.partitions.forEach(partition => partition.start());
		}
	}

	public stop() {
		if (this.isRunning) {
			console.log("stop", "project", this.directory);
			this.isRunning = false;
			this.partitions.forEach(partition => partition.stop());
		}
	}
}
