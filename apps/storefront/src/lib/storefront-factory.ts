import {
  countPublicStorefrontOfferings,
  loadLiveStorefrontForHost,
  siteContentHash,
} from "@ewatrade/db/queries"
import { storefrontActionSchema } from "@ewatrade/storefront-contracts/actions"
import { STOREFRONT_RUNTIME_VERSION } from "@ewatrade/storefront-contracts/manifest"
import {
  ORDERING_TEMPLATE_KEYS,
  orderingFulfilmentMethods,
} from "@ewatrade/storefront-contracts/orders"
import { catalogQuerySchema } from "@ewatrade/storefront-contracts/resources"
import {
  itemWhatsAppUrl,
  serviceRequestUrl,
} from "@ewatrade/storefront-runtime/links"
import { publicStorefrontResources } from "@ewatrade/storefront-runtime/projection"
import {
  handleStorefrontAction,
  loadStorefront,
} from "@ewatrade/storefront-runtime/server"
import { templateRegistry } from "@ewatrade/storefront-templates"
import {
  buildCustomerChatEntryUrl,
  resolveCustomerChatOrigin,
} from "@ewatrade/utils"
import { withLocalQaStorefrontPhotos } from "./local-qa-storefront-photos"
import { storefrontOtpAdapter } from "./storefront-commerce"

type Db = Parameters<typeof loadLiveStorefrontForHost>[0]

/** Request-local only. Scope comes from verified Host → Site → its active release. */
function factoryDependencies(db: Db, host: string, query: unknown) {
  const checkedQuery = catalogQuerySchema.safeParse(query)
  const parsed = checkedQuery.success ? checkedQuery.data : {}
  const current = loadLiveStorefrontForHost(
    db,
    host,
    parsed.after,
    parsed,
  ).then(async (value) => {
    if (!value) return null
    const release = value.site.release
    const pinned = release.composition as {
      template?: { key?: unknown; version?: unknown }
    } | null
    if (
      release.runtimeVersion !== STOREFRONT_RUNTIME_VERSION ||
      release.contentHash !== siteContentHash(release.composition) ||
      pinned?.template?.key !== release.templateKey ||
      pinned?.template?.version !== release.templateVersion
    )
      return null
    const storefront = await withLocalQaStorefrontPhotos(value.storefront, host)
    return storefront ? { ...value, storefront } : null
  })
  return {
    registry: templateRegistry,
    current,
    resolveSite: async () => {
      const value = await current
      if (!value) return null
      const { site, storefront } = value
      return {
        scope: {
          tenantId: site.release.tenantId,
          siteId: site.siteId,
          storeId: site.storeId,
          releaseId: site.release.id,
          mode: storefront.isQaPreview
            ? ("preview" as const)
            : ("live" as const),
          locale: "en-NG",
          currencyCode: storefront.currencyCode,
        },
        composition: site.release.composition,
      }
    },
    loadResources: async () => {
      const value = await current
      if (!value) throw new Error("Storefront is unavailable.")
      const store = value.storefront as typeof value.storefront & {
        customerRequestsAllowed?: boolean
        hasBusinessContact?: boolean
        storefrontItems?: number | null
      }
      const adaptive = ORDERING_TEMPLATE_KEYS.includes(
        value.site.release.templateKey,
      )
      const offeringCounts = adaptive
        ? await countPublicStorefrontOfferings(db, {
            tenantId: value.site.release.tenantId,
            storeId: value.site.storeId,
            storefrontItems: store.storefrontItems ?? null,
          })
        : undefined
      // Presentation hints only; every write re-derives these facts on the server.
      const ordering =
        ORDERING_TEMPLATE_KEYS.includes(value.site.release.templateKey) &&
        Boolean(store.customerRequestsAllowed)
      const otp = ordering
        ? storefrontOtpAdapter({ qaTenant: Boolean(store.isQaPreview) })
        : null
      return publicStorefrontResources({
        ...value.storefront,
        ...(offeringCounts ? { offeringCounts } : {}),
        ...(ORDERING_TEMPLATE_KEYS.includes(value.site.release.templateKey)
          ? {
              commerce: {
                orderRequests: ordering
                  ? { available: (offeringCounts?.products ?? 0) > 0 }
                  : { available: false, reason: "Not taking order requests." },
                customerAccounts: otp
                  ? { available: true, channels: otp.channels }
                  : {
                      available: false,
                      reason: "Login isn't available.",
                      channels: [],
                    },
                fulfilment: orderingFulfilmentMethods(
                  value.site.release.composition,
                ),
                hasContact: Boolean(store.hasBusinessContact),
              },
            }
          : {}),
      })
    },
  }
}

/** Prepared route adapter; publication, not schema creation, activates a Store. */
export async function loadFactoryStorefront(
  db: Db,
  host: string,
  query: unknown = {},
) {
  const deps = factoryDependencies(db, host, query)
  const load = await loadStorefront(deps, query)
  return { load, storefront: (await deps.current)?.storefront ?? null }
}

/** Re-reads exact public eligibility on every invocation; this only returns safe links. */
export async function handleFactoryStorefrontAction(
  db: Db,
  host: string,
  input: unknown,
) {
  const action = storefrontActionSchema.parse(input)
  const deps = factoryDependencies(
    db,
    host,
    "itemId" in action ? { item: action.itemId } : {},
  )
  return handleStorefrontAction(
    {
      ...deps,
      live: async (requested) => {
        const value = await deps.current
        const unavailable = {
          status: "unavailable" as const,
          message: "This is not available right now.",
        }
        if (!value) return unavailable
        const store = value.storefront
        const origin = resolveCustomerChatOrigin({
          chatUrl: process.env.NEXT_PUBLIC_CHAT_URL ?? process.env.CHAT_URL,
          storefrontUrl:
            process.env.NEXT_PUBLIC_STOREFRONT_URL ??
            process.env.STOREFRONT_URL,
        })
        if (requested.type === "openConversation") {
          return store.chatToken
            ? {
                status: "navigate" as const,
                href: buildCustomerChatEntryUrl({
                  origin,
                  publicToken: store.chatToken,
                }),
              }
            : unavailable
        }
        const item =
          store.highlightedItem?.id === requested.itemId
            ? store.highlightedItem
            : store.items.find((entry) => entry.id === requested.itemId)
        if (!item) return unavailable
        if (requested.type === "openItem") {
          return {
            status: "navigate" as const,
            href: `?item=${encodeURIComponent(item.id)}`,
          }
        }
        if (requested.type === "openServiceRequest") {
          const href = serviceRequestUrl(
            `https://${host}`,
            store.serviceRequestEntry,
            item,
            requested.offeringId,
            requested.offeringIds,
          )
          return href &&
            JSON.stringify(
              new URL(href).searchParams.getAll("serviceOfferingId"),
            ) ===
              JSON.stringify(requested.offeringIds ?? [requested.offeringId])
            ? { status: "navigate" as const, href }
            : unavailable
        }
        const page = new URL(`https://${host}/`)
        page.searchParams.set("item", item.id)
        const href = itemWhatsAppUrl(
          store.whatsAppPhone,
          item,
          page.toString(),
          requested.optionIds,
        )
        return href ? { status: "navigate" as const, href } : unavailable
      },
    },
    action,
  )
}
