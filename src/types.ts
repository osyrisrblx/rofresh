export interface IRofreshConfig {
	id?: string;
	placeIds?: Array<number>;
}

export interface IChange {
	path: Array<string>;
	source: string | null;
	isRename?: boolean;
	type?: string;
}

export interface IClientPayload {
	projectId?: string;
	changes?: Array<IChange>;
}

export interface IProjectPayload {
	projectId: string;
	changes: Array<IChange>;
	tagOverride?: string;
	initialPaths?: Array<string>;
}
