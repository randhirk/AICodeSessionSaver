import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  decodeBundle,
  decodeFromBase64,
  encodeSession,
  encodeToBase64,
  sha256,
} from "../src/core/encoder.js";
import type { UnifiedSession } from "../src/core/types.js";

function sampleSession(overrides: Partial<UnifiedSession> = {}): UnifiedSession {
  return {
    id: "sess-test-001",
    provider: "claude-code",
    title: "Sample session",
    projectPath: "/Users/test/demo",
    cwd: "/Users/test/demo",
    model: "claude-sonnet-4",
    createdAt: "2025-01-15T10:00:00.000Z",
    updatedAt: "2025-01-15T10:05:00.000Z",
    messageCount: 2,
    messages: [
      {
        id: "msg-0",
        role: "user",
        content: "Hello",
        timestamp: "2025-01-15T10:00:00.000Z",
      },
      {
        id: "msg-1",
        role: "assistant",
        content: "Hi there",
        timestamp: "2025-01-15T10:00:01.000Z",
      },
    ],
    connections: [],
    source: { paths: ["/tmp/sess-test-001.jsonl"], fingerprint: "abc123" },
    ...overrides,
  };
}

describe("encoder", () => {
  it("round-trips a session with checksum validation", () => {
    const session = sampleSession();
    const raw = {
      "sess-test-001.jsonl": { encoding: "utf8" as const, content: '{"ok":true}\n' },
    };
    const buffer = encodeSession(session, raw);
    const bundle = decodeBundle(buffer);

    expect(bundle.format).toBe("aiss");
    expect(bundle.version).toBe(1);
    expect(bundle.session.id).toBe(session.id);
    expect(bundle.session.messages).toHaveLength(2);
    expect(bundle.raw["sess-test-001.jsonl"]?.content).toContain("ok");
    expect(bundle.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it("round-trips via base64", () => {
    const session = sampleSession();
    const encoded = encodeToBase64(session);
    const bundle = decodeFromBase64(encoded);
    expect(bundle.session.title).toBe("Sample session");
  });

  it("rejects tampered checksums", () => {
    const buffer = encodeSession(sampleSession());
    const json = JSON.parse(gunzipSync(buffer).toString("utf8")) as {
      checksum: string;
    };
    json.checksum = sha256("tampered");
    const tampered = gzipSync(Buffer.from(JSON.stringify(json), "utf8"));
    expect(() => decodeBundle(tampered)).toThrow(/checksum mismatch/i);
  });

  it("preserves unicode and multiline content", () => {
    const session = sampleSession({
      messages: [
        {
          id: "msg-0",
          role: "user",
          content: "Fix café ☕\nand keep newlines",
        },
      ],
      messageCount: 1,
    });
    const bundle = decodeBundle(encodeSession(session));
    expect(bundle.session.messages[0]?.content).toBe("Fix café ☕\nand keep newlines");
  });
});
