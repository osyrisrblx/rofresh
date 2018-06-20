#!/usr/bin/env node
const jsLog = console.log;
console.log = (...args: Array<any>) => jsLog("\x1b[31m[Rofresh]\x1b[0m", ...args);

import fs = require("mz/fs");
import path = require("path");
import util = require("util");

import commander = require("commander");
import rofresh = require("./rofresh");

const DEFAULT_PROJECT_DIR = ".";

async function main() {
	const pkgVersion = JSON.parse(await fs.readFile(path.join(__dirname, "..", "package.json"), { encoding: "utf8" }))
		.version as string;

	const projectFolders = new Array<string>();

	commander
		.version(pkgVersion, "-v, --version")
		.arguments("[dir...]")
		.option("-i --install [dir]", "Install Studio Plugin Automatically")
		.action((folders: Array<string>) => {
			for (const folder of folders) {
				projectFolders.push(folder);
			}
		})
		.parse(process.argv);

	if (commander.install) {
		let installDir = commander.install;
		if (typeof installDir === "string") {
			if (!(await fs.exists(installDir))) {
				throw new Error(util.format("Specified installation directory does not exist! [ %s ]", installDir));
			}
		} else {
			installDir = null;
		}
		const result = await rofresh.installPlugin(installDir);
		if (result === rofresh.PluginInstallResult.Success) {
			console.log("Rofresh plugin successfully installed!");
		} else if (result === rofresh.PluginInstallResult.Failure) {
			console.log("Rofresh plugin could not be installed automatically!");
			console.log(util.format("Please install manually from %s", rofresh.PLUGIN_URL));
		} else if (result === rofresh.PluginInstallResult.PromptRestartStudio) {
			console.log("Rofresh plugin successfully installed!");
			console.log("Please restart Roblox Studio.");
		}
	} else {
		let projectsAdded = 0;
		for (const dir of projectFolders) {
			if (await fs.exists(dir)) {
				rofresh.addProject(dir);
				projectsAdded++;
			}
		}

		if (projectsAdded === 0) {
			rofresh.addProject(DEFAULT_PROJECT_DIR);
		}
		rofresh.start();
	}
}

main();
