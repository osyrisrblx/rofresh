import http = require("http");
import * as t from "io-ts";

export const PartitionIO = t.interface({
	path: t.string,
	target: t.string,
});

export const RofreshConfigIO = t.intersection([
	t.interface({
		name: t.string,
	}),
	t.partial({
		allowAnyPlaceId: t.boolean,
		partitions: t.dictionary(t.string, PartitionIO),
		placeIds: t.array(t.number),
	}),
]);

export type RofreshConfig = t.TypeOf<typeof RofreshConfigIO>;

export type RouteCallback = (req: http.IncomingMessage, res: http.ServerResponse) => void;

export interface Route {
	readonly glob: string;
	readonly callback: RouteCallback;
	readonly method: string;
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
