const fs = require("fs");
const path = require("path");
const { app, safeStorage } = require("electron");

function credentialPath() {
  return path.join(app.getPath("userData"), "remembered-login.json");
}

function saveRememberedLogin(credentials) {
  const username = String(credentials?.username || "").trim();
  const password = String(credentials?.password || "");
  if (!username || !password) throw new Error("Usuário e senha são obrigatórios para lembrar o acesso.");
  if (!safeStorage.isEncryptionAvailable()) throw new Error("A proteção de credenciais do Windows não está disponível.");
  const encrypted = safeStorage.encryptString(JSON.stringify({ username, password }));
  fs.writeFileSync(credentialPath(), JSON.stringify({ version: 1, encrypted: encrypted.toString("base64") }), { encoding: "utf8", mode: 0o600 });
  return { saved: true, username };
}

function loadRememberedLogin() {
  try {
    if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(credentialPath())) return null;
    const stored = JSON.parse(fs.readFileSync(credentialPath(), "utf8"));
    if (!stored?.encrypted) return null;
    const credentials = JSON.parse(safeStorage.decryptString(Buffer.from(stored.encrypted, "base64")));
    if (!credentials?.username || !credentials?.password) return null;
    return { username: String(credentials.username), password: String(credentials.password) };
  } catch {
    clearRememberedLogin();
    return null;
  }
}

function clearRememberedLogin() {
  try { if (fs.existsSync(credentialPath())) fs.unlinkSync(credentialPath()); } catch { /* best effort */ }
  return { saved: false };
}

function registerRememberedLoginIpc(ipcMain) {
  ipcMain.handle("credentials:load", () => loadRememberedLogin());
  ipcMain.handle("credentials:save", (_event, credentials) => saveRememberedLogin(credentials));
  ipcMain.handle("credentials:clear", () => clearRememberedLogin());
}

module.exports = { registerRememberedLoginIpc, saveRememberedLogin, loadRememberedLogin, clearRememberedLogin };
