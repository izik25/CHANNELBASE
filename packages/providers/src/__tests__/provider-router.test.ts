import { describe, expect, it, vi } from "vitest";
import { ProviderRouter, type ProviderRegistry } from "../router/provider-router.js";
import type { LLMProvider } from "../interfaces.js";

function fakeLLM(name: string, behavior: "succeed" | "fail"): LLMProvider {
  return {
    name,
    isMock: name.startsWith("mock"),
    generateText: vi.fn(async () => {
      if (behavior === "fail") throw new Error(`${name} is down`);
      return `response from ${name}`;
    }),
    generateStructured: vi.fn(async () => {
      if (behavior === "fail") throw new Error(`${name} is down`);
      return {} as never;
    }),
    analyze: vi.fn(async () => "ok"),
  };
}

function buildRegistry(overrides: Partial<ProviderRegistry> = {}): ProviderRegistry {
  return {
    llm: new Map(),
    image: new Map(),
    video: new Map(),
    voice: new Map(),
    music: new Map(),
    publishing: new Map(),
    storage: {} as never,
    billing: {} as never,
    ...overrides,
  };
}

describe("ProviderRouter", () => {
  it("uses the first provider in the chain when it succeeds", async () => {
    const primary = fakeLLM("primary", "succeed");
    const fallback = fakeLLM("mock-llm", "succeed");
    const registry = buildRegistry({ llm: new Map([["primary", primary], ["mock-llm", fallback]]) });
    const router = new ProviderRouter(registry, () => ["primary", "mock-llm"]);

    const { result, provider, attempts } = await router.generateText({ prompt: "hi" });

    expect(provider).toBe("primary");
    expect(result).toBe("response from primary");
    expect(attempts).toHaveLength(0);
    expect(fallback.generateText).not.toHaveBeenCalled();
  });

  it("falls back to the next provider when the first fails", async () => {
    const primary = fakeLLM("primary", "fail");
    const fallback = fakeLLM("mock-llm", "succeed");
    const registry = buildRegistry({ llm: new Map([["primary", primary], ["mock-llm", fallback]]) });
    const router = new ProviderRouter(registry, () => ["primary", "mock-llm"]);

    const { result, provider, attempts } = await router.generateText({ prompt: "hi" });

    expect(provider).toBe("mock-llm");
    expect(result).toBe("response from mock-llm");
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.provider).toBe("primary");
  });

  it("throws when every provider in the chain fails", async () => {
    const primary = fakeLLM("primary", "fail");
    const registry = buildRegistry({ llm: new Map([["primary", primary]]) });
    const router = new ProviderRouter(registry, () => ["primary"]);

    await expect(router.generateText({ prompt: "hi" })).rejects.toThrow(/All providers in the "llm" chain failed/);
  });

  it("throws a clear error when the category has no configured providers", async () => {
    const registry = buildRegistry();
    const router = new ProviderRouter(registry, () => []);
    await expect(router.generateText({ prompt: "hi" })).rejects.toThrow(/No providers configured/);
  });
});
