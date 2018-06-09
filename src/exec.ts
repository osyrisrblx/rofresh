#!/usr/bin/env node
const jsLog = console.log;
console.log = (...args: Array<any>) => jsLog("\x1b[31m[Rofresh]\x1b[0m", ...args);

import commander = require("commander");
import rofresh = require("./rofresh");

import Project from "./class/Project";

const DEFAULT_PROJECT_DIR = ".";

const pkgVersion = process.env.npm_package_version || "0.0.0";
if (typeof pkgVersion !== "string") {
	throw new Error("package.json version must be a string!");
}

commander
	.version(pkgVersion, "-v, --version")
	.arguments("[dir...]")
	.option("-i --install [dir]", "Install Studio Plugin Automatically")
	.action((args: Array<any>) => {
		for (const arg of args) {
			if (typeof arg === "string") {
				Project.add(arg);
			} else {
				throw new Error("Invalid argument!");
			}
		}
	})
	.parse(process.argv);

if (Project.instances.length === 0) {
	Project.add(DEFAULT_PROJECT_DIR);
}
rofresh.start();
