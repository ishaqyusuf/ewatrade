import type {
  SetupEntityPayload,
  SetupMoneyAccountPayload,
  SetupOpenQuestion,
} from "@ewatrade/assistant/setup/contracts"
import { catalogCategoryEmoji } from "@ewatrade/utils/catalog-category-emojis"
import { formatMinorMoney } from "@ewatrade/utils/currency"

/** Every Setup list record, money accounts included. */
export type SetupCardPayload = SetupEntityPayload
export type { SetupMoneyAccountPayload }

export type SetupDraftEntity = {
  key: string
  kind: "PRODUCT" | "SERVICE" | "CUSTOMER" | "MONEY_ACCOUNT"
  state:
    | "PROPOSED"
    | "NEEDS_INPUT"
    | "CONFIRMED"
    | "COMMITTED"
    | "FAILED"
    | "SKIPPED"
  payload: unknown
  openQuestions: unknown
  errorCode?: string | null
  committedRecordId?: string | null
  source?: unknown
}

export type SetupAttachmentName = {
  id: string
  fileName: string
  kind: string
  contentType: string
}

/** Where a record's values were read from, for the "check this" hints. */
export function entitySource(entity: SetupDraftEntity) {
  const source = (entity.source ?? {}) as {
    attachmentId?: unknown
    location?: unknown
    uncertain?: unknown
  }
  return {
    attachmentId:
      typeof source.attachmentId === "string" ? source.attachmentId : null,
    location: typeof source.location === "string" ? source.location : null,
    uncertain: source.uncertain === true,
  }
}

const ERROR_COPY: Record<string, string> = {
  CATALOG_TERMS_REQUIRED:
    "Accept the EwaTrade Terms at the top of this list; this record is then queued again.",
  DUPLICATE_CATALOG_KEY:
    "An item with this name is already in your catalog. Rename it or skip it.",
  DUPLICATE_CUSTOMER:
    "A customer with this phone number or email already exists. Change it or skip it.",
  INVALID_UNIT_CONFIGURATION: "Check the units and pack sizes, then try again.",
  INVALID_DRAFT: "Edit this record before adding it.",
  OPENING_BALANCE_NEEDS_FINANCE:
    "Customer added. Set up Finance at the top of this list and their balance is recorded right after.",
  OPENING_BALANCE_PENDING:
    "Customer added. Their opening balance is still being recorded; press Add to finish.",
  PHOTO_NOT_ADDED:
    "Added without its photo. You can add the photo from Catalog.",
  OPENING_BALANCE_FAILED:
    "Customer added, but their balance was not recorded yet. Try again.",
  MONEY_ACCOUNT_NEEDS_FINANCE:
    "Set up Finance at the top of this list; this account is then added.",
  CONFLICT:
    "An account with these details already exists in Finance. Rename it or skip it.",
}

const MONEY_ERROR_COPY: Record<string, string> = {
  OPENING_BALANCE_NEEDS_FINANCE:
    "Account added. Set up Finance at the top of this list and its balance is recorded right after.",
  OPENING_BALANCE_FAILED:
    "Account added, but its balance was not recorded yet. Try again.",
}

export function entityErrorCopy(
  code: string | null | undefined,
  payload?: SetupCardPayload,
) {
  if (!code) return null
  return (
    (payload?.kind === "money_account" ? MONEY_ERROR_COPY[code] : undefined) ??
    ERROR_COPY[code] ??
    "This record could not be added. Edit it and try again."
  )
}

export function isBalancePending(entity: SetupDraftEntity) {
  return (
    entity.state === "COMMITTED" &&
    (entity.errorCode === "OPENING_BALANCE_NEEDS_FINANCE" ||
      entity.errorCode === "OPENING_BALANCE_FAILED" ||
      entity.errorCode === "OPENING_BALANCE_PENDING")
  )
}

export function entityPayload(entity: SetupDraftEntity) {
  return entity.payload as SetupCardPayload
}

