import fs = require("mz/fs");
import nsfw = require("nsfw");
import path = require("path");

import { Change, Remove, Update } from "../types";
import { getFileContents } from "../utility";
import Client from "./Client";
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

function filterNsfwEvents(curr: nsfw.Event, index: number, events: Array<nsfw.Event>) {
	if (index > 0) {
		const prev = events[index - 1];
		if (curr.action === prev.action) {
			if (curr.action === nsfw.actions.RENAMED && prev.action === nsfw.actions.RENAMED) {
				if (
					curr.directory === prev.directory &&
					curr.newDirectory === prev.newDirectory &&
					curr.newFile === prev.newFile &&
					curr.oldFile === prev.oldFile
				) {
					return false;
				}
			} else if (curr.action !== nsfw.actions.RENAMED && prev.action !== nsfw.actions.RENAMED) {
				if (curr.directory === prev.directory && curr.file === prev.file) {
					return false;
				}
			}
		}
	}
	return true;
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
	private watcher?: nsfw.Watcher;
	private rbxPath: Array<string>;

	private isSingleFile = false;
	private isSingleFileSet = false;

	constructor(
		public readonly project: Project,
		public readonly name: string,
		public readonly directory: string,
		public readonly target: string,
	) {
		this.rbxPath = target.split(RBX_SEPARATOR);
		this.setSingleFile();
	}

	private async setSingleFile() {
		if (!this.isSingleFileSet) {
			this.isSingleFile = (await fs.stat(this.directory)).isFile();
			this.isSingleFileSet = true;
		}
	}

	public async addChangesRecursive(changes = new Array<Promise<Change>>(), dir = this.directory) {
		await this.setSingleFile();
		if (this.isSingleFile) {
			changes.push(this.getChangeFromFile(dir));
		} else {
			const promises = new Array<Promise<void>>();
			for (const fileName of await fs.readdir(dir)) {
				const filePath = path.resolve(dir, fileName);
				if ((await fs.stat(filePath)).isDirectory()) {
					promises.push(this.addChangesRecursive(changes, filePath));
				} else if (filePath.match(Language.ignoreRegExp) === null) {
					changes.push(this.getChangeFromFile(filePath));
				}
			}
			await Promise.all(promises);
		}
	}

	private getUpdateFromFile(filePath: string): Update {
		const fullName = path.basename(filePath, path.extname(filePath));
		const fileTypeExt = path
			.extname(fullName)
			.substr(1) // remove leading period
			.toLowerCase();

		let changePath = this.rbxPath.concat(path.relative(this.directory, filePath).split(path.sep));
		changePath.pop();
		changePath = changePath
			.filter(value => value.length > 0)
			.reduce((accum, value) => accum.concat(...value.split(".")), new Array<string>());

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
		const update = this.getUpdateFromFile(filePath);
		return {
			path: update.path,
			source: null,
			type: update.type,
		};
	}

	private async getChangeFromFile(filePath: string): Promise<Change> {
		const update = this.getUpdateFromFile(filePath);
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

	public async start() {
		if (!this.isRunning) {
			this.isRunning = true;
			console.log("start", "partition", this.name, path.relative(this.project.directory, this.directory));
			this.watcher = await nsfw(this.directory, async events => {
				try {
					events = events.filter(filterNsfwEvents);
					console.log("EVENTS");
					for (const event of events) {
						console.log(event);
						if (event.action === nsfw.actions.RENAMED) {
						} else {
							const filePath = path.join(event.directory, event.file);
							const isFile = await fs.exists(filePath) && (await fs.lstat(filePath)).isFile();
							if (event.action === nsfw.actions.CREATED && isFile) {
								await this.syncChangeToStudio(filePath);
							} else if (event.action === nsfw.actions.MODIFIED && isFile) {
								await this.syncChangeToStudio(filePath);
							} else if (event.action === nsfw.actions.DELETED) {
								await this.syncRemoveToStudio(filePath);
							}
						}
					}
				} catch (e) {
					console.log(e);
				}
			});
			this.watcher.start();
		}
	}

	public stop() {
		if (this.isRunning) {
			this.isRunning = false;
			console.log("stop watch", "partition", this.name, path.relative(this.project.directory, this.directory));
			if (this.watcher) {
				this.watcher.stop();
				this.watcher = undefined;
			}
		}
	}
}
