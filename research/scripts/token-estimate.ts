/** Rough token estimate used when a provider tokenizer is unavailable. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