const USAGE_LABEL = {
  INTERNAL_USE: "Used, not sold",
  BOTH: "Sold and used",
} as const

export function entityQuestions(entity: SetupDraftEntity) {
  return Array.isArray(entity.openQuestions)
    ? (entity.openQuestions as SetupOpenQuestion[])
    : []
}

export function entityEmoji(payload: SetupCardPayload) {
  if (payload.kind === "customer") return null
  if (payload.kind === "money_account")
    return payload.purpose === "CASH" ? "💵" : "🏦"
  if (payload.categoryKey) return catalogCategoryEmoji(payload.categoryKey)
  return payload.kind === "service" ? "🛠️" : "📦"
}

export function entitySummary(payload: SetupCardPayload, currencyCode: string) {
  if (payload.kind === "money_account") {
    const parts: string[] = [payload.purpose === "CASH" ? "Cash" : "Bank"]
    if (payload.bankName && payload.purpose === "BANK")
      parts.push(payload.bankName)
    parts.push(
      payload.openingBalanceMinor !== undefined
        ? `${formatMinorMoney(payload.openingBalanceMinor, currencyCode)} now`
        : "Balance not given",
    )
    return parts.join(" · ")
  }
  if (payload.kind === "customer") {
    const parts = [payload.phone, payload.email].filter(Boolean) as string[]
    if (payload.opening)
      parts.push(
        payload.opening.direction === "owes_business"
          ? `Owes you ${formatMinorMoney(payload.opening.amountMinor, currencyCode)}`
          : `You hold ${formatMinorMoney(payload.opening.amountMinor, currencyCode)}`,
      )
    return parts.join(" · ") || "No contact details yet"
  }
  if (payload.kind === "service")
    return payload.pricing === "quote"
      ? "Priced per job"
      : payload.priceMinor !== undefined
        ? formatMinorMoney(payload.priceMinor, currencyCode)
        : "Price needed"
  const usage =
    payload.usage && payload.usage !== "FOR_SALE"
      ? USAGE_LABEL[payload.usage]
      : null
  // Items the business only uses have no selling price.
  const price =
    payload.priceMinor !== undefined
      ? `${formatMinorMoney(payload.priceMinor, currencyCode)} per ${payload.unitName.toLowerCase()}`
      : payload.usage === "INTERNAL_USE"
        ? null
        : "Price needed"
  const stock =
    payload.openingStock !== undefined
      ? `${payload.openingStock} in stock`
      : null
  const units = payload.sellingUnits?.length
    ? `Also sold by ${payload.sellingUnits.map((unit) => `${unit.name.toLowerCase()} (${unit.containsQuantity})`).join(", ")}`
    : null
  return [usage, price, stock, units].filter(Boolean).join(" · ")
}

export const ENTITY_GROUPS = [
  { group: "PRODUCT", title: "Products" },
  { group: "SERVICE", title: "Services" },
  { group: "INTERNAL_USE", title: "Things you use" },
  { group: "CUSTOMER", title: "Customers" },
  { group: "MONEY_ACCOUNT", title: "Cash and bank" },
] as const

export type SetupEntityGroup = (typeof ENTITY_GROUPS)[number]["group"]

export function entityGroup(entity: SetupDraftEntity): SetupEntityGroup {
  const payload = entityPayload(entity)
  if (payload.kind === "money_account") return "MONEY_ACCOUNT"
  if (payload.kind === "product" && payload.usage === "INTERNAL_USE")
    return "INTERNAL_USE"
  return entity.kind === "MONEY_ACCOUNT" ? "MONEY_ACCOUNT" : entity.kind
}

/** Records that only failed because the business had no Finance book yet. */
export function isWaitingForFinance(entity: SetupDraftEntity) {
  return (
    entity.state === "FAILED" &&
    entity.errorCode === "MONEY_ACCOUNT_NEEDS_FINANCE"
  )
}
