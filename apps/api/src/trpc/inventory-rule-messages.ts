/**
 * Plain words for inventory rules a shop owner can act on. Domain messages
 * are written for developers ("Balance Source", "Packaged Stock"), so only the
 * rules listed here reach the person; every other inventory error keeps its
 * fixed public text. Keys are the exact domain message, lower-cased.
 */
const RULES: Record<string, string> = {
  "enter the low-stock level as 0 or more.":
    "Enter the low-stock level as 0 or more.",
  // Not enough stock free (INSUFFICIENT_STOCK).
  "the operation would leave on-hand below reserved stock.":
    "Not enough free stock for this. Some of it is held for orders.",
  "the operation would reduce on-hand below reserved stock.":
    "Not enough free stock for this. Some of it is held for orders.",
  "the corrected operation would reduce on-hand below reserved stock.":
    "That correction would take stock that is held for orders.",
  "the source balance source has insufficient available stock.":
    "Not enough free stock to move that many.",
  "the source packaged stock balance has insufficient available stock.":
    "Not enough packs free to open that many.",
  "dispatch would consume reserved or unavailable stock.":
    "Not enough free stock to send that many. Some of it may be held for orders.",
  "the transfer would consume reserved transit stock.":
    "Part of this transfer is held for an order, so it can't be changed now.",
  "the acknowledged quantity exceeds remaining transit stock.":
    "That's more than is still on the way.",

  // Where the stock is (custody).
  "ordinary stock changes require store custody; use the owning custody or transfer operation.":
    "This stock is with a staff member or on the way. Take it back to the store first.",
  "purchase receipts require store custody.":
    "Stock can only come in to the store itself, not to a staff member.",
  "store transfer dispatch must start from central store custody.":
    "Only stock kept in the store can be sent. Take it back from staff first.",
  "custody movement must remain in one store.":
    "Staff can only hold stock from their own store.",
  "staff or session custody requires a stable reference identity.":
    "Choose who gets it.",

  // Packs kept separately.
  "packaged stock must be posted in its own inventory unit.":
    "Packs kept separately can only be entered as packs.",
  "packaged stock cannot be posted into a shared stock pool.":
    "Packs kept separately can't be added to loose stock. Use Pack or unpack.",
  "transformation endpoints must be different packaged stock balances for the same store, product, and variant.":
    "Pick a pack of the same product to fill.",
  "transformation source and target must conserve exact canonical quantity. record any loss as a separate linked adjustment.":
    "What you take out must equal what goes into the packs. Record any loss separately with Damaged or lost.",

  // Used in the business.
  "set this product's usage to internal use or both before recording use.":
    "This Product isn't set for internal use. Change its usage in Catalog first.",
  "internal use only decreases stock, without categories or a unit cost.":
    "Used in the business can only remove stock.",
  "receive/adjust require categories or a legacy reason; returns require a reason without categories.":
    "Pick a reason.",

  // Transfers.
  "source and target stores must be different.":
    "Choose a different store to send to.",
  "transfer requires two accessible stores.":
    "You need access to both stores for this transfer.",
  "transfer source or destination is unavailable.":
    "One of these stores isn't available any more.",
  "only an in-transit transfer can be received or cancelled.":
    "This transfer was already received or cancelled.",
  "only an in-transit stock transfer can be received or cancelled.":
    "This transfer was already received or cancelled.",
  "this transfer has no remaining stock in transit.":
    "Nothing is still on the way for this transfer.",
  "cancellation must return all remaining transit stock.":
    "Cancelling sends back everything still on the way.",

  // Counts.
  "choose each counted stock source once.": "Count each product once.",
  "every counted balance source requires at least one observation.":
    "Enter a count for each product you picked.",
  "a stock count requires at least one balance source.":
    "Count at least one product.",

  // Corrections.
  "this stock operation already has a correction.":
    "This change was already corrected.",
  "a financially registered stock operation must be corrected through its linked source.":
    "This change came from a purchase or sale. Correct it there.",
  "a catalog opening must be corrected through its owning source.":
    "Opening stock is corrected on the Product in Catalog.",
  "an inventory closeout must be corrected through its owning source.":
    "Correct this in the staff stock check it came from.",
  "a committed reservation must be corrected through its owning source.":
    "This came from an order. Correct it on the order.",
}

/**
 * The owner-facing reason for an inventory rule refusal, or null to keep the
 * fixed text and error class. Only listed rules change; for example order
 * reservations keep their conflict behaviour.
 */
export function plainInventoryRuleMessage(error: {
  message: string
}): string | null {
  return RULES[error.message.trim().toLowerCase()] ?? null
}

/** Every domain message this table rewrites, for the drift test. */
export const plainInventoryRuleKeys = Object.keys(RULES)

/** Unit sheet rules (INVALID_UNIT_CONFIGURATION), some with a unit name inside. */
const UNIT_RULES: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [
    /^every configured unit requires a name\.$/i,
    () => "Give every unit a name.",
  ],
  [/^unit definition name is required\.$/i, () => "Give every unit a name."],
  [
    /^unit keys must be unique within a configuration\.$/i,
    () => "Two units have the same short code. Change one of them.",
  ],
  [
    /^a product unit configuration requires at least one unit\.$/i,
    () => "Keep at least one unit.",
  ],
  [
    /^a product requires exactly one canonical inventory unit\.$/i,
    () => "Choose exactly one main unit.",
  ],
  [
    /^the canonical inventory unit must have factor 1\.$/i,
    () => "The main unit always counts as 1.",
  ],
  [
    /^canonical balance precision must be from 0 to 18 decimal places\.$/i,
    () => "Decimal places in stock must be from 0 to 18.",
  ],
  [
    /^transaction precision for (.+) must be from 0 to 6 decimal places\.$/i,
    (match) => `Decimal places for ${match[1]} must be from 0 to 6.`,
  ],
  [
    /^configured unit (.+) is still used by an offering\.$/i,
    (match) =>
      `${match[1]} is still used by a selling option. Remove it there first.`,
  ],
  [
    /^publishing this semantic change requires an explicit stock transition\.$/i,
    () =>
      "You have stock in a unit whose size changed. Count, sell or unpack that stock first.",
  ],
  [
    /^the supplied stock transition does not cover this product\.$/i,
    () => "That support reference is for a different Product.",
  ],
]

/** Owner-facing reason for a Units sheet refusal, or null to keep fixed text. */
export function plainUnitConfigurationMessage(message: string): string | null {
  for (const [pattern, plain] of UNIT_RULES) {
    const match = message.trim().match(pattern)
    if (match) return plain(match)
  }
  return null
}
