"use client"

import {
  useStorefrontEvents,
  useStorefrontItemView,
} from "@ewatrade/events/storefront-client"

import {
  handleStorefrontItemClick,
  productWhatsAppUrl,
  serviceRequestUrl,
  storefrontItemHref,
} from "@ewatrade/storefront-runtime/links"
import {
  StorefrontArtwork,
  StorefrontPrice,
  availabilityLabel,
  formatStorefrontPrice,
} from "@ewatrade/storefront-runtime/primitives"
import { shareStorefrontLink } from "@ewatrade/storefront-runtime/share"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@ewatrade/ui"
import { Share08Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react"
import type { CatalogV4Layout } from "./layout"
import type { CatalogV4Item, CatalogV4Store } from "./types"

export function StorefrontCatalog({
  store,
  domain,
  after,
  customerChatOrigin,
  layout,
  staticParts,
}: {
  store: CatalogV4Store
  domain: string
  after?: string
  customerChatOrigin: string
  layout: CatalogV4Layout
  staticParts: { brand: ReactNode; hero: ReactNode; footer: ReactNode }
}) {
  const [selected, setSelected] = useState<CatalogV4Item | null>(
    store.highlightedItem,
  )
  const events = useStorefrontEvents()
  useStorefrontItemView(selected)
  const [feedback, setFeedback] = useState("")
  const [manualLink, setManualLink] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const opener = useRef<HTMLElement | null>(null)
  const shopUrl = `https://${domain}/`
  const chatUrl = productWhatsAppUrl(
    store.whatsAppPhone,
    "your products and services",
    shopUrl,
  )
  const listingUrl = (category?: string | null, cursor?: string | null) => {
    const params = new URLSearchParams()
    if (category) params.set("category", category)
    if (cursor) params.set("after", cursor)
    return params.size ? `?${params}` : "/"
  }
  const itemUrl = (item: CatalogV4Item) =>
    `${shopUrl}?item=${encodeURIComponent(item.id)}`
  function openItem(item: CatalogV4Item, trigger: HTMLElement) {
    setFeedback("")
    setManualLink(null)
    opener.current = trigger
    setSelected(item)
    document.title = `${item.name} | ${store.name}`
    const url = new URL(window.location.href)
    url.searchParams.set("item", item.id)
    window.history.replaceState(null, "", url)
  }
  function closeItem() {
    setSelected(null)
    document.title = `${store.name} | ẸwáTrade`
    setFeedback("")
    setManualLink(null)
    const url = new URL(window.location.href)
    url.searchParams.delete("item")
    window.history.replaceState(null, "", url)
    opener.current?.focus()
  }
  async function share(item?: CatalogV4Item, copyOnly = false) {
    if (store.isDraftPreview) {
      setFeedback("Preview only — no link was shared or copied.")
      return
    }
    setSharing(true)
    setFeedback("")
    setManualLink(null)
    const url = item ? itemUrl(item) : shopUrl
    const result = await shareStorefrontLink(
      { title: item ? `${item.name} · ${store.name}` : store.name, url },
      {
        share:
          !copyOnly && navigator.share
            ? (request) => navigator.share(request)
            : undefined,
        copy: navigator.clipboard
          ? (value) => navigator.clipboard.writeText(value)
          : undefined,
      },
    )
    setFeedback(
      result === "copied"
        ? "Link copied."
        : result === "shared"
          ? "Link shared."
          : result === "unavailable"
            ? "Sharing isn’t available in this browser. You can copy the link below."
            : "",
    )
    if (result === "unavailable") setManualLink(url)
    setSharing(false)
    if (result === "shared" || result === "copied")
      events.track("storefront_link_shared", { status: result })
  }
  useEffect(() => {
    if (!feedback) return
    const timer = setTimeout(() => setFeedback(""), 5000)
    return () => clearTimeout(timer)
  }, [feedback])
  const askButton = (item: CatalogV4Item, card = false) => {
    const requestHref = serviceRequestUrl(
      shopUrl,
      store.serviceRequestEntry,
      item,
    )
    if (requestHref) {
      return (
        <Button
          variant={card ? "outline" : "default"}
          className={card ? "sf-ask-item" : undefined}
          render={
            <a
              href={requestHref}
              data-storefront-event="storefront_request_started"
            >
              Request service
            </a>
          }
          aria-label={`Request ${item.name}`}
        >
          Request service
        </Button>
      )
    }
    const href = productWhatsAppUrl(
      store.whatsAppPhone,
      item.name,
      itemUrl(item),
    )
    if (!href && !store.isQaPreview) return null
    return (
      <Button
        variant={card ? "outline" : "default"}
        className={card ? "sf-ask-item" : undefined}
        disabled={!href}
        aria-label={`Ask about ${item.name} on WhatsApp${store.isQaPreview ? " (disabled in QA)" : ""}`}
        render={
          href ? (
            <a
              aria-label={`Ask about ${item.name} on WhatsApp`}
              data-storefront-event="storefront_whatsapp_clicked"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ask on WhatsApp
            </a>
          ) : undefined
        }
      >
        Ask on WhatsApp
      </Button>
    )
  }
  const shareButton = (
    item?: CatalogV4Item,
    label = "Share",
    className = "",
  ) => (
    <Button
      variant="outline"
      className={className}
      disabled={sharing}
      onClick={() => void share(item)}
    >
      <HugeiconsIcon icon={Share08Icon} data-icon="inline-start" />
      {label}
    </Button>
  )
  const shareFeedback = (insideDialog = false) => (
    <div className={insideDialog ? "sf-detail-feedback" : undefined}>
      {feedback ? <output className="sf-feedback">{feedback}</output> : null}
      {manualLink ? (
        <div className="sf-manual-link">
          <a href={manualLink}>{manualLink}</a>
          <Button variant="ghost" onClick={() => setManualLink(null)}>
            Dismiss
          </Button>
        </div>
      ) : null}
    </div>
  )
  const catalogSection = (
    <section key="catalog" aria-labelledby="storefront-catalog-heading">
      <h2 id="storefront-catalog-heading" className="sf-section-heading">
        Products &amp; services
      </h2>
      {layout.showCategories && store.categories.length > 1 ? (
        <nav aria-label="Categories" className="sf-chips">
          <Link
            prefetch={false}
            href="/"
            aria-current={!store.category ? "page" : undefined}
          >
            All
          </Link>
          {store.categories.map((category) => (
            <Link
              prefetch={false}
              key={category.id}
              href={listingUrl(category.id)}
              aria-current={store.category === category.id ? "page" : undefined}
            >
              {category.name}
            </Link>
          ))}
        </nav>
      ) : null}
      {store.items.length ? (
        <div
          className={
            store.items.length <= 3 ? "sf-grid sf-grid-few" : "sf-grid"
          }
        >
          {store.items.map((item) => (
            <article className="sf-card" key={item.id}>
              <Button
                variant="ghost"
                className="sf-card-trigger"
                aria-label={`${item.name}, view details`}
                render={
                  // biome-ignore lint/a11y/useAnchorContent: Button renders its visible children into this anchor.
                  <a href={storefrontItemHref(item.id)} />
                }
                onClick={(event) =>
                  handleStorefrontItemClick(event, () =>
                    openItem(item, event.currentTarget),
                  )
                }
              >
                <StorefrontArtwork item={item} />
                <div className="sf-card-body">
                  <h3 title={item.name}>{item.name}</h3>
                  <StorefrontPrice
                    item={item}
                    chatAvailable={!!chatUrl || !!store.whatsAppPhone}
                  />
                </div>
              </Button>
              {askButton(item, true)}
            </article>
          ))}
        </div>
      ) : (
        <Empty className="sf-empty">
          <EmptyHeader>
            <div className="sf-empty-art" aria-hidden="true">
              {["ill-tote-bag", "ill-gift-box", "ill-shopping-bag"].map(
                (illustrationId) => (
                  <StorefrontArtwork
                    key={illustrationId}
                    item={{ id: illustrationId, name: "", illustrationId }}
                  />
                ),
              )}
            </div>
            <EmptyTitle>
              {store.category
                ? "No items in this category"
                : "New items are on the way"}
            </EmptyTitle>
            <EmptyDescription>
              {store.category
                ? "Try another category to see what’s available."
                : `${store.name} is adding its products and services. Check back soon.`}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="sf-empty-actions">
              {store.category ? (
                <Button
                  variant="outline"
                  render={<Link prefetch={false} href="/" />}
                >
                  View all items
                </Button>
              ) : null}
              {chatUrl ? (
                <Button
                  render={
                    <a
                      aria-label="Enquire on WhatsApp"
                      href={chatUrl}
                      data-storefront-event="storefront_whatsapp_clicked"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Enquire on WhatsApp
                    </a>
                  }
                >
                  Enquire on WhatsApp
                </Button>
              ) : null}
              {shareButton(undefined, "Share this shop")}
            </div>
          </EmptyContent>
        </Empty>
      )}
      {store.hasHiddenItems ? (
        <p className="sf-limited">
          A selection of this shop’s items.
          {chatUrl ? " Enquire on WhatsApp to ask about others." : ""}
        </p>
      ) : null}
      {store.nextCursor || after ? (
        <nav aria-label="More items" className="sf-pager">
          {store.nextCursor ? (
            <Button
              variant="outline"
              render={
                <Link
                  prefetch={false}
                  href={listingUrl(store.category, store.nextCursor)}
                />
              }
            >
              Show more
            </Button>
          ) : null}
          {after ? (
            <Link prefetch={false} href={listingUrl(store.category)}>
              Back to start
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  )
  return (
    <div className="sf-catalog" style={layout.themeStyle}>
      {store.isQaPreview ? (
        <div className="sf-qa">
          <div className="sf-wrap">
            {store.isDraftPreview
              ? "Private draft preview · customer actions disabled"
              : "Local QA preview"}
          </div>
        </div>
      ) : null}
      <header className="sf-top">
        <div className="sf-wrap sf-top-inner">
          {staticParts.brand}
          <div className="sf-top-actions">
            {shareButton(
              undefined,
              "Share",
              chatUrl ? "sf-share-top sf-secondary-action" : "sf-share-top",
            )}
            {chatUrl ? (
              <Button
                render={
                  <a
                    aria-label="Enquire on WhatsApp"
                    href={chatUrl}
                    data-storefront-event="storefront_whatsapp_clicked"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Enquire on WhatsApp
                  </a>
                }
              >
                WhatsApp
              </Button>
            ) : null}
          </div>
        </div>
      </header>
      <main>
        {layout.regions.map((region) =>
          region.type === "contact" ? (
            <Fragment key="contact">{staticParts.footer}</Fragment>
          ) : (
            <div className="sf-wrap" key={`main-${region.sections.join("-")}`}>
              {region.sections.map((type) =>
                type === "catalog-header" ? staticParts.hero : catalogSection,
              )}
            </div>
          ),
        )}
      </main>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) closeItem()
        }}
      >
        <DialogContent
          className="sf-dialog"
          aria-describedby={
            selected?.description ? "storefront-item-description" : undefined
          }
        >
          {selected ? (
            <>
              <StorefrontArtwork item={selected} />
              <div className="sf-detail-body">
                <p className="sf-detail-category">
                  {selected.category?.name ??
                    (selected.kind === "SERVICE" ? "Service" : "Product")}
                </p>
                <DialogTitle className="sf-detail-title">
                  {selected.name}
                </DialogTitle>
                <StorefrontPrice
                  item={selected}
                  chatAvailable={!!chatUrl || !!store.whatsAppPhone}
                />
                {availabilityLabel(selected.availability) ? (
                  <p className="sf-detail-availability">
                    {availabilityLabel(selected.availability)}
                    {selected.availability === "MADE_TO_ORDER"
                      ? " · ask the shop about timing"
                      : ""}
                  </p>
                ) : null}
                {selected.description ? (
                  <DialogDescription
                    id="storefront-item-description"
                    className="sf-detail-description"
                  >
                    {selected.description}
                  </DialogDescription>
                ) : null}
                {selected.options.length > 1 ? (
                  <section
                    className="sf-options"
                    aria-label="Available options"
                  >
                    <h3>Options</h3>
                    <ul>
                      {selected.options.map((option) => (
                        <li key={option.id}>
                          <span>{option.name}</span>
                          <span>
                            {option.availability === "OUT_OF_STOCK"
                              ? "Out of stock"
                              : option.priceMinor !== null
                                ? formatStorefrontPrice(
                                    option.priceMinor,
                                    option.currencyCode,
                                  )
                                : "Price not listed"}
                            {option.availability === "MADE_TO_ORDER"
                              ? " · Made to order"
                              : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                <div className="sf-detail-actions">
                  {askButton(selected)}
                  {shareButton(selected, "Share item")}
                  <Button
                    variant="ghost"
                    onClick={() => void share(selected, true)}
                    disabled={sharing}
                  >
                    Copy item link
                  </Button>
                </div>
                {store.isQaPreview ? (
                  <p className="sf-contact-note">
                    WhatsApp enquiries are disabled in this local QA preview.
                  </p>
                ) : null}
                {shareFeedback(true)}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      {!selected ? shareFeedback() : null}
    </div>
  )
}
