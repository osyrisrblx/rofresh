export interface Partition {
	path: string;
	target: string;
}

export interface RofreshConfig {
	name: string;
	placeIds?: Array<number>;
	allowAnyPlaceId?: boolean;
	partitions: {
		[index: string]: Partition;
	};
}

export interface Update {
	path: Array<string>;
	type: string;
}

export interface Change extends Update {
	source: string;
}

export interface Remove extends Update {
	source: null;
}

export interface ClientPayload {
	projectName?: string;
	changes?: Array<Change>;
}

export interface InitialPaths {
	[index: string]: true;
}

export interface ProjectPayload {
	projectName: string;
	changes?: Array<Change | Remove>;
	tagOverride?: string;
	initialPaths?: InitialPaths;
}
