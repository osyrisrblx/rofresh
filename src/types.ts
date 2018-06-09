export interface IRofreshConfig {
	placeIds?: Array<number>;
}

export interface IChange {
	type: string;
	path: Array<string>;
	source: string;
}

export interface IClientBody {
	projectId?: string;
	changes?: Array<IChange>;
}
