import type {
  ServiceCommerceCatalogAvailabilityAttestation,
  ServiceCommerceCatalogAvailabilityValidationStatus,
  ServiceCommerceCatalogPriceEvidence,
  ServiceCommerceCatalogPriceSuggestion,
  ServiceCommerceCatalogSourceLineRef,
} from "./schemas/catalog-adoption"

export function selectCatalogPriceSuggestion(input: {
  currencyCode: string
  evidence: ServiceCommerceCatalogPriceEvidence[]
  offeringId: string
  storeId: string
  tenantId: string
}): ServiceCommerceCatalogPriceSuggestion {
  const currencyCode = input.currencyCode.trim().toUpperCase()
  const candidates = input.evidence.filter(
    (candidate) =>
      candidate.currencyCode === currencyCode &&
      candidate.offeringId === input.offeringId &&
      candidate.tenantId === input.tenantId,
  )
  const byMostRecent = (candidates: ServiceCommerceCatalogPriceEvidence[]) =>
    [...candidates].sort(
      (left, right) => right.effectiveAt.getTime() - left.effectiveAt.getTime(),
    )[0]

  const offering = byMostRecent(
    candidates.filter(
      (candidate) =>
        candidate.scope === "offering" &&
        candidate.source === "current_offering",
    ),
  )
  const storeQuote = byMostRecent(
    candidates.filter(
      (candidate) =>
        candidate.scope === "store" &&
        candidate.source === "accepted_quote" &&
        candidate.storeId === input.storeId,
    ),
  )
  const storeSale = byMostRecent(
    candidates.filter(
      (candidate) =>
        candidate.scope === "store" &&
        candidate.source === "completed_sale" &&
        candidate.storeId === input.storeId,
    ),
  )
  const authorizedTenantHistory = byMostRecent(
    candidates.filter(
      (candidate) =>
        candidate.scope === "tenant" && candidate.authorizedTenantHistory,
    ),
  )
  const selected =
    offering ?? storeQuote ?? storeSale ?? authorizedTenantHistory

  if (!selected) {
    return {
      currencyCode: currencyCode || null,
      effectiveAt: null,
      priceMinor: null,
      scope: "unknown",
      source: "unknown",
    }
  }

  return {
    currencyCode: selected.currencyCode,
    effectiveAt: selected.effectiveAt,
    priceMinor: selected.priceMinor,
    scope: selected.scope,
    source: selected.source,
  }
}

export function validateCatalogAvailabilityAttestation(input: {
  attestation: ServiceCommerceCatalogAvailabilityAttestation
  currentSourceLine: ServiceCommerceCatalogSourceLineRef
  now?: Date
}): ServiceCommerceCatalogAvailabilityValidationStatus {
  const { attestation, currentSourceLine } = input
  if (
    attestation.sourceLine.fingerprint !== currentSourceLine.fingerprint ||
    attestation.sourceLine.id !== currentSourceLine.id ||
    attestation.sourceLine.source.id !== currentSourceLine.source.id ||
    attestation.sourceLine.source.kind !== currentSourceLine.source.kind ||
    attestation.sourceLine.sourceVersion !== currentSourceLine.sourceVersion
  ) {
    return "stale_source"
  }
  if (attestation.availability === "unavailable") return "unavailable"
  if (
    attestation.availability === "manual_procure_to_order" &&
    attestation.expiresAt <= (input.now ?? new Date())
  ) {
    return "expired"
  }
  return "valid"
}

export function getCatalogPricePromotionConfirmationImpact(input: {
  boundStoreIds: string[]
  offeringPriceScope: "tenant"
}): { affectedStoreIds: string[]; requiresConfirmation: true } {
  return {
    affectedStoreIds: [...new Set(input.boundStoreIds.map((id) => id.trim()))]
      .filter(Boolean)
      .sort(),
    requiresConfirmation: true,
  }
}
