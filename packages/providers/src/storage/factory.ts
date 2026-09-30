import { env } from "@channelbase/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StorageProvider } from "../interfaces.js";
import { LocalStorageProvider } from "./local.js";
import { S3StorageProvider } from "./s3.js";

// This file always lives at <repo-root>/packages/providers/src/storage/factory.ts,
// so walking up from its own location gives a stable repo root regardless of which
// process (apps/api, apps/worker, ...) imported it — see resolveLocalStoragePath below.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * Resolves LOCAL_STORAGE_PATH to an absolute path anchored at the monorepo root, NOT at
 * `process.cwd()`. apps/api and apps/worker each run with their own package directory as
 * cwd (pnpm sets it per-filter), so a naive `path.join(process.cwd(), LOCAL_STORAGE_PATH)`
 * resolves to two different directories in the two processes — the worker writes generated
 * assets to apps/worker/storage/local while the API serves static files from
 * apps/api/storage/local, and every asset URL 404s. Anchoring to this file's own location
 * instead guarantees both processes agree on the same directory.
 */
export function resolveLocalStoragePath(): string {
  return path.isAbsolute(env.LOCAL_STORAGE_PATH) ? env.LOCAL_STORAGE_PATH : path.join(REPO_ROOT, env.LOCAL_STORAGE_PATH);
}

/** Builds the configured StorageProvider from env. Defaults to local disk storage. */
export function createStorageProvider(): StorageProvider {
  if (env.STORAGE_DRIVER === "s3") {
    if (!env.S3_BUCKET || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
      throw new Error(
        "STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY to be set. " +
          "Unset STORAGE_DRIVER (or set it to 'local') to use local disk storage instead.",
      );
    }
    return new S3StorageProvider({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      publicBaseUrl: env.S3_PUBLIC_BASE_URL,
    });
  }

  return new LocalStorageProvider(resolveLocalStoragePath(), `${env.API_URL.replace(/\/$/, "")}/storage`);
}
