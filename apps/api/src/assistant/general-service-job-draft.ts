import {
  type ServiceJobDraft,
  type ServiceJobRequest,
  resolveServiceJobLines,
  serviceJobDraftSchema,
  serviceNameKey,
} from "@ewatrade/assistant/general/contracts"
import { createGeneralDomainCaller } from "./general-callers"
import { type GeneralContext, requireGeneralScope } from "./general-context"
import { recordPreparation } from "./preparation-observability"

/** Protected reads only. Writes require explicit native Catalog actions or customer/job form submission. */
export async function prepareGeneralServiceJob(
  ctx: GeneralContext,
  request: ServiceJobRequest,
) {
  const startedAt = Date.now()
  const scope = requireGeneralScope(ctx)
  const caller = createGeneralDomainCaller(ctx)
  const names = [...new Set(request.lines.map((line) => line.name))]
  const pages = await Promise.all(
    names.map(async (name) => ({
      name,
      page: await caller.catalog.listItemsPage({
        kind: "service",
        query: name,
        searchOrder: "stable",
        limit: 50,
      }),
    })),
  )
  const resolved = {
    lines: [] as ServiceJobDraft["lines"],
    questions: [] as string[],
  }
  for (const line of request.lines) {
    const page = pages.find((entry) => entry.name === line.name)?.page
    const choices = (page?.items ?? []).flatMap((item) =>
      item.variants.flatMap((variant) =>
        variant.offerings
          .filter((offering) => offering.kind === "service")
          .map((offering) => ({
            offeringId: offering.id,
            name:
              variant.name === offering.name
                ? variant.name
                : `${variant.name} · ${offering.name}`,
            aliases: [item.name, variant.name, offering.name],
            unitPriceMinor: offering.fixedPriceMinor ?? undefined,
            requiresQuote: offering.pricingPolicy === "quote_required",
            available:
              item.status === "active" &&
              variant.status === "active" &&
              offering.status === "active" &&
              offering.stores.some(
                (store) => store.storeId === scope.storeId && store.isAvailable,
              ),
          })),
      ),
    )
    const result = resolveServiceJobLines(
      { lines: [line] },
      choices,
      !!page && !page.nextCursor,
    )
    resolved.lines.push(...result.lines)
    resolved.questions.push(...result.questions)
  }
  let customerIssue: string | undefined
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
      customerIssue = `Select the exact saved customer named ${request.customerName} in the form.`
    const match = !customerIssue ? exact[0] : undefined
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
    totalMinor: resolved.lines.every((line) => line.totalMinor !== undefined)
      ? resolved.lines.reduce((sum, line) => sum + (line.totalMinor ?? 0), 0)
      : undefined,
    customerIssue,
    issues: resolved.lines.flatMap((line) => (line.issue ? [line.issue] : [])),
    notes: request.notes,
    assumptions: request.assumptions ?? [],
  })
  recordPreparation({
    kind: "service",
    durationMs: Date.now() - startedAt,
    lineCount: draft.lines.length,
    unresolvedCount: draft.issues?.length ?? 0,
    missingCount: draft.lines.filter((line) => line.resolution === "missing")
      .length,
  })
  return { status: "ready" as const, draft }
}
