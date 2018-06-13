import http = require("http");
import util = require("util");

import anymatch = require("anymatch");

import { writeError } from "../utility";

export type RouteCallback = (req: http.IncomingMessage, res: http.ServerResponse) => void;

export interface IRoute {
	readonly glob: string;
	readonly callback: RouteCallback;
	readonly method: string;
}

export default class Server {
	private httpServer?: http.Server;
	private readonly routes = new Array<IRoute>();
	public enabled = true;

	constructor() {
		this.httpServer = http.createServer((req, res) => {
			const desiredRoute = req.url;
			let didRespond = false;
			if (desiredRoute && this.enabled) {
				const validRoutes = this.routes.filter(route => route.method === req.method);
				for (const route of validRoutes) {
					if (anymatch(route.glob, desiredRoute)) {
						try {
							route.callback(req, res);
						} catch (e) {
							if (e instanceof Error) {
								writeError(res, e.message);
							}
						}
						didRespond = true;
						return;
					}
				}
			}
			if (!didRespond) {
				res.statusCode = 404;
				res.end();
			}
		});
	}

	public listen(port: number) {
		if (this.httpServer) {
			this.httpServer.listen(port);
		}
	}

	public close() {
		if (this.httpServer) {
			this.httpServer.close();
			this.httpServer = undefined;
		}
	}

	private registerRoute(glob: string, callback: RouteCallback, method: string) {
		const routeGlobExists = this.routes.reduce(
			(accum, route) => accum || (route.glob === glob && route.method === method),
			false,
		);
		if (routeGlobExists) {
			throw new Error(util.format("Route already exists! [ %s %s ]", method, glob));
		}
		this.routes.push({ glob, callback, method });
	}

	public get(glob: string, callback: RouteCallback) {
		this.registerRoute(glob, callback, "GET");
	}

	public post(glob: string, callback: RouteCallback) {
		this.registerRoute(glob, callback, "POST");
	}
}
