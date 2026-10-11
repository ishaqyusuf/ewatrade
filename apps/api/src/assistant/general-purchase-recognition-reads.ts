import { generalMoney, type GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import type { listFinancePurchaseRecognitions } from "@ewatrade/db/queries"
import { financePurchaseRecognitionsSchema, financePurchaseRecognitionDetailSchema } from "../schemas/finance-purchases"
export const generalPurchaseRegistrationsInput = financePurchaseRecognitionsSchema.omit({ limit: true, direction: true })
export const generalPurchaseRecognitionInput = financePurchaseRecognitionDetailSchema
export function generalPurchaseRegistrationsAnswer(page: Awaited<ReturnType<typeof listFinancePurchaseRecognitions>>): GeneralAnswer {
  return {
    id: `purchase_registrations_${crypto.randomUUID()}`,
    title: "Registered purchases", value: `${page.items.length} on this page`,
    scope: `Selected Finance Book and supplier · ${page.currencyCode}`,
    asOf: new Date().toISOString(),
    detail: `${page.items.map(item => `${item.description} · ${generalMoney(item.amountMinor, page.currencyCode)} agreed`).join("; ") || "No registrations on this page."} ${page.nextCursor ? "More registrations available; preserve the Book and supplier when continuing." : "End of this list."} These are purchase agreements, including those without invoices. Registration alone creates no payable or stock; inspect each recognition record for invoice, ownership, receipt and correction events.`,
  }
}
