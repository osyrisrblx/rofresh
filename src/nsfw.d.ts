declare module "nsfw" {
	enum actions {
		CREATED = 0,
		DELETED = 1,
		MODIFIED = 2,
		RENAMED = 3,
	}

	namespace nsfw {

		interface EventModified {
			action: actions.MODIFIED;
			directory: string;
			file: string;
		}

		interface EventCreated {
			action: actions.CREATED;
			directory: string;
			file: string;
		}

		interface EventDeleted {
			action: actions.DELETED;
			directory: string;
			file: string;
		}

		interface EventRenamed {
			action: actions.RENAMED;
			directory: string;
			oldFile: string;
			newDirectory: string;
			newFile: string;
		}

		type Event = nsfw.EventModified | nsfw.EventCreated | nsfw.EventDeleted | nsfw.EventRenamed;

		interface Watcher {
			start(): void;
			stop(): void;
		}

		interface Options {
			debounceMS?: number;
			errorCallback?: (errors: any) => void;
		}
	}

	interface nsfw {
		actions: typeof actions;
		(directory: string, callback: (events: Array<nsfw.Event>, options?: nsfw.Options) => void): Promise<
			nsfw.Watcher
		>;
	}

	const nsfw: nsfw;
	export = nsfw;
}
