import chokidar = require("chokidar");
import fs = require("mz/fs");
import path = require("path");

import { Change, Remove, Update } from "../types";
import { getFileContents } from "../utility";
import Language from "./Language";
import Project from "./Project";

const RBX_SEPARATOR = ".";

const FILE_TYPE_EXTENSIONS: Array<[string, string]> = [
	["client", "LocalScript"],
	["", "ModuleScript"],
	["server", "Script"],
];

function getTypeBySubExtension(ext: string) {
	for (const pair of FILE_TYPE_EXTENSIONS) {
		if (pair[0] === ext) {
			return pair[1];
		}
	}
	return null;
}

// TODO: reverse sync
// function getSubExtensionByType(type: string) {
// 	for (const pair of FILE_TYPE_EXTENSIONS) {
// 		if (pair[1] === type) {
// 			return pair[0];
// 		}
// 	}
// 	return "";
// }

export default class Partition {
	private isRunning = false;
	private watcher?: chokidar.FSWatcher;
	private rbxPath: Array<string>;
	private isSingleFile = false;

	constructor(
		private project: Project,
		public readonly name: string,
		public readonly directory: string,
		rbxTarget: string,
	) {
		this.rbxPath = rbxTarget.split(RBX_SEPARATOR);
		fs.stat(directory).then(stats => {
			if (stats.isFile()) {
				this.isSingleFile = true;
			}
		});
	}

	private async getPathsRecursive(dir = this.directory, paths = new Array<string>()) {
		if (this.isSingleFile) {
			paths.push(dir);
		} else {
			for (const fileName of await fs.readdir(dir)) {
				const filePath = path.resolve(dir, fileName);
				if ((await fs.stat(filePath)).isDirectory()) {
					await this.getPathsRecursive(filePath, paths);
				} else if (filePath.match(Language.ignoreRegExp) === null) {
					paths.push(filePath);
				}
			}
		}
		return paths;
	}

	public async getChangesRecursive() {
		return Promise.all((await this.getPathsRecursive()).map(filePath => this.getChangeFromFile(filePath)));
	}

	private async getUpdateFromFile(filePath: string): Promise<Update> {
		const fullName = path.basename(filePath, path.extname(filePath));
		const fileTypeExt = path
			.extname(fullName)
			.replace(/^\.+/, "")
			.toLowerCase();

		let changePath = this.rbxPath.concat(path.relative(this.directory, filePath).split(path.sep));
		changePath.pop();
		changePath = changePath.filter(value => value.length > 0);

		changePath = changePath.reduce((accum, value) => {
			return accum.concat(...value.split("."));
		}, new Array<string>());

		let changeType = getTypeBySubExtension(fileTypeExt.toLowerCase());
		let fileName = path.basename(fullName, "." + fileTypeExt);

		if (!changeType) {
			changeType = "ModuleScript";
			fileName += "." + fileTypeExt;
		}

		if (!this.isSingleFile) {
			changePath.push(fileName);
		}

		return {
			path: changePath,
			type: changeType,
		};
	}

	private async getRemoveFromFile(filePath: string): Promise<Remove> {
		const update = await this.getUpdateFromFile(filePath);
		return {
			path: update.path,
			source: null,
			type: update.type,
		};
	}

	private async getChangeFromFile(filePath: string): Promise<Change> {
		const update = await this.getUpdateFromFile(filePath);
		const ext = path.extname(filePath);

		let language: Language | undefined;
		for (const lang of Language.instances) {
			if (ext === lang.ext) {
				language = lang;
			}
		}

		let changeSource: string;
		if (language) {
			changeSource = (await language.getSource(filePath)).toString();
		} else {
			changeSource = (await getFileContents(filePath)).toString();
		}

		return {
			path: update.path,
			source: changeSource,
			type: update.type,
		};
	}

	public async syncChangeToStudio(filePath: string) {
		this.project.distributeChangeToStudio(await this.getChangeFromFile(filePath));
	}

	public async syncRemoveToStudio(filePath: string) {
		this.project.distributeChangeToStudio(await this.getRemoveFromFile(filePath));
	}

	public start() {
		if (!this.isRunning) {
			this.isRunning = true;
			console.log("watch", "partition", this.name, path.relative(this.project.directory, this.directory));
			this.watcher = chokidar
				.watch(this.directory, {
					ignoreInitial: true,
					ignored: (filePath: string, stat?: fs.Stats) =>
						stat &&
						!stat.isDirectory() &&
						!Language.instances
							.map(lang => lang.ext)
							.reduce((accum, ext) => accum || filePath.endsWith(ext), false),
				})
				.on("unlink", (filePath: string) => {
					this.syncRemoveToStudio(filePath);
				})
				.on("add", (filePath: string) => {
					this.syncChangeToStudio(filePath);
				})
				.on("change", (filePath: string) => {
					this.syncChangeToStudio(filePath);
				});
		}
	}

	public stop() {
		if (this.isRunning) {
			this.isRunning = false;
			console.log("stop watch", "partition", this.name, path.relative(this.project.directory, this.directory));
			if (this.watcher) {
				this.watcher.close();
				this.watcher = undefined;
			}
		}
	}
}
