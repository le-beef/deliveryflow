import { getApp, getApps, initializeApp } from "firebase/app";
import { GoogleAuthProvider, createUserWithEmailAndPassword, getAuth, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signInWithPopup, signOut, type User } from "firebase/auth";
import { get, getDatabase, onValue, push, ref, remove, set, update } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCeOmMugVRuf0UaWXJ7kO3bctQ3x80ybjI",
  authDomain: "deliveryflow-f0e3e.firebaseapp.com",
  databaseURL: "https://deliveryflow-f0e3e-default-rtdb.firebaseio.com",
  projectId: "deliveryflow-f0e3e",
  storageBucket: "deliveryflow-f0e3e.firebasestorage.app",
  messagingSenderId: "422150569633",
  appId: "1:422150569633:web:edaed912569bda40bdbae0",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);
export const ADMIN_EMAIL = "albano.tiago.esteves@gmail.com";

export function watchAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function loginAdmin() {
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  if (result.user.email !== ADMIN_EMAIL) {
    await signOut(auth);
    throw new Error("Esta conta não possui acesso administrativo.");
  }
  return result.user;
}

export function logoutAdmin() {
  return signOut(auth);
}

export function loginStaff(email: string, password: string) { return signInWithEmailAndPassword(auth, email, password); }
export function logoutStaff() { return signOut(auth); }
export function watchStaffProfile<T>(uid: string, callback: (profile: T | null) => void) { return onValue(ref(database, `staffProfiles/${uid}`), (snapshot) => callback(snapshot.exists() ? snapshot.val() as T : null)); }

export async function createOnlineStaff(profile: { name: string; email: string; role: "garcom" | "cozinha" | "entregador"; password: string }) {
  if (auth.currentUser?.email !== ADMIN_EMAIL) throw new Error("Somente o administrador pode cadastrar acesso online.");
  const staffApp = getApps().find((candidate) => candidate.name === "staff-creator") || initializeApp(firebaseConfig, "staff-creator");
  const staffAuth = getAuth(staffApp);
  const credential = await createUserWithEmailAndPassword(staffAuth, profile.email, profile.password);
  await set(ref(database, `staffProfiles/${credential.user.uid}`), { name: profile.name, email: profile.email, role: profile.role, active: true, createdAt: Date.now(), createdBy: auth.currentUser.uid });
  await signOut(staffAuth);
  return credential.user.uid;
}

export async function ensureAnonymousUser() {
  if (auth.currentUser) return auth.currentUser;
  return (await signInAnonymously(auth)).user;
}

export function watchProducts<T>(callback: (products: T[] | null) => void) {
  return onValue(ref(database, "products"), (snapshot) => {
    callback(snapshot.exists() ? Object.values(snapshot.val() as Record<string, T>) : null);
  });
}

export function watchBusinessSettings<T>(callback: (settings: T | null) => void) {
  return onValue(ref(database, "settings/business"), (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() as T : null);
  });
}

export async function saveBusinessSettings<T>(settings: T) {
  await set(ref(database, "settings/business"), settings);
}

export function watchStoreSettings<T>(callback: (settings: T | null) => void) {
  return onValue(ref(database, "settings/store"), (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() as T : null);
  });
}

export async function saveStoreSettings<T>(settings: T) {
  await set(ref(database, "settings/store"), settings);
}

export function watchServiceUnits<T>(callback: (units: T[] | null) => void) {
  return onValue(ref(database, "settings/serviceUnits"), (snapshot) => {
    callback(snapshot.exists() ? Object.values(snapshot.val() as Record<string, T>) : null);
  });
}

export async function saveServiceUnits<T>(units: T[]) {
  await set(ref(database, "settings/serviceUnits"), units);
}

export function watchCategories(callback: (categories: string[] | null) => void) {
  return onValue(ref(database, "settings/categories"), (snapshot) => {
    callback(snapshot.exists() ? Object.values(snapshot.val() as Record<string, string>) : null);
  });
}

export async function saveCategories(categories: string[]) {
  await set(ref(database, "settings/categories"), categories);
}

export function watchOrders<T extends object>(callback: (orders: Array<T & { firebaseKey: string }>) => void) {
  return onValue(ref(database, "orders"), (snapshot) => {
    const value = snapshot.val() as Record<string, T> | null;
    callback(value ? Object.entries(value).map(([firebaseKey, order]) => ({ ...order, firebaseKey })) : []);
  });
}

export async function saveProduct<T extends { id: number }>(product: T) {
  await set(ref(database, `products/${product.id}`), product);
}

