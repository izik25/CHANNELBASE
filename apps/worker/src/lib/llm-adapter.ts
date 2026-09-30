import type { LLMProvider, ProviderRouter, AnalyzeParams, GenerateStructuredParams, GenerateTextParams } from "@channelbase/providers";

/**
 * Adapts a ProviderRouter (which returns { result, provider, attempts })
 * into the plain LLMProvider interface that packages/channel-brain's
 * engines expect. Keeps channel-brain decoupled from the router/registry —
 * it only ever sees "an LLMProvider", never knows fallback happened.
 */
export class RouterBackedLLMProvider implements LLMProvider {
  readonly name = "provider-router";
  readonly isMock = false;

  constructor(private readonly router: ProviderRouter) {}

  async generateText(params: GenerateTextParams): Promise<string> {
    return (await this.router.generateText(params)).result;
  }

  async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T> {
    return (await this.router.generateStructured(params)).result;
  }

  async analyze(params: AnalyzeParams): Promise<string> {
    return (await this.router.analyze(params)).result;
  }
}
