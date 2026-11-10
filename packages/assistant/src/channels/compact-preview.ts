import type { GeneralAnswer } from "../general/contracts"
import {
  whatsAppDataText,
  whatsAppHeading,
  whatsAppLiteralText,
} from "./presentation"

/** Project already-saved read facts only. Never summarize a decision or a receipt. */
export function compactWhatsAppReadPreview(answers: GeneralAnswer[]) {
  const head = answers[0]
  if (!head || answers.filter((answer) => answer.continuation).length !== 1)
    return null
  const kinds: Record<string, string> = {
    readCatalogPage: "catalog_item",
    readOrders: "order",
    readCustomers: "customer",
  }
  const kind = kinds[head.continuation?.tool ?? ""]
  if (!kind || head.catalogCreate || head.serviceDraft || head.handoff)
    return null
  const rows = answers.slice(1)
  if (!rows.length || rows.some((row) => row.target?.kind !== kind)) return null
  const shown = rows.slice(0, 3)
  const more =
    rows.length > shown.length || Boolean(head.continuation?.nextCursor)
  return [
    whatsAppHeading(whatsAppDataText(head.title)),
    ...shown.map(
      (row, index) =>
        `${index + 1}. ${whatsAppLiteralText(whatsAppDataText(row.title))} — ${whatsAppLiteralText(whatsAppDataText(row.value))}${row.summary ? ` · ${whatsAppLiteralText(whatsAppDataText(row.summary))}` : ""}${kind === "order" ? `\n${whatsAppLiteralText(whatsAppDataText(row.detail))}` : ""}`,
    ),
    more
      ? `First ${shown.length} items. More available.`
      : "All matches shown.",
    whatsAppLiteralText(whatsAppDataText(head.detail)),
    "This is a saved page, not a total.",
    `Scope: ${whatsAppLiteralText(whatsAppDataText(head.scope))}`,
    `As of ${head.asOf}`,
  ].join("\n\n")
}
