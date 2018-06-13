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

export interface IClientBody {
	projectId?: string;
	changes?: Array<IChange>;
}
