import chokidar = require("chokidar");
import fs = require("mz/fs");
import path = require("path");
import util = require("util");

import { Change, Remove, RofreshConfig } from "../types";
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

	private partitions = new Array<Partition>();
	private configWatcher?: chokidar.FSWatcher;
	private isRunning = false;
	private allowAnyPlaceId = false;
	private hasEverBeenConfigured = false;
	private previousPartitionsJson?: string;

	private _placeIds = new Set<number>();
	public readonly placeIds: ReadonlySet<number> = this._placeIds;

	public readonly directory: string;
	public name = "";

	constructor(directory: string) {
		Project._instances.push(this);
		this.directory = path.resolve(directory);
		if (!fs.existsSync(this.directory)) {
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

	private async readConfig(configPath: string) {
		// reset before attempting to read
		let config: RofreshConfig;
		if (await fs.exists(configPath)) {
			const fileContents = await getFileContents(configPath);
			try {
				config = JSON.parse(fileContents.toString());
			} catch (e) {
				console.log(util.format("Could not parse JSON [ %s ]", configPath));
				return;
			}
		} else {
			// no config, no project
			this.remove();
			return;
		}

		const configPlaceIds = config.placeIds;
		const configAllowAnyPlaceId = config.allowAnyPlaceId;
		if (configAllowAnyPlaceId !== true) {
			if (
				configPlaceIds === undefined ||
				!configPlaceIds.reduce((accum, value) => accum && typeof value === "number", true)
			) {
				// TODO: emit error
				console.log(util.format("Invalid configuration: placeIds [ %s ]", configPath));
				return;
			}
		}

		const configName = config.name;
		if (configName === undefined || typeof configName !== "string") {
			console.log(util.format("Invalid configuration: name"));
			return;
		}

		const configPartitions = config.partitions || DEFAULT_PARTITIONS;
		let amtPartitions = 0;
		for (const key in configPartitions) {
			const partitionInfo = configPartitions[key];
			if (
				typeof key !== "string" ||
				partitionInfo === undefined ||
				partitionInfo.path === undefined ||
				partitionInfo.target === undefined ||
				typeof partitionInfo.path !== "string" ||
				typeof partitionInfo.target !== "string"
			) {
				console.log(util.format("Invalid configuration: partitions"));
				return;
			} else {
				amtPartitions++;
			}
		}

		if (amtPartitions === 0) {
			console.log(util.format("Invalid configuration: need atleast one partition"));
			return;
		}

		// configuration validated

		this.name = configName;
		this.allowAnyPlaceId = configAllowAnyPlaceId === true;
		if (!this.allowAnyPlaceId) {
			this._placeIds = new Set<number>(configPlaceIds);
		}

		const partitionsJson = JSON.stringify(configPartitions);
		if (this.previousPartitionsJson !== partitionsJson) {
			this.previousPartitionsJson = partitionsJson;
			const wasRunning = this.isRunning;
			if (wasRunning) {
				this.stop();
			}
			this.partitions.splice(0, this.partitions.length);
			for (const partitionName in configPartitions) {
				const partitionInfo = configPartitions[partitionName];
				if (partitionInfo) {
					const partitionPath = path.join(this.directory, partitionInfo.path);
					if (await fs.exists(partitionPath)) {
						const partition = new Partition(this, partitionName, partitionPath, partitionInfo.target);
						this.partitions.push(partition);
						if (this.isRunning) {
							partition.start();
						}
					}
				}
			}
			if (wasRunning) {
				this.start();
			}
		}

		this.hasEverBeenConfigured = true;
	}

	public async fullSyncToStudio(client: Client) {
		if (!this.hasEverBeenConfigured) {
			setTimeout(() => this.fullSyncToStudio(client), 10);
			return;
		}
		const promises = new Array<Promise<Array<Change>>>();
		this.partitions.forEach(partition => promises.push(partition.getChangesRecursive()));
		client.syncToStudio(
			this.name,
			(await Promise.all(promises)).reduce((accum, value) => accum.concat(value), new Array<Change>()),
		);
	}

	public async distributeChangeToStudio(change: Change | Remove) {
		Client.instances
			.filter(client => this.isValidPlaceId(client.placeId))
			.forEach(client => client.syncToStudio(this.name, [change]));
	}

	public async syncChangeFromStudio(change: Change) {}
	public async syncChangesFromStudio(changes: Array<Change>) {}

	public start() {
		if (!this.hasEverBeenConfigured) {
			setTimeout(() => this.start(), 10);
			return;
		}
		if (!this.isRunning) {
			console.log("watch", this.directory, [...this.placeIds].toString());
			this.isRunning = true;
			this.partitions.forEach(partition => partition.start());
			Client.instances.filter(client => this.isValidPlaceId(client.placeId)).forEach(client => {
				console.log("full sync (start)", client.id);
				this.fullSyncToStudio(client);
			});
		}
	}

	public stop() {
		if (this.isRunning) {
			console.log("stop watch", this.directory, [...this.placeIds].toString());
			this.isRunning = false;
			this.partitions.forEach(partition => partition.stop());
		}
	}
}
