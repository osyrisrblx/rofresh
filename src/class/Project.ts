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

	private _placeIds = new Set<number>();
	public readonly placeIds: ReadonlySet<number> = this._placeIds;

	public readonly directory: string;
	public name = "";

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
		this.name = config.name;
		this.allowAnyPlaceId = config.allowAnyPlaceId === true;
		if (!this.allowAnyPlaceId) {
			this._placeIds = new Set<number>(config.placeIds);
		}
		const configPartitions = config.partitions || DEFAULT_PARTITIONS;

		// resolve paths
		for (const name in configPartitions) {
			const info = configPartitions[name];
			info.path = path.resolve(this.directory, info.path);
		}

		// remove old partitions
		for (let i = this.partitions.length - 1; i >= 0; i--) {
			const partition = this.partitions[i];
			let found = false;
			for (const name in configPartitions) {
				const info = configPartitions[name];
				if (partition.name === name && partition.directory === info.path && partition.target === info.target) {
					found = true;
					break;
				}
			}
			if (!found) {
				partition.stop();
				this.partitions.splice(i, 1);
			}
		}

		// add new partitions
		for (const name in configPartitions) {
			const info = configPartitions[name];
			let found = false;
			for (const partition of this.partitions) {
				if (partition.name === name && partition.directory === info.path && partition.target === info.target) {
					found = true;
					break;
				}
			}
			if (!found) {
				const partition = new Partition(this, name, info.path, info.target);
				this.partitions.push(partition);
				if (this.isRunning) {
					partition.start();
				}
			}
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
			.mapLeft(errors => console.log("errors", errors));
	}

	public async fullSyncToStudio(client: Client) {
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
