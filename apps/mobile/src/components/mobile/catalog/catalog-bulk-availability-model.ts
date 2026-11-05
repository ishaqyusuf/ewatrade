/** Hide or show several Catalog items for sale in the current store. */
import type { BulkOutcome } from "@/components/mobile/list-selection/bulk-report"

type StoreAvailability = { isAvailable: boolean; storeId: string }
export type AvailabilityItem = {
  id: string
  name: string
  variants: Array<{
    offerings: Array<{
      id: string
      status: string
      stores: StoreAvailability[]
    }>
  }>
}

function activeOfferings(item: AvailabilityItem) {
  return item.variants.flatMap((variant) =>
    variant.offerings.filter((offering) => offering.status === "active"),
  )
}

const availableIn = (stores: StoreAvailability[], storeId: string) =>
  stores.some((row) => row.storeId === storeId && row.isAvailable)

/** On sale here = an active offering is available in this store (as sales see it). */
export function isOnSale(item: AvailabilityItem, storeId: string) {
  return activeOfferings(item).some((offering) =>
    availableIn(offering.stores, storeId),
  )
}

/** Hidden = it has active offerings, none of them available in this store. */
export function isHiddenFromSale(item: AvailabilityItem, storeId: string) {
  return activeOfferings(item).length > 0 && !isOnSale(item, storeId)
}

/** Hide when any selected item is on sale; otherwise every one is hidden, so show. */
export function bulkAvailabilityHides(
  items: readonly AvailabilityItem[],
  storeId: string,
) {
  return items.some((item) => isOnSale(item, storeId))
}

/** The offerings each item needs switched, plus items skipped up front. */
export function planBulkAvailability<T extends AvailabilityItem>(
  items: readonly T[],
  storeId: string,
  hide: boolean,
) {
  const targets: Array<{ item: T; offeringIds: string[] }> = []
  const skipped: BulkOutcome[] = []
  for (const item of items) {
    const offerings = activeOfferings(item)
    if (!offerings.length) {
      skipped.push({
        detail: "No active price to sell",
        key: item.id,
        label: item.name,
        result: "skipped",
      })
      continue
    }
    const offeringIds = offerings
      .filter((offering) => availableIn(offering.stores, storeId) === hide)
      .map((offering) => offering.id)
    if (offeringIds.length) targets.push({ item, offeringIds })
    else
      skipped.push({
        detail: hide ? "Already hidden" : "Already on sale",
        key: item.id,
        label: item.name,
        result: "skipped",
      })
  }
  return { skipped, targets }
}

export function bulkAvailabilityDone(item: AvailabilityItem, hide: boolean) {
  return {
    detail: hide ? "Hidden from sale" : "On sale again",
    key: item.id,
    label: item.name,
    result: "done",
  } satisfies BulkOutcome
}

export function bulkAvailabilityFailed(item: AvailabilityItem, error: unknown) {
  return {
    detail:
      error instanceof Error && error.message.trim()
        ? error.message
        : "Couldn’t change this item. Try it from the item.",
    key: item.id,
    label: item.name,
    result: "skipped",
  } satisfies BulkOutcome
}

/** "3 hidden · 1 skipped" */
export function bulkAvailabilitySummary(
  outcomes: readonly BulkOutcome[],
  hide: boolean,
) {
  const done = outcomes.filter((outcome) => outcome.result === "done").length
  const skipped = outcomes.length - done
  const verb = hide ? "hidden" : "back on sale"
  return skipped ? `${done} ${verb} · ${skipped} skipped` : `${done} ${verb}`
}
