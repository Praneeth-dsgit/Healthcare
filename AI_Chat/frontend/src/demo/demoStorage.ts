/**
 * localStorage persistence for demo feature state.
 * Survives page refresh during client demos.
 */

const PREFIX = 'acufore_demo_';

export interface DemoStorageState {
  visits: unknown[];
  referrals: unknown[];
  referralNotifications: unknown[];
  networkConnections: string[];
  networkMessages: unknown[];
  feedPosts: unknown[];
  joinedGroups: string[];
  visitAuditLogs: Record<string, unknown[]>;
  visitChatMessages: Record<string, unknown[]>;
  visitSharedDocs: Record<string, unknown[]>;
  signedPrescriptions: string[];
  visitPrescriptions: Record<string, unknown>;
  visitPayments: Record<string, unknown>;
  visitTranscripts: Record<string, unknown[]>;
  seeded: boolean;
}

const DEFAULT_STATE: DemoStorageState = {
  visits: [],
  referrals: [],
  referralNotifications: [],
  networkConnections: [],
  networkMessages: [],
  feedPosts: [],
  joinedGroups: [],
  visitAuditLogs: {},
  visitChatMessages: {},
  visitSharedDocs: {},
  signedPrescriptions: [],
  visitPrescriptions: {},
  visitPayments: {},
  visitTranscripts: {},
  seeded: false,
};

function readRaw(): DemoStorageState {
  try {
    const raw = localStorage.getItem(`${PREFIX}state`);
    if (!raw) return { ...DEFAULT_STATE };
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function writeRaw(state: DemoStorageState): void {
  try {
    localStorage.setItem(`${PREFIX}state`, JSON.stringify(state));
  } catch {
    /* ignore quota errors in demo */
  }
}

export function getDemoState(): DemoStorageState {
  return readRaw();
}

export function updateDemoState(partial: Partial<DemoStorageState>): DemoStorageState {
  const next = { ...readRaw(), ...partial };
  writeRaw(next);
  return next;
}

export function getDemoList<K extends keyof DemoStorageState>(
  key: K
): DemoStorageState[K] extends unknown[] ? DemoStorageState[K] : never {
  return readRaw()[key] as DemoStorageState[K] extends unknown[] ? DemoStorageState[K] : never;
}

export function appendDemoItem<K extends keyof DemoStorageState>(
  key: K,
  item: DemoStorageState[K] extends (infer U)[] ? U : never
): void {
  const state = readRaw();
  const list = [...(state[key] as unknown[]), item];
  writeRaw({ ...state, [key]: list });
}

export function upsertDemoVisitAudit(visitId: string, event: { action: string; at: string; detail?: string }): void {
  const state = readRaw();
  const logs = { ...state.visitAuditLogs };
  logs[visitId] = [...(logs[visitId] || []), event];
  writeRaw({ ...state, visitAuditLogs: logs });
}

export function appendVisitChat(visitId: string, message: { id: string; sender: string; text: string; at: string }): void {
  const state = readRaw();
  const chats = { ...state.visitChatMessages };
  chats[visitId] = [...(chats[visitId] || []), message];
  writeRaw({ ...state, visitChatMessages: chats });
}
