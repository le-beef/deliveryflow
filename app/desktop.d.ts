export {};

declare global {
  type DesktopRole = "admin" | "gerente" | "caixa" | "garcom" | "cozinha" | "entregador";
  type DesktopUser = { id: string; name: string; username: string; role: DesktopRole; active: boolean; mustChangePassword: boolean; permissions: string[] };
  interface Window {
    deliveryflowDesktop?: {
      platform: "windows";
      networkInfo(): Promise<{ mode: "server" | "terminal"; configured: boolean; terminalId: string; terminalName: string; serverHost: string; serverPort: number; lanAddresses?: string[]; waiterUrls?: string[] }>;
      configureNetwork(payload: { terminalName: string; serverHost: string; serverPort: number }): Promise<Record<string, unknown>>;
      testNetwork(payload: { terminalName?: string; serverHost: string; serverPort: number }): Promise<{ ok: boolean }>;
      launchNetwork(): Promise<void>;
      networkSnapshot(): Promise<{ orders: Array<Record<string, unknown>>; products: Array<Record<string, unknown>>; categories: Array<Record<string, unknown>>; serviceUnits: Array<Record<string, unknown>>; customers: Array<Record<string, unknown>>; settings: Array<Record<string, unknown>>; terminals: Array<{ id: string; name: string; address: string; lastSeen: number; active: boolean }>; serverTime: number }>;
      saveNetworkEntity(payload: { entityType: string; entityId: string; data: unknown }): Promise<unknown>;
      deleteNetworkEntity(payload: { entityType: string; entityId: string }): Promise<void>;
      login(credentials: { username: string; password: string }): Promise<DesktopUser>;
      loadRememberedLogin(): Promise<{ username: string; password: string } | null>;
      saveRememberedLogin(credentials: { username: string; password: string }): Promise<{ saved: boolean; username: string }>;
      clearRememberedLogin(): Promise<{ saved: boolean }>;
      listUsers(): Promise<DesktopUser[]>;
      saveUser(payload: { actorId: string; user: Partial<DesktopUser> & { name: string; username: string; role: DesktopRole; password?: string; pin?: string } }): Promise<DesktopUser>;
      deleteUser(payload: { actorId: string; userId: string }): Promise<void>;
      authorizeManager(payload: { username: string; secret: string }): Promise<DesktopUser>;
      listAudit(): Promise<Array<Record<string, unknown>>>;
      enqueueSync(payload: { operation: string; entityType: string; entityId: string; data: unknown }): Promise<void>;
      pendingSync(): Promise<Array<Record<string, unknown>>>;
      markSynced(syncId: string): Promise<void>;
      currentCash(): Promise<import("./firebase").CashRegister | null>;
      openCash(payload: { actorId: string; openingAmount: number; openingNote: string }): Promise<import("./firebase").CashRegister>;
      closeCash(payload: { actorId: string; cash: import("./firebase").CashRegister }): Promise<import("./firebase").CashRegister>;
      addCashMovement(payload: { actorId: string; sessionId: string; type: "sangria" | "suprimento"; amount: number; reason: string }): Promise<import("./firebase").CashMovement>;
      listCashMovements(sessionId: string): Promise<import("./firebase").CashMovement[]>;
      listCashSessions(): Promise<import("./firebase").CashRegister[]>;
    };
  }
}
