import { describe, expect, it } from "vitest";
import {
  CHAT_MAX,
  clearChat,
  loadChat,
  parseChat,
  saveChat,
  type ChatMessage,
  type StorageLike,
} from "./chatStore";

function fakeStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

const turn = (role: "user" | "assistant", content: string): ChatMessage => ({ role, content });

describe("parseChat", () => {
  it("rejects broken data and bad roles, and keeps the most recent turns", () => {
    expect(parseChat("{oops")).toEqual([]);
    expect(parseChat('{"role":"user"}')).toEqual([]);
    expect(parseChat(JSON.stringify([turn("user", "hi"), { role: "system", content: "x" }]))).toEqual([
      turn("user", "hi"),
    ]);
    const many = Array.from({ length: 30 }, (_, i) => turn("user", `q${i}`));
    const parsed = parseChat(JSON.stringify(many));
    expect(parsed).toHaveLength(CHAT_MAX);
    expect(parsed[CHAT_MAX - 1].content).toBe("q29");
  });
});

describe("per-session chat", () => {
  it("stores independently per session and loads it back", () => {
    const store = fakeStorage();
    saveChat(1, [turn("user", "one")], store);
    saveChat(2, [turn("user", "two")], store);
    expect(loadChat(1, store)[0].content).toBe("one");
    expect(loadChat(2, store)[0].content).toBe("two");
  });

  it("clears only the requested session", () => {
    const store = fakeStorage();
    saveChat(1, [turn("user", "one")], store);
    saveChat(2, [turn("user", "two")], store);
    clearChat(1, store);
    expect(loadChat(1, store)).toEqual([]);
    expect(loadChat(2, store)).toHaveLength(1);
  });

  it("survives storage that throws", () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadChat(1, broken)).toEqual([]);
    expect(saveChat(1, [turn("user", "x")], broken)).toHaveLength(1);
    expect(() => clearChat(1, broken)).not.toThrow();
  });
});
