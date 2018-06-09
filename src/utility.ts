import http = require("http");

export function writeJson(res: http.ServerResponse, object: any) {
	res.setHeader("content-type", "application/json");
	res.write(JSON.stringify(object));
	res.end();
}

export function writeError(res: http.ServerResponse, errorMsg: string) {
	writeJson(res, { error: errorMsg });
}
