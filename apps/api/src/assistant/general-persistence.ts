import {
  generalProposalReferenceSchema,
  generalStoredPartSchema,
} from "@ewatrade/assistant/general/contracts"

/** Only the exact successful server draft result may be attached to its final reply. */
export function generalProposalReferencePart(
  proposalId: string,
  source: unknown,
) {
  const parsed = generalProposalReferenceSchema.safeParse(source)
  return parsed.success && parsed.data.proposalId === proposalId
    ? {
        type: "data-general-proposal-reference" as const,
        data: parsed.data,
      }
    : undefined
}

/** Persist only text and authoritative cards, without SDK envelope metadata. */
export function generalPersistentParts(parts: readonly unknown[]) {
  return parts.flatMap((part) => {
    if (!part || typeof part !== "object" || !("type" in part)) return []
    const candidate =
      part.type === "text" && "text" in part
        ? { type: "text", text: part.text }
        : (part.type === "data-general-answer" ||
              part.type === "data-general-proposal-reference") &&
            "data" in part
          ? { type: part.type, data: part.data }
          : null
    const parsed = generalStoredPartSchema.safeParse(candidate)
    return parsed.success ? [parsed.data] : []
  })
}
