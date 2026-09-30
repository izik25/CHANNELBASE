import { GetObjectCommand, DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createLogger } from "@channelbase/logger";
import type { StorageProvider, StorageUploadParams } from "../interfaces.js";

const log = createLogger("storage:s3");

export interface S3StorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  publicBaseUrl?: string;
}

/**
 * S3-compatible storage adapter. Works against AWS S3 as-is; for MinIO or any
 * other S3-compatible provider set S3_ENDPOINT + S3_FORCE_PATH_STYLE=true.
 */
export class S3StorageProvider implements StorageProvider {
  readonly name = "s3-storage";
  readonly isMock = false;
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async upload({ key, body, contentType }: StorageUploadParams): Promise<{ key: string; url: string }> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    log.debug({ key, contentType, bytes: body.byteLength }, "uploaded asset to s3");
    const url = this.config.publicBaseUrl
      ? `${this.config.publicBaseUrl.replace(/\/$/, "")}/${key}`
      : await this.createSignedUrl(key);
    return { key, url };
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    return Buffer.from(bytes ?? []);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  async createSignedUrl(key: string, expiresSeconds = 3600): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.config.bucket, Key: key }), {
      expiresIn: expiresSeconds,
    });
  }
}
