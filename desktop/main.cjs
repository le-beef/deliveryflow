const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { spawn } = require("node:child_process");
const store = require("./local-store.cjs");

let mainWindow;
let localServer;
let printerAgent;

function startPrinterAgent() {
  const scriptPath = app.isPackaged
    ? path.join(process.resourcesPath, "app.asar.unpacked", "printer-agent", "DeliveryFlow.PrintAgent.ps1")
    : path.join(__dirname, "..", "printer-agent", "DeliveryFlow.PrintAgent.ps1");
  if (!fs.existsSync(scriptPath)) return;
  printerAgent = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
    windowsHide: true,
    stdio: "ignore",
  });
  printerAgent.unref();
}

function startLocalServer() {
  const publicRoot = path.resolve(__dirname, "..", "out");
  return new Promise((resolve) => {
    localServer = http.createServer((request, response) => {
      const pathname = decodeURIComponent((request.url || "/").split("?")[0]);
      const candidate = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      let filePath = path.resolve(publicRoot, candidate);
      if (!filePath.startsWith(publicRoot)) { response.writeHead(403); response.end(); return; }
      if (!path.extname(filePath)) filePath += ".html";
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(publicRoot, "index.html");
      const extension = path.extname(filePath).toLowerCase();
      const contentType = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".json": "application/json", ".webmanifest": "application/manifest+json" }[extension] || "application/octet-stream";
      response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
      fs.createReadStream(filePath).pipe(response);
    });
    localServer.listen(0, "127.0.0.1", () => resolve(localServer.address().port));
  });
}

async function createWindow() {
  store.initializeLocalStore();
  startPrinterAgent();
  const port = localServer?.listening ? localServer.address().port : await startLocalServer();
  mainWindow = new BrowserWindow({ width: 1440, height: 900, minWidth: 1060, minHeight: 680, backgroundColor: "#f4f3ee", show: false, autoHideMenuBar: true, icon: path.join(__dirname, "..", "public", "deliveryflow-icon.png"), webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  mainWindow.loadURL(`http://127.0.0.1:${port}/?desktop=1`);
  mainWindow.once("ready-to-show", () => { mainWindow.maximize(); mainWindow.show(); });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith("https://")) shell.openExternal(url); return { action: "deny" }; });
}

ipcMain.handle("local:login", (_event, credentials) => store.login(credentials.username, credentials.password));
ipcMain.handle("local:list-users", () => store.listUsers());
ipcMain.handle("local:save-user", (_event, payload) => store.saveUser(payload.actorId, payload.user));
ipcMain.handle("local:delete-user", (_event, payload) => store.deleteUser(payload.actorId, payload.userId));
ipcMain.handle("local:authorize-manager", (_event, payload) => store.authorizeManager(payload.username, payload.secret));
ipcMain.handle("local:list-audit", () => store.listAudit());
ipcMain.handle("sync:enqueue", (_event, payload) => store.enqueue(payload.operation, payload.entityType, payload.entityId, payload.data));
ipcMain.handle("sync:pending", () => store.pendingSync());
ipcMain.handle("sync:mark", (_event, syncId) => store.markSynced(syncId));
ipcMain.handle("cash:current", () => store.currentCash());
ipcMain.handle("cash:open", (_event, payload) => store.openCash(payload.actorId, payload.openingAmount, payload.openingNote));
ipcMain.handle("cash:close", (_event, payload) => store.closeCash(payload.actorId, payload.cash));
ipcMain.handle("cash:movement", (_event, payload) => store.addLocalCashMovement(payload.actorId, payload.sessionId, payload.type, payload.amount, payload.reason));
ipcMain.handle("cash:movements", (_event, sessionId) => store.listLocalCashMovements(sessionId));
ipcMain.handle("cash:sessions", () => store.listLocalCashSessions());

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on("before-quit", () => { localServer?.close(); if (printerAgent && !printerAgent.killed) printerAgent.kill(); });
