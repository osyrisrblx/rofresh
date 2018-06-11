import child_process = require("mz/child_process");
import fs = require("mz/fs");
import path = require("path");

export default class Language {
	private static readonly _instances = new Array<Language>();
	public static readonly instances: ReadonlyArray<Language> = Language._instances;

	public static ignoreRegExp = new RegExp("^$");

	constructor(
		public name: string,
		public ext: string,
		public getSource = async (filePath: string): Promise<Buffer> => fs.readFile(filePath),
	) {
		Language.instances.forEach(lang => {
			if (lang.name === this.name || lang.ext === this.ext) {
				throw new Error("Duplicate language definition!");
			}
		});
		Language._instances.push(this);
		const middle = Language.instances
			.map(lang => lang.ext)
			.reduce((result, ext, index) => result + (index !== 0 ? "$|" : "") + ".*\\" + ext, "");
		Language.ignoreRegExp = new RegExp("^(.(?!" + middle + "))*$");
	}
}

new Language("Lua", ".lua");
new Language("MoonScript", ".moon", filePath => {
	return new Promise((resolve, reject) => {
		child_process
			.exec("moonc -p " + filePath)
			.then(result => resolve(result[0]))
			.catch((reason: Error) => {
				console.log(reason.message);
				resolve(Buffer.from(""));
			});
	});
});