export async function deleteProduct(productId: number) {
  await remove(ref(database, `products/${productId}`));
}

export async function seedProducts<T extends { id: number }>(products: T[]) {
  const payload = Object.fromEntries(products.map((product) => [product.id, product]));
  await set(ref(database, "products"), payload);
}

export async function submitOrder<T extends object>(order: T) {
  const user = await ensureAnonymousUser();
  const orderRef = push(ref(database, "orders"));
  // O Realtime Database rejeita qualquer campo com valor `undefined`.
  // Pedidos de mesa, retirada e delivery possuem campos opcionais diferentes,
  // então removemos apenas os campos ausentes antes de gravar.
  const cleanOrder = JSON.parse(JSON.stringify(order)) as T;
  await set(orderRef, { ...cleanOrder, createdBy: user.uid, createdAt: Date.now() });
  return orderRef.key;
}

export async function setOrderStatus(firebaseKey: string, status: string) {
  await update(ref(database, `orders/${firebaseKey}`), { status, updatedAt: Date.now() });
}

export async function settleOrder(firebaseKey: string, payment: {
  paymentMethod: string;
  paidAmount: number;
  change: number;
  paidAt: number;
  cashSessionId: string;
}) {
  await update(ref(database, `orders/${firebaseKey}`), {
    ...payment,
    status: "concluido",
    updatedAt: Date.now(),
  });
}

export async function updateOrder<T extends object>(firebaseKey: string, changes: T) {
  await update(ref(database, `orders/${firebaseKey}`), { ...changes, updatedAt: Date.now() });
}

export async function applyQueuedOrderMutation(operation: string, firebaseKey: string, payload: Record<string, unknown>) {
  if (auth.currentUser?.email !== ADMIN_EMAIL) throw new Error("Sincronização aguardando conexão administrativa.");
  if (operation === "delete") return remove(ref(database, `orders/${firebaseKey}`));
  if (operation === "create") return set(ref(database, `orders/${firebaseKey}`), { ...payload, createdBy: auth.currentUser.uid, createdAt: payload.createdAt || Date.now() });
  return update(ref(database, `orders/${firebaseKey}`), { ...payload, updatedAt: Date.now() });
}

async function withManagerAuthorization<T>(action: (managerDatabase: ReturnType<typeof getDatabase>, manager: User) => Promise<T>) {
  const managerApp = getApps().find((candidate) => candidate.name === "manager-authorization") || initializeApp(firebaseConfig, "manager-authorization");
  const managerAuth = getAuth(managerApp);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const credential = await signInWithPopup(managerAuth, provider);
  if (credential.user.email !== ADMIN_EMAIL) {
    await signOut(managerAuth);
    throw new Error("Esta conta não possui autorização gerencial.");
  }
  try {
    return await action(getDatabase(managerApp), credential.user);
  } finally {
    await signOut(managerAuth);
  }
}

export async function cancelOrderWithManagerGoogle(payload: { firebaseKey: string; reason: string; note?: string; requestedBy?: string }) {
  return withManagerAuthorization(async (managerDatabase, manager) => {
    const orderRef = ref(managerDatabase, `orders/${payload.firebaseKey}`);
    const snapshot = await get(orderRef);
    if (!snapshot.exists()) throw new Error("Pedido não encontrado.");
    const order = snapshot.val() as Record<string, unknown>;
    if (order.status === "concluido" || order.paymentMethod) throw new Error("Pedido pago precisa ser estornado antes do cancelamento.");
    if (order.status === "cancelado") throw new Error("Este pedido já foi cancelado.");
    const cancellation = { status: "cancelado", previousStatus: order.status, cancellationReason: payload.reason.trim(), cancellationNote: payload.note?.trim() || "", cancelledAt: Date.now(), cancelledByEmail: payload.requestedBy || auth.currentUser?.email || "operador", authorizedBy: manager.email || ADMIN_EMAIL, cancelledServiceUnitId: order.serviceUnitId || null, serviceUnitId: null, updatedAt: Date.now() };
    await update(orderRef, cancellation);
    await set(push(ref(managerDatabase, "audit/orderActions")), { action: "cancel", firebaseKey: payload.firebaseKey, orderId: order.id, ...cancellation });
    return { cancellation };
  });
}

