export interface IPartition {
	path: string;
	target: string;
}

export interface IRofreshConfig {
	name: string;
	placeIds?: Array<number>;
	allowAnyPlaceId?: boolean;
	partitions: {
		[index: string]: IPartition;
	};
}

export interface IUpdate {
	path: Array<string>;
	type: string;
}

export interface IChange extends IUpdate {
	source: string;
}

export interface IRemove extends IUpdate {
	source: null;
}

export interface IClientPayload {
	projectName?: string;
	changes?: Array<IChange>;
}

export interface IProjectPayload {
	projectName: string;
	changes?: Array<IChange | IRemove>;
	tagOverride?: string;
	initialPaths?: Array<string>;
}
