import { createHash } from "node:crypto"
import {
  findBusinessProfile,
  readBusinessProfileKeyFromStoreMetadata,
} from "@ewatrade/utils/business-profiles"
import { catalogCategoryEmoji } from "@ewatrade/utils/catalog-category-emojis"
import { CATALOG_CATEGORY_PRESETS } from "@ewatrade/utils/catalog-category-presets"
import {
  CATEGORY_SUGGESTION_CONFIG_KEY,
  type CatalogCategorySuggestion,
  readCategorySuggestionConfiguration,
} from "@ewatrade/utils/catalog-category-suggestions"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  type CatalogPhotoActorScope,
  authorizeCatalogPhotoScope,
} from "./catalog-photos"

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
type Node = { id?: string; key: string; label: string }
type Tree = Node & { children: Node[] }

/** Authorize and read a complete, bounded snapshot before any external work.
 * No provider request is made while a database transaction/permission lock is held. */
export async function readCategorySuggestionContext(
  db: PrismaClient,
  scope: CatalogPhotoActorScope,
  reserveBudget: boolean,
) {
  return db.$transaction(
    async (tx) => {
      const tenant = await authorizeCatalogPhotoScope(tx, scope)
      const row = await tx.systemConfiguration.findUnique({
        where: { key: CATEGORY_SUGGESTION_CONFIG_KEY },
      })
      const configuration = readCategorySuggestionConfiguration(row?.value)
      if (!configuration?.enabled) return { status: "disabled" as const }
      // Defense in depth for service callers that do not pass through tRPC middleware.
      if (tenant.dataClassification === "QA")
        return { status: "unavailable" as const }
      const store = await tx.store.findFirst({
        where: {
          id: scope.storeId,
          tenantId: scope.tenantId,
          status: "ACTIVE",
        },
        select: { metadata: true },
      })
      if (!store) return { status: "unavailable" as const }
      const profileKey = readBusinessProfileKeyFromStoreMetadata(store.metadata)
      const profile = findBusinessProfile(profileKey)
      const saved = await tx.catalogCategory.findMany({
        where: { tenantId: scope.tenantId },
        select: { id: true, key: true, label: true, parentId: true },
        orderBy: { id: "asc" },
        take: 1201,
      })
      // Never silently send an incomplete tree when the business exceeds the budget.
      if (saved.length > 1200) return { status: "unavailable" as const }
      const trees: Tree[] = []
      const merged = new Set<string>()
      for (const preset of CATALOG_CATEGORY_PRESETS.filter((entry) =>
        entry.itemKinds.includes("product"),
      )) {
        const stored = saved.find(
          (entry) => !entry.parentId && entry.key === `preset:${preset.key}`,
        )
        // A renamed preset root cannot safely materialize virtual children via
        // the legacy label resolver. Keep the complete manual picker available.
        if (stored && stored.label !== preset.label)
          return { status: "unavailable" as const }
        if (stored) merged.add(stored.id)
        const children: Node[] = preset.subcategories.map((child) => {
          const persisted =
            stored &&
            saved.find(
              (entry) =>
                entry.parentId === stored.id &&
                entry.key === `preset:${child.key}`,
            )
          return {
            key: `preset:${child.key}`,
            label: persisted?.label ?? child.label,
            id: persisted?.id,
          }
        })
        if (stored)
          for (const child of saved.filter(
            (entry) => entry.parentId === stored.id,
          )) {
            if (!children.some((entry) => entry.id === child.id))
              children.push(child)
          }
        trees.push({
          key: `preset:${preset.key}`,
          label: preset.label,
          id: stored?.id,
          children,
        })
      }
      for (const root of saved.filter(
        (entry) => !entry.parentId && !merged.has(entry.id),
      )) {
        const preset = CATALOG_CATEGORY_PRESETS.find(
          (entry) => `preset:${entry.key}` === root.key,
        )
        if (preset && !preset.itemKinds.includes("product")) continue
        trees.push({
          ...root,
          children: saved.filter((entry) => entry.parentId === root.id),
        })
      }
      const candidates: CatalogCategorySuggestion[] = []
      const add = (root: Tree, child?: Node) => {
        const category = child ? `${root.label} / ${child.label}` : root.label
        if (category.length > 120) return
        // Virtual preset children materialize through the existing label resolver.
        // Passing a persisted parent alone would lose that virtual child at save.
        const persisted = Boolean(root.id && (!child || child.id))
        candidates.push({
          key: `path-${candidates.length + 1}`,
          rootKey: root.key,
          childKey: child?.key ?? null,
          rootLabel: root.label,
          childLabel: child?.label ?? null,
          category,
          ...(persisted
            ? { categoryId: root.id, subcategoryId: child?.id }
            : {}),
          emoji: catalogCategoryEmoji(child?.key ?? root.key),
        })
      }
      for (const root of trees) {
        add(root)
        for (const child of root.children) add(root, child)
      }
      const business = {
        key: profileKey,
        title: profile?.title ?? "Other / mixed business",
      }
      const fingerprint = hash(
        JSON.stringify({
          revision: row?.revision,
          configuration,
          business,
          candidates,
        }),
      )
      if (reserveBudget) {
        const scopeKey = hash(`${scope.tenantId}:${scope.actorUserId}`)
        const now = new Date()
        await tx.catalogCategorySuggestionBudget.upsert({
          where: { scopeKey },
          create: { scopeKey, windowStartedAt: now },
          update: {},
        })
        const [budget] = await tx.$queryRaw<
          Array<{ requests: number; windowStartedAt: Date }>
        >(Prisma.sql`
        SELECT "requests", "windowStartedAt" FROM "CatalogCategorySuggestionBudget"
        WHERE "scopeKey" = ${scopeKey} FOR UPDATE
      `)
        if (!budget) return { status: "unavailable" as const }
        const reset = now.getTime() - budget.windowStartedAt.getTime() >= 60_000
        if (!reset && budget.requests >= 10)
          return { status: "unavailable" as const }
        await tx.catalogCategorySuggestionBudget.update({
          where: { scopeKey },
          data: reset
            ? { windowStartedAt: now, requests: 1 }
            : { requests: { increment: 1 } },
        })
      }
      return {
        status: "ready" as const,
        configuration,
        business,
        candidates,
        fingerprint,
      }
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
