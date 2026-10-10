import {
  SETUP_AREAS,
  summarizeSetupAreas,
} from "@ewatrade/assistant/setup/areas"
import { setupEntityPayloadSchema } from "@ewatrade/assistant/setup/contracts"
import { setupProductVariants } from "@ewatrade/assistant/setup/variants"
import { formatMinorMoney } from "@ewatrade/utils/currency"
import { z } from "zod"
const entity = z.object({
  key: z.string(),
  kind: z.string(),
  state: z.enum([
    "PROPOSED",
    "NEEDS_INPUT",
    "CONFIRMED",
    "COMMITTED",
    "FAILED",
    "SKIPPED",
  ]),
  payload: z.unknown(),
  source: z.unknown().optional(),
  openQuestions: z.unknown().optional(),
  committedRecordId: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
})
const snapshot = z.object({
  enabled: z.literal(true),
  activeRunId: z.string().nullable().optional(),
  conversation: z.object({ id: z.string(), status: z.string() }).nullable(),
  currencyCode: z.string(),
  countryCode: z.string().optional(),
  areas: z
    .array(
      z.object({
        area: z.enum(SETUP_AREAS),
        label: z.string(),
        status: z.enum(["OPEN", "STARTED", "DONE", "SKIPPED"]),
        records: z.number().int().min(0),
      }),
    )
    .optional(),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(["user", "assistant", "system"]),
      parts: z.array(z.unknown()),
      createdAt: z.coerce.date().optional(),
    }),
  ),
  draft: z
    .object({ revision: z.number(), entities: z.array(entity) })
    .nullable(),
  prerequisites: z
    .object({ termsRequired: z.boolean(), financeBookMissing: z.boolean() })
    .optional(),
})
export type SetupSnapshot = z.infer<typeof snapshot>
export type SetupEntity = z.infer<typeof entity>
export function setupAreas(data: SetupSnapshot | null) {
  return data?.areas ?? summarizeSetupAreas(null, data?.draft?.entities ?? [])
}
export function readSetupSnapshot(value: unknown) {
  const parsed = snapshot.safeParse(value)
  return parsed.success ? parsed.data : null
}
export function readSetupCache(
  value: string | null,
  scope: string,
  now = Date.now(),
) {
  if (!value) return null
  try {
    const parsed = z
      .object({ scope: z.string(), savedAt: z.number(), data: snapshot })
      .parse(JSON.parse(value))
    return parsed.scope === scope &&
      parsed.savedAt <= now &&
      now - parsed.savedAt <= 24 * 60 * 60 * 1000
      ? parsed
      : null
  } catch {
    return null
  }
}
export function setupCounts(entities: SetupEntity[]) {
  return {
    open: entities.filter((e) => !["SKIPPED", "COMMITTED"].includes(e.state))
      .length,
    confirmed: entities.filter((e) => e.state === "CONFIRMED").length,
    added: entities.filter((e) => e.state === "COMMITTED").length,
    check: entities.filter((e) =>
      ["PROPOSED", "NEEDS_INPUT", "FAILED"].includes(e.state),
    ).length,
  }
}
export function setupCommitKeys(entities: SetupEntity[]) {
  return entities
    .filter(
      (e) =>
        e.state === "CONFIRMED" ||
        (e.state === "COMMITTED" &&
          [
            "OPENING_BALANCE_PENDING",
            "OPENING_BALANCE_FAILED",
            "OPENING_BALANCE_NEEDS_FINANCE",
          ].includes(e.errorCode ?? "")),
    )
    .map((e) => e.key)
}
export function setupEntityPayload(e: SetupEntity) {
  const p = setupEntityPayloadSchema.safeParse(e.payload)
  return p.success ? p.data : null
}
export function setupSummary(e: SetupEntity, currency: string) {
  const p = setupEntityPayload(e)
  if (!p)
    return "This record needs a newer setup service. Review it on the dashboard."
  if (p.kind === "customer")
    return (
      [
        p.phone,
        p.email,
        p.opening
          ? `${p.opening.direction === "owes_business" ? "Owes you" : "Your business owes"} ${formatMinorMoney(p.opening.amountMinor, currency)}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ") || "No contact details yet"
    )
  if (p.kind === "money_account")
    return [
      p.purpose === "CASH" ? "Cash" : "Bank",
      p.purpose === "BANK" ? p.bankName : null,
      p.openingBalanceMinor === undefined
        ? "Balance not given"
        : `${formatMinorMoney(p.openingBalanceMinor, currency)} now`,
    ]
      .filter(Boolean)
      .join(" · ")
  if (p.kind === "service")
    return p.pricing === "quote"
      ? "Priced per job"
      : p.priceMinor === undefined
        ? "Price needed"
        : formatMinorMoney(p.priceMinor, currency)
  if (p.options?.length || p.variants?.length || p.sellingUnits?.length)
    return (
      setupProductVariants(p)
        .map((variant) => {
          const stock =
            variant.openingStock ??
            (!p.options?.length ? p.openingStock : undefined)
          return [
            variant.label,
            ...(p.usage === "INTERNAL_USE"
              ? []
              : [
                  variant.priceMinor === undefined
                    ? `Price needed per ${p.unitName}`
                    : `${formatMinorMoney(variant.priceMinor, currency)} per ${p.unitName}`,
                  ...variant.sellingUnits.map((unit) =>
                    unit.priceMinor === undefined
                      ? `Price needed per ${unit.name}`
                      : `${formatMinorMoney(unit.priceMinor, currency)} per ${unit.name} (${unit.containsQuantity} ${p.unitName})`,
                  ),
                  ...variant.pendingUnitPrices.map(
                    (unit) =>
                      `${formatMinorMoney(unit.priceMinor, currency)} per ${unit.unitName} · pack size needed`,
                  ),
                ]),
            stock === undefined ? null : `${stock} ${p.unitName} in stock`,
          ]
            .filter(Boolean)
            .join(" · ")
        })
        .join("\n") || "Check the options and units before adding."
    )
  return [
    p.usage === "INTERNAL_USE"
      ? "For business use"
      : p.priceMinor === undefined
        ? "Price needed"
        : `${formatMinorMoney(p.priceMinor, currency)} per ${p.unitName.toLowerCase()}`,
    p.openingStock === undefined ? null : `${p.openingStock} in stock`,
  ]
    .filter(Boolean)
    .join(" · ")
}
export function setupErrorSummary(e: SetupEntity) {
  if (!e.errorCode) return null
  if (e.errorCode === "MONEY_ACCOUNT_SHOP_CASH")
    return "Added to Shop cash, the cash account Finance already keeps for your business."
  if (e.errorCode === "MONEY_ACCOUNT_NEEDS_FINANCE")
    return "Set up your Finance book, then confirm and add this account again."
  if (e.errorCode === "PHOTO_NOT_ADDED")
    return "Added without its photo. You can add the photo from Catalog."
  if (e.errorCode.startsWith("OPENING_BALANCE"))
    return `${e.kind === "MONEY_ACCOUNT" ? "Account" : "Customer"} added. The opening balance still needs attention in Finance.`
  return "This record could not be added. Check its details and try again."
}
export function setupSource(e: SetupEntity) {
  if (!e.source || typeof e.source !== "object") return null
  const s = e.source as Record<string, unknown>
  const file =
    typeof s.fileName === "string"
      ? s.fileName
      : typeof s.attachmentName === "string"
        ? s.attachmentName
        : null
  if (!file)
    return typeof s.quote === "string"
      ? `From your message: ${s.quote.slice(0, 240)}`
      : null
  return `From ${file.slice(0, 120)}${typeof s.line === "number" ? ` · line ${s.line}` : typeof s.row === "number" ? ` · row ${s.row}` : ""}`
}
export function setupRecordRoute(e: SetupEntity) {
  if (e.state !== "COMMITTED" || !e.committedRecordId) return null
  const id = encodeURIComponent(e.committedRecordId)
  if (["PRODUCT", "SERVICE", "INTERNAL_USE"].includes(e.kind))
    return `/catalog-item/${id}`
  if (e.kind === "CUSTOMER") return `/customer-ledger/${id}`
  if (e.kind === "MONEY_ACCOUNT") return `/finance-account/${id}`
  return null
}
export function setupPlainText(parts: unknown[]) {
  return parts
    .flatMap((p) =>
      p &&
      typeof p === "object" &&
      "type" in p &&
      p.type === "text" &&
      "text" in p &&
      typeof p.text === "string"
        ? [p.text]
        : [],
    )
    .join("\n\n")
}
export function setupInitialMessages(data: SetupSnapshot) {
  return data.messages
    .map((m) => ({
      id: m.id,
      role: m.role,
      parts: [{ type: "text" as const, text: setupPlainText(m.parts) }],
    }))
    .filter((m) => m.parts[0].text)
}

export function readSetupRun(value: unknown, conversationId: string) {
  const parsed = z
    .object({
      conversationId: z.literal(conversationId),
      status: z.enum(["RUNNING", "COMPLETED", "FAILED"]),
    })
    .safeParse(value)
  return parsed.success ? parsed.data : null
}
