export interface Partition {
	path: string;
	target: string;
}

export interface RofreshConfig {
	name: string;
	placeIds?: Array<number>;
	allowAnyPlaceId?: boolean;
	partitions: {
		[index: string]: Partition | undefined;
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

export interface ProjectPayload {
	projectName: string;
	changes?: Array<Change | Remove>;
	tagOverride?: string;
	initial?: boolean;
}
