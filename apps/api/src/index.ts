import { env } from "@channelbase/config";
import { createLogger } from "@channelbase/logger";
import { buildServer } from "./app.js";

const log = createLogger("api:bootstrap");

async function main() {
  const app = await buildServer();
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
  log.info({ port: env.API_PORT }, `API listening on http://localhost:${env.API_PORT}`);
}

main().catch((err) => {
  log.error({ err }, "failed to start API server");
  process.exit(1);
});
