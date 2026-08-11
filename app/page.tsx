"use client";
/* eslint-disable @next/next/no-img-element */

import { CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { ADMIN_EMAIL, addCashMovement, closeCashRegister, createOnlineStaffWithManagerGoogle, deleteProduct, loginAdmin, logoutAdmin, openCashRegister, saveBusinessSettings, saveCategories, saveProduct, saveServiceUnits, saveStoreSettings, seedProducts as uploadSeedProducts, submitOrder, watchAuth, watchBusinessSettings, watchCashMovements, watchCashRegister, watchCashSessions, watchCategories, watchOrders, watchProducts, watchServiceUnits, watchStoreSettings, type CashMovement, type CashRegister } from "./firebase";

type View = "pedidos" | "novo-pedido" | "categorias" | "produtos" | "mesas" | "comandas" | "clientes" | "caixa" | "impressoras" | "atendimento" | "loja" | "equipe" | "cardapio";
type ServiceMode = "mesa" | "comanda";
type Customer = { id: string; name: string; phone: string; street?: string; number?: string; neighborhood?: string; complement?: string; notes?: string; active: boolean; createdAt: number; updatedAt: number };
type OrderStatus = "novo" | "preparo" | "pronto" | "enviado" | "entregue" | "retirado" | "servido" | "concluido" | "cancelado";
type PrinterSector = "caixa" | "cozinha";
type TicketTextStyle = { size: "normal" | "large" | "extra"; bold: boolean };
type PrinterConfig = {
  queue: string;
  paper: "80mm" | "58mm";
  copies: number;
  enabled: boolean;
  autoPrint: boolean;
  font: "Arial" | "Segoe UI" | "Consolas";
  lineSpacing: 24 | 30 | 36;
  categories: string[];
  sections: { store: TicketTextStyle; header: TicketTextStyle; customer: TicketTextStyle; items: TicketTextStyle; values: TicketTextStyle; notes: TicketTextStyle };
};
type ExtraPrinter = { id: string; label: string; template: PrinterSector; config: PrinterConfig };
type WeekDay = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
type BusinessSettings = {
  schedule: Record<WeekDay, { enabled: boolean; open: string; close: string }>;
  pickupMinutes: number;
  deliveryMinutes: number;
  deliveryFee: number;
};
type StoreSettings = {
  name: string;
  legalName: string;
  cnpj: string;
  whatsapp: string;
  phone: string;
  email: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  complement: string;
  logoDataUrl: string;
  printLogoDataUrl: string;
  bannerDataUrl: string;
  bannerPosition: number;
  primaryColor: string;
  theme: "light" | "dark";
  promoText: string;
  showAddress: boolean;
  showPhone: boolean;
  showInfo: boolean;
  serviceMode: ServiceMode;
};

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  description: string;
  emoji: string;
  active: boolean;
  imageDataUrl?: string;
  featured?: boolean;
};

type OrderItem = { productId: number; name: string; quantity: number; price: number; category?: string; note?: string };
type PaymentMethod = "Dinheiro" | "PIX" | "Débito" | "Crédito" | "Outro";
type Order = {
  firebaseKey?: string;
  id: number;
  origin: "Mesa" | "Delivery" | "Retirada";
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
  paymentMethod?: PaymentMethod;
  paidAmount?: number;
  change?: number;
  paidAt?: number;
  cashSessionId?: string;
  subtotal?: number;
  deliveryFee?: number;
  estimatedMinutes?: number;
  promisedAt?: number;
  orderDate?: string;
  revision?: number;
  revisedAt?: number;
  isReprint?: boolean;
  isCancellation?: boolean;
  serviceUnitId?: string;
  previousStatus?: OrderStatus;
  cancellationReason?: string;
  cancellationNote?: string;
  cancelledAt?: number;
  cancelledByEmail?: string;
  authorizedBy?: string;
  customerId?: string;
  serviceCustomerId?: string;
};

type ServiceUnit = { id: string; number: string; label: string; type: "mesa" | "comanda"; active: boolean; openedAt?: number; customer?: string; customerId?: string; customerIds?: string[]; currentTable?: string; qrCodeId?: string };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const APP_VERSION = "0.2.0";

const seedProducts: Product[] = [
  { id: 1, name: "X-Burger da casa", category: "Lanches", price: 24.9, description: "Pão brioche, carne 150g, queijo, salada e molho da casa.", emoji: "🍔", active: true },
  { id: 2, name: "X-Bacon especial", category: "Lanches", price: 29.9, description: "Carne 150g, queijo duplo, bacon crocante e molho da casa.", emoji: "🥓", active: true },
  { id: 3, name: "Batata crocante", category: "Porções", price: 18, description: "Batata sequinha com tempero especial. Serve duas pessoas.", emoji: "🍟", active: true },
  { id: 4, name: "Frango em tiras", category: "Porções", price: 32, description: "Tiras empanadas acompanhadas de molho barbecue.", emoji: "🍗", active: true },
  { id: 5, name: "Refrigerante lata", category: "Bebidas", price: 7, description: "Escolha o sabor nas observações do pedido.", emoji: "🥤", active: true },
  { id: 6, name: "Suco de laranja", category: "Bebidas", price: 10, description: "Suco natural preparado na hora, 400 ml.", emoji: "🍊", active: true },
  { id: 7, name: "Brownie com sorvete", category: "Sobremesas", price: 16.9, description: "Brownie de chocolate servido com sorvete de creme.", emoji: "🍨", active: true },
];

const statusLabel: Record<OrderStatus, string> = { novo: "Recebido", preparo: "Produção", pronto: "Pronto", enviado: "Enviado", entregue: "Entregue", retirado: "Retirado", servido: "Servido", concluido: "Concluído", cancelado: "Cancelado" };
const defaultPrinters: Record<PrinterSector, PrinterConfig> = {
  caixa: { queue: "TANCA TP-650", paper: "80mm", copies: 1, enabled: true, autoPrint: true, font: "Arial", lineSpacing: 30, categories: [], sections: { store: { size: "large", bold: true }, header: { size: "large", bold: true }, customer: { size: "large", bold: true }, items: { size: "normal", bold: false }, values: { size: "large", bold: true }, notes: { size: "normal", bold: true } } },
  cozinha: { queue: "", paper: "80mm", copies: 1, enabled: false, autoPrint: false, font: "Arial", lineSpacing: 30, categories: [], sections: { store: { size: "normal", bold: true }, header: { size: "large", bold: true }, customer: { size: "normal", bold: true }, items: { size: "normal", bold: true }, values: { size: "normal", bold: true }, notes: { size: "large", bold: true } } },
};
const weekDays: Array<{ id: WeekDay; label: string }> = [
  { id: "mon", label: "Segunda-feira" }, { id: "tue", label: "Terça-feira" }, { id: "wed", label: "Quarta-feira" }, { id: "thu", label: "Quinta-feira" }, { id: "fri", label: "Sexta-feira" }, { id: "sat", label: "Sábado" }, { id: "sun", label: "Domingo" },
];
const defaultBusiness: BusinessSettings = {
  schedule: {
    mon: { enabled: true, open: "18:00", close: "23:00" }, tue: { enabled: true, open: "18:00", close: "23:00" }, wed: { enabled: true, open: "18:00", close: "23:00" }, thu: { enabled: true, open: "18:00", close: "23:00" }, fri: { enabled: true, open: "18:00", close: "23:00" }, sat: { enabled: true, open: "18:00", close: "23:00" }, sun: { enabled: true, open: "18:00", close: "23:00" },
  },
  pickupMinutes: 40,
  deliveryMinutes: 60,
  deliveryFee: 6,
};
const defaultStore: StoreSettings = {
  printLogoDataUrl: "",
  name: "Seu Restaurante", legalName: "", cnpj: "", whatsapp: "", phone: "", email: "", street: "", number: "", neighborhood: "", city: "", state: "", zipCode: "", complement: "", logoDataUrl: "", bannerDataUrl: "", bannerPosition: 50, primaryColor: "#ff6333", theme: "light", promoText: "Peça online e receba onde estiver", showAddress: true, showPhone: true, showInfo: true, serviceMode: "mesa",
};

function normalizePrinterConfig(config: Partial<PrinterConfig> | undefined, sector: PrinterSector): PrinterConfig {
  const defaults = defaultPrinters[sector];
  return {
    ...defaults,
    ...config,
    categories: Array.isArray(config?.categories) ? config.categories : [],
    font: config?.font === "Segoe UI" || config?.font === "Consolas" ? config.font : "Arial",
    sections: {
      store: { ...defaults.sections.store, ...config?.sections?.store },
      header: { ...defaults.sections.header, ...config?.sections?.header },
      customer: { ...defaults.sections.customer, ...config?.sections?.customer },
      items: { ...defaults.sections.items, ...config?.sections?.items },
      values: { ...defaults.sections.values, ...config?.sections?.values },
      notes: { ...defaults.sections.notes, ...config?.sections?.notes },
    },
  };
}

