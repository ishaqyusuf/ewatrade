import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import {
  CatalogError,
  archiveCatalogOffering,
  archiveCatalogVariantInTransaction,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { proposalDigest } from "./proposal-security"

type Action = Extract<GeneralAction, { action: "catalog_archive" }>

/**
 * The Product, each requested unit/variant with its impact, and what stays
 * sellable afterwards. Anything already archived, from another Product or
 * still reserved by open orders refuses the whole draft with its reason.
 */
async function archiveTarget(ctx: GeneralTransactionContext, payload: Action) {
  const scope = requireGeneralScope(ctx)
  const item = await ctx.db.catalogItem.findFirst({
    where: {
      id: payload.catalogItemId,
      tenantId: scope.tenantId,
      systemRole: null,
    },
    select: {
      id: true,
      name: true,
      status: true,
      updatedAt: true,
      variants: {
        select: {
          id: true,
          name: true,
          status: true,
          updatedAt: true,
          offerings: {
            select: {
              id: true,
              name: true,
              status: true,
              revision: true,
              updatedAt: true,
              _count: {
                select: {
                  stockReservations: { where: { status: "ACTIVE" } },
                },
              },
            },
          },
        },
      },
    },
  })
  if (!item)
    throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." })
  const offerings = item.variants.flatMap((variant) =>
    variant.offerings.map((offering) => ({ ...offering, variant })),
  )
  const problems: string[] = []
  const archiving = new Set<string>()
  const lines: string[] = [item.name]
  // A variant already archives its own units; listing both would let "Keep
  // selling" on the unit be silently overridden by its variant.
  const variantTargets = new Set(
    payload.targets.flatMap((target) =>
      target.kind === "variant" ? [target.variantId] : [],
    ),
  )
  for (const target of payload.targets) {
    if (target.kind === "offering") {
      const offering = offerings.find((row) => row.id === target.offeringId)
      if (!offering) {
        problems.push("A selling unit is not part of this Product.")
        continue
      }
      const label = `${offering.variant.name} · ${offering.name}`
      if (variantTargets.has(offering.variant.id)) {
        problems.push(
          `${label} is already included in variant ${offering.variant.name}; choose the variant or the unit, not both.`,
        )
        continue
      }
      if (offering.status === "ARCHIVED") {
        problems.push(`${label} is already archived.`)
        continue
      }
      if (offering._count.stockReservations)
        problems.push(
          `${label} is reserved by ${offering._count.stockReservations} open order line(s). Fulfil or release them first.`,
        )
      archiving.add(offering.id)
      lines.push(`Archive selling unit: ${label}`)
    } else {
      const variant = item.variants.find((row) => row.id === target.variantId)
      if (!variant) {
        problems.push("A variant is not part of this Product.")
        continue
      }
      if (variant.status === "ARCHIVED") {
        problems.push(`${variant.name} is already archived.`)
        continue
      }
      const active = variant.offerings.filter((o) => o.status !== "ARCHIVED")
      const reserved = active.reduce(
        (sum, offering) => sum + offering._count.stockReservations,
        0,
      )
      if (reserved)
        problems.push(
          `${variant.name} is reserved by ${reserved} open order line(s). Fulfil or release them first.`,
        )
      for (const offering of active) archiving.add(offering.id)
      lines.push(
        `Archive variant: ${variant.name} and its ${active.length} selling unit(s)`,
      )
    }
  }
  if (problems.length)
    throw new TRPCError({ code: "CONFLICT", message: problems.join(" ") })
  // Bound to what the records prove: active (published) units versus draft
  // units, which progressive availability may still allow. No Store
  // availability is claimed here because it is not read.
  const left = offerings.filter((offering) => !archiving.has(offering.id))
  const active = left.filter((offering) => offering.status === "ACTIVE")
  const drafts = left.filter((offering) => offering.status === "DRAFT")
  const remainingSummary = active.length
    ? `Active selling units left afterwards: ${active.length}.`
    : `${item.name} will have no active selling units left.`
  lines.push(remainingSummary)
  if (drafts.length)
    lines.push(
      `${drafts.length} draft selling unit(s) also remain and are not archived by this change.`,
    )
  lines.push(
    "Applies in every Store. Saved orders, prices, stock quantities and history stay unchanged.",
    `Reason: ${payload.reason}`,
  )
  return {
    item,
    lines,
    remainingSummary,
    target: {
      id: item.id,
      revision: proposalDigest({
        item: { id: item.id, status: item.status, updatedAt: item.updatedAt },
        offerings: offerings.map((offering) => ({
          id: offering.id,
          status: offering.status,
          revision: offering.revision,
          reserved: offering._count.stockReservations,
        })),
        variants: item.variants.map((variant) => ({
          id: variant.id,
          status: variant.status,
          updatedAt: variant.updatedAt,
        })),
      }),
    },
  }
}

export const catalogArchive: GeneralActionAdapter<Action> = {
  async validate(ctx, payload) {
    return (await archiveTarget(ctx, payload)).target
  },
  async review(ctx, payload) {
    const { lines, target } = await archiveTarget(ctx, payload)
    return { lines, target }
  },
  stale: "This Product changed. Edit and review the archive again.",
  unavailable:
    "These selling units can't be archived now. Check the Product before trying again.",
  async execute(ctx, payload) {
    const scope = requireGeneralScope(ctx)
    const { item, remainingSummary } = await archiveTarget(ctx, payload)
    const outcomes: string[] = []
    try {
      for (const target of payload.targets) {
        if (target.kind === "offering") {
          const saved = await archiveCatalogOffering(ctx.db, {
            tenantId: scope.tenantId,
            offeringId: target.offeringId,
          })
          outcomes.push(`${saved.name} archived`)
        } else {
          const saved = await archiveCatalogVariantInTransaction(ctx.db, {
            tenantId: scope.tenantId,
            variantId: target.variantId,
          })
          outcomes.push(`${saved.name} archived with its selling units`)
        }
      }
    } catch (error) {
      if (error instanceof CatalogError)
        throw new TRPCError({ code: "CONFLICT", message: error.message })
      throw error
    }
    return {
      kind: "product",
      recordId: item.id,
      title: "Archived from sale",
      detail: `${item.name} · ${outcomes.join(" · ")} · ${remainingSummary}`,
    }
  },
}
