export type QuoteablePrescriptionLine = {
  availability?: string | null
  id: string
}

export function buildPrescriptionQuoteCommand(input: {
  createId?: () => string
  fulfilmentPromise?: string
  lines: QuoteablePrescriptionLine[]
  now?: Date
  prices: Record<string, string>
  requestId: string
  storeId: string
}) {
  const payableCount = input.lines.filter(
    (line) =>
      line.availability === "AVAILABLE" || line.availability === "PARTIAL",
  ).length
  const availabilityOutcome =
    payableCount === 0
      ? ("unavailable" as const)
      : payableCount === input.lines.length
        ? ("full" as const)
        : ("partial" as const)
  const createId = input.createId ?? (() => crypto.randomUUID())
  const now = input.now ?? new Date()

  return {
    availabilityOutcome,
    clientQuoteId: createId(),
    clientVersionId: createId(),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
    fulfilmentPromise:
      input.fulfilmentPromise ??
      "Pickup timing will be confirmed by the pharmacy.",
    lines: input.lines.map((line) => {
      const price = input.prices[line.id]?.trim()
      return {
        transcriptionLineId: line.id,
        unitPriceMinor: price
          ? Math.round(Number.parseFloat(price) * 100)
          : undefined,
      }
    }),
    requestId: input.requestId,
    storeId: input.storeId,
  }
}
