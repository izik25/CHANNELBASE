import { prisma } from "@channelbase/database";
import { buildProviderRegistry, createStorageProvider, ProviderRouter, type ChainResolver } from "@channelbase/providers";
import { getDefaultProviderRouting } from "@channelbase/config";
import { createLogger } from "@channelbase/logger";

const log = createLogger("worker:provider-router");

/**
 * DB-backed routing: reads admin-editable ProviderConfig rows (enabled +
 * priority) when present, falling back to the static defaults from
 * @channelbase/config when the table is empty (e.g. before the seed runs).
 * This is what makes the admin "enable/disable provider, change priority"
 * screen actually affect generation, not just display.
 */
function createDbChainResolver(): ChainResolver {
  const defaults = getDefaultProviderRouting();
  return async (category) => {
    try {
      const rows = await prisma.providerConfig.findMany({
        where: { category, enabled: true },
        orderBy: { priority: "asc" },
      });
      if (rows.length > 0) return rows.map((r) => r.providerName);
    } catch (err) {
      log.warn({ err, category }, "failed to read ProviderConfig from DB, using static defaults");
    }
    return defaults.find((r) => r.category === category)?.chain ?? [];
  };
}

export const storage = createStorageProvider();
export const providerRouter = new ProviderRouter(buildProviderRegistry(storage), createDbChainResolver());
