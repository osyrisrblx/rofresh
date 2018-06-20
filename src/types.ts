import iots = require("io-ts");

export const PartitionIO = iots.interface({
	path: iots.string,
	target: iots.string,
});

export const RofreshConfigIO = iots.intersection([
	iots.interface({
		name: iots.string,
	}),
	iots.partial({
		allowAnyPlaceId: iots.boolean,
		partitions: iots.dictionary(iots.string, PartitionIO),
		placeIds: iots.array(iots.number),
	}),
]);

export type RofreshConfig = iots.TypeOf<typeof RofreshConfigIO>;

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
