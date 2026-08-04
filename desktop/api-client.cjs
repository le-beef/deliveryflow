function createApiClient(config) {
  const base = `http://${config.serverHost || "127.0.0.1"}:${config.serverPort || 3030}`;
  async function call(path, method = "GET", body) {
    const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", "X-Terminal-Id": config.terminalId, "X-Terminal-Name": config.terminalName }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || "Servidor indisponível"); return result;
  }
  return { call, health: () => call("/api/health"), login: (data) => call("/api/login", "POST", data), snapshot: () => call("/api/snapshot"), users: () => call("/api/users"), saveUser: (data) => call("/api/users", "PUT", data), deleteUser: (data) => call("/api/users", "DELETE", data), manager: (data) => call("/api/manager", "POST", data), saveEntity: (data) => call("/api/entity", "PUT", data), deleteEntity: (data) => call("/api/entity", "DELETE", data), currentCash: () => call("/api/cash/current"), openCash: (data) => call("/api/cash/open", "POST", data), closeCash: (data) => call("/api/cash/close", "POST", data), movement: (data) => call("/api/cash/movement", "POST", data), movements: (sessionId) => call(`/api/cash/movements?sessionId=${encodeURIComponent(sessionId)}`), sessions: () => call("/api/cash/sessions") };
}
module.exports = { createApiClient };
