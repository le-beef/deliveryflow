# DeliveryFlow

Sistema de PDV e pedidos online para delivery e atendimento por QR Code nas mesas.

## Recursos

- painel de pedidos em tempo real;
- cardápio para delivery e consumo na mesa;
- QR Code individual por mesa;
- cadastro e disponibilidade de produtos;
- abertura e fechamento de caixa;
- impressão de comandas em bobina térmica de 80 mm;
- instalação como aplicativo no computador;
- autenticação administrativa com Google;
- sincronização com Firebase Realtime Database.

## Desenvolvimento

Requer Node.js 22 ou superior.

```bash
npm install
npm run dev
```

## Validação

```bash
npm test
npm run lint
npm run build:firebase
```

## Publicação

O projeto está configurado para o Firebase `deliveryflow-f0e3e`.

```bash
npm run build:firebase
firebase deploy --only hosting
```
