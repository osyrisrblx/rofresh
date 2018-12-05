import http = require("http");
import * as io_ts from "io-ts";

export const PartitionIO = io_ts.interface({
	path: io_ts.string,
	target: io_ts.string,
});

export const RofreshConfigIO = io_ts.intersection([
	io_ts.interface({
		name: io_ts.string,
	}),
	io_ts.partial({
		allowAnyPlaceId: io_ts.boolean,
		partitions: io_ts.dictionary(io_ts.string, PartitionIO),
		placeIds: io_ts.array(io_ts.number),
	}),
]);

export type RofreshConfig = io_ts.TypeOf<typeof RofreshConfigIO>;

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
