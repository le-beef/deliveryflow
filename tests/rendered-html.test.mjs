import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("contains the core PDV and customer-ordering flows", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Pedidos/);
  assert.match(page, /Cadastrar produto/);
  assert.match(page, /serviceMode/);
  assert.match(page, /Controle de caixa/);
  assert.match(page, /Caixa atual/);
  assert.match(page, /Movimentações/);
  assert.match(page, /Fechamento de caixa/);
  assert.match(page, /Caixas anteriores/);
  assert.match(page, /Sangria/);
  assert.match(page, /Suprimento/);
  assert.match(page, /Confirmar fechamento e imprimir/);
  assert.match(page, /Solicitar autorização/);
  assert.match(page, /Autorização gerencial gratuita/);
  assert.match(page, /Autorizar com Google/);
  assert.match(page, /Imprimir cancelamento/);
  assert.match(page, /somente na cozinha/);
  assert.doesNotMatch(page, /sendDirectPrint\(cancelled/);
  assert.match(page, /excluir definitivamente/i);
  assert.match(page, /Enviar pedido/);
  assert.match(page, /Baixar links no Excel/);
  assert.match(page, /Preencha nome, telefone e endereço completo/);
  assert.match(page, /Selecione.*mesa.*comanda/);
  assert.match(page, /Dados para entrega/);
});

test("prints a dedicated thermal cash-closing report", async () => {
  const agent = await readFile(new URL("../printer-agent/DeliveryFlow.PrintAgent.ps1", import.meta.url), "utf8");
  assert.match(agent, /FECHAMENTO DE CAIXA/);
  assert.match(agent, /TOTAL VENDIDO/);
  assert.match(agent, /REIMPRESSAO/);
});

test("protects cancellation and deletion with local manager credentials", async () => {
  const [page, store] = await Promise.all([readFile(new URL("../app/page.tsx", import.meta.url), "utf8"), readFile(new URL("../desktop/local-store.cjs", import.meta.url), "utf8")]);
  assert.match(page, /authorizeManager/);
  assert.match(page, /A exclusão definitiva exige um administrador/);
  assert.match(store, /Senha ou PIN gerencial incorreto/);
  assert.doesNotMatch(page, /cancelOrderWithManagerGoogle/);
});

test("is configured as an installable Portuguese app", async () => {
  const [layout, manifest] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /lang="pt-BR"/);
  assert.equal(JSON.parse(manifest).display, "standalone");
});

