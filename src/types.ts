export interface IRofreshConfig {
	placeIds?: Array<number>;
}

export interface IChangeBase {
	type?: string;
	path: Array<string>;
}

export interface IChange extends IChangeBase {
	source: string | null;
}

export interface IClientPayload {
	projectId?: string;
	changes?: Array<IChange>;
}

export interface IProjectPayload {
	projectId: string;
	tagOverride?: string;
	initialPaths: Array<string>;
	changes: Array<IChange>;
}

export interface IServerPayload {
	projects: Array<IProjectPayload>;
}

export interface IServerInit {}
