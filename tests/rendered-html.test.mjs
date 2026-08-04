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
