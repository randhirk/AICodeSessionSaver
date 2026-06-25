import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

export function fileFingerprint(path: string): string {
  const stat = statSync(path);
  return createHash("sha256")
    .update(`${path}:${stat.size}:${stat.mtimeMs}`)
    .digest("hex")
    .slice(0, 16);
}

export function safeJsonParse<T>(line: string): T | null {
  try {
    return JSON.parse(line) as T;
  } catch {
    return null;
  }
}

export function readJsonl<T>(path: string): T[] {
  const content = readFileSync(path, "utf8");
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => safeJsonParse<T>(line))
    .filter((item): item is T => item !== null);
}

export function stripXmlTags(text: string): string {
  return text
    .replace(/<user_query>/g, "")
    .replace(/<\/user_query>/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export function toIsoDate(input: string | number | Date | undefined, fallback?: Date): string {
  if (input === undefined) {
    return (fallback ?? new Date()).toISOString();
  }
  if (typeof input === "number") {
    return new Date(input).toISOString();
  }
  if (input instanceof Date) {
    return input.toISOString();
  }
  const parsed = Date.parse(input);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }
  return (fallback ?? new Date()).toISOString();
}
