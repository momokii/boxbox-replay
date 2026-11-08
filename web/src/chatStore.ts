/**
 * Per-session chat, kept in sessionStorage: survives a reload in the same tab,
 * disappears when the tab closes, and never touches the server. A Clear button
 * wipes it, which matters on a public deployment.
 */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  grounded_on?: string[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const CHAT_MAX = 20;

export function chatKey(session: number): string {
  return `boxbox.chat.${session}`;
}

function store(fallback?: StorageLike): StorageLike | null {
  if (fallback) return fallback;
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    (item.role === "user" || item.role === "assistant") &&
    typeof item.content === "string" &&
    item.content.length > 0
  );
}

export function parseChat(raw: string | null): ChatMessage[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMessage).slice(-CHAT_MAX);
  } catch {
    return [];
  }
}

export function loadChat(session: number, fallback?: StorageLike): ChatMessage[] {
  const s = store(fallback);
  if (!s) return [];
  try {
    return parseChat(s.getItem(chatKey(session)));
  } catch {
    return [];
  }
}

export function saveChat(
  session: number,
  messages: ChatMessage[],
  fallback?: StorageLike,
): ChatMessage[] {
  const trimmed = messages.slice(-CHAT_MAX);
  const s = store(fallback);
  if (s) {
    try {
      s.setItem(chatKey(session), JSON.stringify(trimmed));
    } catch {
      // Quota or private mode: the chat still works in memory.
    }
  }
  return trimmed;
}

export function clearChat(session: number, fallback?: StorageLike): void {
  const s = store(fallback);
  if (!s) return;
  try {
    s.removeItem(chatKey(session));
  } catch {
    // ignore
  }
}
