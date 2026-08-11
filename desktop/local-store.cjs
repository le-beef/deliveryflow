const { app } = require("electron");
const { DatabaseSync } = require("node:sqlite");
const { randomBytes, scryptSync, timingSafeEqual } = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");

const ROLE_PERMISSIONS = {
  admin: ["*"],
  gerente: ["orders:view", "orders:create", "orders:edit", "orders:cancel", "orders:authorize_cancel", "cash:view", "cash:open", "cash:close", "reports:view", "tables:manage"],
  caixa: ["orders:view", "orders:create", "orders:edit", "orders:request_cancel", "cash:view", "cash:open", "payments:receive", "tables:manage"],
  garcom: ["orders:view", "orders:create", "orders:request_cancel", "tables:manage"],
  cozinha: ["orders:view", "orders:production"],
  entregador: ["orders:delivery"],
};

let database;
let databasePath;

function now() { return Date.now(); }
function id(prefix) { return `${prefix}_${now()}_${randomBytes(4).toString("hex")}`; }
function hashSecret(secret, salt = randomBytes(16).toString("hex")) { return { salt, hash: scryptSync(String(secret), salt, 64).toString("hex") }; }
function verifySecret(secret, salt, expected) { const actual = scryptSync(String(secret), salt, 64); const stored = Buffer.from(expected, "hex"); return actual.length === stored.length && timingSafeEqual(actual, stored); }
function publicUser(row) { if (!row) return null; return { id: row.id, name: row.name, username: row.username, role: row.role, active: Boolean(row.active), mustChangePassword: Boolean(row.must_change_password), permissions: JSON.parse(row.permissions || "[]") }; }

