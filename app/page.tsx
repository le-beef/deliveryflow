"use client";
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { ADMIN_EMAIL, loginAdmin, logoutAdmin, saveProduct, seedProducts as uploadSeedProducts, setOrderStatus, submitOrder, watchAuth, watchOrders, watchProducts } from "./firebase";

type View = "pedidos" | "produtos" | "mesas" | "caixa" | "cardapio";
type OrderStatus = "novo" | "preparo" | "pronto" | "concluido";

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  description: string;
  emoji: string;
  active: boolean;
};

type OrderItem = { productId: number; name: string; quantity: number; price: number };
type Order = {
  firebaseKey?: string;
  id: number;
  origin: "Mesa" | "Delivery";
  reference: string;
  customer: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  time: string;
  note?: string;
  phone?: string;
  deliveryAddress?: string;
  createdAt?: number;
  createdBy?: string;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const seedProducts: Product[] = [
  { id: 1, name: "X-Burger da casa", category: "Lanches", price: 24.9, description: "Pão brioche, carne 150g, queijo, salada e molho da casa.", emoji: "🍔", active: true },
  { id: 2, name: "X-Bacon especial", category: "Lanches", price: 29.9, description: "Carne 150g, queijo duplo, bacon crocante e molho da casa.", emoji: "🥓", active: true },
  { id: 3, name: "Batata crocante", category: "Porções", price: 18, description: "Batata sequinha com tempero especial. Serve duas pessoas.", emoji: "🍟", active: true },
  { id: 4, name: "Frango em tiras", category: "Porções", price: 32, description: "Tiras empanadas acompanhadas de molho barbecue.", emoji: "🍗", active: true },
  { id: 5, name: "Refrigerante lata", category: "Bebidas", price: 7, description: "Escolha o sabor nas observações do pedido.", emoji: "🥤", active: true },
  { id: 6, name: "Suco de laranja", category: "Bebidas", price: 10, description: "Suco natural preparado na hora, 400 ml.", emoji: "🍊", active: true },
  { id: 7, name: "Brownie com sorvete", category: "Sobremesas", price: 16.9, description: "Brownie de chocolate servido com sorvete de creme.", emoji: "🍨", active: true },
];

const seedOrders: Order[] = [
  { id: 1042, origin: "Mesa", reference: "Mesa 04", customer: "Mesa 04", items: [{ productId: 2, name: "X-Bacon especial", quantity: 2, price: 29.9 }, { productId: 5, name: "Refrigerante lata", quantity: 2, price: 7 }], total: 73.8, status: "novo", time: "19:42", note: "Um lanche sem cebola" },
  { id: 1041, origin: "Delivery", reference: "Entrega · 2,4 km", customer: "Marina Souza", items: [{ productId: 1, name: "X-Burger da casa", quantity: 1, price: 24.9 }, { productId: 3, name: "Batata crocante", quantity: 1, price: 18 }], total: 48.9, status: "preparo", time: "19:36" },
  { id: 1040, origin: "Mesa", reference: "Mesa 09", customer: "Mesa 09", items: [{ productId: 4, name: "Frango em tiras", quantity: 1, price: 32 }], total: 32, status: "pronto", time: "19:28" },
];

const statusLabel: Record<OrderStatus, string> = { novo: "Novo", preparo: "Em preparo", pronto: "Pronto", concluido: "Concluído" };

export default function Home() {
  const [view, setView] = useState<View>("pedidos");
  const [products, setProducts] = useState<Product[]>(seedProducts);
  const [orders, setOrders] = useState<Order[]>(seedOrders);
  const [category, setCategory] = useState("Todos");
  const [cart, setCart] = useState<Record<number, number>>({});
  const [orderType, setOrderType] = useState<"Mesa" | "Delivery">("Delivery");
  const [table, setTable] = useState("");
  const [note, setNote] = useState("");
  const [customer, setCustomer] = useState("");
  const [delivery, setDelivery] = useState({ phone: "", street: "", number: "", neighborhood: "", complement: "" });
  const [formError, setFormError] = useState("");
  const [cashOpen, setCashOpen] = useState(false);
  const [cashStart, setCashStart] = useState(100);
  const [modal, setModal] = useState<"product" | "cash" | null>(null);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [toast, setToast] = useState("");
  const [installEvent, setInstallEvent] = useState<Event | null>(null);
  const [printingQrs, setPrintingQrs] = useState(false);
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [authError, setAuthError] = useState("");
  const [remoteProductsEmpty, setRemoteProductsEmpty] = useState(false);
  const [routeResolved, setRouteResolved] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: "", category: "Lanches", price: "", description: "", emoji: "🍽️" });

  useEffect(() => {
    const initialize = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const mesa = params.get("mesa");
      if (mesa) {
        setTable(mesa.padStart(2, "0"));
        setOrderType("Mesa");
        setView("cardapio");
      }
      const savedProducts = localStorage.getItem("deliveryflow-products");
      const savedOrders = localStorage.getItem("deliveryflow-orders");
      if (savedProducts) setProducts(JSON.parse(savedProducts));
      if (savedOrders) setOrders(JSON.parse(savedOrders));
      setRouteResolved(true);
    }, 0);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstallEvent(event); };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    return () => { window.clearTimeout(initialize); window.removeEventListener("beforeinstallprompt", beforeInstall); };
  }, []);

  useEffect(() => { localStorage.setItem("deliveryflow-products", JSON.stringify(products)); }, [products]);
  useEffect(() => { localStorage.setItem("deliveryflow-orders", JSON.stringify(orders)); }, [orders]);

  useEffect(() => watchAuth((user) => {
    setAdminUser(user?.email === ADMIN_EMAIL ? user : null);
    setAuthResolved(true);
  }), []);

  useEffect(() => watchProducts<Product>((remoteProducts) => {
    if (remoteProducts?.length) {
      setProducts(remoteProducts);
      setRemoteProductsEmpty(false);
    } else {
      setRemoteProductsEmpty(true);
    }
  }), []);

  useEffect(() => {
    if (!adminUser) return;
    const stopOrders = watchOrders<Order>((remoteOrders) => setOrders(remoteOrders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))));
    if (remoteProductsEmpty) uploadSeedProducts(seedProducts).catch(() => notify("Não foi possível enviar os produtos iniciais"));
    return stopOrders;
  }, [adminUser, remoteProductsEmpty]);

  const categories = useMemo(() => ["Todos", ...Array.from(new Set(products.map((p) => p.category)))], [products]);
  const visibleProducts = products.filter((p) => p.active && (category === "Todos" || p.category === category));
  const cartItems = products.filter((p) => cart[p.id]).map((p) => ({ ...p, quantity: cart[p.id] }));
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = orderType === "Delivery" && subtotal ? 6 : 0;
  const activeOrders = orders.filter((o) => o.status !== "concluido");
  const todayTotal = orders.reduce((sum, order) => sum + order.total, 0);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  async function moveOrder(order: Order) {
    const next: Record<OrderStatus, OrderStatus> = { novo: "preparo", preparo: "pronto", pronto: "concluido", concluido: "concluido" };
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: next[item.status] } : item));
    if (order.firebaseKey) await setOrderStatus(order.firebaseKey, next[order.status]).catch(() => notify("Falha ao atualizar o pedido no Firebase"));
  }

  function printTicket(order: Order) {
    setPrintOrder(order);
    window.setTimeout(() => window.print(), 80);
  }

  function printQrs() {
    setPrintingQrs(true);
    const done = () => { setPrintingQrs(false); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.setTimeout(() => window.print(), 80);
  }

  async function addProduct(event: FormEvent) {
    event.preventDefault();
    const price = Number(newProduct.price.replace(",", "."));
    if (!newProduct.name || !price) return;
    const product = { id: Date.now(), ...newProduct, price, active: true };
    setProducts((current) => [...current, product]);
    await saveProduct(product).catch(() => notify("Produto salvo apenas neste computador"));
    setNewProduct({ name: "", category: "Lanches", price: "", description: "", emoji: "🍽️" });
    setModal(null);
    notify("Produto cadastrado com sucesso");
  }

  async function sendOrder() {
    if (!cartItems.length) return;
    if (orderType === "Mesa" && !table) {
      setFormError("Selecione o número da mesa antes de enviar o pedido.");
      return;
    }
    if (orderType === "Delivery" && [customer, delivery.phone, delivery.street, delivery.number, delivery.neighborhood].some((value) => !value.trim())) {
      setFormError("Preencha nome, telefone e endereço completo para a entrega.");
      return;
    }
    setFormError("");
    const address = orderType === "Delivery" ? `${delivery.street}, ${delivery.number} · ${delivery.neighborhood}${delivery.complement ? ` · ${delivery.complement}` : ""}` : undefined;
    const newOrder: Order = {
      id: Number(String(Date.now()).slice(-6)),
      origin: orderType,
      reference: orderType === "Mesa" ? `Mesa ${table}` : "Entrega",
      customer: orderType === "Mesa" ? `Mesa ${table}` : customer.trim(),
      items: cartItems.map((item) => ({ productId: item.id, name: item.name, quantity: item.quantity, price: item.price })),
      total: subtotal + deliveryFee,
      status: "novo",
      time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      note,
      phone: orderType === "Delivery" ? delivery.phone.trim() : undefined,
      deliveryAddress: address,
    };
    try {
      await submitOrder(newOrder);
    } catch {
      setFormError("Não foi possível enviar o pedido. Verifique a internet e tente novamente.");
      return;
    }
    setCart({});
    setNote("");
    setCustomer("");
    setDelivery({ phone: "", street: "", number: "", neighborhood: "", complement: "" });
    notify(`Pedido #${newOrder.id} enviado para a cozinha`);
  }

  async function enterAdmin() {
    setAuthError("");
    try {
      await loginAdmin();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Não foi possível entrar.");
    }
  }

  function toggleProduct(product: Product) {
    const updated = { ...product, active: !product.active };
    setProducts((current) => current.map((item) => item.id === product.id ? updated : item));
    saveProduct(updated).catch(() => notify("Não foi possível atualizar o produto"));
  }

  async function installApp() {
    const prompt = installEvent as Event & { prompt?: () => Promise<void> };
    if (prompt?.prompt) await prompt.prompt();
    else notify("No Chrome ou Edge, use o menu ⋮ e escolha “Instalar aplicativo”");
  }

  if (view === "cardapio") {
    return (
      <main className="storefront">
        <header className="store-header">
          <button className="brand brand-dark" onClick={() => setView("pedidos")} aria-label="Voltar ao PDV"><span>DF</span><strong>DeliveryFlow</strong></button>
          <div className="store-location"><small>Você está pedindo para</small><strong>{orderType === "Mesa" ? (table ? `Mesa ${table}` : "Escolha a mesa") : "Delivery"}</strong></div>
          <button className="cart-button" onClick={() => document.getElementById("carrinho")?.scrollIntoView({ behavior: "smooth" })}>Sacola <span>{Object.values(cart).reduce((a, b) => a + b, 0)}</span></button>
        </header>

        <section className="hero">
          <div><span className="eyebrow">ABERTO AGORA · ATÉ 23H</span><h1>Seu pedido favorito,<br /><em>do seu jeito.</em></h1><p>Feito na hora, com ingredientes frescos e aquele sabor que dá vontade de voltar.</p></div>
          <div className="hero-art"><span>🍔</span><i>feito<br />na hora</i></div>
        </section>

        <div className="order-mode">
          <button className={orderType === "Delivery" ? "active" : ""} onClick={() => { setOrderType("Delivery"); setFormError(""); }}><b>Entrega</b><small>Receba no seu endereço</small></button>
          <button className={orderType === "Mesa" ? "active" : ""} onClick={() => { setOrderType("Mesa"); setFormError(""); }}><b>Na mesa</b><small>Peça pelo QR Code</small></button>
        </div>

        <div className="menu-layout">
          <section className="menu-content">
            <div className="category-row">{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
            <div className="section-heading"><div><span>Cardápio</span><h2>{category === "Todos" ? "Mais pedidos" : category}</h2></div><p>{visibleProducts.length} opções</p></div>
            <div className="product-grid">
              {visibleProducts.map((product) => (
                <article className="menu-card" key={product.id}>
                  <div className="food-photo"><span>{product.emoji}</span><small>{product.category}</small></div>
                  <div className="menu-card-body"><h3>{product.name}</h3><p>{product.description}</p><div><strong>{money.format(product.price)}</strong><button onClick={() => setCart((current) => ({ ...current, [product.id]: (current[product.id] || 0) + 1 }))} aria-label={`Adicionar ${product.name}`}>+</button></div></div>
                </article>
              ))}
            </div>
          </section>

          <aside className="checkout" id="carrinho">
            <div className="checkout-title"><div><span>Seu pedido</span><h2>{orderType === "Mesa" ? (table ? `Mesa ${table}` : "Escolha a mesa") : "Entrega"}</h2></div><span className="item-count">{cartItems.length}</span></div>
            {!cartItems.length ? <div className="empty-cart"><span>🛍️</span><strong>Sua sacola está vazia</strong><p>Adicione produtos para começar.</p></div> : <>
              <div className="cart-list">{cartItems.map((item) => <div className="cart-item" key={item.id}><div><b>{item.quantity}×</b><span>{item.name}</span><small>{money.format(item.price * item.quantity)}</small></div><div className="quantity"><button onClick={() => setCart((current) => ({ ...current, [item.id]: Math.max(0, current[item.id] - 1) }))}>−</button><span>{item.quantity}</span><button onClick={() => setCart((current) => ({ ...current, [item.id]: current[item.id] + 1 }))}>+</button></div></div>)}</div>
              {orderType === "Delivery" && <div className="checkout-form">
                <strong>Dados para entrega</strong>
                <label className="field-label">Nome do cliente<input className="field" placeholder="Nome completo" value={customer} onChange={(e) => setCustomer(e.target.value)} /></label>
                <label className="field-label">Telefone<input className="field" placeholder="(00) 00000-0000" value={delivery.phone} onChange={(e) => setDelivery({ ...delivery, phone: e.target.value })} inputMode="tel" /></label>
                <label className="field-label">Rua ou avenida<input className="field" placeholder="Nome da rua" value={delivery.street} onChange={(e) => setDelivery({ ...delivery, street: e.target.value })} /></label>
                <div className="checkout-field-row"><label className="field-label">Número<input className="field" placeholder="123" value={delivery.number} onChange={(e) => setDelivery({ ...delivery, number: e.target.value })} /></label><label className="field-label">Bairro<input className="field" placeholder="Seu bairro" value={delivery.neighborhood} onChange={(e) => setDelivery({ ...delivery, neighborhood: e.target.value })} /></label></div>
                <label className="field-label">Complemento <small>opcional</small><input className="field" placeholder="Apto, bloco ou referência" value={delivery.complement} onChange={(e) => setDelivery({ ...delivery, complement: e.target.value })} /></label>
              </div>}
              {orderType === "Mesa" && <label className="field-label table-select-label">Número da mesa<select className="field" value={table} onChange={(e) => { setTable(e.target.value); setFormError(""); }}><option value="">Selecione a mesa</option>{Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((n) => <option key={n} value={n}>Mesa {n}</option>)}</select></label>}
              <textarea className="field" placeholder="Alguma observação?" value={note} onChange={(e) => setNote(e.target.value)} />
              {formError && <p className="form-error" role="alert">! {formError}</p>}
              <div className="totals"><p><span>Subtotal</span><b>{money.format(subtotal)}</b></p>{orderType === "Delivery" && <p><span>Taxa de entrega</span><b>{money.format(deliveryFee)}</b></p>}<p className="grand-total"><span>Total</span><b>{money.format(subtotal + deliveryFee)}</b></p></div>
              <button className="primary wide" onClick={sendOrder}>Enviar pedido <span>→</span></button>
            </>}
          </aside>
        </div>
        <footer className="store-footer">DeliveryFlow · Pedidos simples, atendimento melhor.</footer>
        {toast && <div className="toast">✓ {toast}</div>}
      </main>
    );
  }

  if (!routeResolved || !authResolved) {
    return <main className="admin-login"><div className="login-card"><div className="login-logo">DF</div><h1>DeliveryFlow</h1><p>Conectando ao sistema...</p></div></main>;
  }

  if (!adminUser) {
    return <main className="admin-login"><section className="login-card"><div className="login-logo">DF</div><span>ACESSO ADMINISTRATIVO</span><h1>Entre no seu PDV</h1><p>Use a conta Google proprietária do Firebase para acessar pedidos, produtos e caixa.</p><button className="google-login" onClick={enterAdmin}>G&nbsp;&nbsp; Entrar com Google</button>{authError && <p className="login-error">{authError}</p>}<button className="customer-link" onClick={() => setView("cardapio")}>Abrir cardápio do cliente →</button></section></main>;
  }

  const nav: { id: View; label: string; icon: string }[] = [
    { id: "pedidos", label: "Pedidos", icon: "▦" }, { id: "produtos", label: "Produtos", icon: "◫" }, { id: "mesas", label: "Mesas e QR", icon: "⌗" }, { id: "caixa", label: "Caixa", icon: "◉" },
  ];

  return (
    <main className={`admin-shell ${printingQrs ? "printing-qrs" : ""}`}>
      <aside className="sidebar">
        <div className="brand"><span>DF</span><div><strong>DeliveryFlow</strong><small>Gestão inteligente</small></div></div>
        <nav>{nav.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><i>{item.icon}</i>{item.label}{item.id === "pedidos" && <b>{activeOrders.length}</b>}</button>)}</nav>
        <div className="sidebar-bottom"><button onClick={() => setView("cardapio")}><i>↗</i> Ver cardápio</button><button onClick={installApp}><i>↓</i> Instalar no PC</button><button onClick={() => logoutAdmin()}><i>↪</i> Sair</button><div className="user"><span>{adminUser.displayName?.slice(0, 2).toUpperCase() || "AD"}</span><div><strong>{adminUser.displayName || "Administrador"}</strong><small>Administrador</small></div><i>•••</i></div></div>
      </aside>

      <section className="admin-main">
        <header className="topbar"><div><small>SEGUNDA, 03 DE AGOSTO</small><h1>{view === "pedidos" ? "Pedidos" : view === "produtos" ? "Produtos" : view === "mesas" ? "Mesas e QR Code" : "Controle de caixa"}</h1></div><div className="top-actions"><div className={`store-status ${cashOpen ? "open" : ""}`}><span></span>{cashOpen ? "Caixa aberto" : "Caixa fechado"}</div><button className="icon-button" aria-label="Notificações">●</button></div></header>

        {view === "pedidos" && <>
          <div className="summary-grid"><article><span className="summary-icon orange">▣</span><div><small>Pedidos ativos</small><strong>{activeOrders.length}</strong><em>+2 na última hora</em></div></article><article><span className="summary-icon green">R$</span><div><small>Vendas de hoje</small><strong>{money.format(todayTotal)}</strong><em>12 pedidos realizados</em></div></article><article><span className="summary-icon blue">◷</span><div><small>Tempo médio</small><strong>18 min</strong><em>Dentro da meta</em></div></article></div>
          <div className="board-toolbar"><div><button className="active">Todos <span>{activeOrders.length}</span></button><button>Delivery</button><button>Mesas</button></div><button className="secondary" onClick={() => setView("cardapio")}>+ Novo pedido</button></div>
          <div className="kanban">{(["novo", "preparo", "pronto"] as OrderStatus[]).map((status) => <section className={`kanban-column ${status}`} key={status}><header><div><span></span><h2>{statusLabel[status]}</h2><b>{orders.filter((o) => o.status === status).length}</b></div>{status === "novo" && <small>aguardando aceite</small>}</header><div className="order-stack">{orders.filter((o) => o.status === status).map((order) => <article className="order-card" key={order.id}><div className="order-card-head"><div><span className={`origin ${order.origin.toLowerCase()}`}>{order.origin}</span><strong>#{order.id}</strong></div><time>{order.time}</time></div><h3>{order.reference}</h3><p className="customer">{order.customer}</p><ul>{order.items.map((item) => <li key={item.productId}><b>{item.quantity}×</b><span>{item.name}</span></li>)}</ul>{order.note && <p className="note">“{order.note}”</p>}<div className="order-total"><span>Total</span><strong>{money.format(order.total)}</strong></div><div className="order-actions"><button onClick={() => printTicket(order)}>Imprimir</button><button className="primary" onClick={() => moveOrder(order)}>{status === "novo" ? "Aceitar pedido" : status === "preparo" ? "Marcar pronto" : "Finalizar"} →</button></div></article>)}</div></section>)}</div>
        </>}

        {view === "produtos" && <>
          <div className="page-actions"><div className="search-box">⌕ <input placeholder="Buscar produto..." /></div><button className="primary" onClick={() => setModal("product")}>+ Cadastrar produto</button></div>
          <div className="table-card"><table><thead><tr><th>Produto</th><th>Categoria</th><th>Preço</th><th>Disponível</th><th></th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><span className="product-thumb">{product.emoji}</span><div><strong>{product.name}</strong><small>{product.description}</small></div></td><td><span className="tag">{product.category}</span></td><td><strong>{money.format(product.price)}</strong></td><td><button className={`switch ${product.active ? "on" : ""}`} onClick={() => toggleProduct(product)}><span></span></button></td><td><button className="more">•••</button></td></tr>)}</tbody></table></div>
        </>}

        {view === "mesas" && <>
          <div className="info-banner"><div><span>⌗</span><div><strong>QR Code inteligente</strong><p>O cliente aponta a câmera, abre o cardápio e o pedido já chega identificado com o número da mesa.</p></div></div><button className="secondary" onClick={printQrs}>Imprimir todos</button></div>
          <div className="tables-grid">{Array.from({ length: 12 }, (_, i) => i + 1).map((number) => { const url = typeof window === "undefined" ? "" : `${window.location.origin}/?mesa=${number}`; return <article className="table-tile" key={number}><div className="qr">{/* A imagem é gerada para uma URL dinâmica por mesa. */}<img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}`} alt={`QR Code da mesa ${number}`} /></div><div><span>MESA</span><strong>{String(number).padStart(2, "0")}</strong></div><button onClick={() => navigator.clipboard?.writeText(url).then(() => notify(`Link da mesa ${number} copiado`))}>Copiar link</button></article>; })}</div>
        </>}

        {view === "caixa" && <>
          <div className={`cash-hero ${cashOpen ? "is-open" : ""}`}><div><span className="cash-symbol">R$</span><div><small>SITUAÇÃO DO CAIXA</small><h2>{cashOpen ? "Caixa aberto" : "Caixa fechado"}</h2><p>{cashOpen ? "Aberto hoje às 17:30 por Estevão Silva" : "Abra o caixa para começar a registrar recebimentos."}</p></div></div><button className={cashOpen ? "secondary" : "primary"} onClick={() => cashOpen ? setCashOpen(false) : setModal("cash")}>{cashOpen ? "Fechar caixa" : "Abrir caixa"}</button></div>
          <div className="cash-grid"><article><small>Saldo inicial</small><strong>{money.format(cashOpen ? cashStart : 0)}</strong><span>Dinheiro em caixa</span></article><article><small>Vendas no dinheiro</small><strong>{money.format(cashOpen ? 186.5 : 0)}</strong><span>4 pagamentos</span></article><article><small>PIX e cartão</small><strong>{money.format(cashOpen ? todayTotal - 186.5 : 0)}</strong><span>8 pagamentos</span></article><article><small>Saldo esperado</small><strong>{money.format(cashOpen ? cashStart + 186.5 : 0)}</strong><span>Valor físico esperado</span></article></div>
          <div className="table-card cash-history"><div className="card-title"><div><span>Movimentações de hoje</span><h2>Histórico do caixa</h2></div><button className="secondary" disabled={!cashOpen}>+ Nova movimentação</button></div><table><thead><tr><th>Horário</th><th>Descrição</th><th>Tipo</th><th>Forma</th><th>Valor</th></tr></thead><tbody><tr><td>17:30</td><td><strong>Abertura de caixa</strong></td><td><span className="tag">Entrada</span></td><td>Dinheiro</td><td><strong>{money.format(cashOpen ? cashStart : 0)}</strong></td></tr><tr><td>19:36</td><td><strong>Pedido #1041</strong></td><td><span className="tag green-tag">Venda</span></td><td>PIX</td><td><strong>{money.format(48.9)}</strong></td></tr></tbody></table></div>
        </>}
      </section>

      {modal === "product" && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><form className="modal" onSubmit={addProduct} onMouseDown={(e) => e.stopPropagation()}><div className="modal-head"><div><small>NOVO ITEM</small><h2>Cadastrar produto</h2></div><button type="button" onClick={() => setModal(null)}>×</button></div><label>Nome do produto<input value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} placeholder="Ex.: X-Salada especial" autoFocus /></label><div className="form-row"><label>Categoria<select value={newProduct.category} onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}><option>Lanches</option><option>Porções</option><option>Bebidas</option><option>Sobremesas</option></select></label><label>Preço<input value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} placeholder="0,00" inputMode="decimal" /></label></div><label>Descrição<textarea value={newProduct.description} onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })} placeholder="Ingredientes e detalhes" /></label><div className="modal-actions"><button type="button" className="secondary" onClick={() => setModal(null)}>Cancelar</button><button className="primary">Salvar produto</button></div></form></div>}
      {modal === "cash" && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><form className="modal small-modal" onSubmit={(e) => { e.preventDefault(); setCashOpen(true); setModal(null); notify("Caixa aberto com sucesso"); }} onMouseDown={(e) => e.stopPropagation()}><div className="modal-head"><div><small>INÍCIO DO TURNO</small><h2>Abrir caixa</h2></div><button type="button" onClick={() => setModal(null)}>×</button></div><label>Valor inicial em dinheiro<input type="number" value={cashStart} onChange={(e) => setCashStart(Number(e.target.value))} /></label><p className="helper">Informe o valor disponível na gaveta antes da primeira venda.</p><button className="primary wide">Confirmar abertura</button></form></div>}

      {printOrder && <section className="print-ticket"><h1>DELIVERYFLOW</h1><p>COMANDA DE PRODUÇÃO</p><hr /><h2>PEDIDO #{printOrder.id}</h2><h3>{printOrder.reference} · {printOrder.time}</h3>{printOrder.origin === "Delivery" && <><p><b>CLIENTE:</b> {printOrder.customer}</p><p><b>TELEFONE:</b> {printOrder.phone}</p><p><b>ENDEREÇO:</b> {printOrder.deliveryAddress}</p></>}<hr />{printOrder.items.map((item) => <p className="ticket-item" key={item.productId}><b>{item.quantity}x</b> {item.name}</p>)}{printOrder.note && <><hr /><strong>OBSERVAÇÃO:</strong><p>{printOrder.note}</p></>}<hr /><p>Impresso em {new Date().toLocaleString("pt-BR")}</p></section>}
      {toast && <div className="toast">✓ {toast}</div>}
    </main>
  );
}
