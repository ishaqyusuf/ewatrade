import type {
  SetupEntityPayload,
  SetupOpenQuestion,
} from "@ewatrade/assistant/setup/contracts"
import { catalogCategoryEmoji } from "@ewatrade/utils/catalog-category-emojis"
import { formatMinorMoney } from "@ewatrade/utils/currency"

export type SetupDraftEntity = {
  key: string
  kind: "PRODUCT" | "SERVICE" | "CUSTOMER"
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
  OPENING_BALANCE_FAILED:
    "Customer added, but their balance was not recorded yet. Try again.",
}

export function entityErrorCopy(code: string | null | undefined) {
  if (!code) return null
  return (
    ERROR_COPY[code] ?? "This record could not be added. Edit it and try again."
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
  return entity.payload as SetupEntityPayload
}

export function entityQuestions(entity: SetupDraftEntity) {
  return Array.isArray(entity.openQuestions)
    ? (entity.openQuestions as SetupOpenQuestion[])
    : []
}

export function entityEmoji(payload: SetupEntityPayload) {
  if (payload.kind === "customer") return null
  if (payload.categoryKey) return catalogCategoryEmoji(payload.categoryKey)
  return payload.kind === "service" ? "🛠️" : "📦"
}

export function entitySummary(
  payload: SetupEntityPayload,
  currencyCode: string,
) {
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
  const price =
    payload.priceMinor !== undefined
      ? `${formatMinorMoney(payload.priceMinor, currencyCode)} per ${payload.unitName.toLowerCase()}`
      : "Price needed"
  const stock =
    payload.openingStock !== undefined
      ? `${payload.openingStock} in stock`
      : null
  const units = payload.sellingUnits?.length
    ? `Also sold by ${payload.sellingUnits.map((unit) => `${unit.name.toLowerCase()} (${unit.containsQuantity})`).join(", ")}`
    : null
  return [price, stock, units].filter(Boolean).join(" · ")
}

export const ENTITY_GROUPS = [
  { kind: "PRODUCT", title: "Products" },
  { kind: "SERVICE", title: "Services" },
  { kind: "CUSTOMER", title: "Customers" },
] as const
