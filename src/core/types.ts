import { z } from "zod";

export const ProviderSchema = z.enum([
  "claude-code",
  "cursor",
  "codex",
  "aider",
  "unknown",
]);
export type Provider = z.infer<typeof ProviderSchema>;

export const MessageRoleSchema = z.enum([
  "user",
  "assistant",
  "system",
  "tool",
]);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const SessionMessageSchema = z.object({
  id: z.string(),
  role: MessageRoleSchema,
  content: z.string(),
  timestamp: z.string().datetime().optional(),
  toolName: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type SessionMessage = z.infer<typeof SessionMessageSchema>;

export const SessionConnectionSchema = z.object({
  type: z.enum(["parent", "child", "fork", "related"]),
  sessionId: z.string(),
  provider: ProviderSchema,
  label: z.string().optional(),
});
export type SessionConnection = z.infer<typeof SessionConnectionSchema>;

export const UnifiedSessionSchema = z.object({
  id: z.string(),
  provider: ProviderSchema,
  title: z.string(),
  projectPath: z.string().optional(),
  cwd: z.string().optional(),
  model: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  messageCount: z.number().int().nonnegative(),
  messages: z.array(SessionMessageSchema),
  connections: z.array(SessionConnectionSchema).default([]),
  resumeHint: z
    .object({
      command: z.string().optional(),
      sessionId: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  source: z.object({
    paths: z.array(z.string()),
    fingerprint: z.string().optional(),
  }),
});
export type UnifiedSession = z.infer<typeof UnifiedSessionSchema>;

export const AissBundleSchema = z.object({
  format: z.literal("aiss"),
  version: z.literal(1),
  encodedAt: z.string().datetime(),
  session: UnifiedSessionSchema,
  raw: z
    .record(
      z.object({
        encoding: z.enum(["utf8", "base64"]),
        content: z.string(),
      }),
    )
    .default({}),
  checksum: z.string(),
});
export type AissBundle = z.infer<typeof AissBundleSchema>;

export interface SessionAdapter {
  readonly provider: Provider;
  readonly name: string;
  isAvailable(): boolean;
  discoverSessions(): Promise<UnifiedSession[]>;
  watchPaths(): string[];
}

export interface IndexRecord {
  id: string;
  provider: Provider;
  title: string;
  projectPath: string | null;
  cwd: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  sourcePaths: string;
  bundlePath: string | null;
  fingerprint: string | null;
}
