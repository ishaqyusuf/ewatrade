import { listServiceAssignees } from "@ewatrade/db/queries"
import { z } from "zod"
import { createTRPCRouter } from "../trpc/init"
import { catalogRouter } from "../trpc/routers/catalog"
import { assertServiceManager } from "../trpc/routers/service-permissions"
import { servicesRouter } from "../trpc/routers/services"
import { type GeneralContext, requireGeneralScope } from "./general-context"
import { serviceIntakeOptionPage } from "./service-intake-option-page"

// Preserve the full protected procedure paths for scoped staff policy middleware.
const intakeOptionReads = createTRPCRouter({
  catalog: catalogRouter,
  services: servicesRouter,
})

export const generalServiceIntakeOptionsInput = z
  .object({
    query: z.string().trim().max(160).optional(),
    cursor: z.string().trim().min(1).max(1000).optional(),
    offeringAfter: z.string().trim().min(1).max(160).optional(),
  })
  .strict()
/** Canonical protected reads, supplied with fresh auth context by the tool wrapper. */
export async function readGeneralServiceIntakeOptions(
  ctx: GeneralContext,
  input: z.infer<typeof generalServiceIntakeOptionsInput>,
) {
  const scope = requireGeneralScope(ctx)
  assertServiceManager(ctx.tenantContext.membership.role)
  const caller = intakeOptionReads.createCaller(ctx)
  const [page, settings, assignees] = await Promise.all([
    caller.catalog.listItemsPage({
      kind: "service",
      status: "active",
      query: input.query,
      cursor: input.cursor,
      limit: 20,
      sort: { field: "name", direction: "asc" },
    }),
    caller.services.getSettings({ storeId: scope.storeId }),
    caller.services.assignees().then(async (authorized) => {
      const scoped = await listServiceAssignees(ctx.db, {
        tenantId: scope.tenantId,
        storeId: scope.storeId,
      })
      const authorizedIds = new Set(authorized.map((row) => row.id))
      return scoped.filter((row) => authorizedIds.has(row.id))
    }),
  ])
  const offerings = page.items.flatMap((item) =>
    item.variants
      .filter((v) => v.status === "active")
      .flatMap((variant) =>
        variant.offerings
          .filter(
            (o) =>
              o.kind === "service" &&
              o.status === "active" &&
              o.pricingPolicy === "fixed" &&
              o.stores.some(
                (s) => s.storeId === scope.storeId && s.isAvailable,
              ),
          )
          .map((o) => ({
            offeringId: o.id,
            itemName: item.name,
            variantName: variant.name,
            offeringName: o.name,
            fixedPriceMinor: o.fixedPriceMinor,
            service: o.serviceWorkPolicy,
          })),
      ),
  )
  return {
    storeId: scope.storeId,
    currencyCode:
      ctx.tenantContext.activeStore?.currencyCode ??
      ctx.tenantContext.tenant.currencyCode,
    ...serviceIntakeOptionPage(offerings, input, page.nextCursor),
    coverage: "bounded_catalog_page" as const,
    exhaustive: false,
    catalogItemsExamined: page.items.length,
    assignees,
    settings,
    note: "Fixed-price choices from one canonical catalog page. Follow continuation with the same query; do not treat this page or a capped search as all choices. Narrow ambiguous matches and keep distinct Offering IDs. Assignees are eligible at the current Store; confirmation rechecks access. Resolve saved customers through existing customer lookup. This read creates no Intake, Order, work or payment.",
  }
}
