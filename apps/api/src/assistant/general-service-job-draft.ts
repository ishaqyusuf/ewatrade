import {
  type ServiceJobDraft,
  type ServiceJobRequest,
  resolveServiceJobLines,
  serviceJobDraftSchema,
  serviceNameKey,
} from "@ewatrade/assistant/general/contracts"
import { createGeneralDomainCaller } from "./general-callers"
import { type GeneralContext, requireGeneralScope } from "./general-context"

/** Protected reads only. Writes require explicit native Catalog actions or customer/job form submission. */
export async function prepareGeneralServiceJob(
  ctx: GeneralContext,
  request: ServiceJobRequest,
) {
  const scope = requireGeneralScope(ctx)
  const caller = createGeneralDomainCaller(ctx)
  const query = [...new Set(request.lines.map((line) => line.name))].join(" ")
  if (query.length > 160)
    return {
      status: "needs_details" as const,
      question: "Please prepare fewer different services together.",
    }
  const page = await caller.catalog.listItemsPage({
    kind: "service",
    query,
    searchOrder: "stable",
    limit: 50,
  })
  if (page.nextCursor)
    return {
      status: "needs_details" as const,
      question: "Which saved laundry service should I use?",
    }
  const choices = page.items.flatMap((item) =>
    item.variants.flatMap((variant) =>
      variant.offerings
        .filter((offering) => offering.kind === "service")
        .map((offering) => ({
          offeringId: offering.id,
          name:
            variant.name === offering.name
              ? variant.name
              : `${variant.name} · ${offering.name}`,
          unitPriceMinor: offering.fixedPriceMinor ?? 0,
          available:
            item.status === "active" &&
            variant.status === "active" &&
            offering.status === "active" &&
            offering.pricingPolicy === "fixed" &&
            offering.fixedPriceMinor !== null &&
            offering.stores.some(
              (store) => store.storeId === scope.storeId && store.isAvailable,
            ),
        })),
    ),
  )
  const resolved = resolveServiceJobLines(request, choices)
  if (resolved.questions.length)
    return {
      status: "needs_details" as const,
      question: resolved.questions.join(" "),
      instruction:
        "Ask only this short question. Retain all known lines and customer facts. Do not ask about payment, phone, due date or assignment; no card until the prices are known.",
    }
  let customer: ServiceJobDraft["customer"]
  if (request.customerName) {
    const customers = await caller.customers.listPage({
      query: request.customerName,
      limit: 50,
    })
    const exact = customers.items.filter(
      (row) =>
        row.name.trim().toLocaleLowerCase() ===
        request.customerName?.trim().toLocaleLowerCase(),
    )
    if (exact.length > 1 || customers.nextCursor)
      return {
        status: "needs_details" as const,
        question: `More than one customer matches ${request.customerName}. Which one?`,
      }
    const match = exact[0]
    customer = match
      ? {
          id: match.id,
          name: match.name,
          phone: match.phone,
          email: match.email,
        }
      : { name: request.customerName, phone: null, email: null }
  }
  const draft = serviceJobDraftSchema.parse({
    origin: { tenantId: scope.tenantId, storeId: scope.storeId },
    currencyCode:
      ctx.tenantContext.activeStore?.currencyCode ??
      ctx.tenantContext.tenant.currencyCode,
    customer,
    lines: resolved.lines,
    totalMinor: resolved.lines.reduce((sum, line) => sum + line.totalMinor, 0),
    notes: request.notes,
    assumptions: request.assumptions ?? [],
  })
  return { status: "ready" as const, draft }
}
