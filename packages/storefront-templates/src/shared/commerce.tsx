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
import {
  StorefrontRuntimeProvider,
  useOfferingOptions,
  useStorefrontAction,
  useStorefrontCatalog,
  useStorefrontContact,
  useStorefrontContext,
} from "@ewatrade/storefront-runtime/react"
import type { StorefrontClientSnapshot } from "@ewatrade/storefront-runtime/server"
import { shareStorefrontLink } from "@ewatrade/storefront-runtime/share"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ewatrade/ui"
import Link from "next/link"
import type { ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import {
  type StorefrontAction,
  storefrontActionResultSchema,
} from "../../../storefront-contracts/src/actions"
import type { PublicCatalogItem } from "../../../storefront-contracts/src/resources"

/** Host route retains scope and authority; the templates request typed navigation only. */
export function TemplateHost({
  snapshot,
  children,
}: { snapshot: StorefrontClientSnapshot; children: ReactNode }) {
  return (
    <StorefrontRuntimeProvider
      snapshot={snapshot}
      onAction={async (action) => {
        const response = await fetch("/api/storefront/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action),
          cache: "no-store",
        })
        if (!response.ok)
          return {
            status: "unavailable",
            message: "This action is unavailable. Please try again.",
          }
        return storefrontActionResultSchema.parse(await response.json())
      }}
    >
      {children}
    </StorefrontRuntimeProvider>
  )
}

