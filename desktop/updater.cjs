const { dialog, app } = require("electron");
const { autoUpdater } = require("electron-updater");

function configureUpdater({ window, channel, beforeInstall }) {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = false; autoUpdater.autoInstallOnAppQuit = false; autoUpdater.allowPrerelease = false; autoUpdater.channel = channel;
  autoUpdater.setFeedURL({ provider: "github", owner: "le-beef", repo: "deliveryflow", channel });
  autoUpdater.on("update-available", async (info) => { const answer = await dialog.showMessageBox(window, { type: "info", title: "Atualização disponível", message: `DeliveryFlow ${info.version} está disponível.`, detail: "Deseja baixar agora? Você poderá continuar usando o sistema durante o download.", buttons: ["Baixar atualização", "Agora não"], defaultId: 0, cancelId: 1 }); if (answer.response === 0) void autoUpdater.downloadUpdate(); });
  autoUpdater.on("download-progress", (progress) => window.setProgressBar(progress.percent / 100));
  autoUpdater.on("update-downloaded", async (info) => { window.setProgressBar(-1); try { if (beforeInstall) await beforeInstall(); } catch (error) { return dialog.showErrorBox("Atualização adiada", error instanceof Error ? error.message : "Não foi possível criar o backup."); } const answer = await dialog.showMessageBox(window, { type: "question", title: "Atualização pronta", message: `A versão ${info.version} foi baixada.`, detail: "Deseja reiniciar o DeliveryFlow e instalar agora?", buttons: ["Reiniciar e instalar", "Instalar ao fechar"], defaultId: 0, cancelId: 1 }); if (answer.response === 0) autoUpdater.quitAndInstall(false, true); else autoUpdater.autoInstallOnAppQuit = true; });
  autoUpdater.on("error", () => window.setProgressBar(-1));
  setTimeout(() => void autoUpdater.checkForUpdates().catch(() => undefined), 5000);
}
module.exports = { configureUpdater };
