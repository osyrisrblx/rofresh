#!/usr/bin/env node
const jsLog = console.log;
console.log = (...args: Array<any>) => jsLog("\x1b[31m[Rofresh]\x1b[0m", ...args);

import fs = require("fs");
import util = require("util");

import commander = require("commander");
import rofresh = require("./rofresh");

const DEFAULT_PROJECT_DIR = ".";

const pkgVersion = JSON.parse(fs.readFileSync("../package.json", { encoding: "utf8" })).version as string;

commander
	.version(pkgVersion, "-v, --version")
	.arguments("[dir...]")
	.option("-i --install [dir]", "Install Studio Plugin Automatically")
	.action((folders: Array<string>) => {
		for (const folder of folders) {
			if (fs.existsSync(folder)) {
				rofresh.addProject(folder);
			} else {
				throw new Error(util.format("Path does not exist [ %s ]", folder));
			}
		}
	})
	.parse(process.argv);

if (commander.install) {
	let installDir = commander.install;
	if (typeof installDir === "string") {
		if (!fs.existsSync(installDir)) {
			throw new Error(util.format("Specified installation directory does not exist! [ %s ]", installDir));
		}
	} else {
		installDir = null;
	}
	const result = rofresh.installPlugin(installDir);
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
	rofresh.addProject(DEFAULT_PROJECT_DIR, true);
	rofresh.start();
}
