import {
  type ServiceCommerceCostObservation,
  type ServiceCommerceCostSummary,
  type ServiceCommerceReportInput,
  serviceCommerceCostObservationSchema,
} from "./schemas"

/**
 * Returns true only for an authoritative occurrence inside the half-open
 * report window. Adjacent windows can be queried without an overlap.
 */
export function isServiceCommerceReportOccurrenceInWindow(
  occurredAt: Date | null | undefined,
  input: Pick<ServiceCommerceReportInput, "end" | "start">,
) {
  return Boolean(
    occurredAt && occurredAt >= input.start && occurredAt < input.end,
  )
}

/**
 * Summarizes separately attributable external costs without treating missing
 * provider data as zero. The result is grouped by cost kind and currency so
 * callers cannot accidentally combine different currencies.
 */
export function summarizeServiceCommerceCosts(
  observations: readonly ServiceCommerceCostObservation[],
): ServiceCommerceCostSummary[] {
  const summaries = new Map<string, ServiceCommerceCostSummary>()

  for (const rawObservation of observations) {
    const observation =
      serviceCommerceCostObservationSchema.parse(rawObservation)
    const key = `${observation.costKind}:${observation.currencyCode ?? "unknown"}`
    const existing = summaries.get(key) ?? {
      costKind: observation.costKind,
      currencyCode: observation.currencyCode,
      knownCount: 0,
      knownTotalMinor: null,
      unknownCount: 0,
    }

    if (observation.amountMinor === null) {
      existing.unknownCount += 1
    } else {
      existing.knownCount += 1
      existing.knownTotalMinor =
        (existing.knownTotalMinor ?? 0) + observation.amountMinor
    }
    summaries.set(key, existing)
  }

  return [...summaries.values()].sort(
    (left, right) =>
      left.costKind.localeCompare(right.costKind) ||
      (left.currencyCode ?? "").localeCompare(right.currencyCode ?? ""),
  )
}
