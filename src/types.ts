export interface IRofreshConfig {
	id?: string;
	placeIds?: Array<number>;
}

interface IUpdate {
	path: Array<string>;
	type: string;
}

export interface IChange extends IUpdate {
	source: string | null;
	isRename?: boolean;
}

export interface IRemove extends IUpdate {}

export interface IClientPayload {
	projectId?: string;
	changes?: Array<IChange>;
}

export interface IProjectPayload {
	projectId: string;
	changes?: Array<IChange>;
	removes?: Array<IRemove>;
	tagOverride?: string;
	initialPaths?: Array<string>;
}