async function sendDirectPrint(order: Order, sector: PrinterSector, config: PrinterConfig, store: StoreSettings) {
  const isCashReport = (order as Order & { reportType?: string }).reportType === "cash-close";
  const selectedItems = !isCashReport && !order.isCancellation && config.categories.length ? order.items.filter((item) => item.category && config.categories.includes(item.category)) : order.items;
  if (!selectedItems.length) return;
  const routedOrder = { ...order, items: selectedItems };
  const body = JSON.stringify({ printerName: config.queue, sector, copies: config.copies, style: { paper: config.paper, font: config.font, lineSpacing: config.lineSpacing, sections: config.sections }, store, order: routedOrder }).replace(/[\u007f-\uffff]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
  const response = await fetch("http://127.0.0.1:18181/print", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const result = await response.json() as { ok: boolean; error?: string };
  if (!response.ok || !result.ok) throw new Error(result.error || "Falha na impressão");
}

export default function Home() {
  const [view, setView] = useState<View>("pedidos");
  const [orderDisplay, setOrderDisplay] = useState<"columns" | "list">("columns");
  const [serviceUnits, setServiceUnits] = useState<ServiceUnit[]>(() => [...Array.from({ length: 12 }, (_, index) => ({ id: `mesa-${index + 1}`, number: String(index + 1).padStart(2, "0"), label: `Mesa ${String(index + 1).padStart(2, "0")}`, type: "mesa" as const, active: true })), ...Array.from({ length: 20 }, (_, index) => ({ id: `comanda-${index + 1}`, number: String(index + 1).padStart(2, "0"), label: `Comanda ${String(index + 1).padStart(2, "0")}`, type: "comanda" as const, active: true }))]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [currentComandaTable, setCurrentComandaTable] = useState("");
  const [selectedUnit, setSelectedUnit] = useState<ServiceUnit | null>(null);
  const [newUnitLabel, setNewUnitLabel] = useState("");
  const [publicOrderMode, setPublicOrderMode] = useState<"delivery" | "table" | null>(null);
  const [products, setProducts] = useState<Product[]>(seedProducts);
  const [orders, setOrders] = useState<Order[]>([]);
  const [category, setCategory] = useState("Todos");
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [categoriesRemoteResolved, setCategoriesRemoteResolved] = useState(false);
  const [serviceUnitsRemoteResolved, setServiceUnitsRemoteResolved] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [menuSearch, setMenuSearch] = useState("");
  const [manualSearch, setManualSearch] = useState("");
  const [itemNotes, setItemNotes] = useState<Record<number, string>>({});
  const [storeInfoOpen, setStoreInfoOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [orderType, setOrderType] = useState<"Mesa" | "Delivery" | "Retirada">("Delivery");
  const [table, setTable] = useState("");
  const [note, setNote] = useState("");
  const [customer, setCustomer] = useState("");
  const [delivery, setDelivery] = useState({ phone: "", street: "", number: "", neighborhood: "", complement: "" });
  const [formError, setFormError] = useState("");
  const [cashRegister, setCashRegister] = useState<CashRegister | null>(null);
  const [cashResolved, setCashResolved] = useState(false);
  const [cashStart, setCashStart] = useState(100);
  const [cashOpeningNote, setCashOpeningNote] = useState("");
  const [cashClosing, setCashClosing] = useState(0);
  const [cashDeclared, setCashDeclared] = useState<Record<Exclude<PaymentMethod, "Dinheiro">, string>>({ PIX: "", Débito: "", Crédito: "", Outro: "" });
  const [cashClosingNote, setCashClosingNote] = useState("");
  const [cashTab, setCashTab] = useState<"current" | "movements" | "closing" | "history">("current");
  const [cashSessions, setCashSessions] = useState<CashRegister[]>([]);
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [cashMovementType, setCashMovementType] = useState<CashMovement["type"]>("sangria");
  const [cashMovementAmount, setCashMovementAmount] = useState(0);
  const [cashMovementReason, setCashMovementReason] = useState("");
  const [cashHistorySearch, setCashHistorySearch] = useState("");
  const [cashError, setCashError] = useState("");
  const [cashSaving, setCashSaving] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Dinheiro");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [modal, setModal] = useState<"product" | "cash" | "cash-close" | "cash-movement" | "payment" | "print-destination" | "order-details" | "cancel-order" | "manager-google" | "manager-local" | null>(null);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [printDestination, setPrintDestination] = useState<PrinterSector>("cozinha");
  const [printers, setPrinters] = useState<Record<PrinterSector, PrinterConfig>>(defaultPrinters);
  const [extraPrinters, setExtraPrinters] = useState<ExtraPrinter[]>([]);
  const [connectorOnline, setConnectorOnline] = useState(false);
  const [detectedPrinters, setDetectedPrinters] = useState<string[]>([]);
  const [business, setBusiness] = useState<BusinessSettings>(defaultBusiness);
  const [businessRemoteResolved, setBusinessRemoteResolved] = useState(false);
  const [store, setStore] = useState<StoreSettings>(defaultStore);
  const [storeRemoteResolved, setStoreRemoteResolved] = useState(false);
  const [storeSaving, setStoreSaving] = useState(false);
  const [manualPrintOrder, setManualPrintOrder] = useState<Order | null>(null);
  const [printingDestination, setPrintingDestination] = useState("");
  const [editingPrinter, setEditingPrinter] = useState<string | null>(null);
  const [editingSettings, setEditingSettings] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editProductId, setEditProductId] = useState("");
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);
  const [cancellationReason, setCancellationReason] = useState("Lançamento errado");
  const [cancellationNote, setCancellationNote] = useState("");
  const [managerAuthorizationSaving, setManagerAuthorizationSaving] = useState(false);
  const [managerAuthorizationError, setManagerAuthorizationError] = useState("");
  const [localManagerCredentials, setLocalManagerCredentials] = useState({ username: "", secret: "" });
  const [toast, setToast] = useState("");
  const [installEvent, setInstallEvent] = useState<Event | null>(null);
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [desktopMode, setDesktopMode] = useState(false);
  const [desktopUser, setDesktopUser] = useState<DesktopUser | null>(null);
  const [networkInfo, setNetworkInfo] = useState<Awaited<ReturnType<NonNullable<Window["deliveryflowDesktop"]>["networkInfo"]>> | null>(null);
  const [networkReady, setNetworkReady] = useState(false);
  const [desktopLogin, setDesktopLogin] = useState({ username: "", password: "" });
  const [desktopLoginError, setDesktopLoginError] = useState("");
  const [desktopLoginSaving, setDesktopLoginSaving] = useState(false);
  const [teamUsers, setTeamUsers] = useState<DesktopUser[]>([]);
  const [editingTeamUser, setEditingTeamUser] = useState<(Partial<DesktopUser> & { name: string; username: string; role: DesktopRole; password: string; pin: string; onlineEmail: string; onlinePassword: string }) | null>(null);
  const [teamError, setTeamError] = useState("");
  const [onlineStaffForm, setOnlineStaffForm] = useState({ name: "", email: "", password: "", role: "garcom" as "garcom" | "cozinha" | "entregador" });
  const [onlineStaffSaving, setOnlineStaffSaving] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const [authError, setAuthError] = useState("");
  const [remoteProductsEmpty, setRemoteProductsEmpty] = useState(false);
  const [routeResolved, setRouteResolved] = useState(false);
  const knownOrderKeys = useRef<Set<string> | null>(null);
  const printersRef = useRef(printers);
  const extraPrintersRef = useRef(extraPrinters);
  const storeRef = useRef(store);
  const productsRef = useRef(products);
  const [newProduct, setNewProduct] = useState({ name: "", category: "Lanches", price: "", description: "", emoji: "🍽️", imageDataUrl: "", featured: false });
  const [editingProductId, setEditingProductId] = useState<number | null>(null);

  useEffect(() => {
    const initialize = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const mesa = params.get("mesa");
      const comanda = params.get("comanda");
      const serviceUnitId = params.get("unit");
      const isDesktop = params.get("desktop") === "1" && Boolean(window.deliveryflowDesktop);
      setDesktopMode(isDesktop);
      const path = window.location.pathname.replace(/\/$/, "") || "/";
      if (path === "/mesa" || (path === "/" && mesa)) {
        const number = mesa ? mesa.padStart(2, "0") : "";
        setTable(number);
        if (number) setSelectedUnit({ id: serviceUnitId || `mesa-${Number(mesa)}`, number, label: `Mesa ${number}`, type: "mesa", active: true });
        setOrderType("Mesa");
        setPublicOrderMode("table");
        setView("cardapio");
      } else if (path === "/comanda" && comanda) {
        const number = comanda.padStart(2, "0");
        setTable(number); setSelectedUnit({ id: serviceUnitId || `comanda-${Number(comanda)}`, number, label: `Comanda ${number}`, type: "comanda", active: true }); setOrderType("Mesa"); setPublicOrderMode("table"); setView("cardapio");
      } else if (path === "/pedido") {
        setOrderType("Delivery");
        setPublicOrderMode("delivery");
        setView("cardapio");
      } else if (path === "/" && !isDesktop) {
        setOrderType("Delivery");
        setPublicOrderMode("delivery");
        setView("cardapio");
      }
      const savedProducts = localStorage.getItem("deliveryflow-products");
      const savedOrders = localStorage.getItem("deliveryflow-orders");
      const savedPrinters = localStorage.getItem("deliveryflow-printers");
      const savedExtraPrinters = localStorage.getItem("deliveryflow-extra-printers");
      const savedBusiness = localStorage.getItem("deliveryflow-business");
      const savedStore = localStorage.getItem("deliveryflow-store");
      const savedServiceUnits = localStorage.getItem("deliveryflow-service-units");
      const savedCategories = localStorage.getItem("deliveryflow-categories");
      if (savedProducts) setProducts(JSON.parse(savedProducts));
      if (savedOrders) setOrders((JSON.parse(savedOrders) as Order[]).filter((order) => !((order.id === 1040 && order.reference === "Mesa 09") || (order.id === 1041 && order.customer === "Marina Souza") || (order.id === 1042 && order.reference === "Mesa 04"))));
      if (savedPrinters) {
        const parsed = JSON.parse(savedPrinters) as Record<PrinterSector, Partial<PrinterConfig>>;
        const normalized = { caixa: normalizePrinterConfig(parsed.caixa, "caixa"), cozinha: normalizePrinterConfig(parsed.cozinha, "cozinha") };
        if (localStorage.getItem("deliveryflow-printers-version") !== "2") {
          normalized.caixa = { ...normalized.caixa, queue: "TANCA TP-650", paper: "80mm", enabled: true, autoPrint: true };
          localStorage.setItem("deliveryflow-printers-version", "2");
        }
        setPrinters(normalized);
      } else {
        localStorage.setItem("deliveryflow-printers-version", "2");
      }
      if (savedExtraPrinters) setExtraPrinters((JSON.parse(savedExtraPrinters) as ExtraPrinter[]).map((printer) => ({ ...printer, config: normalizePrinterConfig(printer.config, printer.template) })));
      if (savedBusiness) setBusiness(JSON.parse(savedBusiness));
      if (savedStore) setStore({ ...defaultStore, ...JSON.parse(savedStore) });
      if (savedServiceUnits) setServiceUnits(JSON.parse(savedServiceUnits));
      if (savedCategories) setCustomCategories(JSON.parse(savedCategories));
      setRouteResolved(true);
    }, 0);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstallEvent(event); };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    return () => { window.clearTimeout(initialize); window.removeEventListener("beforeinstallprompt", beforeInstall); };
  }, []);

  useEffect(() => {
    if (!desktopUser || !window.deliveryflowDesktop) return;
    window.deliveryflowDesktop.listUsers().then(setTeamUsers).catch(() => undefined);
  }, [desktopUser]);

  useEffect(() => {
    if (!desktopUser || !window.deliveryflowDesktop) return;
    let active = true;
    async function refreshNetwork() {
      const bridge = window.deliveryflowDesktop;
      if (!bridge) return;
      try {
        const [info, snapshot] = await Promise.all([bridge.networkInfo(), bridge.networkSnapshot()]);
        if (!active) return;
        setNetworkInfo(info);
        if (snapshot.orders.length) setOrders(snapshot.orders as unknown as Order[]);
        if (snapshot.products.length) setProducts(snapshot.products as unknown as Product[]);
        if (snapshot.categories.length) setCustomCategories(snapshot.categories.map((item) => String(item.value || "")).filter(Boolean));
        if (snapshot.serviceUnits.length) setServiceUnits(snapshot.serviceUnits as unknown as ServiceUnit[]);
        if (snapshot.customers.length) setCustomers(snapshot.customers as unknown as Customer[]);
        const storeSetting = snapshot.settings.find((item) => item.networkId === "store");
        if (storeSetting) setStore((current) => ({ ...current, ...(storeSetting as unknown as Partial<StoreSettings>) }));
        setNetworkReady(true);
      } catch { if (active) setNetworkReady(false); }
    }
    void refreshNetwork(); const timer = window.setInterval(refreshNetwork, 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [desktopUser]);

  useEffect(() => {
    if (!networkReady || !desktopUser || !window.deliveryflowDesktop) return;
    const timer = window.setTimeout(() => { for (const order of orders) void window.deliveryflowDesktop?.saveNetworkEntity({ entityType: "order", entityId: String(order.firebaseKey || (order as Order & { networkId?: string }).networkId || order.id), data: order }); }, 250);
    return () => window.clearTimeout(timer);
  }, [desktopUser, networkReady, orders]);

  useEffect(() => {
    if (!networkReady || desktopUser?.role !== "admin" || !window.deliveryflowDesktop) return;
    const timer = window.setTimeout(() => {
      for (const product of products) void window.deliveryflowDesktop?.saveNetworkEntity({ entityType: "product", entityId: String(product.id), data: product });
      for (const unit of serviceUnits) void window.deliveryflowDesktop?.saveNetworkEntity({ entityType: "serviceUnit", entityId: unit.id, data: unit });
      for (const category of customCategories) void window.deliveryflowDesktop?.saveNetworkEntity({ entityType: "category", entityId: category, data: { value: category } });
      for (const savedCustomer of customers) void window.deliveryflowDesktop?.saveNetworkEntity({ entityType: "customer", entityId: savedCustomer.id, data: savedCustomer });
      void window.deliveryflowDesktop?.saveNetworkEntity({ entityType: "setting", entityId: "store", data: store });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [customCategories, customers, desktopUser, networkReady, products, serviceUnits, store]);

  useEffect(() => { localStorage.setItem("deliveryflow-products", JSON.stringify(products)); }, [products]);
  useEffect(() => { localStorage.setItem("deliveryflow-orders", JSON.stringify(orders)); }, [orders]);
  useEffect(() => { if (!desktopUser || !networkInfo) return; localStorage.setItem(`deliveryflow-order-display:${networkInfo.terminalId}:${desktopUser.id}`, orderDisplay); }, [desktopUser, networkInfo, orderDisplay]);
  useEffect(() => { if (routeResolved) localStorage.setItem("deliveryflow-printers", JSON.stringify(printers)); }, [printers, routeResolved]);
  useEffect(() => { if (routeResolved) localStorage.setItem("deliveryflow-extra-printers", JSON.stringify(extraPrinters)); }, [extraPrinters, routeResolved]);
  useEffect(() => { if (routeResolved) localStorage.setItem("deliveryflow-business", JSON.stringify(business)); }, [business, routeResolved]);
  useEffect(() => { if (routeResolved) localStorage.setItem("deliveryflow-service-units", JSON.stringify(serviceUnits)); }, [serviceUnits, routeResolved]);
  useEffect(() => { if (routeResolved) localStorage.setItem("deliveryflow-categories", JSON.stringify(customCategories)); }, [customCategories, routeResolved]);
  useEffect(() => { if (routeResolved) localStorage.setItem("deliveryflow-store", JSON.stringify(store)); }, [store, routeResolved]);
  useEffect(() => { printersRef.current = printers; }, [printers]);
  useEffect(() => { extraPrintersRef.current = extraPrinters; }, [extraPrinters]);
  useEffect(() => { storeRef.current = store; }, [store]);
  useEffect(() => { productsRef.current = products; }, [products]);

  useEffect(() => {
    let active = true;
    async function checkConnector() {
      try {
        const response = await fetch("http://127.0.0.1:18181/health", { cache: "no-store" });
        const result = await response.json() as { ok: boolean; printers?: string[] };
        if (active) {
          setConnectorOnline(result.ok);
          setDetectedPrinters(result.printers || []);
        }
      } catch {
        if (active) setConnectorOnline(false);
      }
    }
    checkConnector();
    const timer = window.setInterval(checkConnector, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => watchAuth((user) => {
    setAdminUser(user?.email === ADMIN_EMAIL ? user : null);
    setAuthResolved(true);
  }), []);

  useEffect(() => { if (desktopMode) return; return watchProducts<Product>((remoteProducts) => {
    if (remoteProducts?.length) {
      setProducts(remoteProducts);
      setRemoteProductsEmpty(false);
    } else {
      setRemoteProductsEmpty(true);
    }
  }); }, [desktopMode]);

  useEffect(() => { if (desktopMode) return; return watchBusinessSettings<BusinessSettings>((remoteBusiness) => {
    if (remoteBusiness) setBusiness(remoteBusiness);
    setBusinessRemoteResolved(true);
  }); }, [desktopMode]);

  useEffect(() => { if (desktopMode) return; return watchStoreSettings<StoreSettings>((remoteStore) => {
    if (remoteStore) setStore({ ...defaultStore, ...remoteStore });
    setStoreRemoteResolved(true);
  }); }, [desktopMode]);

  useEffect(() => { if (desktopMode) return; return watchServiceUnits<ServiceUnit>((remoteUnits) => {
    if (remoteUnits?.length) setServiceUnits(remoteUnits);
    setServiceUnitsRemoteResolved(true);
  }); }, [desktopMode]);

  useEffect(() => { if (desktopMode) return; return watchCategories((remoteCategories) => {
    if (remoteCategories?.length) setCustomCategories(remoteCategories);
    setCategoriesRemoteResolved(true);
  }); }, [desktopMode]);

  useEffect(() => {
    if (!adminUser || !businessRemoteResolved || !routeResolved) return;
    const timer = window.setTimeout(() => saveBusinessSettings(business).catch(() => notify("Não foi possível salvar os horários no Firebase")), 500);
    return () => window.clearTimeout(timer);
  }, [adminUser, business, businessRemoteResolved, routeResolved]);

  useEffect(() => {
    if (!adminUser || !storeRemoteResolved || !routeResolved) return;
    const timer = window.setTimeout(() => saveStoreSettings(store).catch(() => notify("Não foi possível salvar os dados da loja no Firebase")), 700);
    return () => window.clearTimeout(timer);
  }, [adminUser, routeResolved, store, storeRemoteResolved]);

  useEffect(() => {
    if (!adminUser || !serviceUnitsRemoteResolved || !routeResolved) return;
    const timer = window.setTimeout(() => saveServiceUnits(serviceUnits).catch(() => notify("Não foi possível salvar mesas e comandas no Firebase")), 600);
    return () => window.clearTimeout(timer);
  }, [adminUser, routeResolved, serviceUnits, serviceUnitsRemoteResolved]);

  useEffect(() => {
    if (!adminUser || !categoriesRemoteResolved || !routeResolved) return;
    const timer = window.setTimeout(() => saveCategories(customCategories).catch(() => notify("Não foi possível salvar as categorias no Firebase")), 600);
    return () => window.clearTimeout(timer);
  }, [adminUser, categoriesRemoteResolved, customCategories, routeResolved]);

  useEffect(() => {
    if (!adminUser) return;
    knownOrderKeys.current = null;
    const stopOrders = watchOrders<Order>((remoteOrders) => {
      const sorted = remoteOrders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const keys = new Set(sorted.map((order) => order.firebaseKey));
      if (knownOrderKeys.current) {
        const newOrders = sorted.filter((order) => (order.status === "novo" || order.status === "preparo") && !knownOrderKeys.current?.has(order.firebaseKey));
        for (const order of newOrders) {
          const categorizedOrder = { ...order, items: order.items.map((item) => ({ ...item, category: item.category || productsRef.current.find((product) => product.id === item.productId)?.category })) };
          const settings = printersRef.current;
          const kitchenPrinter = settings.cozinha.enabled && settings.cozinha.autoPrint && settings.cozinha.queue.trim() ? settings.cozinha : settings.caixa;
          if (kitchenPrinter.enabled && kitchenPrinter.autoPrint && kitchenPrinter.queue.trim()) {
            void sendDirectPrint(categorizedOrder, "cozinha", kitchenPrinter, storeRef.current).then(() => notify(`Comanda #${order.id} enviada para produção`)).catch(() => notify(`Falha ao imprimir a comanda #${order.id}`));
          }
          if (order.origin === "Delivery" && settings.caixa.enabled && settings.caixa.autoPrint && settings.caixa.queue.trim()) {
            void sendDirectPrint(categorizedOrder, "caixa", settings.caixa, storeRef.current).then(() => notify(`Via do motoboy #${order.id} impressa no caixa`)).catch(() => notify(`Falha ao imprimir a via do motoboy #${order.id}`));
          }
          for (const extra of extraPrintersRef.current) {
            if (extra.config.enabled && extra.config.autoPrint && extra.config.queue.trim()) {
              void sendDirectPrint(categorizedOrder, extra.template, extra.config, storeRef.current).catch(() => notify(`Falha na impressora ${extra.label}`));
            }
          }
        }
      }
      knownOrderKeys.current = keys;
      setOrders((current) => desktopMode ? [...sorted, ...current.filter((local) => !local.firebaseKey || !keys.has(local.firebaseKey))].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)) : sorted);
    }, (error) => {
      notify(`Pedidos online: ${error.message || "não foi possível ler a fila do Firebase."}`);
    });
    if (!desktopMode && remoteProductsEmpty) uploadSeedProducts(seedProducts).catch(() => notify("Não foi possível enviar os produtos iniciais"));
    return stopOrders;
  }, [adminUser, desktopMode, remoteProductsEmpty]);

  useEffect(() => {
    if (!adminUser || desktopMode) return;
    return watchCashRegister((current) => {
      setCashRegister(current);
      setCashResolved(true);
      if (current?.status !== "open") {
        setView("caixa");
        setModal("cash");
      }
    });
  }, [adminUser, desktopMode]);

  useEffect(() => {
    if (!adminUser || desktopMode) return;
    const stopSessions = watchCashSessions(setCashSessions);
    const stopMovements = watchCashMovements(setCashMovements);
    return () => { stopSessions(); stopMovements(); };
  }, [adminUser, desktopMode]);

  const categories = useMemo(() => ["Todos", ...Array.from(new Set([...products.map((p) => p.category), ...customCategories]))], [products, customCategories]);
  const normalizedSearch = menuSearch.trim().toLocaleLowerCase("pt-BR");
  const visibleProducts = products.filter((p) => p.active && (category === "Todos" || p.category === category) && (!normalizedSearch || `${p.name} ${p.description} ${p.category}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch)));
  const featuredProducts = products.filter((product) => product.active && product.featured).slice(0, 4);
  const featuredDisplay = featuredProducts.length ? featuredProducts : products.filter((product) => product.active).slice(0, 2);
  const menuGroups = categories.filter((item) => item !== "Todos").map((name) => ({ name, products: visibleProducts.filter((product) => product.category === name) })).filter((group) => group.products.length);
  const cartItems = products.filter((p) => cart[p.id]).map((p) => ({ ...p, quantity: cart[p.id] }));
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = orderType === "Delivery" && subtotal ? business.deliveryFee : 0;
  const activeOrders = orders.filter((o) => o.status !== "concluido" && (desktopUser?.role === "cozinha" || o.origin !== "Mesa"));
  const paidOrders = orders.filter((order) => order.status === "concluido" && order.paymentMethod);
  const todayTotal = paidOrders.reduce((sum, order) => sum + (Number.isFinite(Number(order.total)) ? Number(order.total) : 0), 0);
  const cashOpen = cashRegister?.status === "open";
  const currentCashOrders = paidOrders.filter((order) => order.cashSessionId === cashRegister?.sessionId);
  const currentMovements = cashMovements.filter((movement) => movement.sessionId === cashRegister?.sessionId);
  const cashSales = currentCashOrders.filter((order) => order.paymentMethod === "Dinheiro").reduce((sum, order) => sum + order.total, 0);
  const digitalSales = currentCashOrders.filter((order) => order.paymentMethod !== "Dinheiro").reduce((sum, order) => sum + order.total, 0);
  const paymentTotals = (["Dinheiro", "PIX", "Débito", "Crédito", "Outro"] as PaymentMethod[]).reduce<Record<string, number>>((totals, method) => ({ ...totals, [method]: currentCashOrders.filter((order) => order.paymentMethod === method).reduce((sum, order) => sum + order.total, 0) }), {});
  const suppliesTotal = currentMovements.filter((movement) => movement.type === "suprimento").reduce((sum, movement) => sum + movement.amount, 0);
  const withdrawalsTotal = currentMovements.filter((movement) => movement.type === "sangria").reduce((sum, movement) => sum + movement.amount, 0);
  const expectedCash = (cashRegister?.openingAmount || 0) + cashSales + suppliesTotal - withdrawalsTotal;
  const pendingCashOrders = orders.filter((order) => !["concluido", "cancelado"].includes(order.status));
  const occupiedUnits = serviceUnits.filter((unit) => unit.openedAt || orders.some((order) => order.serviceUnitId === unit.id && !["concluido", "cancelado"].includes(order.status)));
  const filteredCashSessions = cashSessions.filter((session) => !cashHistorySearch.trim() || `${session.sessionId} ${session.openedByName} ${session.closedByName || ""} ${new Date(session.openedAt).toLocaleDateString("pt-BR")}`.toLocaleLowerCase("pt-BR").includes(cashHistorySearch.trim().toLocaleLowerCase("pt-BR")));
  const dayKey = (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as WeekDay[])[new Date().getDay()];
  const todaySchedule = business.schedule[dayKey];
  const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const [openHour, openMinute] = todaySchedule.open.split(":").map(Number);
  const [closeHour, closeMinute] = todaySchedule.close.split(":").map(Number);
  const openMinutes = openHour * 60 + openMinute;
  let closeMinutes = closeHour * 60 + closeMinute;
  if (closeMinutes <= openMinutes) closeMinutes += 24 * 60;
  const adjustedCurrentMinutes = currentMinutes < openMinutes && closeMinutes > 24 * 60 ? currentMinutes + 24 * 60 : currentMinutes;
  const storeOpen = todaySchedule.enabled && adjustedCurrentMinutes >= openMinutes && adjustedCurrentMinutes < closeMinutes;

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  async function moveOrder(order: Order) {
    const shouldReceive = order.status === "entregue" || order.status === "retirado";
    if (shouldReceive) {
      setPaymentOrder(order);
      setPaymentMethod("Dinheiro");
      setReceivedAmount("");
      setPaymentError("");
      setModal("payment");
      return;
    }
    const next: OrderStatus = order.status === "novo" ? "preparo" : order.status === "preparo" ? "pronto" : order.status === "pronto" ? (order.origin === "Delivery" ? "enviado" : order.origin === "Retirada" ? "retirado" : "servido") : order.status === "enviado" ? "entregue" : order.status;
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: next } : item));
  }

  async function previousOrderStatus(order: Order) {
    const previous: OrderStatus = order.status === "pronto" ? "preparo" : order.status === "enviado" || order.status === "retirado" || order.status === "servido" ? "pronto" : order.status === "entregue" ? "enviado" : order.status;
    if (previous === order.status) return;
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: previous } : item));
  }

  function openOrderDetails(order: Order) {
    setEditingOrder({ ...order, items: order.items.map((item) => ({ ...item })) });
    setEditProductId("");
    setEditError("");
    setModal("order-details");
  }

  function changeEditedItem(productId: number, quantity: number) {
    setEditingOrder((current) => current ? { ...current, items: current.items.map((item) => item.productId === productId ? { ...item, quantity } : item).filter((item) => item.quantity > 0) } : current);
  }

  function addProductToEditedOrder() {
    if (!editingOrder || !editProductId) return;
    const product = products.find((item) => item.id === Number(editProductId));
    if (!product) return;
    const existing = editingOrder.items.find((item) => item.productId === product.id);
    const items = existing ? editingOrder.items.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...editingOrder.items, { productId: product.id, name: product.name, quantity: 1, price: product.price }];
    setEditingOrder({ ...editingOrder, items });
    setEditProductId("");
  }

  async function saveEditedOrder(reprintKitchen: boolean) {
    if (!editingOrder || !editingOrder.items.length) {
      setEditError("O pedido precisa ter pelo menos um item.");
      return;
    }
    if (!editingOrder.reference.trim()) {
      setEditError("Informe a mesa ou identificação do pedido.");
      return;
    }
    if (editingOrder.origin !== "Mesa" && !editingOrder.customer.trim()) {
      setEditError("Informe o nome do cliente.");
      return;
    }
    const recalculatedSubtotal = editingOrder.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const revised: Order = {
      ...editingOrder,
      subtotal: recalculatedSubtotal,
      total: recalculatedSubtotal + (editingOrder.deliveryFee || 0),
      revision: (editingOrder.revision || 0) + 1,
      revisedAt: Date.now(),
      isReprint: true,
    };
    setEditSaving(true);
    setEditError("");
    try {
      setOrders((current) => current.map((order) => order.id === revised.id ? revised : order));
      if (reprintKitchen) {
        const config = printers.cozinha.enabled && printers.cozinha.queue.trim() ? printers.cozinha : printers.caixa;
        const printed = await printWithConfig(revised, "cozinha", config, "Cozinha");
        if (!printed) {
          setEditError("Alterações salvas, mas a reimpressão falhou. Use o botão Imprimir para tentar novamente.");
          return;
        }
      }
      setModal(null);
      setEditingOrder(null);
      notify(reprintKitchen ? `Pedido #${revised.id} alterado e reimpresso` : `Pedido #${revised.id} atualizado`);
    } catch {
      setEditError("Não foi possível salvar as alterações no servidor local.");
    } finally {
      setEditSaving(false);
    }
  }

  function requestOrderCancellation(order: Order) {
    if (order.status === "concluido" || order.paymentMethod) { notify("Pedido pago precisa ser estornado antes do cancelamento"); return; }
    if (order.status === "cancelado") { notify("Este pedido já foi cancelado"); return; }
    setCancellingOrder(order); setCancellationReason("Lançamento errado"); setCancellationNote(""); setManagerAuthorizationError(""); setModal("cancel-order");
  }

  function continueCancellationAuthorization() {
    if (!cancellingOrder || !cancellationReason.trim()) { setManagerAuthorizationError("Informe o motivo do cancelamento."); return; }
    setManagerAuthorizationError(""); setModal("manager-local");
  }

  async function confirmLocalOrderCancellation(event: FormEvent) {
    event.preventDefault();
    if (!cancellingOrder || !window.deliveryflowDesktop) return;
    setManagerAuthorizationSaving(true); setManagerAuthorizationError("");
    try {
      const manager = await window.deliveryflowDesktop.authorizeManager(localManagerCredentials);
      const cancellation: Partial<Order> = { previousStatus: cancellingOrder.status, status: "cancelado", cancellationReason, cancellationNote, cancelledAt: Date.now(), cancelledByEmail: desktopUser?.username || "operador", authorizedBy: manager.username, serviceUnitId: undefined, isCancellation: true };
      const cancelled: Order = { ...cancellingOrder, ...cancellation, note: `CANCELAMENTO: ${cancellationReason}${cancellationNote.trim() ? ` · ${cancellationNote.trim()}` : ""}` };
      setOrders((current) => current.map((order) => order.id === cancelled.id ? cancelled : order));
      await window.deliveryflowDesktop.saveNetworkEntity({ entityType: "order", entityId: cancellingOrder.firebaseKey || (cancellingOrder as Order & { networkId?: string }).networkId || String(cancellingOrder.id), data: cancelled });
      setLocalManagerCredentials({ username: "", secret: "" }); setCancellingOrder(null); setModal(null); notify(`Pedido #${cancelled.id} cancelado por ${manager.name}`);
    } catch (error) { setManagerAuthorizationError(error instanceof Error ? error.message : "Autorização gerencial recusada."); }
    finally { setManagerAuthorizationSaving(false); }
  }

  async function confirmOrderCancellation() { setModal("manager-local"); }

  async function printCancelledOrder(order: Order) {
    if (!printers.cozinha.enabled || !printers.cozinha.queue.trim()) {
      notify("Configure e ative a impressora da cozinha antes de imprimir o cancelamento");
      return;
    }
    if (!window.confirm(`Imprimir o cancelamento do pedido #${order.id} somente na cozinha?`)) return;
    const cancellationCopy: Order = { ...order, isCancellation: true, note: `CANCELAMENTO: ${order.cancellationReason || "Motivo não informado"}${order.cancellationNote ? ` · ${order.cancellationNote}` : ""}` };
    await printWithConfig(cancellationCopy, "cozinha", printers.cozinha, "Cozinha");
  }

  async function permanentlyDeleteOrder(order: Order) {
    if (!desktopUser || desktopUser.role !== "admin" || !window.deliveryflowDesktop) { notify("Somente um administrador local pode excluir pedidos"); return; }
    if (order.paymentMethod && !(order as Order & { refundedAt?: number }).refundedAt) { notify("Registre o estorno antes de excluir um pedido pago"); return; }
    const adminUsername = window.prompt("Usuário do administrador", desktopUser.username); if (!adminUsername) return;
    const adminSecret = window.prompt("Senha ou PIN do administrador"); if (!adminSecret) return;
    if (!window.confirm(`EXCLUIR DEFINITIVAMENTE o pedido #${order.id}? Esta ação não poderá ser desfeita.`)) return;
    if (!window.confirm("Confirme novamente: o pedido será removido, mas uma cópia ficará na auditoria.")) return;
    setEditSaving(true); setEditError("");
    try {
      const authorized = await window.deliveryflowDesktop.authorizeManager({ username: adminUsername, secret: adminSecret }); if (authorized.role !== "admin") throw new Error("A exclusão definitiva exige um administrador.");
      const entityId = order.firebaseKey || (order as Order & { networkId?: string }).networkId || String(order.id); await window.deliveryflowDesktop.deleteNetworkEntity({ entityType: "order", entityId });
      setOrders((current) => current.filter((item) => item.id !== order.id));
      setModal(null); setEditingOrder(null); notify(`Pedido #${order.id} excluído pelo administrador`);
    } catch (error) {
      setEditError(error instanceof Error ? error.message.replace(/^FirebaseError:\s*/i, "") : "Não foi possível excluir o pedido.");
    } finally { setEditSaving(false); }
  }

  async function finishPayment(event: FormEvent) {
    event.preventDefault();
    if (!paymentOrder || !cashRegister || cashRegister.status !== "open") {
      setPaymentError("Abra o caixa antes de receber o pedido.");
      return;
    }
    const received = paymentMethod === "Dinheiro" ? Number(receivedAmount.replace(",", ".")) : paymentOrder.total;
    if (!Number.isFinite(received) || received < paymentOrder.total) {
      setPaymentError("O valor recebido não pode ser menor que o total do pedido.");
      return;
    }
    const payment = {
      paymentMethod,
      paidAmount: received,
      change: paymentMethod === "Dinheiro" ? received - paymentOrder.total : 0,
      paidAt: Date.now(),
      cashSessionId: cashRegister.sessionId,
    };
    setPaymentSaving(true);
    setPaymentError("");
    try {
      const persistSettlement = async (order: Order) => {
        if (desktopMode && window.deliveryflowDesktop) { const settled = { ...order, ...payment, status: "concluido" as OrderStatus }; await window.deliveryflowDesktop.saveNetworkEntity({ entityType: "order", entityId: order.firebaseKey || (order as Order & { networkId?: string }).networkId || String(order.id), data: settled }); }
      };
      if (paymentOrder.serviceUnitId) {
        const related = orders.filter((order) => order.serviceUnitId === paymentOrder.serviceUnitId && !["concluido", "cancelado"].includes(order.status));
        await Promise.all(related.map(persistSettlement));
        setOrders((current) => current.map((order) => order.serviceUnitId === paymentOrder.serviceUnitId ? { ...order, ...payment, status: "concluido" } : order));
        setServiceUnits((current) => current.map((unit) => unit.id === paymentOrder.serviceUnitId ? { ...unit, openedAt: undefined, customer: undefined } : unit));
        setSelectedUnit(null);
      }
      if (!paymentOrder.serviceUnitId) await persistSettlement(paymentOrder);
      const settledOrder: Order = { ...paymentOrder, ...payment, status: "concluido" };
      if (!paymentOrder.serviceUnitId) setOrders((current) => current.map((order) => order.id === paymentOrder.id ? settledOrder : order));
      setModal(null);
      setPaymentOrder(null);
      notify(`Pedido #${paymentOrder.id} recebido em ${paymentMethod}`);
    } catch {
      setPaymentError("Não foi possível registrar o recebimento. Tente novamente.");
    } finally {
      setPaymentSaving(false);
    }
  }

  async function printWithConfig(order: Order, destination: PrinterSector, config: PrinterConfig, label: string) {
    setPrintDestination(destination);
    setPrintOrder(order);
    if (!config.enabled || !config.queue.trim()) {
      notify(`A impressora ${label} não está configurada`);
      return false;
    }
    try {
      await sendDirectPrint(order, destination, config, store);
      setConnectorOnline(true);
      notify(`Enviado diretamente para ${config.queue}`);
      return true;
    } catch (error) {
      setConnectorOnline(false);
      notify(error instanceof Error && !error.message.includes("fetch") ? error.message : "Conector de impressão desligado");
      return false;
    }
  }

  async function manualPrint(destination: PrinterSector, config: PrinterConfig, label: string) {
    if (!manualPrintOrder) return;
    setPrintingDestination(label);
    const categorizedOrder = { ...manualPrintOrder, items: manualPrintOrder.items.map((item) => ({ ...item, category: item.category || products.find((product) => product.id === item.productId)?.category })) };
    const printed = await printWithConfig(categorizedOrder, destination, config, label);
    setPrintingDestination("");
    if (printed) {
      setModal(null);
      setManualPrintOrder(null);
    }
  }

  function updatePrinter(sector: PrinterSector, changes: Partial<PrinterConfig>) {
    setPrinters((current) => ({ ...current, [sector]: { ...current[sector], ...changes } }));
  }

  function togglePrinterCategory(sector: PrinterSector, categoryName: string) {
    const current = printers[sector].categories;
    updatePrinter(sector, { categories: current.includes(categoryName) ? current.filter((item) => item !== categoryName) : [...current, categoryName] });
  }

  function removeFixedPrinterConfiguration(sector: PrinterSector) {
    const label = sector === "caixa" ? "Caixa" : "Cozinha";
    if (!window.confirm(`Remover a configuração da impressora ${label}?`)) return;
    updatePrinter(sector, { queue: "", enabled: false, autoPrint: false, categories: [] });
    setEditingPrinter(null);
    notify(`Configuração da impressora ${label} removida`);
  }

  function addExtraPrinter() {
    const id = String(Date.now());
    setExtraPrinters((current) => [...current, { id, label: `Impressora ${current.length + 3}`, template: "cozinha", config: { ...defaultPrinters.cozinha, sections: { ...defaultPrinters.cozinha.sections }, enabled: true } }]);
    setEditingPrinter(id);
  }

  function duplicatePrinter(label: string, template: PrinterSector, config: PrinterConfig) {
    const id = String(Date.now());
    const copy: ExtraPrinter = { id, label: `${label} — cópia`, template, config: { ...config, categories: [...config.categories], sections: Object.fromEntries(Object.entries(config.sections).map(([key, value]) => [key, { ...value }])) as PrinterConfig["sections"] } };
    setExtraPrinters((current) => [...current, copy]);
    setEditingPrinter(id);
    notify(`${label} duplicada`);
  }

  function updateExtraPrinter(id: string, changes: Partial<ExtraPrinter>, configChanges?: Partial<PrinterConfig>) {
    setExtraPrinters((current) => current.map((printer) => printer.id === id ? { ...printer, ...changes, config: { ...printer.config, ...configChanges } } : printer));
  }

  function toggleExtraPrinterCategory(id: string, categoryName: string) {
    setExtraPrinters((current) => current.map((printer) => printer.id === id ? { ...printer, config: { ...printer.config, categories: printer.config.categories.includes(categoryName) ? printer.config.categories.filter((item) => item !== categoryName) : [...printer.config.categories, categoryName] } } : printer));
  }

  function removeExtraPrinter(id: string, label: string) {
    if (!window.confirm(`Excluir a impressora ${label}?`)) return;
    setExtraPrinters((current) => current.filter((item) => item.id !== id));
    if (editingPrinter === id) setEditingPrinter(null);
    notify(`${label} excluída`);
  }

  function updatePrinterSection(sector: PrinterSector, section: keyof PrinterConfig["sections"], changes: Partial<TicketTextStyle>) {
    setPrinters((current) => ({
      ...current,
      [sector]: {
        ...current[sector],
        sections: { ...current[sector].sections, [section]: { ...current[sector].sections[section], ...changes } },
      },
    }));
  }

  function updateSchedule(day: WeekDay, changes: Partial<BusinessSettings["schedule"][WeekDay]>) {
    setBusiness((current) => ({ ...current, schedule: { ...current.schedule, [day]: { ...current.schedule[day], ...changes } } }));
  }

  async function resizeImage(file: File, maxWidth: number, maxHeight: number, format: "image/png" | "image/jpeg" = "image/jpeg") {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas indisponível");
    if (format === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL(format, .82);
  }

  async function handleStoreImage(file: File | undefined, kind: "logo" | "printLogo" | "banner") {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("Escolha um arquivo de imagem");
      return;
    }
    setStoreSaving(true);
    try {
      const dataUrl = await resizeImage(file, kind === "banner" ? 1400 : 720, kind === "banner" ? 650 : 720, kind === "banner" ? "image/jpeg" : "image/png");
      const field = kind === "logo" ? "logoDataUrl" : kind === "printLogo" ? "printLogoDataUrl" : "bannerDataUrl";
      setStore((current) => ({ ...current, [field]: dataUrl }));
      notify(kind === "logo" ? "Logo do site atualizada" : kind === "printLogo" ? "Logo das impressões atualizada" : "Banner do cardápio atualizado");
    } catch {
      notify("Não foi possível processar essa imagem");
    } finally {
      setStoreSaving(false);
    }
  }

  async function handleProductImage(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const imageDataUrl = await resizeImage(file, 720, 520);
      setNewProduct((current) => ({ ...current, imageDataUrl }));
    } catch {
      notify("Não foi possível processar a foto do produto");
    }
  }

  async function testPrinter(sector: PrinterSector) {
    const config = printers[sector];
    await testPrinterConfig(sector, config);
  }

  async function testPrinterConfig(sector: PrinterSector, config: PrinterConfig) {
    if (!config.enabled || !config.queue.trim()) {
      notify(`Configure a impressora da ${sector} antes do teste`);
      return;
    }
    await printWithConfig({
      id: 999999,
      origin: sector === "caixa" ? "Delivery" : "Mesa",
      reference: sector === "caixa" ? "TESTE DO CAIXA" : "TESTE DA COZINHA",
      customer: "Impressão de teste",
      items: [{ productId: 0, name: "Configuração DeliveryFlow", quantity: 1, price: 0 }],
      total: 0,
      status: "pronto",
      time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      note: `Fila configurada: ${config.queue} · Papel ${config.paper}`,
      paymentMethod: sector === "caixa" ? "Dinheiro" : undefined,
    }, sector, config, sector);
  }

  async function addProduct(event: FormEvent) {
    event.preventDefault();
    const price = Number(newProduct.price.replace(",", "."));
    if (!newProduct.name || !price) return;
    const existing = products.find((item) => item.id === editingProductId);
    const product = { id: editingProductId || Date.now(), ...newProduct, price, active: existing?.active ?? true };
    setProducts((current) => editingProductId ? current.map((item) => item.id === editingProductId ? product : item) : [...current, product]);
    await saveProduct(product).catch(() => notify("Produto salvo apenas neste computador"));
    setNewProduct({ name: "", category: "Lanches", price: "", description: "", emoji: "🍽️", imageDataUrl: "", featured: false });
    setEditingProductId(null);
    setModal(null);
    notify("Produto cadastrado com sucesso");
  }

  function findCustomerByPhone(phone: string) {
    const normalized = phone.replace(/\D/g, "");
    if (normalized.length < 8) return;
    const found = customers.find((item) => item.active && item.phone.replace(/\D/g, "") === normalized);
    if (!found) { setSelectedCustomerId(""); return; }
    setSelectedCustomerId(found.id); setCustomer(found.name); setDelivery({ phone: found.phone, street: found.street || "", number: found.number || "", neighborhood: found.neighborhood || "", complement: found.complement || "" }); notify(`Cliente ${found.name} localizado`);
  }

  function saveCustomerRecord(event: FormEvent) {
    event.preventDefault(); if (!editingCustomer?.name.trim() || !editingCustomer.phone.trim()) return;
    const timestamp = Date.now(); const record = { ...editingCustomer, name: editingCustomer.name.trim(), phone: editingCustomer.phone.trim(), updatedAt: timestamp };
    setCustomers((current) => current.some((item) => item.id === record.id) ? current.map((item) => item.id === record.id ? record : item) : [record, ...current]); setEditingCustomer(null); notify("Cliente salvo");
  }

  async function sendOrder() {
    if (!cartItems.length) return;
    if (publicOrderMode === "delivery" && orderType !== "Mesa" && !storeOpen) {
      setFormError(`Pedidos online estão fechados agora. Atendimento de hoje: ${todaySchedule.open} às ${todaySchedule.close}.`);
      return;
    }
    if (orderType === "Mesa" && (!selectedUnit || selectedUnit.type !== store.serviceMode)) {
      setFormError(`Selecione ${store.serviceMode === "mesa" ? "uma mesa" : "uma comanda"} antes de enviar o pedido.`);
      return;
    }
    if (orderType === "Mesa" && [customer, delivery.phone].some((value) => !value.trim())) {
      setFormError("Informe o nome e o telefone do cliente antes do primeiro pedido.");
      return;
    }
    if (orderType === "Mesa" && store.serviceMode === "comanda" && !currentComandaTable.trim()) {
      setFormError("Informe em qual mesa o cliente da comanda está.");
      return;
    }
    if (orderType === "Delivery" && [customer, delivery.phone, delivery.street, delivery.number, delivery.neighborhood].some((value) => !value.trim())) {
      setFormError("Preencha nome, telefone e endereço completo para a entrega.");
      return;
    }
    if (orderType === "Retirada" && [customer, delivery.phone].some((value) => !value.trim())) {
      setFormError("Preencha o nome e o telefone de quem fará a retirada.");
      return;
    }
    setFormError("");
    const address = orderType === "Delivery" ? `${delivery.street}, ${delivery.number} · ${delivery.neighborhood}${delivery.complement ? ` · ${delivery.complement}` : ""}` : undefined;
    const estimatedMinutes = orderType === "Delivery" ? business.deliveryMinutes : orderType === "Retirada" ? business.pickupMinutes : undefined;
    const createdAt = Date.now();
    const normalizedPhone = delivery.phone.replace(/\D/g, "");
    const existingCustomer = customers.find((item) => item.id === selectedCustomerId || (normalizedPhone && item.phone.replace(/\D/g, "") === normalizedPhone));
    const savedCustomer: Customer | undefined = customer.trim() && normalizedPhone ? { id: existingCustomer?.id || `cli_${createdAt}`, name: customer.trim(), phone: delivery.phone.trim(), street: delivery.street.trim(), number: delivery.number.trim(), neighborhood: delivery.neighborhood.trim(), complement: delivery.complement.trim(), notes: existingCustomer?.notes || "", active: true, createdAt: existingCustomer?.createdAt || createdAt, updatedAt: createdAt } : undefined;
    if (savedCustomer) { setCustomers((current) => existingCustomer ? current.map((item) => item.id === savedCustomer.id ? savedCustomer : item) : [savedCustomer, ...current]); setSelectedCustomerId(savedCustomer.id); }
    if (orderType === "Mesa" && selectedUnit && savedCustomer) setServiceUnits((current) => current.map((unit) => unit.id === selectedUnit.id ? store.serviceMode === "mesa" ? { ...unit, openedAt: unit.openedAt || createdAt, customerIds: Array.from(new Set([...(unit.customerIds || []), savedCustomer.id])) } : { ...unit, openedAt: unit.openedAt || createdAt, customer: savedCustomer.name, customerId: savedCustomer.id, currentTable: currentComandaTable } : unit));
    const newOrder: Order = {
      id: Number(String(Date.now()).slice(-6)),
      origin: orderType,
      reference: orderType === "Mesa" ? `${selectedUnit?.label}${store.serviceMode === "comanda" ? ` · Mesa ${currentComandaTable}` : ""}` : orderType === "Retirada" ? "Retirada no balcão" : "Entrega",
      customer: savedCustomer?.name || customer.trim(),
      items: cartItems.map((item) => ({ productId: item.id, name: item.name, quantity: item.quantity, price: item.price, category: item.category, ...(itemNotes[item.id]?.trim() ? { note: itemNotes[item.id].trim() } : {}) })),
      total: subtotal + deliveryFee,
      subtotal,
      deliveryFee,
      status: "preparo",
      time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      orderDate: new Date().toLocaleDateString("pt-BR"),
      estimatedMinutes,
      promisedAt: estimatedMinutes ? createdAt + estimatedMinutes * 60_000 : undefined,
      serviceUnitId: orderType === "Mesa" ? selectedUnit?.id : undefined,
      customerId: savedCustomer?.id,
      serviceCustomerId: orderType === "Mesa" ? savedCustomer?.id : undefined,
      note,
      phone: delivery.phone.trim() || undefined,
      deliveryAddress: address,
    };
    try {
      if (desktopMode && window.deliveryflowDesktop) {
        await window.deliveryflowDesktop.saveNetworkEntity({ entityType: "order", entityId: `local_${createdAt}`, data: { ...newOrder, createdAt } });
        setOrders((current) => [{ ...newOrder, createdAt }, ...current]);
      } else await submitOrder(newOrder);
    } catch {
      setFormError(desktopMode ? "Não foi possível salvar o pedido no servidor local." : "Não foi possível enviar o pedido. Verifique a internet e tente novamente."); return;
    }
    setCart({});
    setItemNotes({});
    setNote("");
    setCustomer("");
    setSelectedCustomerId("");
    setCurrentComandaTable("");
    setDelivery({ phone: "", street: "", number: "", neighborhood: "", complement: "" });
    notify(`Pedido #${newOrder.id} enviado para a cozinha`);
    if (view === "novo-pedido") setView("pedidos");
  }

  async function enterAdmin() {
    setAuthError("");
    try {
      await loginAdmin();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível conectar os pedidos online.";
      setAuthError(message);
      notify(`Firebase: ${message}`);
    }
  }

  async function enterDesktop(event: FormEvent) {
    event.preventDefault();
    if (!window.deliveryflowDesktop) return;
    setDesktopLoginSaving(true); setDesktopLoginError("");
    try {
      const user = await window.deliveryflowDesktop.login(desktopLogin);
      const info = await window.deliveryflowDesktop.networkInfo(); const savedDisplay = localStorage.getItem(`deliveryflow-order-display:${info.terminalId}:${user.id}`); if (savedDisplay === "columns" || savedDisplay === "list") setOrderDisplay(savedDisplay);
      setDesktopUser(user); setDesktopLogin({ username: "", password: "" });
      const localCash = await window.deliveryflowDesktop.currentCash();
      setCashRegister(localCash); setCashResolved(true);
      setCashSessions(await window.deliveryflowDesktop.listCashSessions());
      if (localCash) setCashMovements(await window.deliveryflowDesktop.listCashMovements(localCash.sessionId));
    } catch (error) {
      setDesktopLoginError(error instanceof Error ? error.message : "Não foi possível entrar no PDV.");
    } finally { setDesktopLoginSaving(false); }
  }

  function openTeamUser(user?: DesktopUser) {
    setTeamError("");
    setEditingTeamUser(user ? { ...user, password: "", pin: "", onlineEmail: "", onlinePassword: "" } : { name: "", username: "", role: "caixa", password: "", pin: "", onlineEmail: "", onlinePassword: "", active: true, permissions: [] });
  }

  async function saveTeamUser(event: FormEvent) {
    event.preventDefault();
    if (!desktopUser || !editingTeamUser || !window.deliveryflowDesktop) return;
    setTeamError("");
    try {
      await window.deliveryflowDesktop.saveUser({ actorId: desktopUser.id, user: editingTeamUser });
      if (["garcom", "cozinha", "entregador"].includes(editingTeamUser.role) && editingTeamUser.onlineEmail && editingTeamUser.onlinePassword) {
        await createOnlineStaffWithManagerGoogle({ name: editingTeamUser.name, email: editingTeamUser.onlineEmail, password: editingTeamUser.onlinePassword, role: editingTeamUser.role as "garcom" | "cozinha" | "entregador" });
      }
      setTeamUsers(await window.deliveryflowDesktop.listUsers()); setEditingTeamUser(null); notify("Usuário salvo no PDV");
    } catch (error) { setTeamError(error instanceof Error ? error.message : "Não foi possível salvar o usuário."); }
  }

  async function removeTeamUser(user: DesktopUser) {
    if (!desktopUser || !window.deliveryflowDesktop || !window.confirm(`Excluir o usuário ${user.name}?`)) return;
    try { await window.deliveryflowDesktop.deleteUser({ actorId: desktopUser.id, userId: user.id }); setTeamUsers(await window.deliveryflowDesktop.listUsers()); notify("Usuário excluído"); }
    catch (error) { notify(error instanceof Error ? error.message : "Não foi possível excluir"); }
  }

  async function saveOnlineStaff(event: FormEvent) {
    event.preventDefault(); setTeamError(""); setOnlineStaffSaving(true);
    try { await createOnlineStaffWithManagerGoogle(onlineStaffForm); setOnlineStaffForm({ name: "", email: "", password: "", role: "garcom" }); notify("Acesso online da equipe criado"); }
    catch (error) { setTeamError(error instanceof Error ? error.message.replace(/^FirebaseError:\s*/i, "") : "Não foi possível criar o acesso online."); }
    finally { setOnlineStaffSaving(false); }
  }

  async function handleOpenCash(event: FormEvent) {
    event.preventDefault();
    if ((!adminUser && !desktopUser) || cashStart < 0) return;
    setCashSaving(true);
    setCashError("");
    try {
      const opened = desktopMode && desktopUser && window.deliveryflowDesktop ? await window.deliveryflowDesktop.openCash({ actorId: desktopUser.id, openingAmount: cashStart, openingNote: cashOpeningNote.trim() }) : await openCashRegister(cashStart, adminUser!, cashOpeningNote.trim());
      setCashRegister(opened);
      setCashOpeningNote("");
      setCashTab("current");
      setModal(null);
      notify("Caixa aberto com sucesso");
    } catch {
      setCashError("Nao foi possivel abrir o caixa. Verifique a conexao e as regras do Firebase.");
    } finally {
      setCashSaving(false);
    }
  }

  async function handleCloseCash(event: FormEvent) {
    event.preventDefault();
    if ((!adminUser && !desktopUser) || !cashRegister || cashRegister.status !== "open" || cashClosing < 0) return;
    if (pendingCashOrders.length || occupiedUnits.length) {
      setCashError(`Não é possível fechar: existem ${pendingCashOrders.length} pedido(s) e ${occupiedUnits.length} mesa(s)/comanda(s) pendentes.`);
      return;
    }
    setCashSaving(true);
    setCashError("");
    try {
      const difference = cashClosing - expectedCash;
      const declaredPaymentTotals = Object.fromEntries((["PIX", "Débito", "Crédito", "Outro"] as const).map((method) => [method, cashDeclared[method].trim() ? Number(cashDeclared[method].replace(",", ".")) || 0 : paymentTotals[method] || 0]));
      const paymentDifferences = Object.fromEntries(Object.entries(declaredPaymentTotals).map(([method, value]) => [method, value - (paymentTotals[method] || 0)]));
      const closingData = {
        closingNote: cashClosingNote.trim(), expectedCash, difference, paymentTotals, declaredPaymentTotals: { Dinheiro: cashClosing, ...declaredPaymentTotals }, paymentDifferences: { Dinheiro: difference, ...paymentDifferences },
        orderCount: currentCashOrders.length,
        salesTotal: currentCashOrders.reduce((sum, order) => sum + order.total, 0),
      };
      const closed = desktopMode && desktopUser && window.deliveryflowDesktop ? await window.deliveryflowDesktop.closeCash({ actorId: desktopUser.id, cash: { ...cashRegister, ...closingData, closingAmount: cashClosing } }) : await closeCashRegister(cashRegister, cashClosing, adminUser!, closingData);
      setCashRegister(closed);
      const reportItems: Array<{ productId: number; name: string; quantity: number; price: number; note?: string }> = (["Dinheiro", "PIX", "Débito", "Crédito", "Outro"] as PaymentMethod[]).map((method, index) => ({ productId: index + 1, name: method, quantity: 1, price: paymentTotals[method] || 0, note: `Conferido: ${money.format(method === "Dinheiro" ? cashClosing : declaredPaymentTotals[method] || 0)} · Diferença: ${money.format(method === "Dinheiro" ? difference : paymentDifferences[method] || 0)}` }));
      reportItems.push({ productId: 20, name: "Suprimentos", quantity: 1, price: suppliesTotal });
      reportItems.push({ productId: 21, name: "Sangrias", quantity: 1, price: -withdrawalsTotal });
      const reportOrder = {
        id: cashRegister.sessionId.slice(-6).toUpperCase(), origin: "Caixa", reference: "FECHAMENTO DE CAIXA", customer: cashRegister.openedByName,
        items: reportItems, total: currentCashOrders.reduce((sum, order) => sum + order.total, 0), subtotal: expectedCash,
        status: "concluido", time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), orderDate: new Date().toLocaleDateString("pt-BR"),
        note: `Abertura: ${money.format(cashRegister.openingAmount)} | Esperado: ${money.format(expectedCash)} | Contado: ${money.format(cashClosing)} | Diferença: ${money.format(difference)}${cashClosingNote.trim() ? ` | ${cashClosingNote.trim()}` : ""}`,
        reportType: "cash-close", openedAt: cashRegister.openedAt, closedAt: closed.closedAt, openedByName: cashRegister.openedByName, closedByName: closed.closedByName,
      };
      if (printers.caixa.enabled && printers.caixa.queue.trim()) {
        await sendDirectPrint(reportOrder as unknown as Order, "caixa", printers.caixa, store).catch(() => notify("Caixa fechado, mas a impressão do resumo falhou"));
      }
      setCashStart(100);
      setCashClosing(0);
      setCashClosingNote("");
      setCashDeclared({ PIX: "", Débito: "", Crédito: "", Outro: "" });
      setCart({}); setItemNotes({}); setNote(""); setCustomer(""); setDelivery({ phone: "", street: "", number: "", neighborhood: "", complement: "" });
      setCashTab("current");
      setModal("cash");
      notify("Caixa fechado. Abra um novo caixa para continuar.");
    } catch {
      setCashError("Nao foi possivel fechar o caixa. Tente novamente.");
    } finally {
      setCashSaving(false);
    }
  }

  async function handleCashMovement(event: FormEvent) {
    event.preventDefault();
    if ((!adminUser && !desktopUser) || !cashRegister || cashRegister.status !== "open" || cashMovementAmount <= 0 || !cashMovementReason.trim()) {
      setCashError("Informe um valor e o motivo da movimentação.");
      return;
    }
    setCashSaving(true); setCashError("");
    try {
      if (desktopMode && desktopUser && window.deliveryflowDesktop) {
        await window.deliveryflowDesktop.addCashMovement({ actorId: desktopUser.id, sessionId: cashRegister.sessionId, type: cashMovementType, amount: cashMovementAmount, reason: cashMovementReason.trim() });
        setCashMovements(await window.deliveryflowDesktop.listCashMovements(cashRegister.sessionId));
      } else await addCashMovement(cashRegister.sessionId, cashMovementType, cashMovementAmount, cashMovementReason.trim(), adminUser!);
      setCashMovementAmount(0); setCashMovementReason(""); setModal(null);
      notify(cashMovementType === "sangria" ? "Sangria registrada" : "Suprimento registrado");
    } catch {
      setCashError("Não foi possível salvar a movimentação.");
    } finally { setCashSaving(false); }
  }

  async function reprintCashSession(session: CashRegister) {
    const sessionOrders = paidOrders.filter((order) => order.cashSessionId === session.sessionId);
    const totals = session.paymentTotals || (["Dinheiro", "PIX", "Débito", "Crédito", "Outro"] as PaymentMethod[]).reduce<Record<string, number>>((result, method) => ({ ...result, [method]: sessionOrders.filter((order) => order.paymentMethod === method).reduce((sum, order) => sum + order.total, 0) }), {});
    const reportOrder = { id: session.sessionId.slice(-6).toUpperCase(), origin: "Caixa", reference: "FECHAMENTO DE CAIXA", customer: session.openedByName, items: Object.entries(totals).map(([name, price], index) => ({ productId: index + 1, name, quantity: 1, price, note: `Conferido: ${money.format(session.declaredPaymentTotals?.[name] ?? price)} · Diferença: ${money.format(session.paymentDifferences?.[name] || 0)}` })), total: session.salesTotal || 0, subtotal: session.expectedCash || 0, status: "concluido", time: session.closedAt ? new Date(session.closedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--", orderDate: new Date(session.openedAt).toLocaleDateString("pt-BR"), note: `Esperado: ${money.format(session.expectedCash || 0)} | Contado: ${money.format(session.closingAmount || 0)} | Diferença: ${money.format(session.difference || 0)}`, reportType: "cash-close", isReprint: true, openedAt: session.openedAt, closedAt: session.closedAt, openedByName: session.openedByName, closedByName: session.closedByName };
    const printed = await printWithConfig(reportOrder as unknown as Order, "caixa", printers.caixa, "Caixa");
    if (printed) notify("Fechamento reimpresso");
  }

  function toggleProduct(product: Product) {
    const updated = { ...product, active: !product.active };
    setProducts((current) => current.map((item) => item.id === product.id ? updated : item));
    saveProduct(updated).catch(() => notify("Não foi possível atualizar o produto"));
  }

  function editProduct(product: Product) {
    setEditingProductId(product.id);
    setNewProduct({ name: product.name, category: product.category, price: String(product.price).replace(".", ","), description: product.description, emoji: product.emoji, imageDataUrl: product.imageDataUrl || "", featured: Boolean(product.featured) });
    setModal("product");
  }

  function duplicateProduct(product: Product) {
    const duplicate = { ...product, id: Date.now(), name: `${product.name} — cópia` };
    setProducts((current) => [...current, duplicate]);
    saveProduct(duplicate).catch(() => notify("Cópia salva apenas neste computador"));
  }

  function removeProduct(product: Product) {
    if (!window.confirm(`Excluir ${product.name}?`)) return;
    setProducts((current) => current.filter((item) => item.id !== product.id));
    deleteProduct(product.id).catch(() => notify("Não foi possível excluir no Firebase"));
  }

  function addCategory() {
    const name = newCategoryName.trim();
    if (!name || categories.some((item) => item.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) return;
    setCustomCategories((current) => [...current, name]);
    setNewCategoryName("");
    notify("Categoria criada");
  }

  function deleteCategory(name: string) {
    if (products.some((product) => product.category === name)) { notify("Mova os produtos antes de excluir esta categoria"); return; }
    setCustomCategories((current) => current.filter((item) => item !== name));
  }

  function addServiceUnit(type: ServiceUnit["type"]) {
    const number = String(Math.max(0, ...serviceUnits.filter((unit) => unit.type === type).map((unit) => Number(unit.number) || 0)) + 1).padStart(2, "0");
    const label = newUnitLabel.trim() || `${type === "mesa" ? "Mesa" : "Comanda"} ${number}`;
    const unitId = `${type}-${Date.now()}`;
    setServiceUnits((current) => [...current, { id: unitId, qrCodeId: unitId, number, label, type, active: true }]);
    setNewUnitLabel("");
  }

  function editServiceUnit(unit: ServiceUnit) {
    const label = window.prompt("Nome ou identificação", unit.label)?.trim();
    if (!label) return;
    setServiceUnits((current) => current.map((item) => item.id === unit.id ? { ...item, label } : item));
  }

  function openUnitForOrder(unit: ServiceUnit) {
    setSelectedUnit({ ...unit, openedAt: unit.openedAt || Date.now() });
    setServiceUnits((current) => current.map((item) => item.id === unit.id ? { ...item, openedAt: item.openedAt || Date.now() } : item));
    setOrderType("Mesa");
    setTable(unit.number);
    if (unit.type === "comanda" && unit.customerId) { const saved = customers.find((item) => item.id === unit.customerId); if (saved) { setSelectedCustomerId(saved.id); setCustomer(saved.name); setDelivery({ phone: saved.phone, street: saved.street || "", number: saved.number || "", neighborhood: saved.neighborhood || "", complement: saved.complement || "" }); } setCurrentComandaTable(unit.currentTable || ""); }
    else { setSelectedCustomerId(""); setCustomer(""); setDelivery({ phone: "", street: "", number: "", neighborhood: "", complement: "" }); setCurrentComandaTable(""); }
    setCart({});
    setView("novo-pedido");
  }

  function closeServiceUnit(unit: ServiceUnit) {
    const unitOrders = orders.filter((order) => order.serviceUnitId === unit.id && !["concluido", "cancelado"].includes(order.status));
    const total = unitOrders.reduce((sum, order) => sum + order.total, 0);
    if (!total) { setServiceUnits((current) => current.map((item) => item.id === unit.id ? { ...item, openedAt: undefined, customer: undefined } : item)); setSelectedUnit(null); return; }
    setPaymentOrder({ id: Number(String(Date.now()).slice(-6)), origin: "Mesa", reference: unit.label, customer: unit.customer || unit.label, items: unitOrders.flatMap((order) => order.items), total, status: "servido", time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), serviceUnitId: unit.id });
    setPaymentMethod("Dinheiro"); setReceivedAmount(""); setPaymentError(""); setModal("payment");
  }

  function exportServiceUnitLinks(type: ServiceUnit["type"]) {
    const title = type === "mesa" ? "Links das mesas" : "Links das comandas";
    const rows = serviceUnits.filter((unit) => unit.type === type).map((unit) => { const path = type === "mesa" ? `/mesa?mesa=${unit.number}&unit=${encodeURIComponent(unit.id)}` : `/comanda?comanda=${unit.number}&unit=${encodeURIComponent(unit.id)}`; const url = `${window.location.origin}${path}`; return `<Row><Cell><Data ss:Type="String">${unit.number}</Data></Cell><Cell><Data ss:Type="String">${unit.label}</Data></Cell><Cell><Data ss:Type="String">${unit.active ? "Ativa" : "Desativada"}</Data></Cell><Cell><Data ss:Type="String">${url}</Data></Cell></Row>`; }).join("");
    const workbook = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${title}"><Table><Row><Cell><Data ss:Type="String">Número</Data></Cell><Cell><Data ss:Type="String">Nome</Data></Cell><Cell><Data ss:Type="String">Situação</Data></Cell><Cell><Data ss:Type="String">Link do QR Code</Data></Cell></Row>${rows}</Table></Worksheet></Workbook>`;
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([workbook], { type: "application/vnd.ms-excel" })); link.download = `${type === "mesa" ? "mesas" : "comandas"}-qrcode.xls`; link.click(); URL.revokeObjectURL(link.href);
  }

  async function installApp() {
    const prompt = installEvent as Event & { prompt?: () => Promise<void> };
    if (prompt?.prompt) await prompt.prompt();
    else notify("No Chrome ou Edge, use o menu ⋮ e escolha “Instalar aplicativo”");
  }

  function deadlineLabel(order: Order) {
    if (order.status === "cancelado") return { text: "Cancelado", className: "cancelled" };
    if (!order.promisedAt) return { text: "Sem prazo", className: "neutral" };
    const minutes = Math.ceil((order.promisedAt - Date.now()) / 60_000);
    if (minutes < 0) return { text: `Atrasado ${Math.abs(minutes)} min`, className: "late" };
    if (minutes <= 15) return { text: `${minutes} min restantes`, className: "warning" };
    return { text: `${minutes} min restantes`, className: "ok" };
  }

  function orderActionLabel(order: Order) {
    if (order.status === "cancelado") return "Cancelado";
    if (order.status === "preparo" || order.status === "novo") return "Marcar pronto";
    if (order.status === "pronto") return order.origin === "Delivery" ? "Enviar" : order.origin === "Retirada" ? "Marcar retirado" : "Marcar servido";
    if (order.status === "enviado") return "Marcar entregue";
    if (order.status === "entregue" || order.status === "retirado") return "Receber";
    return "Concluído";
  }

  function renderOrderCard(order: Order, compact = false) {
    const deadline = deadlineLabel(order);
    return <article className={`order-card order-card-v2 ${order.status === "cancelado" ? "cancelled-order" : ""} ${compact ? "compact" : ""}`} key={order.id}>
      <div className="order-card-head"><div><span className={`origin ${order.origin.toLowerCase()}`}>{order.origin}</span><strong>#{order.id}</strong></div><time>{order.time}</time></div>
      <div className="order-card-identity"><div><h3>{order.reference}</h3><p className="customer">{order.customer}</p></div><span className={`deadline-pill ${deadline.className}`}>{deadline.text}</span></div>
      {!compact && <ul>{order.items.map((item) => <li key={`${item.productId}-${item.name}`}><b>{item.quantity}×</b><span>{item.name}</span></li>)}</ul>}
      {order.status === "cancelado" && <p className="cancelled-reason">{order.cancellationReason || "Pedido cancelado"}</p>}
      <div className="order-total"><span>{statusLabel[order.status]}</span><strong>{money.format(order.total)}</strong></div>
      <div className="order-actions"><button onClick={() => previousOrderStatus(order)} disabled={["novo", "preparo", "concluido", "cancelado"].includes(order.status)}>← Voltar</button><button onClick={() => openOrderDetails(order)}>Detalhes</button>{order.status === "cancelado" ? <button className="cancel-print-action" onClick={() => printCancelledOrder(order)}>Imprimir cancelamento</button> : <button onClick={() => { setManualPrintOrder(order); setModal("print-destination"); }}>Imprimir</button>}{order.status !== "cancelado" && order.status !== "concluido" && (!["cozinha", "entregador"].includes(desktopUser?.role || "") || !desktopMode) && <button className="cancel-action" onClick={() => requestOrderCancellation(order)}>Cancelar</button>}{order.status === "cancelado" && (desktopUser?.role === "admin" || adminUser?.email === ADMIN_EMAIL) && <button className="danger-action" onClick={() => permanentlyDeleteOrder(order)}>Excluir</button>}<button className="primary" onClick={() => moveOrder(order)} disabled={["servido", "concluido", "cancelado"].includes(order.status)}>{orderActionLabel(order)} →</button></div>
    </article>;
  }

  if (view === "cardapio") {
    const storefrontStyle = { "--store-accent": store.primaryColor || "#ff6333" } as CSSProperties;
    const storeAddress = [store.street && `${store.street}${store.number ? `, ${store.number}` : ""}`, store.neighborhood, store.city && `${store.city}${store.state ? ` - ${store.state}` : ""}`].filter(Boolean).join(" · ");
    const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
    const productCard = (product: Product) => <article className="menu-card" key={product.id}>
      <div className="food-photo">{product.imageDataUrl ? <img src={product.imageDataUrl} alt={product.name} /> : <span>{product.emoji}</span>}{product.featured && <small>Destaque</small>}</div>
      <div className="menu-card-body"><span>{product.category}</span><h3>{product.name}</h3><p>{product.description}</p><div><strong>{money.format(product.price)}</strong><button onClick={() => setCart((current) => ({ ...current, [product.id]: (current[product.id] || 0) + 1 }))} aria-label={`Adicionar ${product.name}`}>+</button></div></div>
    </article>;
    const checkoutContent = <>
      <div className="checkout-title"><div><span>Seu pedido</span><h2>{orderType === "Mesa" ? (selectedUnit?.label || (table ? `Mesa ${table}` : "Escolha a mesa")) : orderType === "Retirada" ? "Retirada" : "Entrega"}</h2></div><span className="item-count">{cartItems.length}</span></div>
      {!cartItems.length ? <div className="empty-cart"><span>🛍️</span><strong>Sua sacola está vazia</strong><p>Adicione produtos para começar.</p></div> : <>
        <div className="cart-list">{cartItems.map((item) => <div className="cart-item" key={item.id}><div><b>{item.quantity}×</b><span>{item.name}</span><small>{money.format(item.price * item.quantity)}</small></div><div className="quantity"><button onClick={() => setCart((current) => ({ ...current, [item.id]: Math.max(0, current[item.id] - 1) }))}>−</button><span>{item.quantity}</span><button onClick={() => setCart((current) => ({ ...current, [item.id]: current[item.id] + 1 }))}>+</button></div></div>)}</div>
        {orderType === "Delivery" && <div className="checkout-form"><strong>Dados para entrega</strong><label className="field-label">Nome do cliente<input className="field" placeholder="Nome completo" value={customer} onChange={(e) => setCustomer(e.target.value)} /></label><label className="field-label">Telefone<input className="field" placeholder="(00) 00000-0000" value={delivery.phone} onChange={(e) => setDelivery({ ...delivery, phone: e.target.value })} inputMode="tel" /></label><label className="field-label">Rua ou avenida<input className="field" placeholder="Nome da rua" value={delivery.street} onChange={(e) => setDelivery({ ...delivery, street: e.target.value })} /></label><div className="checkout-field-row"><label className="field-label">Número<input className="field" placeholder="123" value={delivery.number} onChange={(e) => setDelivery({ ...delivery, number: e.target.value })} /></label><label className="field-label">Bairro<input className="field" placeholder="Seu bairro" value={delivery.neighborhood} onChange={(e) => setDelivery({ ...delivery, neighborhood: e.target.value })} /></label></div><label className="field-label">Complemento <small>opcional</small><input className="field" placeholder="Apto, bloco ou referência" value={delivery.complement} onChange={(e) => setDelivery({ ...delivery, complement: e.target.value })} /></label><p className="pickup-estimate">Previsão de entrega: aproximadamente {business.deliveryMinutes} minutos · Taxa {money.format(business.deliveryFee)}.</p></div>}
        {orderType === "Retirada" && <div className="checkout-form"><strong>Dados para retirada</strong><label className="field-label">Nome do cliente<input className="field" placeholder="Nome completo" value={customer} onChange={(e) => setCustomer(e.target.value)} /></label><label className="field-label">Telefone<input className="field" placeholder="(00) 00000-0000" value={delivery.phone} onChange={(e) => setDelivery({ ...delivery, phone: e.target.value })} inputMode="tel" /></label><p className="pickup-estimate">Previsão: pronto em aproximadamente {business.pickupMinutes} minutos.</p></div>}
        {orderType === "Mesa" && !publicOrderMode && <label className="field-label table-select-label">Número da mesa<select className="field" value={table} onChange={(e) => { setTable(e.target.value); setFormError(""); }}><option value="">Selecione a mesa</option>{serviceUnits.filter((unit) => unit.type === "mesa" && unit.active).map((unit) => <option key={unit.id} value={unit.number}>{unit.label}</option>)}</select></label>}
        <textarea className="field" placeholder="Alguma observação?" value={note} onChange={(e) => setNote(e.target.value)} />
        {formError && <p className="form-error" role="alert">! {formError}</p>}
        <div className="totals"><p><span>Subtotal</span><b>{money.format(subtotal)}</b></p>{orderType === "Delivery" && <p><span>Taxa de entrega</span><b>{money.format(deliveryFee)}</b></p>}<p className="grand-total"><span>Total</span><b>{money.format(subtotal + deliveryFee)}</b></p></div>
        <button className="primary wide" onClick={sendOrder} disabled={orderType !== "Mesa" && !storeOpen}>Enviar pedido <span>→</span></button>
      </>}
    </>;
    return (
      <main className={`storefront storefront-${store.theme}`} style={storefrontStyle}>
        <section className={`store-cover ${store.bannerDataUrl ? "has-banner" : ""}`} style={store.bannerDataUrl ? { backgroundImage: `linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.5)),url(${store.bannerDataUrl})`, backgroundPosition: `center ${store.bannerPosition}%` } : undefined}><div className="cover-promo"><small>PEÇA PELO DELIVERYFLOW</small><strong>{store.promoText || "Seu pedido favorito, do seu jeito."}</strong></div></section>
        <header className="store-profile"><button className="store-avatar" onClick={() => { if (!publicOrderMode) setView("pedidos"); }} aria-label={publicOrderMode ? `Logo ${store.name}` : "Voltar ao PDV"}>{store.logoDataUrl ? <img src={store.logoDataUrl} alt={store.name} /> : <span>{store.name.slice(0, 2).toUpperCase()}</span>}</button><div className="store-profile-name"><h1>{store.name}</h1><p>{store.promoText}</p></div><div className="profile-actions"><span className={`open-pill ${storeOpen ? "is-open" : ""}`}>● {storeOpen ? `Aberto até ${todaySchedule.close}` : "Loja fechada"}</span>{store.showInfo && <button onClick={() => setStoreInfoOpen(true)}>ⓘ Informações</button>}<button className="cart-button desktop-cart" onClick={() => document.getElementById("carrinho")?.scrollIntoView({ behavior: "smooth" })}>Sacola <span>{cartCount}</span></button></div></header>
        {!storeOpen && <div className="closed-notice"><b>Loja fechada no momento</b><span>{todaySchedule.enabled ? `Hoje atendemos das ${todaySchedule.open} às ${todaySchedule.close}. Você pode consultar o cardápio, mas não concluir um pedido de entrega ou retirada.` : "Não abrimos hoje. Você ainda pode consultar o cardápio."}</span></div>}

        <div className="order-mode">
          {publicOrderMode === "table" ? <button className="active table-order-context" disabled><b>{selectedUnit?.label || (table ? `Mesa ${table}` : "Pedido no salão")}</b><small>Identificação confirmada pelo QR Code</small></button> : <><button className={orderType === "Delivery" ? "active" : ""} onClick={() => { setOrderType("Delivery"); setFormError(""); }}><b>Entrega</b><small>Previsão de {business.deliveryMinutes} minutos</small></button><button className={orderType === "Retirada" ? "active" : ""} onClick={() => { setOrderType("Retirada"); setFormError(""); }}><b>Retirada</b><small>Pronto em {business.pickupMinutes} minutos</small></button>{!publicOrderMode && <button className={orderType === "Mesa" ? "active" : ""} onClick={() => { setOrderType("Mesa"); setFormError(""); }}><b>Na mesa</b><small>Prévia do QR Code</small></button>}</>}
        </div>

        <div className="menu-layout">
          <section className="menu-content">
            <div className="menu-toolbar"><div className="category-row">{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div><label className="menu-search">⌕<input value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} placeholder="Buscar no cardápio" /></label></div>
            {category === "Todos" && !normalizedSearch && <section className="featured-menu"><div className="section-heading"><div><span>Destaques</span><h2>Os preferidos da casa</h2></div></div><div className="featured-grid">{featuredDisplay.map(productCard)}</div></section>}
            {category === "Todos" ? menuGroups.map((group) => <section className="menu-category" key={group.name}><div className="section-heading"><div><span>Cardápio</span><h2>{group.name}</h2></div><p>{group.products.length} opções</p></div><div className="product-grid">{group.products.map(productCard)}</div></section>) : <section className="menu-category"><div className="section-heading"><div><span>Cardápio</span><h2>{category}</h2></div><p>{visibleProducts.length} opções</p></div><div className="product-grid">{visibleProducts.map(productCard)}</div></section>}
            {!visibleProducts.length && <div className="no-products"><strong>Nenhum produto encontrado</strong><span>Tente buscar por outro nome ou categoria.</span></div>}
          </section>

          <aside className="checkout" id="carrinho">{checkoutContent}</aside>
        </div>
        <footer className="store-footer"><span>{store.name}{store.whatsapp ? ` · WhatsApp ${store.whatsapp}` : ""}</span><div>Desenvolvido por <img src="/deliveryflow-horizontal.png" alt="DeliveryFlow" /> <small>v{APP_VERSION}</small></div></footer>
        {cartCount > 0 && <button className="mobile-cart-bar" onClick={() => setMobileCartOpen(true)}><span><b>{cartCount}</b> Ver sacola</span><strong>{money.format(subtotal + deliveryFee)}</strong></button>}
        {mobileCartOpen && <div className="mobile-cart-backdrop" onMouseDown={() => setMobileCartOpen(false)}><aside className="mobile-cart-sheet" onMouseDown={(event) => event.stopPropagation()}><button className="sheet-close" onClick={() => setMobileCartOpen(false)}>×</button>{checkoutContent}</aside></div>}
        {storeInfoOpen && <div className="store-info-backdrop" onMouseDown={() => setStoreInfoOpen(false)}><section className="store-info-modal" onMouseDown={(event) => event.stopPropagation()}><button onClick={() => setStoreInfoOpen(false)}>×</button><div className="info-logo">{store.logoDataUrl ? <img src={store.logoDataUrl} alt={store.name} /> : <span>{store.name.slice(0, 2).toUpperCase()}</span>}</div><h2>{store.name}</h2><p className={`info-status ${storeOpen ? "open" : ""}`}>{storeOpen ? `Aberto hoje até ${todaySchedule.close}` : "Fechado agora"}</p>{store.showAddress && storeAddress && <div><small>ENDEREÇO</small><strong>{storeAddress}</strong>{store.complement && <span>{store.complement}</span>}</div>}{store.showPhone && (store.whatsapp || store.phone) && <div><small>CONTATO</small><strong>{store.whatsapp || store.phone}</strong>{store.email && <span>{store.email}</span>}</div>}<div><small>ATENDIMENTO DE HOJE</small><strong>{todaySchedule.enabled ? `${todaySchedule.open} às ${todaySchedule.close}` : "Não abrimos hoje"}</strong><span>Entrega em {business.deliveryMinutes} min · Retirada em {business.pickupMinutes} min</span></div></section></div>}
        {toast && <div className="toast">✓ {toast}</div>}
      </main>
    );
  }

  if (!routeResolved || (!desktopMode && !authResolved) || (adminUser && !cashResolved)) {
    return <main className="admin-login"><div className="login-card"><img className="login-logo-image" src="/deliveryflow-icon.png" alt="DeliveryFlow" /><h1>DeliveryFlow</h1><p>Conectando ao sistema...</p></div></main>;
  }

  if (desktopMode && !desktopUser) {
    return <main className="admin-login desktop-login"><form className="login-card" onSubmit={enterDesktop}><img className="login-logo-image" src="/deliveryflow-icon.png" alt="DeliveryFlow" /><span>DELIVERYFLOW PARA WINDOWS</span><h1>Entrar no PDV</h1><p>Use seu usuário interno. Este acesso funciona mesmo quando a internet estiver indisponível.</p><label>Usuário<input value={desktopLogin.username} onChange={(event) => setDesktopLogin({ ...desktopLogin, username: event.target.value })} autoFocus /></label><label>Senha<input type="password" value={desktopLogin.password} onChange={(event) => setDesktopLogin({ ...desktopLogin, password: event.target.value })} /></label>{desktopLoginError && <p className="login-error">{desktopLoginError}</p>}<button className="primary wide" disabled={desktopLoginSaving}>{desktopLoginSaving ? "Entrando..." : "Entrar no sistema"}</button><small className="first-access">Primeiro acesso: usuário <b>admin</b> · senha <b>DeliveryFlow@123</b></small></form></main>;
  }

  if (!desktopMode && !adminUser) {
    return <main className="admin-login"><section className="login-card"><img className="login-logo-image" src="/deliveryflow-icon.png" alt="DeliveryFlow" /><span>ACESSO ADMINISTRATIVO</span><h1>Entre no seu PDV</h1><p>Use a conta Google proprietária do Firebase para acessar pedidos, produtos e caixa.</p><button className="google-login" onClick={enterAdmin}>G&nbsp;&nbsp; Entrar com Google</button>{authError && <p className="login-error">{authError}</p>}<button className="customer-link" onClick={() => setView("cardapio")}>Abrir cardápio do cliente →</button></section></main>;
  }

  const operatorName = desktopUser?.name || adminUser?.displayName || "Administrador";
  const operatorRole = desktopUser?.role || "admin";
  const roleViews: Record<DesktopRole, View[]> = {
    admin: ["pedidos", "produtos", "mesas", "clientes", "loja", "equipe", "caixa"],
    gerente: ["pedidos", "produtos", "mesas", "clientes", "loja", "caixa"],
    caixa: ["pedidos", "mesas", "clientes", "caixa"],
    garcom: ["pedidos", "mesas", "clientes"],
    cozinha: ["pedidos"],
    entregador: ["pedidos"],
  };

  const navItems: { id: View; label: string; icon: string }[] = [
    { id: "pedidos", label: "Pedidos", icon: "▦" }, { id: "produtos", label: "Produtos", icon: "◫" }, { id: "mesas", label: store.serviceMode === "mesa" ? "Mesas" : "Comandas", icon: "⌗" }, { id: "clientes", label: "Clientes", icon: "♧" }, { id: "loja", label: "Minha loja", icon: "⌂" }, ...(operatorRole === "admin" ? [{ id: "equipe" as View, label: "Equipe e acessos", icon: "♙" }] : []), { id: "caixa", label: "Caixa", icon: "◉" },
  ];
  const nav = navItems.filter((item) => roleViews[operatorRole].includes(item.id));

  return (
    <main className={`admin-shell ${editingSettings ? "config-editing" : ""}`}>
      <aside className="sidebar">
        <div className="brand sidebar-brand"><img src="/deliveryflow-horizontal.png" alt="DeliveryFlow" /></div>
        <nav>{nav.map((item) => { const active = item.id === "produtos" ? ["produtos", "categorias", "impressoras"].includes(view) : item.id === "loja" ? ["loja", "atendimento"].includes(view) : item.id === "mesas" ? ["mesas", "comandas"].includes(view) : view === item.id; return <button key={item.id} className={active ? "active" : ""} onClick={() => setView(item.id === "mesas" ? (store.serviceMode === "mesa" ? "mesas" : "comandas") : item.id)}><i>{item.icon}</i>{item.label}{item.id === "pedidos" && <b>{activeOrders.length}</b>}</button>; })}</nav>
        <div className="sidebar-bottom"><button onClick={() => setView("cardapio")}><i>↗</i> Prévia do cardápio</button>{!desktopMode && <button onClick={installApp}><i>↓</i> Instalar no PC</button>}<button onClick={() => desktopMode ? setDesktopUser(null) : logoutAdmin()}><i>↪</i> Sair</button><div className="user"><span>{operatorName.slice(0, 2).toUpperCase()}</span><div><strong>{operatorName}</strong><small>{operatorRole}</small></div><i>•••</i></div></div>
      </aside>

      <section className="admin-main">
        <header className="topbar"><div><small>{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).toUpperCase()}</small><h1>{view === "pedidos" ? "Pedidos" : view === "novo-pedido" ? "Novo pedido manual" : view === "categorias" ? "Categorias" : view === "produtos" ? "Produtos" : view === "mesas" ? "Mesas" : view === "comandas" ? "Comandas" : view === "impressoras" ? "Configuração de impressoras" : view === "atendimento" ? "Horários e prazos" : view === "loja" ? "Minha loja" : view === "equipe" ? "Equipe e acessos" : "Controle de caixa"}</h1></div><div className="top-actions">{networkInfo && <div className={`store-status ${networkReady ? "open" : ""}`}><span></span>{networkInfo.mode === "server" ? `Servidor · ${networkInfo.lanAddresses?.[0] || "local"}:3030` : networkInfo.terminalName}</div>}{desktopMode && networkInfo?.mode === "server" && operatorRole === "admin" && <button className="secondary" onClick={enterAdmin}>{adminUser ? "Pedidos online conectados" : "Conectar Firebase"}</button>}<div className={`store-status ${cashOpen ? "open" : ""}`}><span></span>{cashOpen ? "Caixa aberto" : "Caixa fechado"}</div><button className="icon-button" aria-label="Notificações">●</button></div></header>

        {["produtos", "categorias", "impressoras"].includes(view) && <nav className="master-tabs"><button className={view === "categorias" ? "active" : ""} onClick={() => setView("categorias")}>Categorias</button><button className={view === "produtos" ? "active" : ""} onClick={() => setView("produtos")}>Produtos</button><button className={view === "impressoras" ? "active" : ""} onClick={() => setView("impressoras")}>Impressoras</button></nav>}
        {["loja", "atendimento"].includes(view) && <nav className="master-tabs"><button className={view === "loja" ? "active" : ""} onClick={() => setView("loja")}>Informações e personalização</button><button className={view === "atendimento" ? "active" : ""} onClick={() => setView("atendimento")}>Atendimento</button></nav>}
        {["mesas", "comandas"].includes(view) && <nav className="master-tabs"><button className={store.serviceMode === "mesa" ? "active" : ""} onClick={() => { if (store.serviceMode === "mesa" || window.confirm("Ativar atendimento por mesas? Os QR Codes e cadastros de comandas serão preservados.")) { setStore({ ...store, serviceMode: "mesa" }); setView("mesas"); } }}>Mesas {store.serviceMode === "mesa" && "· Ativo"}</button><button className={store.serviceMode === "comanda" ? "active" : ""} onClick={() => { if (store.serviceMode === "comanda" || window.confirm("Ativar atendimento por comandas? Os QR Codes e cadastros de mesas serão preservados.")) { setStore({ ...store, serviceMode: "comanda" }); setView("comandas"); } }}>Comandas {store.serviceMode === "comanda" && "· Ativo"}</button></nav>}
        {(view === "loja" || view === "atendimento") && <div className="config-mode-bar"><div><strong>{view === "loja" ? "Configurações da loja" : "Configurações de atendimento"}</strong><span>{editingSettings ? "Modo de edição aberto" : "Visualização resumida"}</span></div><button className={editingSettings ? "secondary" : "primary"} onClick={() => setEditingSettings((current) => !current)}>{editingSettings ? "Fechar edição" : "Editar informações"}</button></div>}

        {view === "pedidos" && <>
          <div className="summary-grid"><article><span className="summary-icon orange">▣</span><div><small>Pedidos ativos</small><strong>{activeOrders.length}</strong><em>+2 na última hora</em></div></article><article><span className="summary-icon green">R$</span><div><small>Vendas de hoje</small><strong>{money.format(todayTotal)}</strong><em>12 pedidos realizados</em></div></article><article><span className="summary-icon blue">◷</span><div><small>Tempo médio</small><strong>18 min</strong><em>Dentro da meta</em></div></article></div>
          <div className="board-toolbar"><div><button className={orderDisplay === "columns" ? "active" : ""} onClick={() => setOrderDisplay("columns")}>▦ Colunas</button><button className={orderDisplay === "list" ? "active" : ""} onClick={() => setOrderDisplay("list")}>☷ Lista</button></div><button className="secondary" onClick={() => { setSelectedUnit(null); setCart({}); setFormError(""); setView("novo-pedido"); }}>+ Novo pedido manual</button></div>
          {orderDisplay === "columns" ? <div className="kanban kanban-v2">{([{ key: "production", label: "Produção", statuses: ["novo", "preparo"] }, { key: "ready", label: "Prontos", statuses: ["pronto"] }, { key: "route", label: "Em entrega", statuses: ["enviado"] }, { key: "finish", label: "Finalizar", statuses: ["entregue", "retirado", "servido"] }, { key: "cancelled", label: "Cancelados", statuses: ["cancelado"] }] as Array<{ key: string; label: string; statuses: OrderStatus[] }>).map((column) => { const columnOrders = activeOrders.filter((order) => column.statuses.includes(order.status)); return <section className={`kanban-column ${column.key}`} key={column.key}><header><div><span></span><h2>{column.label}</h2><b>{columnOrders.length}</b></div></header><div className="order-stack">{columnOrders.map((order) => renderOrderCard(order))}</div></section>; })}</div> : <div className="order-list-view">{activeOrders.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).map((order) => renderOrderCard(order, true))}</div>}
        </>}

        {view === "novo-pedido" && <div className="manual-order-page">
          <section className="manual-products">
            <header><div><small>LANÇAMENTO INTERNO</small><h2>Produtos</h2><p>Toque no produto para adicionar ao pedido.</p></div><button className="secondary" onClick={() => setView("pedidos")}>← Voltar</button></header>
            <label className="manual-search">⌕<input value={manualSearch} onChange={(e) => setManualSearch(e.target.value)} placeholder="Buscar produto pelo nome ou descrição..." autoFocus /></label>
            <div className="manual-categories">{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
            <div className="manual-product-grid">{products.filter((product) => product.active && (category === "Todos" || product.category === category) && (!manualSearch.trim() || `${product.name} ${product.description}`.toLocaleLowerCase("pt-BR").includes(manualSearch.trim().toLocaleLowerCase("pt-BR")))).map((product) => <button key={product.id} onClick={() => setCart((current) => ({ ...current, [product.id]: (current[product.id] || 0) + 1 }))}><span>{product.imageDataUrl ? <img src={product.imageDataUrl} alt="" /> : product.emoji}</span><div><small>{product.category}</small><strong>{product.name}</strong><b>{money.format(product.price)}</b></div><i>＋</i></button>)}</div>
          </section>
          <aside className="manual-cart">
            <header><div><small>PEDIDO MANUAL</small><h2>{orderType === "Mesa" ? (table ? `Mesa ${table}` : "Pedido de mesa") : orderType === "Delivery" ? "Pedido para entrega" : "Pedido para retirada"}</h2></div><span>{cartItems.reduce((sum, item) => sum + item.quantity, 0)} itens</span></header>
            <div className="manual-order-types"><button className={orderType === "Delivery" ? "active" : ""} onClick={() => setOrderType("Delivery")}>🛵 Entrega</button><button className={orderType === "Retirada" ? "active" : ""} onClick={() => setOrderType("Retirada")}>🛍 Retirada</button><button className={orderType === "Mesa" ? "active" : ""} onClick={() => setOrderType("Mesa")}>▦ {store.serviceMode === "mesa" ? "Mesa" : "Comanda"}</button></div>
            {!cartItems.length ? <div className="manual-empty"><span>＋</span><strong>Pedido vazio</strong><p>Busque ou toque em um produto para começar.</p></div> : <>
              <div className="manual-cart-items">{cartItems.map((item) => <article key={item.id}><div className="manual-item-main"><section><strong>{item.name}</strong><small>{money.format(item.price)} cada</small></section><b>{money.format(item.price * item.quantity)}</b></div><div className="manual-item-controls"><div><button aria-label={`Diminuir ${item.name}`} onClick={() => setCart((current) => ({ ...current, [item.id]: Math.max(0, current[item.id] - 1) }))}>−</button><input aria-label={`Quantidade de ${item.name}`} type="number" min="1" value={item.quantity} onChange={(e) => setCart((current) => ({ ...current, [item.id]: Math.max(1, Number(e.target.value) || 1) }))} /><button aria-label={`Aumentar ${item.name}`} onClick={() => setCart((current) => ({ ...current, [item.id]: current[item.id] + 1 }))}>+</button></div><button className="manual-remove" onClick={() => { setCart((current) => ({ ...current, [item.id]: 0 })); setItemNotes((current) => { const updated = { ...current }; delete updated[item.id]; return updated; }); }}>Remover</button></div><label className="manual-item-note">Observação deste item<input value={itemNotes[item.id] || ""} onChange={(e) => setItemNotes((current) => ({ ...current, [item.id]: e.target.value }))} placeholder="Ex.: sem cebola, bem passado..." /></label></article>)}</div>
              <section className="manual-customer-data"><h3>Identificação do pedido</h3>{orderType === "Mesa" && <label>{store.serviceMode === "mesa" ? "Mesa" : "Comanda"}<select value={selectedUnit?.id || ""} onChange={(event) => { const unit = serviceUnits.find((item) => item.id === event.target.value) || null; setSelectedUnit(unit); setTable(unit?.number || ""); setCustomer(unit?.customer || ""); setSelectedCustomerId(unit?.customerId || ""); setCurrentComandaTable(unit?.currentTable || ""); }}><option value="">Selecione</option>{serviceUnits.filter((unit) => unit.type === store.serviceMode && unit.active).map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}</select></label>}<div className="manual-field-row"><label>Telefone do cliente<input value={delivery.phone} onChange={(event) => { setDelivery({ ...delivery, phone: event.target.value }); setSelectedCustomerId(""); }} onBlur={(event) => findCustomerByPhone(event.target.value)} placeholder="Digite para localizar" /></label><label>Nome do cliente<input value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="Nome completo" /></label></div>{orderType === "Mesa" && store.serviceMode === "comanda" && <label>Mesa atual da comanda<input value={currentComandaTable} onChange={(event) => setCurrentComandaTable(event.target.value)} placeholder="Ex.: 08" /></label>}{orderType === "Delivery" && <><label>Rua ou avenida<input value={delivery.street} onChange={(e) => setDelivery({ ...delivery, street: e.target.value })} /></label><div className="manual-field-row compact"><label>Número<input value={delivery.number} onChange={(e) => setDelivery({ ...delivery, number: e.target.value })} /></label><label>Bairro<input value={delivery.neighborhood} onChange={(e) => setDelivery({ ...delivery, neighborhood: e.target.value })} /></label></div><label>Complemento<input value={delivery.complement} onChange={(e) => setDelivery({ ...delivery, complement: e.target.value })} /></label></>}<label>Observação geral do pedido<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Informação para toda a produção" /></label></section>
              {formError && <p className="form-error">! {formError}</p>}<footer className="manual-checkout"><div><span>Total do pedido</span><strong>{money.format(subtotal + deliveryFee)}</strong>{orderType === "Delivery" && <small>Inclui {money.format(deliveryFee)} de entrega</small>}</div><button className="primary" onClick={sendOrder}>Enviar à cozinha →</button></footer>
            </>}
          </aside>
        </div>}

        {view === "categorias" && <section className="category-manager"><header><div><small>ORGANIZAÇÃO DO CARDÁPIO</small><h2>Categorias</h2><p>Cadastre e organize os grupos usados no site e no roteamento das impressoras.</p></div><div><input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="Nova categoria" onKeyDown={(event) => { if (event.key === "Enter") addCategory(); }} /><button className="primary" onClick={addCategory}>+ Adicionar</button></div></header><div className="category-list">{categories.filter((item) => item !== "Todos").map((item, index) => { const count = products.filter((product) => product.category === item).length; return <article key={item}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item}</strong><small>{count} produto{count === 1 ? "" : "s"}</small></div><button className="secondary" onClick={() => setCategory(item)}>Ver produtos</button><button className="danger-action" onClick={() => deleteCategory(item)} disabled={count > 0}>Excluir</button></article>; })}</div></section>}

        {view === "produtos" && <>
          <div className="page-actions"><div className="search-box">⌕ <input placeholder="Buscar produto..." /></div><button className="primary" onClick={() => setModal("product")}>+ Cadastrar produto</button></div>
          <div className="table-card"><table><thead><tr><th>Produto</th><th>Categoria</th><th>Preço</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><span className="product-thumb">{product.emoji}</span><div><strong>{product.name}</strong><small>{product.description}</small></div></td><td><span className="tag">{product.category}</span></td><td><strong>{money.format(product.price)}</strong></td><td><button className={`switch ${product.active ? "on" : ""}`} onClick={() => toggleProduct(product)} title={product.active ? "Desativar" : "Ativar"}><span></span></button></td><td><div className="row-actions"><button className="secondary" onClick={() => editProduct(product)}>Editar</button><button className="secondary" onClick={() => duplicateProduct(product)}>Duplicar</button><button className="danger-action" onClick={() => removeProduct(product)}>Excluir</button></div></td></tr>)}</tbody></table></div>
        </>}

        {view === "clientes" && <section className="customers-page"><header className="team-toolbar"><div><small>CADASTRO CENTRAL</small><h2>Clientes</h2><p>Localize pelo telefone e consulte o histórico em todos os caixas.</p></div><button className="primary" onClick={() => setEditingCustomer({ id: `cli_${Date.now()}`, name: "", phone: "", street: "", number: "", neighborhood: "", complement: "", notes: "", active: true, createdAt: Date.now(), updatedAt: Date.now() })}>+ Novo cliente</button></header><div className="page-actions"><div className="search-box">⌕ <input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Buscar por nome ou telefone" /></div></div><div className="customer-list">{customers.filter((item) => `${item.name} ${item.phone}`.toLowerCase().includes(customerSearch.toLowerCase())).map((item) => { const history = orders.filter((order) => order.customerId === item.id || order.phone?.replace(/\D/g, "") === item.phone.replace(/\D/g, "")); return <article key={item.id} className={item.active ? "" : "inactive"}><span className="team-avatar">{item.name.slice(0, 2).toUpperCase()}</span><div><strong>{item.name}</strong><small>{item.phone} · {item.neighborhood || "Sem endereço"}</small></div><div><b>{history.length} pedidos</b><small>Último: {history[0]?.orderDate || "—"}</small></div><strong>{money.format(history.reduce((sum, order) => sum + order.total, 0))}</strong><button className="secondary" onClick={() => setEditingCustomer(item)}>Editar</button><button className="secondary" onClick={() => setCustomers((current) => current.map((customerItem) => customerItem.id === item.id ? { ...customerItem, active: !customerItem.active, updatedAt: Date.now() } : customerItem))}>{item.active ? "Desativar" : "Ativar"}</button></article>; })}</div></section>}

        {(view === "mesas" || view === "comandas") && <section className="service-unit-page">{(() => { const type = view === "mesas" ? "mesa" : "comanda"; const units = serviceUnits.filter((unit) => unit.type === type); return <><header className="service-unit-toolbar"><div><small>CONTROLE DO SALÃO</small><h2>{type === "mesa" ? "Mesas" : "Comandas"}</h2><p>Clique em uma unidade para ver o consumo, lançar pedidos ou encerrar.</p></div><div><input value={newUnitLabel} onChange={(event) => setNewUnitLabel(event.target.value)} placeholder={`Nome da nova ${type}`} /><button className="primary" onClick={() => addServiceUnit(type)}>+ Criar</button><button className="secondary" onClick={() => exportServiceUnitLinks(type)}>Baixar links no Excel</button></div></header><div className="service-unit-grid">{units.map((unit) => { const unitOrders = orders.filter((order) => order.serviceUnitId === unit.id && order.status !== "concluido"); const total = unitOrders.reduce((sum, order) => sum + order.total, 0); const occupied = Boolean(unit.openedAt || unitOrders.length); return <article className={`service-unit-card ${occupied ? "occupied" : "free"} ${unit.active ? "" : "inactive"}`} key={unit.id} onClick={() => setSelectedUnit(unit)}><header><span>{type === "mesa" ? "MESA" : "COMANDA"}</span><b>{!unit.active ? "Desativada" : occupied ? "Aberta" : "Livre"}</b></header><strong>{unit.number}</strong><h3>{unit.label}</h3><p>{unitOrders.length} pedido{unitOrders.length === 1 ? "" : "s"} · {money.format(total)}</p><footer><button className="secondary" onClick={(event) => { event.stopPropagation(); editServiceUnit(unit); }}>Editar</button><button className="secondary" onClick={(event) => { event.stopPropagation(); setServiceUnits((current) => current.map((item) => item.id === unit.id ? { ...item, active: !item.active } : item)); }}>{unit.active ? "Desativar" : "Ativar"}</button><button className="secondary" onClick={(event) => { event.stopPropagation(); openUnitForOrder(unit); }} disabled={!unit.active}>+ Pedido</button>{occupied && <button className="primary" onClick={(event) => { event.stopPropagation(); closeServiceUnit(unit); }}>Encerrar</button>}<button className="danger-action" onClick={(event) => { event.stopPropagation(); if (!occupied && window.confirm(`Excluir ${unit.label}?`)) setServiceUnits((current) => current.filter((item) => item.id !== unit.id)); }} disabled={occupied}>Excluir</button></footer></article>; })}</div></>; })()}</section>}

        {selectedUnit && (view === "mesas" || view === "comandas") && <div className="modal-backdrop" onMouseDown={() => setSelectedUnit(null)}><section className="modal unit-detail-modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><small>{selectedUnit.type === "mesa" ? "MESA" : "COMANDA"} {selectedUnit.number}</small><h2>{selectedUnit.label}</h2></div><button onClick={() => setSelectedUnit(null)}>×</button></div>{(() => { const unitOrders = orders.filter((order) => order.serviceUnitId === selectedUnit.id && order.status !== "concluido"); const total = unitOrders.reduce((sum, order) => sum + order.total, 0); return <><div className="unit-detail-summary"><span>{unitOrders.length} pedidos</span><strong>{money.format(total)}</strong></div><div className="unit-order-list">{unitOrders.length ? unitOrders.map((order) => <article key={order.id}><div><strong>#{order.id}</strong><span>{statusLabel[order.status]} · {order.time}</span></div><b>{money.format(order.total)}</b></article>) : <p>Nenhum pedido lançado.</p>}</div><div className="modal-actions"><button className="secondary" onClick={() => openUnitForOrder(selectedUnit)}>+ Adicionar pedido</button>{Boolean(selectedUnit.openedAt || unitOrders.length) && <button className="primary" onClick={() => closeServiceUnit(selectedUnit)}>Encerrar e receber</button>}</div></>; })()}</section></div>}

        {view === "equipe" && <section className="team-page"><header className="team-toolbar"><div><small>USUÁRIOS DO PROGRAMA</small><h2>Equipe e acessos</h2><p>Cadastre operadores locais e defina o que cada função pode acessar.</p></div><button className="primary" onClick={() => openTeamUser()}>+ Novo usuário</button></header><div className="team-role-summary">{(["admin", "gerente", "caixa", "garcom", "cozinha", "entregador"] as DesktopRole[]).map((role) => <article key={role}><span>{teamUsers.filter((user) => user.role === role && user.active).length}</span><strong>{role}</strong></article>)}</div><div className="team-list">{teamUsers.map((user) => <article key={user.id} className={user.active ? "" : "inactive"}><span className="team-avatar">{user.name.slice(0, 2).toUpperCase()}</span><div><strong>{user.name}</strong><small>@{user.username} · {user.role}</small></div><b>{user.active ? "Ativo" : "Desativado"}</b><button className="secondary" onClick={() => openTeamUser(user)}>Editar</button><button className="danger-action" onClick={() => removeTeamUser(user)} disabled={user.id === desktopUser?.id}>Excluir</button></article>)}</div>{!desktopMode && <div className="desktop-only-note"><strong>Cadastro local disponível no programa Windows</strong><p>Instale o DeliveryFlow PDV para gerenciar usuários que trabalham no caixa e na produção.</p></div>}</section>}

        {view === "equipe" && <section className="online-staff-card"><header><div><small>ACESSO PELO SITE</small><h2>Garçom e equipe online</h2><p>Crie o acesso para entrar em <b>/garcom</b>. A confirmação administrativa usa a conta Google e continua gratuita.</p></div><span>FIREBASE GRATUITO</span></header><form onSubmit={saveOnlineStaff}><label>Nome<input value={onlineStaffForm.name} onChange={(event) => setOnlineStaffForm({ ...onlineStaffForm, name: event.target.value })} required /></label><label>E-mail<input type="email" value={onlineStaffForm.email} onChange={(event) => setOnlineStaffForm({ ...onlineStaffForm, email: event.target.value })} required /></label><label>Senha inicial<input type="password" minLength={6} value={onlineStaffForm.password} onChange={(event) => setOnlineStaffForm({ ...onlineStaffForm, password: event.target.value })} required /></label><label>Perfil<select value={onlineStaffForm.role} onChange={(event) => setOnlineStaffForm({ ...onlineStaffForm, role: event.target.value as "garcom" | "cozinha" | "entregador" })}><option value="garcom">Garçom</option><option value="cozinha">Cozinha</option><option value="entregador">Entregador</option></select></label><button className="primary" disabled={onlineStaffSaving}>{onlineStaffSaving ? "Criando..." : "Criar acesso online"}</button></form>{teamError && <p className="form-error">! {teamError}</p>}</section>}

        {view === "caixa" && <section className="cash-page">
          <nav className="master-tabs cash-tabs"><button className={cashTab === "current" ? "active" : ""} onClick={() => setCashTab("current")}>Caixa atual</button><button className={cashTab === "movements" ? "active" : ""} onClick={() => setCashTab("movements")}>Movimentações</button><button className={cashTab === "closing" ? "active" : ""} onClick={() => setCashTab("closing")}>Fechamento</button><button className={cashTab === "history" ? "active" : ""} onClick={() => setCashTab("history")}>Histórico</button></nav>
          {cashTab === "current" && <><div className={`cash-hero ${cashOpen ? "is-open" : ""}`}><div><span className="cash-symbol">R$</span><div><small>{cashRegister ? `SESSÃO ${cashRegister.sessionId.slice(-6).toUpperCase()}` : "SITUAÇÃO DO CAIXA"}</small><h2>{cashOpen ? "Caixa aberto" : "Caixa fechado"}</h2><p>{cashOpen && cashRegister ? `Aberto em ${new Date(cashRegister.openedAt).toLocaleString("pt-BR")} por ${cashRegister.openedByName}` : "Abra um novo caixa para iniciar as vendas com os totais zerados."}</p></div></div><button className={cashOpen ? "secondary" : "primary"} onClick={() => { setCashError(""); if (cashOpen) setCashTab("closing"); else setModal("cash"); }}>{cashOpen ? "Ir para fechamento" : "Abrir caixa"}</button></div><div className="cash-grid"><article><small>Saldo inicial</small><strong>{money.format(cashOpen ? cashRegister?.openingAmount || 0 : 0)}</strong><span>Troco informado na abertura</span></article><article><small>Vendas do turno</small><strong>{money.format(cashOpen ? currentCashOrders.reduce((sum, order) => sum + order.total, 0) : 0)}</strong><span>{currentCashOrders.length} pagamentos</span></article><article><small>PIX e cartões</small><strong>{money.format(cashOpen ? digitalSales : 0)}</strong><span>Recebimentos digitais</span></article><article><small>Dinheiro esperado</small><strong>{money.format(cashOpen ? expectedCash : 0)}</strong><span>Com sangrias e suprimentos</span></article></div><div className="payment-breakdown">{(["Dinheiro", "PIX", "Débito", "Crédito", "Outro"] as PaymentMethod[]).map((method) => <article key={method}><span>{method}</span><strong>{money.format(cashOpen ? paymentTotals[method] || 0 : 0)}</strong><small>{currentCashOrders.filter((order) => order.paymentMethod === method).length} venda(s)</small></article>)}</div></>}
          {cashTab === "movements" && <div className="table-card cash-history"><div className="card-title"><div><span>ENTRADAS E RETIRADAS</span><h2>Movimentações do turno</h2><p>Sangrias e suprimentos alteram somente o dinheiro físico esperado.</p></div><button className="primary" disabled={!cashOpen} onClick={() => { setCashError(""); setModal("cash-movement"); }}>+ Nova movimentação</button></div><table><thead><tr><th>Horário</th><th>Descrição</th><th>Operador</th><th>Tipo</th><th>Valor</th></tr></thead><tbody>{cashOpen && cashRegister && <tr><td>{new Date(cashRegister.openedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td><td><strong>Abertura de caixa</strong></td><td>{cashRegister.openedByName}</td><td><span className="tag">Entrada</span></td><td><strong>{money.format(cashRegister.openingAmount)}</strong></td></tr>}{currentMovements.map((movement) => <tr key={movement.id}><td>{new Date(movement.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td><td><strong>{movement.reason}</strong></td><td>{movement.createdByName}</td><td><span className={`tag ${movement.type === "sangria" ? "red-tag" : "green-tag"}`}>{movement.type === "sangria" ? "Sangria" : "Suprimento"}</span></td><td><strong>{movement.type === "sangria" ? "−" : "+"}{money.format(movement.amount)}</strong></td></tr>)}{!currentMovements.length && <tr><td colSpan={5} className="empty-table">Nenhuma sangria ou suprimento neste turno.</td></tr>}</tbody></table></div>}
          {cashTab === "closing" && <section className="closing-panel"><header><div><small>CONFERÊNCIA DO TURNO</small><h2>Fechamento de caixa</h2><p>Finalize todas as vendas, mesas e comandas antes de conferir os valores.</p></div><span className={`closing-status ${pendingCashOrders.length || occupiedUnits.length ? "blocked" : "ready"}`}>{pendingCashOrders.length || occupiedUnits.length ? "Existem pendências" : "Pronto para fechar"}</span></header>{(pendingCashOrders.length > 0 || occupiedUnits.length > 0) && <div className="cash-pending"><strong>Resolva antes de fechar</strong><p>{pendingCashOrders.length} pedido(s) em andamento e {occupiedUnits.length} mesa(s)/comanda(s) aberta(s).</p><div><button className="secondary" onClick={() => setView("pedidos")}>Ver pedidos</button><button className="secondary" onClick={() => setView("mesas")}>Ver mesas</button></div></div>}<div className="closing-summary"><article><span>Total vendido</span><strong>{money.format(currentCashOrders.reduce((sum, order) => sum + order.total, 0))}</strong></article><article><span>Dinheiro esperado</span><strong>{money.format(expectedCash)}</strong></article><article><span>Sangrias</span><strong>{money.format(withdrawalsTotal)}</strong></article><article><span>Suprimentos</span><strong>{money.format(suppliesTotal)}</strong></article></div><button className="primary close-cash-button" disabled={!cashOpen || pendingCashOrders.length > 0 || occupiedUnits.length > 0} onClick={() => { setCashError(""); setCashClosing(expectedCash); setModal("cash-close"); }}>Conferir valores e fechar caixa</button></section>}
          {cashTab === "history" && <div className="table-card cash-history"><div className="card-title"><div><span>AUDITORIA</span><h2>Caixas anteriores</h2><p>As sessões encerradas permanecem salvas e nunca são apagadas no reset operacional.</p></div><input className="cash-history-search" value={cashHistorySearch} onChange={(event) => setCashHistorySearch(event.target.value)} placeholder="Buscar data ou operador" /></div><table><thead><tr><th>Sessão</th><th>Abertura</th><th>Operadores</th><th>Vendas</th><th>Diferença</th><th></th></tr></thead><tbody>{filteredCashSessions.map((session) => <tr key={session.sessionId}><td><strong>#{session.sessionId.slice(-6).toUpperCase()}</strong><small className="table-subline">{session.status === "closed" ? "Encerrado" : "Aberto"}</small></td><td>{new Date(session.openedAt).toLocaleString("pt-BR")}</td><td>{session.openedByName}<small className="table-subline">Fechou: {session.closedByName || "—"}</small></td><td><strong>{money.format(session.salesTotal || 0)}</strong><small className="table-subline">{session.orderCount || 0} pedido(s)</small></td><td><strong className={(session.difference || 0) < 0 ? "negative-value" : (session.difference || 0) > 0 ? "positive-value" : ""}>{money.format(session.difference || 0)}</strong></td><td><button className="secondary" disabled={session.status !== "closed"} onClick={() => reprintCashSession(session)}>Reimprimir</button></td></tr>)}{!filteredCashSessions.length && <tr><td colSpan={6} className="empty-table">Nenhum caixa encontrado.</td></tr>}</tbody></table></div>}
        </section>}

        {view === "atendimento" && <>
          <div className="service-summary"><div><span>◷</span><div><small>STATUS DO CARDÁPIO</small><h2>{storeOpen ? "Aberto para pedidos" : "Fechado agora"}</h2><p>Hoje: {todaySchedule.enabled ? `${todaySchedule.open} às ${todaySchedule.close}` : "não abre"}</p></div></div><div><strong>{business.pickupMinutes} min</strong><small>RETIRADA</small></div><div><strong>{business.deliveryMinutes} min</strong><small>ENTREGA</small></div></div>
          <div className="service-layout"><section className="schedule-card"><header><div><small>SEMANA</small><h2>Horários de atendimento</h2></div><p>Esses horários controlam quando o cardápio aceita pedidos online.</p></header>{weekDays.map((day) => { const schedule = business.schedule[day.id]; return <div className={`schedule-row ${schedule.enabled ? "" : "disabled"}`} key={day.id}><button className={`switch ${schedule.enabled ? "on" : ""}`} onClick={() => updateSchedule(day.id, { enabled: !schedule.enabled })}><span /></button><strong>{day.label}</strong><label>Abre<input type="time" value={schedule.open} onChange={(e) => updateSchedule(day.id, { open: e.target.value })} disabled={!schedule.enabled} /></label><label>Fecha<input type="time" value={schedule.close} onChange={(e) => updateSchedule(day.id, { close: e.target.value })} disabled={!schedule.enabled} /></label></div>; })}</section><aside className="service-rules"><header><small>PRAZOS E VALORES</small><h2>Configuração dos pedidos</h2></header><label>Prazo para retirada <div><input type="number" min="1" value={business.pickupMinutes} onChange={(e) => setBusiness({ ...business, pickupMinutes: Math.max(1, Number(e.target.value)) })} /><span>minutos</span></div></label><label>Prazo para entrega <div><input type="number" min="1" value={business.deliveryMinutes} onChange={(e) => setBusiness({ ...business, deliveryMinutes: Math.max(1, Number(e.target.value)) })} /><span>minutos</span></div></label><label>Taxa padrão de entrega <div><span>R$</span><input type="number" min="0" step="0.01" value={business.deliveryFee} onChange={(e) => setBusiness({ ...business, deliveryFee: Math.max(0, Number(e.target.value)) })} /></div></label><div className="estimate-example"><strong>Exemplo no comprovante</strong><p>Pedido às 19:00</p><p>Retirada prevista: <b>19:{String(business.pickupMinutes).padStart(2, "0")}</b></p><p>Entrega prevista: <b>20:00</b></p></div></aside></div>
        </>}

        {view === "loja" && <div className="store-settings-page">
          <div className="store-settings-layout"><section className="store-settings-form"><header><div><small>CADASTRO DO ESTABELECIMENTO</small><h2>Informações da sua loja</h2><p>Esses dados aparecem no cardápio, comprovantes e contato com o cliente.</p></div><span>{storeRemoteResolved ? "Salvo automaticamente" : "Conectando..."}</span></header><div className="store-fields"><label>Nome da loja<input value={store.name} onChange={(e) => setStore({ ...store, name: e.target.value })} placeholder="Ex.: Lanches do João" /></label><label>Razão social<input value={store.legalName} onChange={(e) => setStore({ ...store, legalName: e.target.value })} placeholder="Nome empresarial" /></label><label>CNPJ<input value={store.cnpj} onChange={(e) => setStore({ ...store, cnpj: e.target.value })} placeholder="00.000.000/0000-00" inputMode="numeric" /></label><label>WhatsApp<input value={store.whatsapp} onChange={(e) => setStore({ ...store, whatsapp: e.target.value })} placeholder="(00) 00000-0000" inputMode="tel" /></label><label>Telefone<input value={store.phone} onChange={(e) => setStore({ ...store, phone: e.target.value })} placeholder="(00) 0000-0000" inputMode="tel" /></label><label>E-mail<input type="email" value={store.email} onChange={(e) => setStore({ ...store, email: e.target.value })} placeholder="contato@loja.com" /></label><label className="field-wide">Rua ou avenida<input value={store.street} onChange={(e) => setStore({ ...store, street: e.target.value })} placeholder="Endereço do estabelecimento" /></label><label>Número<input value={store.number} onChange={(e) => setStore({ ...store, number: e.target.value })} /></label><label>Bairro<input value={store.neighborhood} onChange={(e) => setStore({ ...store, neighborhood: e.target.value })} /></label><label>Cidade<input value={store.city} onChange={(e) => setStore({ ...store, city: e.target.value })} /></label><label>Estado<input value={store.state} onChange={(e) => setStore({ ...store, state: e.target.value.toUpperCase().slice(0, 2) })} maxLength={2} /></label><label>CEP<input value={store.zipCode} onChange={(e) => setStore({ ...store, zipCode: e.target.value })} placeholder="00000-000" inputMode="numeric" /></label><label className="field-wide">Complemento<input value={store.complement} onChange={(e) => setStore({ ...store, complement: e.target.value })} placeholder="Referência ou complemento" /></label></div></section>
          <aside className="brand-settings"><header><small>IDENTIDADE VISUAL</small><h2>Logo e banner</h2></header><div className="store-logo-preview">{store.logoDataUrl ? <img src={store.logoDataUrl} alt={`Logo ${store.name}`} /> : <span>{store.name.slice(0, 2).toUpperCase() || "LO"}</span>}</div><label className="logo-upload"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => handleStoreImage(e.target.files?.[0], "logo")} disabled={storeSaving} /><b>{storeSaving ? "Processando..." : "Escolher logo"}</b><small>Preferencialmente uma imagem quadrada.</small></label>{store.logoDataUrl && <button className="remove-logo" onClick={() => setStore({ ...store, logoDataUrl: "" })}>Remover logo</button>}<div className={`store-banner-preview ${store.bannerDataUrl ? "has-image" : ""}`} style={store.bannerDataUrl ? { backgroundImage: `url(${store.bannerDataUrl})`, backgroundPosition: `center ${store.bannerPosition}%` } : undefined}><span>{store.bannerDataUrl ? "Prévia do banner" : "Seu banner aparecerá aqui"}</span></div><label className="logo-upload"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => handleStoreImage(e.target.files?.[0], "banner")} disabled={storeSaving} /><b>{storeSaving ? "Processando..." : "Escolher banner"}</b><small>Recomendado: imagem horizontal 1200 × 500.</small></label>{store.bannerDataUrl && <><label className="banner-position">Posição da imagem <input type="range" min="0" max="100" value={store.bannerPosition} onChange={(e) => setStore({ ...store, bannerPosition: Number(e.target.value) })} /></label><button className="remove-logo" onClick={() => setStore({ ...store, bannerDataUrl: "" })}>Remover banner</button></>}<div className="platform-brand"><small>MARCA DA PLATAFORMA</small><div><span>Desenvolvido por</span><img src="/deliveryflow-horizontal.png" alt="DeliveryFlow" /></div><b>Versão {APP_VERSION}</b></div></aside></div>
          <section className="menu-appearance"><header><div><small>APARÊNCIA DO CARDÁPIO</small><h2>Personalização e informações</h2></div><button className="secondary" onClick={() => setView("cardapio")}>Abrir prévia completa →</button></header><div className="appearance-grid"><label>Texto promocional<input value={store.promoText} onChange={(e) => setStore({ ...store, promoText: e.target.value })} placeholder="Ex.: Entrega grátis acima de R$ 50" /></label><label>Cor principal<div className="color-control"><input type="color" value={store.primaryColor} onChange={(e) => setStore({ ...store, primaryColor: e.target.value })} /><input value={store.primaryColor} onChange={(e) => setStore({ ...store, primaryColor: e.target.value })} maxLength={7} /></div></label><label>Tema<select value={store.theme} onChange={(e) => setStore({ ...store, theme: e.target.value as StoreSettings["theme"] })}><option value="light">Claro</option><option value="dark">Escuro</option></select></label></div><div className="visibility-options"><label><input type="checkbox" checked={store.showInfo} onChange={(e) => setStore({ ...store, showInfo: e.target.checked })} /> Mostrar botão de informações</label><label><input type="checkbox" checked={store.showAddress} onChange={(e) => setStore({ ...store, showAddress: e.target.checked })} /> Mostrar endereço</label><label><input type="checkbox" checked={store.showPhone} onChange={(e) => setStore({ ...store, showPhone: e.target.checked })} /> Mostrar telefone e WhatsApp</label></div><div className={`storefront-mini-preview storefront-${store.theme}`} style={{ "--store-accent": store.primaryColor } as CSSProperties}><div style={store.bannerDataUrl ? { backgroundImage: `url(${store.bannerDataUrl})`, backgroundPosition: `center ${store.bannerPosition}%` } : undefined}></div><span>{store.logoDataUrl ? <img src={store.logoDataUrl} alt="" /> : store.name.slice(0, 2).toUpperCase()}</span><section><strong>{store.name}</strong><small>{store.promoText}</small><b>● Aberto agora</b></section></div></section>
        </div>}

        {view === "loja" && <section className="system-brand-card"><header><div><small>IDENTIDADE DO COMPROVANTE</small><h2>Logo das impressões</h2><p>Esta imagem aparece somente no cabeçalho dos papéis impressos no caixa e na cozinha. O PDV continua sempre com a marca DeliveryFlow.</p></div><span>SOMENTE PAPEL</span></header><div className="system-brand-content"><div className="system-logo-preview">{store.printLogoDataUrl ? <img src={store.printLogoDataUrl} alt={`Logo das impressões de ${store.name}`} /> : <span className="print-logo-placeholder">Sem logo configurada</span>}</div><div><label className="logo-upload"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => handleStoreImage(e.target.files?.[0], "printLogo")} disabled={storeSaving} /><b>{storeSaving ? "Processando..." : "Escolher logo do papel"}</b><small>Use uma imagem horizontal, preferencialmente em preto para impressão térmica.</small></label>{store.printLogoDataUrl && <button className="remove-logo" onClick={() => setStore({ ...store, printLogoDataUrl: "" })}>Remover logo das impressões</button>}</div></div><div className="brand-separation-note"><b>Separação correta:</b> logo e banner acima são exclusivos do site. Esta logo é exclusiva dos papéis. O sistema permanece DeliveryFlow.</div></section>}

        {view === "loja" && <section className="manager-security-card"><header><div><small>SEGURANÇA OPERACIONAL</small><h2>Autorização gerencial gratuita</h2><p>Cancelamentos e exclusões exigem que o gerente confirme sua conta Google administradora.</p></div><span>SEM MENSALIDADE</span></header><div className="google-manager-info"><span>G</span><div><strong>Conta autorizadora</strong><p>{ADMIN_EMAIL}</p><small>A senha do Google não é exibida nem armazenada pelo DeliveryFlow.</small></div></div><div className="security-note"><b>Proteção ativa:</b> o caixa informa o motivo e o gerente autoriza em uma janela segura do Google.</div></section>}

        {view === "impressoras" && <>
          <div className="printer-intro"><div><span>▤</span><div><strong>Roteamento por setor</strong><p>Defina qual fila do Windows receberá os comprovantes do caixa e as comandas de produção.</p></div></div><b className={connectorOnline ? "connector-online" : "connector-offline"}>{connectorOnline ? `Conector ativo · ${detectedPrinters.length} impressoras` : "Conector desligado"}</b></div>
          <datalist id="windows-printers">{detectedPrinters.map((printer) => <option value={printer} key={printer} />)}</datalist>
          <div className="printer-grid">{(["caixa", "cozinha"] as PrinterSector[]).map((sector) => {
            const config = printers[sector];
            const installed = Boolean(config.enabled && config.queue.trim());
            return <article className={`printer-card printer-list-card ${editingPrinter === sector ? "editing" : ""}`} key={sector}>
              <header><div className="printer-sector-icon">{sector === "caixa" ? "R$" : "♨"}</div><div><small>SETOR FIXO</small><h2>{sector === "caixa" ? "Caixa" : "Cozinha"}</h2><p>{config.queue || "Nenhuma fila selecionada"} · {config.categories.length ? config.categories.join(", ") : "Todas as categorias"}</p></div><span className={`printer-status ${installed ? "connected" : ""}`}>{config.enabled ? (installed ? "Configurada" : "Sem fila") : "Desativada"}</span><button className="secondary" onClick={() => updatePrinter(sector, { enabled: !config.enabled, autoPrint: config.enabled ? false : config.autoPrint })}>{config.enabled ? "Desativar" : "Ativar"}</button><button className="secondary printer-duplicate-button" onClick={() => duplicatePrinter(sector === "caixa" ? "Caixa" : "Cozinha", sector, config)}>Duplicar</button><button className="secondary printer-edit-button" onClick={() => setEditingPrinter(editingPrinter === sector ? null : sector)}>{editingPrinter === sector ? "Fechar" : "Editar"}</button><button className="danger-action" onClick={() => removeFixedPrinterConfiguration(sector)}>Remover</button></header>
              <label>Nome da fila no Windows<input list="windows-printers" value={config.queue} onChange={(e) => updatePrinter(sector, { queue: e.target.value })} placeholder="Ex.: TANCA TP-650" /></label>
              <div className="printer-form-row"><label>Largura do papel<select value={config.paper} onChange={(e) => updatePrinter(sector, { paper: e.target.value as PrinterConfig["paper"] })}><option value="80mm">80 mm</option><option value="58mm">58 mm</option></select></label><label>Quantidade de vias<input type="number" min="1" max="5" value={config.copies} onChange={(e) => updatePrinter(sector, { copies: Math.max(1, Number(e.target.value)) })} /></label></div>
              <section className="printer-typography"><div className="typography-title"><div><strong>Aparência do cupom</strong><small>Impressão gráfica com letras proporcionais.</small></div><div><label>Fonte<select value={config.font} onChange={(e) => updatePrinter(sector, { font: e.target.value as PrinterConfig["font"] })}><option value="Arial">Arial</option><option value="Segoe UI">Segoe UI</option><option value="Consolas">Consolas</option></select></label><label>Espaçamento<select value={config.lineSpacing} onChange={(e) => updatePrinter(sector, { lineSpacing: Number(e.target.value) as PrinterConfig["lineSpacing"] })}><option value="24">Compacto</option><option value="30">Normal</option><option value="36">Amplo</option></select></label></div></div>{(["header", "items", "notes"] as const).map((section) => <div className="typography-row" key={section}><strong>{section === "header" ? "Pedido e mesa" : section === "items" ? "Itens" : "Observações"}</strong><select value={config.sections[section].size} onChange={(e) => updatePrinterSection(sector, section, { size: e.target.value as TicketTextStyle["size"] })}><option value="normal">Normal</option><option value="large">Grande</option><option value="extra">Extra grande</option></select><label className="bold-choice"><input type="checkbox" checked={config.sections[section].bold} onChange={(e) => updatePrinterSection(sector, section, { bold: e.target.checked })} /> Negrito</label></div>)}</section>
              <section className="printer-detail-sizing"><strong>Tamanho das informações</strong><p>Ajuste separadamente as partes que precisam de mais destaque.</p>{([['store', 'Dados da loja'], ['customer', 'Cliente e endereço'], ['values', 'Valores e total']] as const).map(([section, label]) => <div className="typography-row" key={section}><strong>{label}</strong><select value={config.sections[section].size} onChange={(e) => updatePrinterSection(sector, section, { size: e.target.value as TicketTextStyle['size'] })}><option value="normal">Normal</option><option value="large">Grande</option><option value="extra">Extra grande</option></select><label className="bold-choice"><input type="checkbox" checked={config.sections[section].bold} onChange={(e) => updatePrinterSection(sector, section, { bold: e.target.checked })} /> Negrito</label></div>)}</section>
              <section className="printer-category-routing"><header><div><strong>Categorias enviadas para este setor</strong><small>Sem seleção, imprime o pedido completo.</small></div><b>{config.categories.length ? `${config.categories.length} selecionadas` : "Todas"}</b></header><div>{categories.filter((item) => item !== "Todos").map((item) => <button type="button" key={item} className={config.categories.includes(item) ? "active" : ""} onClick={() => togglePrinterCategory(sector, item)}>{config.categories.includes(item) ? "✓ " : ""}{item}</button>)}</div></section>
              <div className="printer-option"><div><strong>Impressora habilitada</strong><small>Permite enviar documentos para este setor.</small></div><button className={`switch ${config.enabled ? "on" : ""}`} onClick={() => updatePrinter(sector, { enabled: !config.enabled })}><span /></button></div>
              <div className="printer-option"><div><strong>Impressão direta automática</strong><small>{sector === "caixa" ? "Via de entrega para o motoboy." : "Novos pedidos de produção."}</small></div><button className={`switch ${config.autoPrint ? "on" : ""}`} onClick={() => updatePrinter(sector, { autoPrint: !config.autoPrint })} disabled={!installed}><span /></button></div>
              <footer><button className="secondary" onClick={() => testPrinter(sector)} disabled={!installed || !connectorOnline}>Imprimir e cortar teste</button><small>{sector === "caixa" ? "Comprovantes e fechamento" : "Pedidos e observações"}</small></footer>
            </article>;
          })}</div>
          <section className="extra-printers">
            <header><div><small>OUTROS DESTINOS</small><h2>Impressoras adicionais</h2><p>Cadastre bar, chapa, expedição ou qualquer outro setor.</p></div><button className="primary add-printer-button" onClick={addExtraPrinter}>+ Adicionar impressora</button></header>
            {!extraPrinters.length ? <div className="extra-printer-empty">Nenhuma impressora adicional cadastrada. Clique em “Adicionar impressora” para criar um setor.</div> : <div className="extra-printer-list">{extraPrinters.map((printer) => <article className={editingPrinter === printer.id ? "editing" : ""} key={printer.id}><header className="extra-printer-summary"><div><strong>{printer.label}</strong><small>{printer.config.queue || "Nenhuma fila selecionada"} · {printer.config.categories.length ? printer.config.categories.join(", ") : "Todas as categorias"}</small></div><span className={printer.config.enabled ? "" : "inactive"}>{printer.config.enabled ? "Ativa" : "Desativada"}</span><button className="secondary" onClick={() => updateExtraPrinter(printer.id, {}, { enabled: !printer.config.enabled, autoPrint: printer.config.enabled ? false : printer.config.autoPrint })}>{printer.config.enabled ? "Desativar" : "Ativar"}</button><button className="secondary" onClick={() => duplicatePrinter(printer.label, printer.template, printer.config)}>Duplicar</button><button className="secondary" onClick={() => setEditingPrinter(editingPrinter === printer.id ? null : printer.id)}>{editingPrinter === printer.id ? "Fechar" : "Editar"}</button><button className="danger-action" onClick={() => removeExtraPrinter(printer.id, printer.label)}>Excluir</button></header><div className="extra-printer-main"><label>Nome do setor<input value={printer.label} onChange={(e) => updateExtraPrinter(printer.id, { label: e.target.value })} placeholder="Ex.: Bar" /></label><label>Fila do Windows<input list="windows-printers" value={printer.config.queue} onChange={(e) => updateExtraPrinter(printer.id, {}, { queue: e.target.value })} placeholder="Nome exato da impressora" /></label><label>Modelo<select value={printer.template} onChange={(e) => updateExtraPrinter(printer.id, { template: e.target.value as PrinterSector })}><option value="cozinha">Comanda de produção</option><option value="caixa">Via do caixa / entrega</option></select></label><label>Vias<input type="number" min="1" max="5" value={printer.config.copies} onChange={(e) => updateExtraPrinter(printer.id, {}, { copies: Math.max(1, Number(e.target.value)) })} /></label></div><section className="printer-category-routing extra-routing"><header><div><strong>Categorias deste setor</strong><small>Ex.: selecione Bebidas para o bar.</small></div><b>{printer.config.categories.length ? `${printer.config.categories.length} selecionadas` : "Todas"}</b></header><div>{categories.filter((item) => item !== "Todos").map((item) => <button type="button" key={item} className={printer.config.categories.includes(item) ? "active" : ""} onClick={() => toggleExtraPrinterCategory(printer.id, item)}>{printer.config.categories.includes(item) ? "✓ " : ""}{item}</button>)}</div></section><div className="extra-printer-actions"><button className={`switch ${printer.config.autoPrint ? "on" : ""}`} onClick={() => updateExtraPrinter(printer.id, {}, { autoPrint: !printer.config.autoPrint })} title="Impressão automática"><span /></button><button className="secondary" onClick={() => testPrinterConfig(printer.template, printer.config)} disabled={!connectorOnline || !printer.config.queue}>Testar</button></div></article>)}</div>}
          </section>
          <div className="printer-note"><strong>Impressão direta ESC/POS</strong><p>O conector envia somente os dados do cupom para a fila escolhida, sem abrir a janela do navegador. Ao terminar, a TP-650 avança apenas alguns milímetros e executa o corte automático.</p></div>
        </>}
      </section>

      {modal === "product" && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><form className="modal" onSubmit={addProduct} onMouseDown={(e) => e.stopPropagation()}><div className="modal-head"><div><small>{editingProductId ? "EDITAR ITEM" : "NOVO ITEM"}</small><h2>{editingProductId ? "Editar produto" : "Cadastrar produto"}</h2></div><button type="button" onClick={() => setModal(null)}>×</button></div><label>Nome do produto<input value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} placeholder="Ex.: X-Salada especial" autoFocus /></label><div className="form-row"><label>Categoria<select value={newProduct.category} onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}>{categories.filter((item) => item !== "Todos").map((item) => <option key={item}>{item}</option>)}</select></label><label>Preço<input value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} placeholder="0,00" inputMode="decimal" /></label></div><label>Descrição<textarea value={newProduct.description} onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })} placeholder="Ingredientes e detalhes" /></label><label className="product-image-upload"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => handleProductImage(e.target.files?.[0])} /><span>{newProduct.imageDataUrl ? <img src={newProduct.imageDataUrl} alt="Prévia do produto" /> : "＋"}</span><div><b>{newProduct.imageDataUrl ? "Trocar foto" : "Adicionar foto do produto"}</b><small>JPG, PNG ou WebP</small></div></label><label className="featured-choice"><input type="checkbox" checked={newProduct.featured} onChange={(e) => setNewProduct({ ...newProduct, featured: e.target.checked })} /> Mostrar nos destaques do cardápio</label><div className="modal-actions"><button type="button" className="secondary" onClick={() => setModal(null)}>Cancelar</button><button className="primary">{editingProductId ? "Salvar alterações" : "Salvar produto"}</button></div></form></div>}
      {modal === "cash" && <div className="modal-backdrop"><form className="modal small-modal" onSubmit={handleOpenCash} onMouseDown={(e) => e.stopPropagation()}><div className="modal-head"><div><small>INÍCIO DO TURNO</small><h2>Abrir caixa</h2></div></div><div className="cash-operator"><span>Operador responsável</span><strong>{adminUser?.displayName || adminUser?.email}</strong><small>{new Date().toLocaleString("pt-BR")}</small></div><label>Valor inicial em dinheiro<input type="number" min="0" step="0.01" value={cashStart} onChange={(e) => setCashStart(Number(e.target.value))} autoFocus /></label><label>Observação da abertura<textarea value={cashOpeningNote} onChange={(event) => setCashOpeningNote(event.target.value)} placeholder="Ex.: troco conferido pelo responsável" /></label><p className="helper">A abertura é obrigatória antes de registrar vendas no PDV.</p>{cashError && <p className="form-error" role="alert">! {cashError}</p>}<button className="primary wide" disabled={cashSaving}>{cashSaving ? "Abrindo caixa..." : "Confirmar abertura"}</button></form></div>}
      {modal === "cash-movement" && cashRegister && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><form className="modal small-modal" onSubmit={handleCashMovement} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><small>MOVIMENTAÇÃO DO TURNO</small><h2>Registrar entrada ou retirada</h2></div><button type="button" onClick={() => setModal(null)}>×</button></div><div className="movement-type"><button type="button" className={cashMovementType === "sangria" ? "active" : ""} onClick={() => setCashMovementType("sangria")}>Sangria</button><button type="button" className={cashMovementType === "suprimento" ? "active" : ""} onClick={() => setCashMovementType("suprimento")}>Suprimento</button></div><label>Valor<input type="number" min="0.01" step="0.01" value={cashMovementAmount || ""} onChange={(event) => setCashMovementAmount(Number(event.target.value))} autoFocus /></label><label>Motivo<input value={cashMovementReason} onChange={(event) => setCashMovementReason(event.target.value)} placeholder={cashMovementType === "sangria" ? "Ex.: pagamento do motoboy" : "Ex.: reforço de troco"} /></label>{cashError && <p className="form-error" role="alert">! {cashError}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={() => setModal(null)}>Cancelar</button><button className="primary" disabled={cashSaving}>{cashSaving ? "Salvando..." : "Registrar movimentação"}</button></div></form></div>}
      {modal === "cash-close" && cashRegister && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><form className="modal cash-close-modal" onSubmit={handleCloseCash} onMouseDown={(e) => e.stopPropagation()}><div className="modal-head"><div><small>FIM DO TURNO · SESSÃO {cashRegister.sessionId.slice(-6).toUpperCase()}</small><h2>Conferir e fechar caixa</h2></div><button type="button" onClick={() => setModal(null)}>×</button></div><div className="blind-closing-note"><strong>Conferência do operador</strong><span>Informe os valores contados ou confirmados. O sistema calculará a diferença.</span></div><div className="closing-fields"><label>Dinheiro contado<input type="number" min="0" step="0.01" value={cashClosing} onChange={(e) => setCashClosing(Number(e.target.value))} autoFocus /><small>Esperado: {money.format(expectedCash)} · Diferença: {money.format(cashClosing - expectedCash)}</small></label>{(["PIX", "Débito", "Crédito", "Outro"] as const).map((method) => <label key={method}>{method} confirmado<input value={cashDeclared[method]} onChange={(event) => setCashDeclared((current) => ({ ...current, [method]: event.target.value }))} placeholder={(paymentTotals[method] || 0).toFixed(2).replace(".", ",")} inputMode="decimal" /><small>Sistema: {money.format(paymentTotals[method] || 0)}</small></label>)}</div><label>Observação do fechamento<textarea value={cashClosingNote} onChange={(event) => setCashClosingNote(event.target.value)} placeholder="Informe qualquer falta, sobra ou ocorrência" /></label><div className="closing-confirm-summary"><span>Total vendido <strong>{money.format(currentCashOrders.reduce((sum, order) => sum + order.total, 0))}</strong></span><span>Diferença no dinheiro <strong className={cashClosing - expectedCash < 0 ? "negative-value" : cashClosing - expectedCash > 0 ? "positive-value" : ""}>{money.format(cashClosing - expectedCash)}</strong></span></div>{cashError && <p className="form-error" role="alert">! {cashError}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={() => setModal(null)}>Cancelar</button><button className="primary" disabled={cashSaving}>{cashSaving ? "Fechando e imprimindo..." : "Confirmar fechamento e imprimir"}</button></div></form></div>}
      {modal === "payment" && paymentOrder && <div className="modal-backdrop"><form className="modal small-modal" onSubmit={finishPayment}><div className="modal-head"><div><small>RECEBIMENTO DO PEDIDO #{paymentOrder.id}</small><h2>Como o cliente pagou?</h2></div><button type="button" onClick={() => { setModal(null); setPaymentOrder(null); }}>×</button></div><div className="payment-total"><span>Total a receber</span><strong>{money.format(paymentOrder.total)}</strong></div><div className="payment-methods">{(["Dinheiro", "PIX", "Débito", "Crédito", "Outro"] as PaymentMethod[]).map((method) => <button type="button" key={method} className={paymentMethod === method ? "active" : ""} onClick={() => { setPaymentMethod(method); setPaymentError(""); }}>{method}</button>)}</div>{paymentMethod === "Dinheiro" && <label>Valor recebido<input value={receivedAmount} onChange={(e) => setReceivedAmount(e.target.value)} placeholder={paymentOrder.total.toFixed(2).replace(".", ",")} inputMode="decimal" autoFocus /></label>}{paymentMethod === "Dinheiro" && Number(receivedAmount.replace(",", ".")) >= paymentOrder.total && <p className="payment-change">Troco: <strong>{money.format(Number(receivedAmount.replace(",", ".")) - paymentOrder.total)}</strong></p>}{paymentError && <p className="form-error" role="alert">! {paymentError}</p>}<button className="primary wide" disabled={paymentSaving}>{paymentSaving ? "Registrando..." : "Confirmar recebimento"}</button></form></div>}
      {modal === "order-details" && editingOrder && <div className="modal-backdrop"><section className="modal order-details-modal"><div className="modal-head"><div><small>PEDIDO #{editingOrder.id} · {editingOrder.origin.toUpperCase()}</small><h2>Detalhes e edição</h2></div><button type="button" onClick={() => { setModal(null); setEditingOrder(null); }}>×</button></div><div className="order-detail-summary"><span>Status: <b>{statusLabel[editingOrder.status]}</b></span><span>Recebido: <b>{editingOrder.orderDate || "Hoje"} às {editingOrder.time}</b></span>{Boolean(editingOrder.revision) && <span className="revision-badge">Revisão {editingOrder.revision}</span>}</div><div className="order-detail-fields"><label>Identificação / mesa<input value={editingOrder.reference} onChange={(e) => setEditingOrder({ ...editingOrder, reference: e.target.value })} /></label><label>Nome do cliente<input value={editingOrder.customer} onChange={(e) => setEditingOrder({ ...editingOrder, customer: e.target.value })} disabled={editingOrder.origin === "Mesa"} /></label>{editingOrder.origin !== "Mesa" && <label>Telefone<input value={editingOrder.phone || ""} onChange={(e) => setEditingOrder({ ...editingOrder, phone: e.target.value })} /></label>}{editingOrder.origin === "Delivery" && <label className="detail-wide">Endereço de entrega<textarea value={editingOrder.deliveryAddress || ""} onChange={(e) => setEditingOrder({ ...editingOrder, deliveryAddress: e.target.value })} /></label>}</div><section className="edit-items"><header><strong>Itens do pedido</strong><span>{editingOrder.items.length} produtos</span></header>{editingOrder.items.map((item) => <div className="edit-item" key={item.productId}><div><strong>{item.name}</strong><small>{money.format(item.price)} cada</small></div><div className="edit-quantity"><button onClick={() => changeEditedItem(item.productId, item.quantity - 1)}>−</button><input type="number" min="0" value={item.quantity} onChange={(e) => changeEditedItem(item.productId, Number(e.target.value))} /><button onClick={() => changeEditedItem(item.productId, item.quantity + 1)}>+</button></div><b>{money.format(item.price * item.quantity)}</b><button className="remove-item" onClick={() => changeEditedItem(item.productId, 0)}>×</button></div>)}<div className="add-edit-item"><select value={editProductId} onChange={(e) => setEditProductId(e.target.value)}><option value="">Adicionar outro produto...</option>{products.filter((product) => product.active).map((product) => <option key={product.id} value={product.id}>{product.name} · {money.format(product.price)}</option>)}</select><button className="secondary" onClick={addProductToEditedOrder} disabled={!editProductId}>Adicionar</button></div></section><label className="edit-note">Observações da produção<textarea value={editingOrder.note || ""} onChange={(e) => setEditingOrder({ ...editingOrder, note: e.target.value })} placeholder="Ex.: sem cebola, ponto da carne..." /></label><div className="edit-order-total"><span>Novo total</span><strong>{money.format(editingOrder.items.reduce((sum, item) => sum + item.price * item.quantity, 0) + (editingOrder.deliveryFee || 0))}</strong></div>{editError && <p className="form-error" role="alert">! {editError}</p>}<div className="modal-actions edit-order-actions"><button className="secondary" onClick={() => { setModal(null); setEditingOrder(null); }} disabled={editSaving}>Cancelar</button><button className="secondary" onClick={() => saveEditedOrder(false)} disabled={editSaving}>{editSaving ? "Salvando..." : "Salvar alterações"}</button><button className="primary" onClick={() => saveEditedOrder(true)} disabled={editSaving}>{editSaving ? "Salvando..." : "Salvar e reimprimir cozinha"}</button></div></section></div>}
      {modal === "print-destination" && manualPrintOrder && <div className="modal-backdrop" onMouseDown={() => { setModal(null); setManualPrintOrder(null); }}><section className="modal print-destination-modal" onMouseDown={(e) => e.stopPropagation()}><div className="modal-head"><div><small>REIMPRIMIR PEDIDO #{manualPrintOrder.id}</small><h2>Escolha onde imprimir</h2></div><button type="button" onClick={() => { setModal(null); setManualPrintOrder(null); }}>×</button></div><div className="print-destinations"><button onClick={() => manualPrint("cozinha", printers.cozinha.enabled && printers.cozinha.queue ? printers.cozinha : printers.caixa, printers.cozinha.enabled && printers.cozinha.queue ? "Cozinha" : "Cozinha no caixa")} disabled={Boolean(printingDestination)}><span>♨</span><div><strong>Cozinha</strong><small>{printers.cozinha.enabled && printers.cozinha.queue ? printers.cozinha.queue : `${printers.caixa.queue} · via de produção`}</small></div><b>{printingDestination.startsWith("Cozinha") ? "Enviando..." : "Comanda"}</b></button><button onClick={() => manualPrint("caixa", printers.caixa, "Caixa")} disabled={!printers.caixa.enabled || Boolean(printingDestination)}><span>R$</span><div><strong>Caixa / Motoboy</strong><small>{printers.caixa.queue || "Não configurada"}</small></div><b>{printingDestination === "Caixa" ? "Enviando..." : "Dados de entrega"}</b></button>{extraPrinters.map((printer) => <button key={printer.id} onClick={() => manualPrint(printer.template, printer.config, printer.label)} disabled={!printer.config.enabled || !printer.config.queue || Boolean(printingDestination)}><span>▤</span><div><strong>{printer.label}</strong><small>{printer.config.queue || "Não configurada"}</small></div><b>{printingDestination === printer.label ? "Enviando..." : printer.template === "caixa" ? "Via do caixa" : "Comanda"}</b></button>)}</div><p className="print-help">Se uma impressão automática falhar, escolha o destino acima para reenviar imediatamente.</p></section></div>}

      {printOrder && <section className={`print-ticket print-${printDestination}`}>{store.printLogoDataUrl && <img className="print-logo" src={store.printLogoDataUrl} alt="" />}<p className="ticket-kind">{printDestination === "caixa" ? "COMPROVANTE DO CAIXA" : "COMANDA DE PRODUÇÃO"}</p><hr /><h2>PEDIDO #{printOrder.id}</h2><h3>{printOrder.reference}</h3><p className="ticket-time">{printDestination === "caixa" ? "Recebido" : "Pedido recebido"} às {printOrder.time}</p>{printOrder.origin === "Delivery" && printOrder.phone && <><p className="ticket-detail"><b>CLIENTE:</b> {printOrder.customer}</p><p className="ticket-detail"><b>TELEFONE:</b> {printOrder.phone}</p><p className="ticket-detail"><b>ENDEREÇO:</b> {printOrder.deliveryAddress}</p></>}<hr />{printOrder.items.map((item) => <div className="ticket-line" key={item.productId}><div><p className="ticket-item"><b>{item.quantity}x</b> {item.name}</p>{item.note && <p className="ticket-item-note"><b>OBS. ITEM:</b> {item.note}</p>}</div>{printDestination === "caixa" && <strong>{money.format(item.price * item.quantity)}</strong>}</div>)}{printDestination === "caixa" && <div className="receipt-total"><span>TOTAL</span><strong>{money.format(printOrder.total)}</strong>{printOrder.paymentMethod && <><span>FORMA</span><b>{printOrder.paymentMethod}</b></>}{printOrder.change !== undefined && printOrder.change > 0 && <><span>TROCO</span><b>{money.format(printOrder.change)}</b></>}</div>}{printOrder.note && <div className="ticket-note"><strong>OBSERVAÇÃO</strong><p>{printOrder.note}</p></div>}<hr /><p className="ticket-footer">Fila: {printers[printDestination].queue}</p><p className="ticket-footer">Impresso em {new Date().toLocaleString("pt-BR")}</p><div className="ticket-feed" /></section>}
      {modal === "cancel-order" && cancellingOrder && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><section className="modal small-modal cancel-order-modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><small>CANCELAMENTO DO PEDIDO #{cancellingOrder.id}</small><h2>Informe o motivo</h2></div><button onClick={() => setModal(null)}>×</button></div><div className="cancel-warning"><strong>Esta ação será registrada</strong><span>O pedido sairá da produção e não entrará no valor do caixa ou da mesa.</span></div><label>Motivo do cancelamento<select value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)}><option>Lançamento errado</option><option>Cliente desistiu</option><option>Produto indisponível</option><option>Pedido duplicado</option><option>Outro motivo</option></select></label><label>Observação<textarea value={cancellationNote} onChange={(event) => setCancellationNote(event.target.value)} placeholder="Explique o que aconteceu" /></label>{managerAuthorizationError && <p className="form-error">! {managerAuthorizationError}</p>}<div className="modal-actions"><button className="secondary" onClick={() => setModal(null)}>Voltar</button><button className="danger-action" onClick={continueCancellationAuthorization}>Solicitar autorização</button></div></section></div>}
      {modal === "manager-google" && cancellingOrder && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><section className="modal small-modal manager-pin-modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><small>AUTORIZAÇÃO GERENCIAL</small><h2>Confirme a conta do gerente</h2></div><button type="button" onClick={() => setModal(null)}>×</button></div><div className="manager-lock">G</div><p className="helper">Será aberta a janela oficial do Google. Escolha a conta administradora autorizada para confirmar o cancelamento.</p><div className="manager-account-hint"><span>Conta autorizada</span><strong>{ADMIN_EMAIL}</strong></div>{managerAuthorizationError && <p className="form-error">! {managerAuthorizationError}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={() => setModal("cancel-order")}>Voltar</button><button className="danger-action" onClick={confirmOrderCancellation} disabled={managerAuthorizationSaving}>{managerAuthorizationSaving ? "Aguardando Google..." : "Autorizar com Google"}</button></div></section></div>}
      {editingTeamUser && <div className="modal-backdrop" onMouseDown={() => setEditingTeamUser(null)}><form className="modal team-user-modal" onSubmit={saveTeamUser} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><small>EQUIPE DO PDV</small><h2>{editingTeamUser.id ? "Editar usuário" : "Novo usuário"}</h2></div><button type="button" onClick={() => setEditingTeamUser(null)}>×</button></div><div className="form-row"><label>Nome completo<input value={editingTeamUser.name} onChange={(event) => setEditingTeamUser({ ...editingTeamUser, name: event.target.value })} required /></label><label>Usuário de acesso<input value={editingTeamUser.username} onChange={(event) => setEditingTeamUser({ ...editingTeamUser, username: event.target.value })} required /></label></div><label>Função<select value={editingTeamUser.role} onChange={(event) => setEditingTeamUser({ ...editingTeamUser, role: event.target.value as DesktopRole })}><option value="admin">Administrador</option><option value="gerente">Gerente</option><option value="caixa">Caixa / atendente</option><option value="garcom">Garçom</option><option value="cozinha">Cozinha</option><option value="entregador">Entregador</option></select></label><div className="form-row"><label>{editingTeamUser.id ? "Nova senha (opcional)" : "Senha inicial"}<input type="password" value={editingTeamUser.password} onChange={(event) => setEditingTeamUser({ ...editingTeamUser, password: event.target.value })} required={!editingTeamUser.id} /></label><label>PIN gerencial <small>opcional</small><input type="password" inputMode="numeric" maxLength={8} value={editingTeamUser.pin} onChange={(event) => setEditingTeamUser({ ...editingTeamUser, pin: event.target.value.replace(/\D/g, "") })} disabled={!['admin','gerente'].includes(editingTeamUser.role)} /></label></div>{editingTeamUser.id && <label className="featured-choice"><input type="checkbox" checked={editingTeamUser.active !== false} onChange={(event) => setEditingTeamUser({ ...editingTeamUser, active: event.target.checked })} /> Usuário ativo</label>}<div className="role-permission-preview"><strong>Permissões da função</strong><p>{editingTeamUser.role === "admin" ? "Acesso completo ao sistema." : editingTeamUser.role === "gerente" ? "Pedidos, cancelamentos, caixa, relatórios e mesas." : editingTeamUser.role === "caixa" ? "Pedidos, recebimentos, caixa e solicitação de cancelamento." : editingTeamUser.role === "garcom" ? "Mesas, comandas e lançamento de pedidos." : editingTeamUser.role === "cozinha" ? "Produção e atualização de preparo." : "Pedidos separados para entrega."}</p></div>{teamError && <p className="form-error">! {teamError}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={() => setEditingTeamUser(null)}>Cancelar</button><button className="primary">Salvar usuário</button></div></form></div>}
      {modal === "manager-local" && cancellingOrder && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><form className="modal small-modal manager-pin-modal" onSubmit={confirmLocalOrderCancellation} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><small>AUTORIZAÇÃO LOCAL</small><h2>Gerente ou administrador</h2></div><button type="button" onClick={() => setModal(null)}>×</button></div><div className="manager-lock">🔒</div><p className="helper">O gerente deve informar seu próprio usuário e senha ou PIN. A autorização funciona sem internet.</p><label>Usuário gerencial<input value={localManagerCredentials.username} onChange={(event) => setLocalManagerCredentials({ ...localManagerCredentials, username: event.target.value })} autoFocus /></label><label>Senha ou PIN<input type="password" value={localManagerCredentials.secret} onChange={(event) => setLocalManagerCredentials({ ...localManagerCredentials, secret: event.target.value })} /></label>{managerAuthorizationError && <p className="form-error">! {managerAuthorizationError}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={() => setModal("cancel-order")}>Voltar</button><button className="danger-action" disabled={managerAuthorizationSaving}>{managerAuthorizationSaving ? "Autorizando..." : "Autorizar cancelamento"}</button></div></form></div>}
      {editingCustomer && <div className="modal-backdrop" onMouseDown={() => setEditingCustomer(null)}><form className="modal customer-modal" onSubmit={saveCustomerRecord} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><small>CLIENTE</small><h2>{customers.some((item) => item.id === editingCustomer.id) ? "Editar cliente" : "Novo cliente"}</h2></div><button type="button" onClick={() => setEditingCustomer(null)}>×</button></div><div className="form-row"><label>Nome completo<input value={editingCustomer.name} onChange={(event) => setEditingCustomer({ ...editingCustomer, name: event.target.value })} required /></label><label>Telefone / WhatsApp<input value={editingCustomer.phone} onChange={(event) => setEditingCustomer({ ...editingCustomer, phone: event.target.value })} required /></label></div><label>Rua ou avenida<input value={editingCustomer.street || ""} onChange={(event) => setEditingCustomer({ ...editingCustomer, street: event.target.value })} /></label><div className="form-row"><label>Número<input value={editingCustomer.number || ""} onChange={(event) => setEditingCustomer({ ...editingCustomer, number: event.target.value })} /></label><label>Bairro<input value={editingCustomer.neighborhood || ""} onChange={(event) => setEditingCustomer({ ...editingCustomer, neighborhood: event.target.value })} /></label></div><label>Complemento / referência<input value={editingCustomer.complement || ""} onChange={(event) => setEditingCustomer({ ...editingCustomer, complement: event.target.value })} /></label><label>Observações internas<textarea value={editingCustomer.notes || ""} onChange={(event) => setEditingCustomer({ ...editingCustomer, notes: event.target.value })} /></label><div className="modal-actions"><button type="button" className="secondary" onClick={() => setEditingCustomer(null)}>Cancelar</button><button className="primary">Salvar cliente</button></div></form></div>}
      {toast && <div className="toast">✓ {toast}</div>}
    </main>
  );
}
