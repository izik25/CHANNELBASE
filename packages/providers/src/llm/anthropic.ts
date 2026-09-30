import Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";
import { createLogger } from "@channelbase/logger";
import type { AnalyzeParams, GenerateStructuredParams, GenerateTextParams, LLMProvider } from "../interfaces.js";

const log = createLogger("provider:llm:anthropic");

/**
 * Real LLM adapter backed by the Anthropic Messages API. Activated by
 * setting LLM_PROVIDER=anthropic and LLM_API_KEY in .env — see
 * docs/PROVIDERS.md for the exact steps. Structured output is obtained by
 * instructing the model to return JSON only and validating with the caller's
 * Zod schema, retrying once on parse failure.
 */
export class AnthropicLLMProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly isMock = false;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string = "claude-sonnet-4-5",
  ) {
    if (!apiKey) {
      throw new Error("AnthropicLLMProvider requires an API key. Set LLM_API_KEY in your environment.");
    }
    this.client = new Anthropic({ apiKey });
  }

  async generateText({ systemPrompt, prompt, maxTokens = 2048, temperature = 0.7 }: GenerateTextParams): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
    });
    return extractText(response);
  }

  async analyze({ prompt, data, maxTokens = 1024 }: AnalyzeParams): Promise<string> {
    return this.generateText({
      prompt: `${prompt}\n\nData:\n${JSON.stringify(data, null, 2)}`,
      maxTokens,
    });
  }

  async generateStructured<T>({ systemPrompt, prompt, schema, maxTokens = 4096, temperature = 0.7 }: GenerateStructuredParams<T>): Promise<T> {
    const jsonInstruction =
      "Respond with ONLY a single valid JSON object matching the requested structure. " +
      "Do not include markdown code fences, explanations, or any text outside the JSON object.";

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        temperature,
        system: [systemPrompt, jsonInstruction].filter(Boolean).join("\n\n"),
        messages: [
          {
            role: "user",
            content: attempt === 0 ? prompt : `${prompt}\n\nYour previous response was not valid JSON. Try again, JSON only.`,
          },
        ],
      });
      const text = extractText(response);
      try {
        const parsed = JSON.parse(stripCodeFences(text));
        return (schema as ZodType<T>).parse(parsed);
      } catch (err) {
        lastError = err;
        log.warn({ attempt, err: err instanceof Error ? err.message : err }, "structured generation parse failed, retrying");
      }
    }
    throw new Error(`AnthropicLLMProvider.generateStructured failed after retries: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }
}

function extractText(response: Anthropic.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1]! : trimmed;
}