export async function deleteOrderWithManagerGoogle(firebaseKey: string) {
  return withManagerAuthorization(async (managerDatabase, manager) => {
    const orderRef = ref(managerDatabase, `orders/${firebaseKey}`);
    const snapshot = await get(orderRef);
    if (!snapshot.exists()) throw new Error("Pedido não encontrado.");
    const order = snapshot.val() as Record<string, unknown>;
    if (order.paymentMethod && !order.refundedAt) throw new Error("Registre o estorno antes de excluir um pedido pago.");
    await set(push(ref(managerDatabase, "audit/orderActions")), { action: "delete", firebaseKey, orderId: order.id, deletedAt: Date.now(), deletedBy: manager.uid, deletedByEmail: manager.email, orderSnapshot: order });
    await remove(orderRef);
    return { ok: true };
  });
}

export async function createOnlineStaffWithManagerGoogle(profile: { name: string; email: string; role: "garcom" | "cozinha" | "entregador"; password: string }) {
  return withManagerAuthorization(async (managerDatabase, manager) => {
    const creatorApp = getApps().find((candidate) => candidate.name === "online-staff-creator") || initializeApp(firebaseConfig, "online-staff-creator");
    const creatorAuth = getAuth(creatorApp);
    const credential = await createUserWithEmailAndPassword(creatorAuth, profile.email, profile.password);
    await set(ref(managerDatabase, `staffProfiles/${credential.user.uid}`), { name: profile.name, email: profile.email, role: profile.role, active: true, createdAt: Date.now(), createdBy: manager.uid });
    await signOut(creatorAuth);
    return credential.user.uid;
  });
}

export type CashRegister = {
  sessionId: string;
  status: "open" | "closed";
  openingAmount: number;
  openingNote?: string;
  openedAt: number;
  openedBy: string;
  openedByName: string;
  closedAt?: number;
  closedBy?: string;
  closingAmount?: number;
  closingNote?: string;
  expectedCash?: number;
  difference?: number;
  paymentTotals?: Record<string, number>;
  declaredPaymentTotals?: Record<string, number>;
  paymentDifferences?: Record<string, number>;
  orderCount?: number;
  salesTotal?: number;
  closedByName?: string;
};

export type CashMovement = {
  id: string;
  sessionId: string;
  type: "sangria" | "suprimento";
  amount: number;
  reason: string;
  createdAt: number;
  createdBy: string;
  createdByName: string;
};

export function watchCashRegister(callback: (cashRegister: CashRegister | null) => void) {
  return onValue(ref(database, "cash/current"), (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() as CashRegister : null);
  });
}

export async function openCashRegister(openingAmount: number, user: User, openingNote = "") {
  const sessionRef = push(ref(database, "cash/sessions"));
  if (!sessionRef.key) throw new Error("Nao foi possivel criar a sessao do caixa.");
  const cashRegister: CashRegister = {
    sessionId: sessionRef.key,
    status: "open",
    openingAmount,
    openingNote,
    openedAt: Date.now(),
    openedBy: user.uid,
    openedByName: user.displayName || user.email || "Administrador",
  };
  await set(sessionRef, cashRegister);
  await set(ref(database, "cash/current"), cashRegister);
  return cashRegister;
}

export async function closeCashRegister(cashRegister: CashRegister, closingAmount: number, user: User, summary: Partial<CashRegister> = {}) {
  const closed: CashRegister = {
    ...cashRegister,
    status: "closed",
    closingAmount,
    ...summary,
    closedAt: Date.now(),
    closedBy: user.uid,
    closedByName: user.displayName || user.email || "Administrador",
  };
  await update(ref(database, `cash/sessions/${cashRegister.sessionId}`), closed);
  await set(ref(database, "cash/current"), closed);
  return closed;
}

export function watchCashSessions(callback: (sessions: CashRegister[]) => void) {
  return onValue(ref(database, "cash/sessions"), (snapshot) => {
    callback(snapshot.exists() ? Object.values(snapshot.val() as Record<string, CashRegister>).sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0)) : []);
  });
}

export function watchCashMovements(callback: (movements: CashMovement[]) => void) {
  return onValue(ref(database, "cash/movements"), (snapshot) => {
    callback(snapshot.exists() ? Object.values(snapshot.val() as Record<string, CashMovement>).sort((a, b) => b.createdAt - a.createdAt) : []);
  });
}

export async function addCashMovement(sessionId: string, type: CashMovement["type"], amount: number, reason: string, user: User) {
  const movementRef = push(ref(database, "cash/movements"));
  if (!movementRef.key) throw new Error("Não foi possível criar a movimentação.");
  const movement: CashMovement = {
    id: movementRef.key,
    sessionId,
    type,
    amount,
    reason,
    createdAt: Date.now(),
    createdBy: user.uid,
    createdByName: user.displayName || user.email || "Administrador",
  };
  await set(movementRef, movement);
  return movement;
}
