import { promises as fs } from "node:fs";
import path from "node:path";
import { createLogger } from "@channelbase/logger";
import type { StorageProvider, StorageUploadParams } from "../interfaces.js";

const log = createLogger("storage:local");

/**
 * Development-only storage adapter that writes to disk under `basePath`.
 * `createSignedUrl` just returns a static file:// style URL served by the
 * API's /storage static route (see apps/api) — there is no real signing
 * since there's nothing to protect on a local filesystem.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = "local-storage";
  readonly isMock = false;

  constructor(
    private readonly basePath: string,
    private readonly publicBaseUrl: string,
  ) {}

  private resolvePath(key: string): string {
    const safeKey = key.replace(/\.\./g, "");
    return path.join(this.basePath, safeKey);
  }

  async upload({ key, body, contentType }: StorageUploadParams): Promise<{ key: string; url: string }> {
    const filePath = this.resolvePath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, body);
    log.debug({ key, contentType, bytes: body.byteLength }, "wrote local asset");
    return { key, url: `${this.publicBaseUrl.replace(/\/$/, "")}/${key}` };
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolvePath(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolvePath(key), { force: true });
  }

  async createSignedUrl(key: string): Promise<string> {
    return `${this.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }
}
