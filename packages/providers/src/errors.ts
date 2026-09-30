/**
 * Thrown by adapter stubs that have a defined interface and registration
 * point but no working implementation yet because it depends on a real
 * provider account/API whose exact contract we won't fabricate. Each stub's
 * doc comment states exactly what's needed to turn it into a real adapter.
 */
export class ProviderNotConfiguredError extends Error {
  constructor(providerName: string, instructions: string) {
    super(`Provider "${providerName}" is not configured yet. ${instructions}`);
    this.name = "ProviderNotConfiguredError";
  }
}

export class ProviderRequestError extends Error {
  constructor(
    public readonly providerName: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[${providerName}] ${message}`);
    this.name = "ProviderRequestError";
  }
}
