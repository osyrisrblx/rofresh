import child_process = require("mz/child_process");
import { getFileContents } from "../utility";

export default class Language {
	private static readonly _instances = new Array<Language>();
	public static readonly instances: ReadonlyArray<Language> = Language._instances;

	public static ignoreRegExp = new RegExp("^$");

	constructor(
		public name: string,
		public ext: string,
		public getSource = (filePath: string): Promise<Buffer> => getFileContents(filePath),
	) {
		Language.instances.forEach(lang => {
			if (lang.name === this.name || lang.ext === this.ext) {
				throw new Error("Duplicate language definition!");
			}
		});
		Language._instances.push(this);
		const middle = Language.instances
			.map(lang => lang.ext)
			.reduce((result, extension, index) => result + (index !== 0 ? "$|" : "") + ".*\\" + extension, "");
		Language.ignoreRegExp = new RegExp("^(.(?!" + middle + "))*$");
	}

	public remove() {
		const index = Language.instances.indexOf(this);
		if (index > -1) {
			Language._instances.splice(index, 1);
		}
	}
}

new Language("Lua", ".lua");
new Language("MoonScript", ".moon", async filePath => (await child_process.exec("moonc -p " + filePath))[0]);