export function useNavigation() {
  const events = useStorefrontEvents()
  const action = useStorefrontAction()
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const run = async (input: StorefrontAction) => {
    if (busy) return
    setBusy(true)
    try {
      const result = await action.run(input)
      if (!alive.current) return
      if (result.status === "navigate") {
        if (input.type === "whatsappEnquiry")
          events.track("storefront_whatsapp_clicked")
        if (input.type === "openServiceRequest")
          events.track("storefront_request_started")
        const url = new URL(result.href, window.location.origin)
        if (url.protocol !== "https:" && url.protocol !== "http:")
          throw new Error("Unsupported destination")
        window.location.assign(url.href)
      } else setNotice(result.message)
    } catch {
      if (alive.current)
        setNotice("This action couldn't be opened. Please try again.")
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  return { ...action, run, notice, busy }
}

export function TemplateActions({
  domain,
  item,
}: { domain: string; item?: PublicCatalogItem }) {
  const { mode, business } = useStorefrontContext()
  const events = useStorefrontEvents()
  const action = useNavigation()
  const contact = useStorefrontContact()
  const enquiryHref =
    mode === "live"
      ? productWhatsAppUrl(
          contact.whatsAppPhone,
          item?.name ?? "your products and services",
          item
            ? `https://${domain}${storefrontItemHref(item.id)}`
            : `https://${domain}/`,
        )
      : null
  const [sharing, setSharing] = useState(false)
  const [notice, setNotice] = useState("")
  const [manualLink, setManualLink] = useState(false)
  const publicUrl = item
    ? `https://${domain}/?item=${encodeURIComponent(item.id)}`
    : `https://${domain}/`
  const share = async () => {
    if (mode === "preview") {
      setNotice("Preview only — no link was shared or copied.")
      return
    }
    setSharing(true)
    const result = await shareStorefrontLink(
      {
        title: item ? `${item.name} · ${business.name}` : business.name,
        url: publicUrl,
      },
      {
        share: navigator.share ? (input) => navigator.share(input) : undefined,
        copy: navigator.clipboard
          ? (value) => navigator.clipboard.writeText(value)
          : undefined,
      },
    )
    setSharing(false)
    if (result === "shared" || result === "copied")
      events.track("storefront_link_shared", { status: result })
    setNotice(
      result === "shared"
        ? "Link shared."
        : result === "copied"
          ? "Link copied."
          : result === "unavailable"
            ? "Copy this shop link:"
            : "",
    )
    setManualLink(result === "unavailable")
  }
  return (
    <div className="tf-actions">
      <Button variant="ghost" disabled={sharing} onClick={() => void share()}>
        {item ? "Share item ↗" : "Share ↗"}
      </Button>
      {enquiryHref ? (
        <Button
          variant="ghost"
          render={
            <a
              aria-label="Enquire on WhatsApp"
              href={enquiryHref}
              data-storefront-event="storefront_whatsapp_clicked"
              target="_blank"
              rel="noopener noreferrer"
            >
              Enquire on WhatsApp
            </a>
          }
        >
          WhatsApp ↗
        </Button>
      ) : null}
      {notice || action.notice ? (
        <output>
          {notice || action.notice}
          {manualLink ? <a href={publicUrl}>{publicUrl}</a> : null}
        </output>
      ) : null}
    </div>
  )
}

/** Same-page catalog listing link; category and cursor stay server-loaded so no item is dropped. */
export function catalogListingHref(
  category?: string | null,
  after?: string | null,
) {
  const params = new URLSearchParams()
  if (category) params.set("category", category)
  if (after) params.set("after", after)
  return params.size ? `?${params}` : "/"
}

/**
 * One item-detail state for every layout: selection, option, ?item= URL, focus return,
 * and the canonical request/enquiry actions. "push" lets Back close the detail;
 * "none" is for embedded previews that must not touch the host page URL.
 */
export function useCommerceDetail({
  domain,
  initial,
  history = "replace",
}: {
  domain: string
  initial: PublicCatalogItem | null
  history?: "replace" | "push" | "none"
}) {
  const catalog = useStorefrontCatalog()
  const contact = useStorefrontContact()
  const { business } = useStorefrontContext()
  const action = useNavigation()
  const [selected, setSelected] = useState<PublicCatalogItem | null>(initial)
  useStorefrontItemView(selected)
  const [optionId, setOptionId] = useState("")
  const opener = useRef<HTMLElement | null>(null)
  const pushed = useRef(false)
  const options = useOfferingOptions(selected?.id ?? "")
  const currentOption =
    options.find((option) => option.id === optionId) ?? options[0]
  useEffect(() => {
    setSelected(initial)
    setOptionId("")
  }, [initial])
  useEffect(() => {
    if (history !== "push") return
    const sync = () => {
      pushed.current = false
      const id = new URL(window.location.href).searchParams.get("item")
      const item =
        (id &&
          [
            ...catalog.items,
            ...(catalog.highlightedItem ? [catalog.highlightedItem] : []),
          ].find((entry) => entry.id === id)) ||
        null
      setSelected(item)
      setOptionId(item?.options[0]?.id ?? "")
      document.title = item
        ? `${item.name} | ${business.name}`
        : `${business.name} | ẸwáTrade`
      if (!item) opener.current?.focus()
    }
    window.addEventListener("popstate", sync)
    return () => window.removeEventListener("popstate", sync)
  }, [history, catalog, business.name])
  const open = (item: PublicCatalogItem, trigger: HTMLElement) => {
    opener.current = trigger
    setSelected(item)
    setOptionId(item.options[0]?.id ?? "")
    if (history === "none") return
    document.title = `${item.name} | ${business.name}`
    const url = new URL(window.location.href)
    url.searchParams.set("item", item.id)
    if (history === "push" && !pushed.current) {
      window.history.pushState(null, "", url)
      pushed.current = true
    } else window.history.replaceState(null, "", url)
  }
  const close = () => {
    setSelected(null)
    if (history !== "none") {
      document.title = `${business.name} | ẸwáTrade`
      if (pushed.current) {
        pushed.current = false
        window.history.back()
      } else {
        const url = new URL(window.location.href)
        url.searchParams.delete("item")
        window.history.replaceState(null, "", url)
      }
    }
    opener.current?.focus()
  }
  // Existing entrypoint owns request scope/intake. No second request form or booking promise.
  const requestHref = selected
    ? serviceRequestUrl(
        `https://${domain}`,
        contact.serviceRequestEntry,
        selected,
        currentOption?.id,
      )
    : null
  const canRequest =
    selected?.kind === "SERVICE" &&
    !!currentOption &&
    requestHref &&
    new URL(requestHref).searchParams.get("serviceOfferingId") ===
      currentOption.id &&
    action.allowed({
      type: "openServiceRequest",
      itemId: selected.id,
      offeringId: currentOption.id,
    })
  const requestAction =
    selected && currentOption && canRequest
      ? {
          type: "openServiceRequest" as const,
          itemId: selected.id,
          offeringId: currentOption.id,
        }
      : null
  const itemAction =
    selected && action.allowed({ type: "whatsappEnquiry", itemId: selected.id })
      ? { type: "whatsappEnquiry" as const, itemId: selected.id }
      : null
  return {
    selected,
    options,
    currentOption,
    setOptionId,
    open,
    close,
    requestAction,
    itemAction,
    action,
  }
}

export function CommerceCollection({
  kind,
  heading,
  requestHeading,
  headingContent,
  requestHeadingContent,
  showCategories,
  customerChatOrigin,
  domain,
  after,
}: {
  kind: "retail" | "services"
  heading: string
  requestHeading?: string
  headingContent?: ReactNode
  requestHeadingContent?: ReactNode
  showCategories?: boolean
  customerChatOrigin: string
  domain: string
  after?: string
}) {
  const catalog = useStorefrontCatalog()
  const { mode, business } = useStorefrontContext()
  const items =
    kind === "services"
      ? catalog.items.filter((item) => item.kind === "SERVICE")
      : catalog.items
  const highlighted =
    kind === "services" && catalog.highlightedItem?.kind !== "SERVICE"
      ? null
      : catalog.highlightedItem
  const [requestItemId, setRequestItemId] = useState(items[0]?.id ?? "")
  const {
    selected,
    options,
    currentOption,
    setOptionId,
    open,
    close,
    requestAction,
    itemAction,
    action,
  } = useCommerceDetail({ domain, initial: highlighted })
  const listing = catalogListingHref
  return (
    <section
      className={`tf-collection tf-${kind}`}
      id="collection"
      aria-label={heading}
    >
      <div className="tf-section-head">
        <h2>{headingContent ?? heading}</h2>
        {showCategories && catalog.categories.length > 1 ? (
          <nav aria-label="Categories">
            <Link
              prefetch={false}
              href="/"
              aria-current={!catalog.category ? "page" : undefined}
            >
              All
            </Link>
            {catalog.categories.map((category) => (
              <Link
                prefetch={false}
                key={category.id}
                href={listing(category.id)}
                aria-current={
                  catalog.category === category.id ? "page" : undefined
                }
              >
                {category.name}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
      <div className={kind === "services" ? "tf-directory" : undefined}>
        {items.length ? (
          <div className={kind === "services" ? "tf-service-list" : "tf-grid"}>
            {items.map((item, index) =>
              kind === "services" ? (
                <article className="tf-service" key={item.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{item.name}</h3>
                    {item.description ? <p>{item.description}</p> : null}
                  </div>
                  <div>
                    <StorefrontPrice
                      item={item}
                      chatAvailable={
                        action.allowed({ type: "openConversation" }) ||
                        action.allowed({
                          type: "whatsappEnquiry",
                          itemId: item.id,
                        })
                      }
                    />
                    <Button
                      variant="outline"
                      render={
                        // biome-ignore lint/a11y/useAnchorContent: Button renders its visible children into this anchor.
                        <a href={storefrontItemHref(item.id)} />
                      }
                      onClick={(event) =>
                        handleStorefrontItemClick(event, () =>
                          open(item, event.currentTarget),
                        )
                      }
                    >
                      View offering ↗
                    </Button>
                  </div>
                </article>
              ) : (
                <article className="tf-product" key={item.id}>
                  <a
                    href={storefrontItemHref(item.id)}
                    onClick={(event) =>
                      handleStorefrontItemClick(event, () =>
                        open(item, event.currentTarget),
                      )
                    }
                  >
                    <StorefrontArtwork item={item} />
                    <div>
                      <h3>{item.name}</h3>
                      <StorefrontPrice
                        item={item}
                        chatAvailable={
                          action.allowed({ type: "openConversation" }) ||
                          action.allowed({
                            type: "whatsappEnquiry",
                            itemId: item.id,
                          })
                        }
                      />
                    </div>
                  </a>
                </article>
              ),
            )}
          </div>
        ) : (
          <div className="tf-empty">
            <h3>
              {kind === "services"
                ? "No services listed yet"
                : "The collection is being prepared"}
            </h3>
            <p>
              {catalog.category
                ? "Try another category to see what's available."
                : `Check back for ${business.name}'s latest ${kind === "services" ? "offerings" : "pieces"}.`}
            </p>
          </div>
        )}
        {kind === "services" ? (
          <aside className="tf-request">
            <h2>{requestHeadingContent ?? requestHeading}</h2>
            <p>
              Choose an offering to view its current options and how to contact
              the business.
            </p>
            {items.length ? (
              <>
                <label>
                  Offering
                  <select
                    value={
                      items.some((item) => item.id === requestItemId)
                        ? requestItemId
                        : items[0]?.id
                    }
                    onChange={(event) => setRequestItemId(event.target.value)}
                  >
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  onClick={(event) => {
                    const item =
                      items.find((item) => item.id === requestItemId) ??
                      items[0]
                    if (item) open(item, event.currentTarget)
                  }}
                >
                  View request options ↗
                </Button>
              </>
            ) : null}
            <p className="tf-help">
              A request does not confirm an appointment, price or order.
            </p>
          </aside>
        ) : null}
      </div>
      {catalog.hasHiddenItems ? (
        <p className="tf-help">A selection of this shop’s items is shown.</p>
      ) : null}
      {catalog.nextCursor || after ? (
        <nav className="tf-pagination" aria-label="More items">
          {catalog.nextCursor ? (
            <Link
              prefetch={false}
              href={listing(catalog.category, catalog.nextCursor)}
            >
              Show more
            </Link>
          ) : null}
          {after ? (
            <Link prefetch={false} href={listing(catalog.category)}>
              Back to start
            </Link>
          ) : null}
        </nav>
      ) : null}
      <Dialog
        open={!!selected}
        onOpenChange={(value) => {
          if (!value) close()
        }}
      >
        <DialogContent
          className="sf-dialog tf-detail"
          aria-describedby={
            selected?.description ? "tf-item-description" : undefined
          }
        >
          {selected ? (
            <>
              <DialogTitle>{selected.name}</DialogTitle>
              {selected.description ? (
                <DialogDescription id="tf-item-description">
                  {selected.description}
                </DialogDescription>
              ) : null}
              {selected.kind === "PRODUCT" ? (
                <StorefrontArtwork item={selected} />
              ) : null}
              <StorefrontPrice item={selected} chatAvailable={!!itemAction} />
              {options.length ? (
                <label>
                  Option
                  <select
                    value={currentOption?.id ?? ""}
                    onChange={(event) => setOptionId(event.target.value)}
                  >
                    {options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name} ·{" "}
                        {option.availability === "OUT_OF_STOCK"
                          ? "Out of stock"
                          : option.priceMinor === null
                            ? "Price not listed"
                            : formatStorefrontPrice(
                                option.priceMinor,
                                option.currencyCode,
                              )}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {availabilityLabel(
                currentOption?.availability ?? selected.availability,
              ) ? (
                <p>
                  {availabilityLabel(
                    currentOption?.availability ?? selected.availability,
                  )}
                </p>
              ) : null}
              <div className="tf-dialog-actions">
                {requestAction ? (
                  <Button
                    disabled={
                      action.busy ||
                      currentOption?.availability === "OUT_OF_STOCK"
                    }
                    onClick={() => void action.run(requestAction)}
                  >
                    Continue to request ↗
                  </Button>
                ) : null}
                {itemAction ? (
                  <Button
                    variant="outline"
                    disabled={action.busy}
                    onClick={() => void action.run(itemAction)}
                  >
                    Ask about{" "}
                    {selected.kind === "SERVICE"
                      ? "this service"
                      : "this piece"}{" "}
                    ↗
                  </Button>
                ) : null}
                {!requestAction && !itemAction ? (
                  <p>
                    Customer requests and messaging are unavailable for this
                    offering.
                  </p>
                ) : null}
              </div>
              {selected.kind === "SERVICE" ? (
                <p className="tf-help">
                  The existing request or conversation page collects your
                  details. No booking or order is created here.
                </p>
              ) : null}
              {mode === "preview" ? (
                <p className="tf-help">Private preview. Nothing is sent.</p>
              ) : null}
              <TemplateActions
                key={selected.id}
                domain={domain}
                item={selected}
              />
              {action.notice ? <output>{action.notice}</output> : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}
