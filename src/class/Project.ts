import chokidar = require("chokidar");
import fs = require("mz/fs");
import path = require("path");
import util = require("util");

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

	private configTasks = new Array<() => void>();

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

	private async applyConfig(config: RofreshConfig) {
		this.name = config.name;
		this.allowAnyPlaceId = config.allowAnyPlaceId === true;
		if (!this.allowAnyPlaceId) {
			this._placeIds = new Set<number>(config.placeIds);
		}
		const configPartitions = config.partitions || DEFAULT_PARTITIONS;
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
					const partition = new Partition(this, partitionName, partitionPath, partitionInfo.target);
					this.partitions.push(partition);
					if (this.isRunning) {
						partition.start();
					}
				}
			}
			if (wasRunning) {
				this.start();
			}
		}
		this.hasEverBeenConfigured = true;
		if (this.configTasks.length > 0) {
		}
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

		RofreshConfigIO.decode(configJson)
			.map(config => this.applyConfig(config))
			.mapLeft(errors => {
				errors.forEach(error => console.log(error.value));
			});
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
