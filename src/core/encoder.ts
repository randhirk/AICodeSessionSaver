import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { AissBundle, AissBundleSchema, UnifiedSession } from "./types.js";

export function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function encodeSession(
  session: UnifiedSession,
  rawFiles: Record<string, { encoding: "utf8" | "base64"; content: string }> = {},
): Buffer {
  const payload = {
    format: "aiss" as const,
    version: 1 as const,
    encodedAt: new Date().toISOString(),
    session,
    raw: rawFiles,
    checksum: "",
  };

  const withoutChecksum = JSON.stringify({ ...payload, checksum: "" });
  payload.checksum = sha256(withoutChecksum);

  const json = JSON.stringify(payload);
  return gzipSync(Buffer.from(json, "utf8"));
}

export function decodeBundle(buffer: Buffer): AissBundle {
  let json: string;
  try {
    json = gunzipSync(buffer).toString("utf8");
  } catch {
    json = buffer.toString("utf8");
  }

  const parsed = JSON.parse(json) as unknown;
  const bundle = AissBundleSchema.parse(parsed);

  const { checksum, ...rest } = bundle;
  const expected = sha256(JSON.stringify({ ...rest, checksum: "" }));
  if (checksum !== expected) {
    throw new Error("Bundle checksum mismatch — file may be corrupted");
  }

  return bundle;
}

export function encodeToBase64(session: UnifiedSession, rawFiles?: Parameters<typeof encodeSession>[1]): string {
  return encodeSession(session, rawFiles).toString("base64");
}

export function decodeFromBase64(encoded: string): AissBundle {
  return decodeBundle(Buffer.from(encoded, "base64"));
}
