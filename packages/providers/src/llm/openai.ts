import { ProviderNotConfiguredError } from "../errors.js";
import type { AnalyzeParams, GenerateStructuredParams, GenerateTextParams, LLMProvider } from "../interfaces.js";

/**
 * STUB — OpenAI Chat Completions adapter.
 *
 * To activate:
 *   1. `pnpm add openai --filter @channelbase/providers`
 *   2. Implement generateText using `client.chat.completions.create(...)`.
 *   3. Implement generateStructured using OpenAI's `response_format: { type: "json_schema" }`
 *      (see https://platform.openai.com/docs/guides/structured-outputs) and validate the
 *      result against the caller's Zod schema.
 *   4. Set LLM_PROVIDER=openai and LLM_API_KEY in .env, register this class in
 *      packages/providers/src/router/registry.ts.
 *
 * Until then, set LLM_PROVIDER=anthropic (implemented, see ./anthropic.ts) or leave
 * LLM_PROVIDER=mock to keep running fully offline.
 */
export class OpenAILLMProvider implements LLMProvider {
  readonly name = "openai";
  readonly isMock = false;

  constructor(private readonly apiKey: string) {}

  private notConfigured(): never {
    throw new ProviderNotConfiguredError(
      this.name,
      "Implement packages/providers/src/llm/openai.ts using the `openai` SDK before selecting LLM_PROVIDER=openai.",
    );
  }

  async generateText(_params: GenerateTextParams): Promise<string> {
    return this.notConfigured();
  }

  async generateStructured<T>(_params: GenerateStructuredParams<T>): Promise<T> {
    return this.notConfigured();
  }

  async analyze(_params: AnalyzeParams): Promise<string> {
    return this.notConfigured();
  }
}
