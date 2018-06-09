import child_process = require("mz/child_process");
import fs = require("mz/fs");
import path = require("path");

export default class Language {
	private static readonly _instances = new Array<Language>();
	public static readonly instances: ReadonlyArray<Language> = Language._instances;

	public static ignoreRegExp = new RegExp("^$");

	public static register(language: Language) {
		Language.instances.forEach(lang => {
			if (lang.name === language.name || lang.ext === language.ext) {
				throw new Error("Duplicate language definition!");
			}
		});
		Language._instances.push(language);
		Language.ignoreRegExp = new RegExp(
			"^(.(?!" +
				this.instances.reduce(
					(result, lang, index) => result + (index !== 0 ? "$|" : "") + ".*\\" + lang.ext,
					"",
				) +
				"))*$",
		);
	}

	public static async getSourceByFilePath(filePath: string) {
		const ext = path.extname(filePath);
		for (const lang of Language.instances) {
			if (ext === lang.ext) {
				return await lang.getSource(filePath);
			}
		}
		throw new Error("Could not find applicable Language for filePath! [ " + filePath + " ]");
	}

	constructor(
		public name: string,
		public ext: string,
		public getSource = async (filePath: string): Promise<Buffer> => fs.readFile(filePath),
	) {}
}

Language.register(new Language("Lua", ".lua"));
Language.register(
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
	}),
);
