/** Plain text of a ProseMirror JSON node (text nodes joined, no separators). */
export function plainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const value = node as { type?: string; text?: string; content?: unknown[] };
  if (value.type === "text") return value.text ?? "";
  return (value.content ?? []).map(plainText).join("");
}
