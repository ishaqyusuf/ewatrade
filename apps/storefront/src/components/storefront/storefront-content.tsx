import { formatStorefrontPrice } from "@ewatrade/storefront-runtime/presentation"
import {
  serializeStorefrontStructuredData,
  storefrontIndexingEnabled,
  storefrontStructuredData,
} from "@ewatrade/storefront-runtime/seo"
import type { StorefrontClientSnapshot } from "@ewatrade/storefront-runtime/server"
import { StorefrontTemplate } from "@ewatrade/storefront-templates/render"
import { getStorefrontDomain, resolveCustomerChatOrigin } from "@ewatrade/utils"
import "@ewatrade/storefront-templates/styles.css"

export function StorefrontContent({
  snapshot,
  after,
  pageKey,
}: { snapshot: StorefrontClientSnapshot; after?: string; pageKey?: string }) {
  const { resources } = snapshot
  const store = {
    ...resources.business,
    ...resources.catalog,
    ...resources.contact,
    isQaPreview: snapshot.mode === "preview",
  }
  const domain = `${store.slug}.${getStorefrontDomain(process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com")}`
  const customerChatOrigin = resolveCustomerChatOrigin({
    chatUrl: process.env.NEXT_PUBLIC_CHAT_URL ?? process.env.CHAT_URL,
    storefrontUrl:
      process.env.NEXT_PUBLIC_STOREFRONT_URL ?? process.env.STOREFRONT_URL,
  })
  return (
    <>
      {snapshot.mode === "live" && storefrontIndexingEnabled(process.env) ? (
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON serialization escapes every less-than character.
          dangerouslySetInnerHTML={{
            __html: serializeStorefrontStructuredData(
              storefrontStructuredData(
                store,
                process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com",
                {
                  page: pageKey === "about" ? "about" : "home",
                  after,
                  category: store.category,
                },
              ),
            ),
          }}
        />
      ) : null}
      {store.highlightedItem && pageKey !== "about" ? (
        <noscript>
          <article>
            <h1>{store.highlightedItem.name}</h1>
            <p>{store.highlightedItem.description}</p>
            {store.highlightedItem.options.map((option) => (
              <p key={option.id}>
                {option.name}:{" "}
                {option.priceMinor === null
                  ? "Ask for a price"
                  : formatStorefrontPrice(
                      option.priceMinor,
                      option.currencyCode,
                    )}
                {option.availability === "OUT_OF_STOCK"
                  ? " · Out of stock"
                  : ""}
              </p>
            ))}
            <a href="/">Visit {store.name}</a>
          </article>
        </noscript>
      ) : null}
      <StorefrontTemplate
        snapshot={snapshot}
        domain={domain}
        after={after}
        pageKey={pageKey}
        customerChatOrigin={customerChatOrigin}
        syncUrl
      />
    </>
  )
}
