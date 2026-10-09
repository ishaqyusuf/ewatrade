import { generalStoredPartSchema } from "@ewatrade/assistant/general/contracts"

/** Persist only text and authoritative cards, without SDK envelope metadata. */
export function generalPersistentParts(parts: readonly unknown[]) {
  return parts.flatMap((part) => {
    if (!part || typeof part !== "object" || !("type" in part)) return []
    const candidate =
      part.type === "text" && "text" in part
        ? { type: "text", text: part.text }
        : part.type === "data-general-answer" && "data" in part
          ? { type: "data-general-answer", data: part.data }
          : null
    const parsed = generalStoredPartSchema.safeParse(candidate)
    return parsed.success ? [parsed.data] : []
  })
}
