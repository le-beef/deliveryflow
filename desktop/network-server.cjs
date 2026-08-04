const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

function json(response, status, body) { response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-Terminal-Id, X-Terminal-Name", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS" }); response.end(JSON.stringify(body)); }
function readBody(request) { return new Promise((resolve, reject) => { let raw = ""; request.on("data", (chunk) => { raw += chunk; if (raw.length > 2_000_000) reject(new Error("Requisição muito grande")); }); request.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("JSON inválido")); } }); request.on("error", reject); }); }

function startNetworkServer({ store, publicRoot, port = 3030 }) {
  const server = http.createServer(async (request, response) => {
    if (request.method === "OPTIONS") return json(response, 204, {});
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    try {
      if (url.pathname === "/api/health") return json(response, 200, { ok: true, name: "DeliveryFlow Servidor", time: Date.now() });
      if (url.pathname.startsWith("/api/")) {
        const terminalId = String(request.headers["x-terminal-id"] || "servidor"); const terminalName = String(request.headers["x-terminal-name"] || "Servidor");
        store.touchTerminal({ id: terminalId, name: terminalName, address: request.socket.remoteAddress });
        if (url.pathname === "/api/login" && request.method === "POST") { const body = await readBody(request); return json(response, 200, store.login(body.username, body.password)); }
        if (url.pathname === "/api/snapshot") return json(response, 200, store.networkSnapshot());
        if (url.pathname === "/api/users" && request.method === "GET") return json(response, 200, store.listUsers());
        if (url.pathname === "/api/users" && request.method === "PUT") { const body = await readBody(request); return json(response, 200, store.saveUser(body.actorId, body.user)); }
        if (url.pathname === "/api/users" && request.method === "DELETE") { const body = await readBody(request); store.deleteUser(body.actorId, body.userId); return json(response, 200, { ok: true }); }
        if (url.pathname === "/api/manager" && request.method === "POST") { const body = await readBody(request); return json(response, 200, store.authorizeManager(body.username, body.secret)); }
        if (url.pathname === "/api/entity" && request.method === "PUT") { const body = await readBody(request); return json(response, 200, store.saveEntity(body.entityType, body.entityId, body.data)); }
        if (url.pathname === "/api/entity" && request.method === "DELETE") { const body = await readBody(request); store.deleteEntity(body.entityType, body.entityId); return json(response, 200, { ok: true }); }
        if (url.pathname === "/api/cash/current") return json(response, 200, store.currentCash(terminalId));
        if (url.pathname === "/api/cash/open" && request.method === "POST") { const body = await readBody(request); return json(response, 200, store.openCash(body.actorId, body.openingAmount, body.openingNote, terminalId, terminalName)); }
        if (url.pathname === "/api/cash/close" && request.method === "POST") { const body = await readBody(request); return json(response, 200, store.closeCash(body.actorId, body.cash)); }
        if (url.pathname === "/api/cash/movement" && request.method === "POST") { const body = await readBody(request); return json(response, 200, store.addLocalCashMovement(body.actorId, body.sessionId, body.type, body.amount, body.reason)); }
        if (url.pathname === "/api/cash/movements") return json(response, 200, store.listLocalCashMovements(url.searchParams.get("sessionId")));
        if (url.pathname === "/api/cash/sessions") return json(response, 200, store.listLocalCashSessions());
        return json(response, 404, { error: "Recurso não encontrado" });
      }
      const pathname = decodeURIComponent(url.pathname); const candidate = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""); let filePath = path.resolve(publicRoot, candidate);
      if (!filePath.startsWith(publicRoot)) { response.writeHead(403); return response.end(); }
      if (!path.extname(filePath)) filePath += ".html"; if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(publicRoot, "index.html");
      const extension = path.extname(filePath).toLowerCase(); const contentType = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".webmanifest": "application/manifest+json" }[extension] || "application/octet-stream";
      response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" }); fs.createReadStream(filePath).pipe(response);
    } catch (error) { json(response, 400, { error: error instanceof Error ? error.message : "Falha no servidor" }); }
  });
  return new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "0.0.0.0", () => resolve(server)); });
}
module.exports = { startNetworkServer };
