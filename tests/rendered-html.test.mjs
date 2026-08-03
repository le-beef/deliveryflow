import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("contains the core PDV and customer-ordering flows", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Pedidos/);
  assert.match(page, /Cadastrar produto/);
  assert.match(page, /Mesas e QR Code/);
  assert.match(page, /Controle de caixa/);
  assert.match(page, /Enviar pedido/);
  assert.match(page, /Imprimir todos/);
  assert.match(page, /Preencha nome, telefone e endereço completo/);
  assert.match(page, /Selecione o número da mesa/);
  assert.match(page, /Dados para entrega/);
});

test("is configured as an installable Portuguese app", async () => {
  const [layout, manifest] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /lang="pt-BR"/);
  assert.equal(JSON.parse(manifest).display, "standalone");
});