function initializeLocalStore(customPath) {
  const dbPath = customPath || path.join(app.getPath("userData"), "deliveryflow.db");
  databasePath = dbPath;
  database = new DatabaseSync(dbPath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, pin_hash TEXT, pin_salt TEXT, role TEXT NOT NULL, permissions TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, must_change_password INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, user_id TEXT, action TEXT NOT NULL, entity_type TEXT, entity_id TEXT, details TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_queue (id TEXT PRIMARY KEY, operation TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, synced_at INTEGER);
    CREATE TABLE IF NOT EXISTS cash_sessions (session_id TEXT PRIMARY KEY, data TEXT NOT NULL, status TEXT NOT NULL, opened_at INTEGER NOT NULL, closed_at INTEGER);
    CREATE TABLE IF NOT EXISTS cash_movements (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS network_entities (entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(entity_type,entity_id));
    CREATE TABLE IF NOT EXISTS terminals (id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT, last_seen INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1);
    CREATE INDEX IF NOT EXISTS idx_users_active_role ON users(active, role);
    CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sync_pending ON sync_queue(synced_at, created_at);
  `);
  const count = database.prepare("SELECT COUNT(*) AS total FROM users").get().total;
  if (!count) {
    const credentials = hashSecret("DeliveryFlow@123");
    database.prepare("INSERT INTO users (id,name,username,password_hash,password_salt,role,permissions,active,must_change_password,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run("usr_admin", "Administrador", "admin", credentials.hash, credentials.salt, "admin", JSON.stringify(["*"]), 1, 1, now(), now());
  }
  for (const row of database.prepare("SELECT entity_id,data FROM network_entities WHERE entity_type='order'").all()) {
    try { const order = JSON.parse(row.data); const demo = (order.id === 1040 && order.reference === "Mesa 09") || (order.id === 1041 && order.customer === "Marina Souza") || (order.id === 1042 && order.reference === "Mesa 04"); if (demo) database.prepare("DELETE FROM network_entities WHERE entity_type='order' AND entity_id=?").run(row.entity_id); } catch { /* registro inválido é mantido para auditoria */ }
  }
  database.exec("PRAGMA optimize;");
  return dbPath;
}

function audit(userId, action, entityType, entityId, details = {}) {
  database.prepare("INSERT INTO audit_log (id,user_id,action,entity_type,entity_id,details,created_at) VALUES (?,?,?,?,?,?,?)").run(id("aud"), userId || null, action, entityType || null, entityId || null, JSON.stringify(details), now());
}

function login(username, password) {
  const row = database.prepare("SELECT * FROM users WHERE lower(username)=lower(?)").get(String(username).trim());
  if (!row || !row.active || !verifySecret(password, row.password_salt, row.password_hash)) { audit(row?.id, "login_failed", "user", row?.id, { username }); throw new Error("Usuário ou senha inválidos."); }
  audit(row.id, "login", "user", row.id); return publicUser(row);
}

function listUsers() { return database.prepare("SELECT * FROM users ORDER BY active DESC, name").all().map(publicUser); }

function saveUser(actorId, input) {
  const actor = database.prepare("SELECT * FROM users WHERE id=?").get(actorId);
  if (!actor || actor.role !== "admin") throw new Error("Somente administradores podem gerenciar usuários.");
  const permissions = input.permissions?.length ? input.permissions : ROLE_PERMISSIONS[input.role] || [];
  if (input.id) {
    database.prepare("UPDATE users SET name=?,username=?,role=?,permissions=?,active=?,updated_at=? WHERE id=?").run(input.name.trim(), input.username.trim(), input.role, JSON.stringify(permissions), input.active === false ? 0 : 1, now(), input.id);
    if (input.password) { const secret = hashSecret(input.password); database.prepare("UPDATE users SET password_hash=?,password_salt=?,must_change_password=1,updated_at=? WHERE id=?").run(secret.hash, secret.salt, now(), input.id); }
    if (input.pin) { const pin = hashSecret(input.pin); database.prepare("UPDATE users SET pin_hash=?,pin_salt=?,updated_at=? WHERE id=?").run(pin.hash, pin.salt, now(), input.id); }
    audit(actorId, "user_updated", "user", input.id, { role: input.role }); return publicUser(database.prepare("SELECT * FROM users WHERE id=?").get(input.id));
  }
  if (!input.password || input.password.length < 6) throw new Error("A senha inicial precisa ter pelo menos 6 caracteres.");
  const userId = id("usr"); const secret = hashSecret(input.password); const pin = input.pin ? hashSecret(input.pin) : null;
  database.prepare("INSERT INTO users (id,name,username,password_hash,password_salt,pin_hash,pin_salt,role,permissions,active,must_change_password,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(userId, input.name.trim(), input.username.trim(), secret.hash, secret.salt, pin?.hash || null, pin?.salt || null, input.role, JSON.stringify(permissions), 1, 1, now(), now());
  audit(actorId, "user_created", "user", userId, { role: input.role }); return publicUser(database.prepare("SELECT * FROM users WHERE id=?").get(userId));
}

function deleteUser(actorId, userId) { const actor = database.prepare("SELECT role FROM users WHERE id=?").get(actorId); if (actor?.role !== "admin" || actorId === userId) throw new Error("Usuário não pode ser excluído."); audit(actorId, "user_deleted", "user", userId, publicUser(database.prepare("SELECT * FROM users WHERE id=?").get(userId))); database.prepare("DELETE FROM users WHERE id=?").run(userId); }
function authorizeManager(username, pinOrPassword) { const row = database.prepare("SELECT * FROM users WHERE lower(username)=lower(?) AND active=1").get(username.trim()); if (!row || !["admin", "gerente"].includes(row.role)) throw new Error("Usuário sem permissão gerencial."); const validPassword = verifySecret(pinOrPassword, row.password_salt, row.password_hash); const validPin = row.pin_hash && verifySecret(pinOrPassword, row.pin_salt, row.pin_hash); if (!validPassword && !validPin) throw new Error("Senha ou PIN gerencial incorreto."); audit(row.id, "manager_authorization", "user", row.id); return publicUser(row); }
function listAudit() { return database.prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 500").all().map((row) => ({ ...row, details: JSON.parse(row.details) })); }
function enqueue(operation, entityType, entityId, payload) { database.prepare("INSERT INTO sync_queue (id,operation,entity_type,entity_id,payload,created_at) VALUES (?,?,?,?,?,?)").run(id("sync"), operation, entityType, entityId, JSON.stringify(payload), now()); }
function pendingSync() { return database.prepare("SELECT * FROM sync_queue WHERE synced_at IS NULL ORDER BY created_at LIMIT 100").all().map((row) => ({ ...row, payload: JSON.parse(row.payload) })); }
function markSynced(syncId) { database.prepare("UPDATE sync_queue SET synced_at=? WHERE id=?").run(now(), syncId); }
function currentCash(terminalId = "servidor") { const rows = database.prepare("SELECT data FROM cash_sessions WHERE status='open' ORDER BY opened_at DESC").all(); return rows.map((row) => JSON.parse(row.data)).find((item) => (item.terminalId || "servidor") === terminalId) || null; }
function openCash(actorId, openingAmount, openingNote = "", terminalId = "servidor", terminalName = "Servidor") { const actor = database.prepare("SELECT * FROM users WHERE id=? AND active=1").get(actorId); if (!actor) throw new Error("Operador inválido."); if (currentCash(terminalId)) throw new Error("Já existe um caixa aberto neste terminal."); const cash = { sessionId: id("cash"), terminalId, terminalName, status: "open", openingAmount, openingNote, openedAt: now(), openedBy: actor.id, openedByName: actor.name }; database.prepare("INSERT INTO cash_sessions(session_id,data,status,opened_at) VALUES(?,?,?,?)").run(cash.sessionId, JSON.stringify(cash), "open", cash.openedAt); audit(actorId, "cash_opened", "cash", cash.sessionId, cash); return cash; }
function closeCash(actorId, cashData) { const actor = database.prepare("SELECT * FROM users WHERE id=? AND active=1").get(actorId); if (!actor || !["admin","gerente","caixa"].includes(actor.role)) throw new Error("Usuário sem permissão para fechar o caixa."); const closed = { ...cashData, status: "closed", closedAt: now(), closedBy: actor.id, closedByName: actor.name }; database.prepare("UPDATE cash_sessions SET data=?,status='closed',closed_at=? WHERE session_id=?").run(JSON.stringify(closed), closed.closedAt, closed.sessionId); audit(actorId, "cash_closed", "cash", closed.sessionId, closed); return closed; }
function addLocalCashMovement(actorId, sessionId, type, amount, reason) { const actor = database.prepare("SELECT * FROM users WHERE id=? AND active=1").get(actorId); if (!actor) throw new Error("Operador inválido."); const movement = { id: id("mov"), sessionId, type, amount, reason, createdAt: now(), createdBy: actor.id, createdByName: actor.name }; database.prepare("INSERT INTO cash_movements(id,session_id,data,created_at) VALUES(?,?,?,?)").run(movement.id, sessionId, JSON.stringify(movement), movement.createdAt); audit(actorId, "cash_movement", "cash", sessionId, movement); return movement; }
function listLocalCashMovements(sessionId) { return database.prepare("SELECT data FROM cash_movements WHERE session_id=? ORDER BY created_at DESC").all(sessionId).map((row) => JSON.parse(row.data)); }
function listLocalCashSessions() { return database.prepare("SELECT data FROM cash_sessions ORDER BY opened_at DESC").all().map((row) => JSON.parse(row.data)); }

function saveEntity(entityType, entityId, data) { database.prepare("INSERT INTO network_entities(entity_type,entity_id,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(entity_type,entity_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at").run(entityType, String(entityId), JSON.stringify(data), now()); return data; }
function deleteEntity(entityType, entityId) { database.prepare("DELETE FROM network_entities WHERE entity_type=? AND entity_id=?").run(entityType, String(entityId)); }
function listEntities(entityType) { return database.prepare("SELECT entity_id,data FROM network_entities WHERE entity_type=? ORDER BY entity_id COLLATE NOCASE").all(entityType).map((row) => ({ ...JSON.parse(row.data), networkId: row.entity_id })); }
function touchTerminal(input) { const terminal = { id: String(input.id || "terminal"), name: String(input.name || "Terminal"), address: input.address || "", lastSeen: now(), active: true }; database.prepare("INSERT INTO terminals(id,name,address,last_seen,active) VALUES(?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET name=excluded.name,address=excluded.address,last_seen=excluded.last_seen,active=1").run(terminal.id, terminal.name, terminal.address, terminal.lastSeen); return terminal; }
function listTerminals() { return database.prepare("SELECT id,name,address,last_seen,active FROM terminals ORDER BY name").all().map((row) => ({ id: row.id, name: row.name, address: row.address, lastSeen: row.last_seen, active: Boolean(row.active) })); }
function networkSnapshot() { return { orders: listEntities("order"), products: listEntities("product"), categories: listEntities("category"), serviceUnits: listEntities("serviceUnit"), customers: listEntities("customer"), settings: listEntities("setting"), terminals: listTerminals(), serverTime: now() }; }
function backupDatabase() { if (!databasePath || !fs.existsSync(databasePath)) throw new Error("Banco de dados não localizado."); database.exec("PRAGMA wal_checkpoint(FULL)"); const directory = path.join(path.dirname(databasePath), "backups"); fs.mkdirSync(directory, { recursive: true }); const target = path.join(directory, `deliveryflow-${new Date().toISOString().replace(/[:.]/g, "-")}.db`); fs.copyFileSync(databasePath, target); return target; }

module.exports = { ROLE_PERMISSIONS, initializeLocalStore, login, listUsers, saveUser, deleteUser, authorizeManager, listAudit, enqueue, pendingSync, markSynced, currentCash, openCash, closeCash, addLocalCashMovement, listLocalCashMovements, listLocalCashSessions, saveEntity, deleteEntity, listEntities, touchTerminal, listTerminals, networkSnapshot, backupDatabase };
