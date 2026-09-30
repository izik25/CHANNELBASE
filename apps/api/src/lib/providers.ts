import { createDefaultProviderRouter } from "@channelbase/providers";

/** Single ProviderRouter instance for the API process (billing checks, admin provider listing). Generation work itself always happens in the worker. */
export const providerRouter = createDefaultProviderRouter();