test("includes the Windows PDV, local roles and offline queue", async () => {
  const [desktop, store, waiter] = await Promise.all([
    readFile(new URL("../desktop/main.cjs", import.meta.url), "utf8"),
    readFile(new URL("../desktop/local-store.cjs", import.meta.url), "utf8"),
    readFile(new URL("../app/garcom/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(desktop, /local:login/);
  assert.match(desktop, /sync:pending/);
  assert.match(store, /CREATE TABLE IF NOT EXISTS users/);
  assert.match(store, /CREATE TABLE IF NOT EXISTS sync_queue/);
  assert.match(store, /authorizeManager/);
  assert.match(waiter, /Acesso do garçom/);
  assert.match(waiter, /Enviar para produção/);
});

test("separates the LAN server, PDV terminals and local waiter access", async () => {
  const [networkServer, serverMain, terminalMain, waiter, store] = await Promise.all([
    readFile(new URL("../desktop/network-server.cjs", import.meta.url), "utf8"),
    readFile(new URL("../desktop/server-main.cjs", import.meta.url), "utf8"),
    readFile(new URL("../desktop/terminal-main.cjs", import.meta.url), "utf8"),
    readFile(new URL("../app/garcom/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../desktop/local-store.cjs", import.meta.url), "utf8"),
  ]);
  assert.match(networkServer, /0\.0\.0\.0/);
  assert.match(networkServer, /\/api\/snapshot/);
  assert.match(serverMain, /port:3030/);
  assert.match(terminalMain, /terminal\.json/);
  assert.match(waiter, /REDE LOCAL · SEM INTERNET/);
  assert.match(store, /terminalId/);
  assert.match(store, /network_entities/);
});

test("connects only the LAN server to the protected online-order inbox", async () => {
  const [page, firebase, serverMain, connectorCss] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/firebase.ts", import.meta.url), "utf8"),
    readFile(new URL("../desktop/server-main.cjs", import.meta.url), "utf8"),
    readFile(new URL("../app/online-connector.css", import.meta.url), "utf8"),
  ]);
  assert.match(serverMain, /http:\/\/localhost:3030\/\?desktop=1&network=server/);
  assert.doesNotMatch(serverMain, /http:\/\/127\.0\.0\.1:3030/);
  assert.match(page, /networkInfo\?\.mode === "server"/);
  assert.match(page, /Pedidos online conectados/);
  assert.match(firebase, /watchOrders<[\s\S]*onError/);
  assert.match(connectorCss, /display: block !important/);
  assert.match(page, /!routeResolved \|\| \(!desktopMode && \(!authResolved \|\| \(adminUser && !cashResolved\)\)\)/);
  assert.match(page, /setAuthResolved\(true\)[\s\S]*O Firebase demorou para responder/);
  assert.match(page, /desktopRequested[\s\S]*getRegistrations\(\)/);
  assert.match(firebase, /watchAuth\([\s\S]*onError/);
});

test("keeps products, tables and tabs stable across network refreshes", async () => {
  const [page, store] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../desktop/local-store.cjs", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(store, /ORDER BY updated_at DESC/);
  assert.doesNotMatch(store, /networkUpdatedAt/);
  assert.match(store, /ORDER BY entity_id COLLATE NOCASE/);
  assert.match(page, /function stableServiceUnits/);
  assert.match(page, /Number\(left\.number\)[\s\S]*Number\(right\.number\)/);
  assert.match(page, /networkSignatures\.current\.products/);
  assert.match(page, /networkSignature\(current\) === networkSignatures\.current\.serviceUnits/);
  assert.match(page, /data: cleanNetworkValue\(product\)/);
  assert.match(page, /data: cleanNetworkValue\(unit\)/);
});

test("edits and permanently removes service units from the local server", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /saveEditedServiceUnit/);
  assert.match(page, /async function removeServiceUnit/);
  assert.match(page, /await window\.deliveryflowDesktop\.deleteNetworkEntity\(\{ entityType: "serviceUnit"/);
  assert.match(page, /void removeServiceUnit\(unit, occupied\)/);
  assert.match(page, /service-unit-edit-modal/);
  assert.match(page, /deleteNetworkEntity\(\{ entityType: "serviceUnit"/);
  assert.match(page, /networkServiceUnitIds/);
});

test("shows the version discreetly and keeps logout in the operator menu", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/sidebar-polish.css", import.meta.url), "utf8");
  assert.match(page, /sidebar-version/);
  assert.match(page, /user-popover/);
  assert.match(page, /Sair do sistema/);
  assert.match(css, /\.sidebar-version/);
  assert.match(css, /\.user-popover/);
});

test("keeps every dialog field inside the modal at desktop and narrow widths", async () => {
  const css = await readFile(new URL("../app/sidebar-polish.css", import.meta.url), "utf8");
  assert.match(css, /\.form-row \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /max-height: calc\(100vh - 40px\)/);
  assert.match(css, /overflow-y: auto/);
  assert.match(css, /\.modal input:not[\s\S]*width: 100%/);
  assert.match(css, /Código numérico rápido para autorizar ações gerenciais/);
  assert.match(css, /@media\(max-width:620px\)/);
});

test("remembers desktop login only with Windows encrypted storage", async () => {
  const [page, preload, credentials, serverMain, terminalMain, desktopMain] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../desktop/preload.cjs", import.meta.url), "utf8"),
    readFile(new URL("../desktop/remembered-login.cjs", import.meta.url), "utf8"),
    readFile(new URL("../desktop/server-main.cjs", import.meta.url), "utf8"),
    readFile(new URL("../desktop/terminal-main.cjs", import.meta.url), "utf8"),
    readFile(new URL("../desktop/main.cjs", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Lembrar meu acesso neste computador/);
  assert.match(page, /loadRememberedLogin/);
  assert.match(page, /saveRememberedLogin\(desktopLogin\)/);
  assert.match(page, /clearRememberedLogin/);
  assert.doesNotMatch(page, /localStorage\.setItem\([^\n]*password/i);
  assert.match(preload, /credentials:load/);
  assert.match(preload, /credentials:save/);
  assert.match(preload, /credentials:clear/);
  assert.match(credentials, /safeStorage\.encryptString/);
  assert.match(credentials, /safeStorage\.decryptString/);
  assert.match(credentials, /remembered-login\.json/);
  assert.match(serverMain, /registerRememberedLoginIpc/);
  assert.match(terminalMain, /registerRememberedLoginIpc/);
  assert.match(desktopMain, /registerRememberedLoginIpc/);
});

test("keeps customers, exclusive service modes and GitHub updates", async () => {
  const [page, waiter, store, updater] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/garcom/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../desktop/local-store.cjs", import.meta.url), "utf8"),
    readFile(new URL("../desktop/updater.cjs", import.meta.url), "utf8"),
  ]);
  assert.match(page, /CADASTRO CENTRAL/);
  assert.match(page, /customerIds/);
  assert.match(page, /currentComandaTable/);
  assert.match(waiter, /Comandas desativadas/);
  assert.match(waiter, /Mesa atual/);
  assert.match(store, /backupDatabase/);
  assert.match(updater, /github/);
  assert.match(updater, /Atualização disponível/);
});
