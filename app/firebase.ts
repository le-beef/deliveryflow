import { getApp, getApps, initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInAnonymously, signInWithPopup, signOut, type User } from "firebase/auth";
import { getDatabase, onValue, push, ref, set, update } from "firebase/database";

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

export async function ensureAnonymousUser() {
  if (auth.currentUser) return auth.currentUser;
  return (await signInAnonymously(auth)).user;
}

export function watchProducts<T>(callback: (products: T[] | null) => void) {
  return onValue(ref(database, "products"), (snapshot) => {
    callback(snapshot.exists() ? Object.values(snapshot.val() as Record<string, T>) : null);
  });
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

export async function seedProducts<T extends { id: number }>(products: T[]) {
  const payload = Object.fromEntries(products.map((product) => [product.id, product]));
  await set(ref(database, "products"), payload);
}

export async function submitOrder<T extends object>(order: T) {
  const user = await ensureAnonymousUser();
  const orderRef = push(ref(database, "orders"));
  await set(orderRef, { ...order, createdBy: user.uid, createdAt: Date.now() });
  return orderRef.key;
}

export async function setOrderStatus(firebaseKey: string, status: string) {
  await update(ref(database, `orders/${firebaseKey}`), { status, updatedAt: Date.now() });
}

export type CashRegister = {
  sessionId: string;
  status: "open" | "closed";
  openingAmount: number;
  openedAt: number;
  openedBy: string;
  openedByName: string;
  closedAt?: number;
  closedBy?: string;
  closingAmount?: number;
};

export function watchCashRegister(callback: (cashRegister: CashRegister | null) => void) {
  return onValue(ref(database, "cash/current"), (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() as CashRegister : null);
  });
}

export async function openCashRegister(openingAmount: number, user: User) {
  const sessionRef = push(ref(database, "cash/sessions"));
  if (!sessionRef.key) throw new Error("Nao foi possivel criar a sessao do caixa.");
  const cashRegister: CashRegister = {
    sessionId: sessionRef.key,
    status: "open",
    openingAmount,
    openedAt: Date.now(),
    openedBy: user.uid,
    openedByName: user.displayName || user.email || "Administrador",
  };
  await set(sessionRef, cashRegister);
  await set(ref(database, "cash/current"), cashRegister);
  return cashRegister;
}

export async function closeCashRegister(cashRegister: CashRegister, closingAmount: number, user: User) {
  const closed: CashRegister = {
    ...cashRegister,
    status: "closed",
    closingAmount,
    closedAt: Date.now(),
    closedBy: user.uid,
  };
  await update(ref(database, `cash/sessions/${cashRegister.sessionId}`), closed);
  await set(ref(database, "cash/current"), closed);
  return closed;
}
