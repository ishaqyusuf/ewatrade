"use client"

import { useStorefrontItemView } from "@ewatrade/events/storefront-client"
import type { PublicCatalogItem } from "@ewatrade/storefront-contracts"
import {
  handleStorefrontItemClick,
  serviceRequestUrl,
  storefrontItemHref,
} from "@ewatrade/storefront-runtime/links"
import {
  StorefrontArtwork,
  availabilityLabel,
  formatStorefrontPrice,
} from "@ewatrade/storefront-runtime/primitives"
import {
  useStorefrontCatalog,
  useStorefrontContact,
  useStorefrontContext,
  useStorefrontTheme,
} from "@ewatrade/storefront-runtime/react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  RadioGroup,
  RadioGroupItem,
  Separator,
} from "@ewatrade/ui"
import Link from "next/link"
import { type ReactNode, useEffect, useId, useState } from "react"
import { TemplateActions, useNavigation } from "../shared/commerce"
import {
  SERVICE_PRICE_ON_REQUEST,
  ServiceOptionPicker,
  orderServiceOptionIds,
  serviceOptionPriceLabel,
} from "../shared/service-option-picker"

const NO_BOOKING_LINE =
  "Requesting a quote does not book a time or take a payment."

/** Concierge-only price wording: an unlisted price reads "Price on request". */
function itemPriceLabel(item: PublicCatalogItem) {
  return item.priceMinor === null
    ? SERVICE_PRICE_ON_REQUEST
    : `${item.isFromPrice ? "From " : ""}${formatStorefrontPrice(item.priceMinor, item.currencyCode)}`
}

/** Untouched services start with their first option that is not out of stock. */
function defaultOptionIds(service: PublicCatalogItem) {
  const first = service.options.find(
    (option) => option.availability !== "OUT_OF_STOCK",
  )
  return first ? [first.id] : []
}

/** Each chosen option with its own listed price. Quantities are agreed later, so no total. */
function SelectionSummary({
  service,
  ids,
  blocked,
}: { service: PublicCatalogItem; ids: string[]; blocked: boolean }) {
  const titleId = useId()
  const chosen = service.options.filter((option) => ids.includes(option.id))
  return (
    <section className="sc-selection" aria-labelledby={titleId}>
      <h3 id={titleId}>Listed prices</h3>
      {chosen.length ? (
        <dl className="sc-facts">
          {chosen.map((option) => (
            <div key={option.id}>
              <dt>{option.name}</dt>
              <dd>{serviceOptionPriceLabel(option)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {!chosen.length || blocked ? (
        <output className="tf-help">
          {chosen.length
            ? "Some chosen options can't be requested online. Remove them to request a quote."
            : "Select at least one option to request a quote."}
        </output>
      ) : null}
    </section>
  )
}

/** Only the host's current public projection supplies service facts or destinations. */
export function ServiceConciergeCollection({
  domain,
  headline,
  description,
  enquiryHeading,
  after,
}: {
  domain: string
  headline: ReactNode
  description: ReactNode
  enquiryHeading: ReactNode
  after?: string
}) {
  const ids = useId()
  const catalog = useStorefrontCatalog()
  const contact = useStorefrontContact()
  const { business, mode } = useStorefrontContext()
  const theme = useStorefrontTheme()
  const action = useNavigation()
  const items =
    catalog.highlightedItem &&
    !catalog.items.some((item) => item.id === catalog.highlightedItem?.id)
      ? [catalog.highlightedItem, ...catalog.items]
      : catalog.items
  const services = items.filter((item) => item.kind === "SERVICE")
  const products = items.filter((item) => item.kind === "PRODUCT")
  const [serviceId, setServiceId] = useState(
    catalog.highlightedItem?.kind === "SERVICE"
      ? catalog.highlightedItem.id
      : (services[0]?.id ?? ""),
  )
  // One active service; every service keeps its own option selection. Once a
  // customer changes it, an empty selection stays empty (no implicit re-pick).
  const [chosen, setChosen] = useState<Record<string, string[]>>({})
  const [detailId, setDetailId] = useState(catalog.highlightedItem?.id ?? "")
  const detail = items.find((item) => item.id === detailId)
  useStorefrontItemView(detail ?? null)
  const [noticeFor, setNoticeFor] = useState("")
  const highlighted = catalog.highlightedItem
  useEffect(() => {
    if (highlighted?.kind === "SERVICE") setServiceId(highlighted.id)
    setDetailId(highlighted?.id ?? "")
  }, [highlighted?.id, highlighted?.kind])
  const service = services.find((item) => item.id === serviceId) ?? services[0]
  const selectedFor = (item: PublicCatalogItem) =>
    orderServiceOptionIds(
      item.options,
      chosen[item.id] ?? defaultOptionIds(item),
    )
  const choose = (item: PublicCatalogItem, next: string[]) =>
    setChosen((current) => ({ ...current, [item.id]: next }))
  const formIds = contact.serviceRequestEntry?.offeringIds ?? []
  /** The request entry only accepts this service's options on the current public form. */
  const requestable = (item: PublicCatalogItem) =>
    item.options.some((option) => formIds.includes(option.id)) &&
    action.allowed({
      type: "openServiceRequest",
      itemId: item.id,
      offeringId: item.options[0]?.id ?? item.id,
    })
  const requestFor = (item: PublicCatalogItem, selected: string[]) => {
    const [first] = selected
    if (
      !first ||
      selected.length > 20 ||
      !selected.every((id) => {
        const option = item.options.find((entry) => entry.id === id)
        return (
          !!option &&
          formIds.includes(id) &&
          option.availability !== "OUT_OF_STOCK"
        )
      })
    )
      return null
    const href = serviceRequestUrl(
      `https://${domain}`,
      contact.serviceRequestEntry,
      item,
      first,
      selected,
    )
    const carried = href
      ? new URL(href).searchParams.getAll("serviceOfferingId")
      : []
    const next = {
      type: "openServiceRequest" as const,
      itemId: item.id,
      offeringId: first,
      offeringIds: selected,
    }
    return carried.length === selected.length &&
      carried.every((id, index) => id === selected[index]) &&
      action.allowed(next)
      ? next
      : null
  }
  const selected = service ? selectedFor(service) : []
  const canRequest = service ? requestable(service) : false
  const request = service && canRequest ? requestFor(service, selected) : null
  const enquiry =
    service && action.allowed({ type: "whatsappEnquiry", itemId: service.id })
      ? { type: "whatsappEnquiry" as const, itemId: service.id }
      : null
  const noticeKey = (item: PublicCatalogItem) =>
    `${item.id}:${selectedFor(item).join(",")}`
  const listing = (cursor?: string | null) => {
    const params = new URLSearchParams()
    if (catalog.category) params.set("category", catalog.category)
    if (cursor) params.set("after", cursor)
    return params.size ? `/?${params}` : "/"
  }
  const detailIds = detail?.kind === "SERVICE" ? selectedFor(detail) : []
  const detailRequest =
    detail?.kind === "SERVICE" && requestable(detail)
      ? requestFor(detail, detailIds)
      : null
  return (
    <>
      <div className="sc-concierge">
        <div className="sc-task">
          <h1>{headline}</h1>
          <p className="cv-lede">{description}</p>
          {services.length ? (
            <RadioGroup
              className="sc-choices"
              aria-label="Services"
              value={service?.id ?? ""}
              onValueChange={(value) => setServiceId(String(value))}
            >
              {services.map((item) => (
                <FieldLabel key={item.id} htmlFor={`${ids}-${item.id}`}>
                  <Field orientation="horizontal">
                    <div className="sc-art">
                      <StorefrontArtwork item={item} />
                    </div>
                    <FieldContent>
                      <FieldTitle>{item.name}</FieldTitle>
                      {item.description ? (
                        <FieldDescription>{item.description}</FieldDescription>
                      ) : null}
                    </FieldContent>
                    <span className="sc-price">
                      {itemPriceLabel(item)}
                      {availabilityLabel(item.availability) ? (
                        <span className="sc-availability">
                          {availabilityLabel(item.availability)}
                        </span>
                      ) : null}
                    </span>
                    <RadioGroupItem value={item.id} id={`${ids}-${item.id}`} />
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>
          ) : (
            <div className="tf-empty">
              <h2>No services listed yet</h2>
              <p>Check back for {business.name}'s available services.</p>
            </div>
          )}
        </div>
        {service ? (
          <aside className="sc-overview" aria-labelledby={`${ids}-overview`}>
            <Card>
              <CardHeader>
                <CardTitle id={`${ids}-overview`}>{enquiryHeading}</CardTitle>
                <CardDescription>
                  {business.name} uses this to agree the work and the final
                  price with you.
                </CardDescription>
              </CardHeader>
              <CardContent className="sc-overview-body">
                <dl className="sc-facts">
                  <div>
                    <dt>Service</dt>
                    <dd>{service.name}</dd>
                  </div>
                  {service.options.length ? null : (
                    <div>
                      <dt>Listed price</dt>
                      <dd>{itemPriceLabel(service)}</dd>
                    </div>
                  )}
                </dl>
                {service.options.length ? (
                  <>
                    <ServiceOptionPicker
                      key={service.id}
                      options={service.options}
                      value={selected}
                      onChange={(next) => choose(service, next)}
                      disabled={action.busy}
                    />
                    <SelectionSummary
                      service={service}
                      ids={selected}
                      blocked={canRequest && !!selected.length && !request}
                    />
                  </>
                ) : null}
                <Separator />
                <section className="sc-next" aria-labelledby={`${ids}-next`}>
                  <h3 id={`${ids}-next`}>
                    {canRequest ? "After you continue" : "Before you request"}
                  </h3>
                  {canRequest ? (
                    <ol>
                      <li>
                        The request form opens with this service and every
                        option you chose.
                      </li>
                      <li>You add your name and contact details there.</li>
                      <li>
                        {business.name} contacts you to agree the work and the
                        final price.
                      </li>
                    </ol>
                  ) : (
                    <p>
                      Online quote requests are unavailable for this service.
                      Contact {business.name} to agree the work and the final
                      price.
                    </p>
                  )}
                </section>
              </CardContent>
              <CardFooter className="sc-overview-actions">
                {canRequest ? (
                  <Button
                    size="lg"
                    disabled={action.busy || !request}
                    onClick={() => {
                      if (!request) return
                      setNoticeFor(noticeKey(service))
                      void action.run(request)
                    }}
                  >
                    Request a quote
                  </Button>
                ) : null}
                <Button
                  size="lg"
                  variant="outline"
                  render={
                    // biome-ignore lint/a11y/useAnchorContent: Button renders its visible children into this anchor.
                    <a href={storefrontItemHref(service.id)} />
                  }
                  onClick={(event) =>
                    handleStorefrontItemClick(event, () =>
                      setDetailId(service.id),
                    )
                  }
                >
                  Service details
                </Button>
                {!canRequest && enquiry ? (
                  <Button
                    size="lg"
                    variant="outline"
                    disabled={action.busy}
                    onClick={() => {
                      setNoticeFor(noticeKey(service))
                      void action.run(enquiry)
                    }}
                  >
                    Ask about this service
                  </Button>
                ) : null}
                {!canRequest &&
                !enquiry &&
                action.allowed({ type: "openConversation" }) ? (
                  <Button
                    size="lg"
                    variant="outline"
                    disabled={action.busy}
                    onClick={() => {
                      setNoticeFor(noticeKey(service))
                      void action.run({ type: "openConversation" })
                    }}
                  >
                    Message business
                  </Button>
                ) : null}
                {canRequest ? (
                  <p className="tf-help">{NO_BOOKING_LINE}</p>
                ) : null}
              </CardFooter>
            </Card>
            {action.notice && noticeFor === noticeKey(service) ? (
              <output className="sc-notice" key={noticeFor}>
                {action.notice}
              </output>
            ) : null}
          </aside>
        ) : null}
      </div>
      {products.length ? (
        <section className="sc-shelf" aria-labelledby={`${ids}-shelf`}>
          <h2 id={`${ids}-shelf`}>Also on {business.name}'s shelves</h2>
          <ul>
            {products.map((item) => (
              <li key={item.id}>
                <Item
                  size="sm"
                  render={
                    // biome-ignore lint/a11y/useAnchorContent: Item renders its visible children into this anchor.
                    <a href={storefrontItemHref(item.id)} />
                  }
                  onClick={(event) =>
                    handleStorefrontItemClick(event, () => setDetailId(item.id))
                  }
                >
                  <ItemMedia>
                    <div className="sc-art">
                      <StorefrontArtwork item={item} />
                    </div>
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{item.name}</ItemTitle>
                    {item.description ? (
                      <ItemDescription>{item.description}</ItemDescription>
                    ) : null}
                  </ItemContent>
                  <ItemActions className="sc-shelf-price">
                    <span className="sc-price">{itemPriceLabel(item)}</span>
                    {availabilityLabel(item.availability) ? (
                      <span className="sc-availability">
                        {availabilityLabel(item.availability)}
                      </span>
                    ) : null}
                  </ItemActions>
                </Item>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {catalog.hasHiddenItems ? (
        <p className="tf-help">A selection of this shop’s items is shown.</p>
      ) : null}
      {catalog.nextCursor || after ? (
        <nav className="tf-pagination" aria-label="More services">
          {catalog.nextCursor ? (
            <Link prefetch={false} href={listing(catalog.nextCursor)}>
              Show more
            </Link>
          ) : null}
          {after ? (
            <Link prefetch={false} href={listing()}>
              Back to start
            </Link>
          ) : null}
        </nav>
      ) : null}
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetailId("")
        }}
      >
        <DialogContent
          className="sc-dialog"
          style={{
            fontFamily:
              theme.font === "serif"
                ? 'Georgia, "Times New Roman", serif'
                : '"Manrope", "Geist", system-ui, sans-serif',
          }}
        >
          <div className="sc-dialog-inner">
            <DialogHeader className="sc-detail-head">
              <DialogTitle className="sc-detail-title">
                {detail?.name ?? "Item details"}
              </DialogTitle>
              <DialogDescription>
                {detail?.category?.name ??
                  (detail?.kind === "SERVICE" ? "Service" : "Product")}
              </DialogDescription>
            </DialogHeader>
            {detail ? (
              <div className="sc-detail">
                <StorefrontArtwork item={detail} />
                <p className="sc-detail-price">{itemPriceLabel(detail)}</p>
                {detail.description ? (
                  <p className="sc-detail-copy">{detail.description}</p>
                ) : null}
                {detail.kind === "SERVICE" && detail.options.length ? (
                  <>
                    <ServiceOptionPicker
                      options={detail.options}
                      value={detailIds}
                      onChange={(next) => choose(detail, next)}
                      disabled={action.busy}
                    />
                    <SelectionSummary
                      service={detail}
                      ids={detailIds}
                      blocked={
                        requestable(detail) &&
                        !!detailIds.length &&
                        !detailRequest
                      }
                    />
                  </>
                ) : null}
                {detail.kind === "SERVICE" && requestable(detail) ? (
                  <p className="tf-help">{NO_BOOKING_LINE}</p>
                ) : null}
                <TemplateActions
                  key={detail.id}
                  domain={domain}
                  item={detail}
                />
                {mode === "preview" ? (
                  <p className="tf-help">Private preview. Nothing is sent.</p>
                ) : null}
                {action.notice && noticeFor === noticeKey(detail) ? (
                  <output className="sc-notice">{action.notice}</output>
                ) : null}
              </div>
            ) : null}
            <DialogFooter className="sc-detail-actions">
              <DialogClose render={<Button variant="outline" />}>
                Close
              </DialogClose>
              {detail?.kind === "SERVICE" && requestable(detail) ? (
                <Button
                  disabled={action.busy || !detailRequest}
                  onClick={() => {
                    if (!detailRequest) return
                    setServiceId(detail.id)
                    setNoticeFor(noticeKey(detail))
                    void action.run(detailRequest)
                  }}
                >
                  Request a quote
                </Button>
              ) : action.allowed({ type: "openConversation" }) ? (
                <Button
                  disabled={action.busy}
                  onClick={() => {
                    if (detail) setNoticeFor(noticeKey(detail))
                    void action.run({ type: "openConversation" })
                  }}
                >
                  Message business
                </Button>
              ) : null}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** About story: authored headline/story copy plus facts read from the current public catalog. */
export function ServiceConciergeStory({
  headline,
  story,
}: { headline: ReactNode; story: ReactNode }) {
  const catalog = useStorefrontCatalog()
  const action = useNavigation()
  const services = catalog.items.filter((item) => item.kind === "SERVICE")
  const products = catalog.items.filter((item) => item.kind === "PRODUCT")
  const productGroups = [
    ...new Set(
      products.map((item) => item.category?.name ?? item.name).filter(Boolean),
    ),
  ]
  const list = (values: string[]) =>
    values.length > 6
      ? `${values.slice(0, 6).join(", ")} and ${values.length - 6} more`
      : values.join(", ")
  const quote =
    services.some((item) => item.options.length) &&
    action.allowed({
      type: "openServiceRequest",
      itemId: services[0]?.id ?? "service",
      offeringId: services[0]?.options[0]?.id ?? "option",
    })
  const message = action.allowed({ type: "openConversation" })
  const howToAsk = quote
    ? `Choose a service on the home page and select Request a quote.${message ? " Use Message for anything else." : ""}`
    : message
      ? "Use Message to ask about a service or product."
      : null
  return (
    <div className="sc-about">
      <div className="sc-about-story">
        <h1>{headline}</h1>
        <p className="cv-lede">{story}</p>
      </div>
      {services.length || productGroups.length || howToAsk ? (
        <dl className="sc-about-facts">
          {services.length ? (
            <div>
              <dt>Services</dt>
              <dd>{list(services.map((item) => item.name))}</dd>
            </div>
          ) : null}
          {productGroups.length ? (
            <div>
              <dt>Products</dt>
              <dd>{list(productGroups)}</dd>
            </div>
          ) : null}
          {howToAsk ? (
            <div>
              <dt>How to ask</dt>
              <dd>{howToAsk}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  )
}

/** Read-only FAQ in the shared Accordion; empty authored questions are skipped. */
export function ServiceConciergeFaq({
  heading,
  entries,
}: {
  heading: ReactNode
  entries: { id: string; question: string; answer: string }[]
}) {
  const headingId = useId()
  const shown = entries.filter((entry) => entry.question.trim())
  if (!shown.length) return null
  return (
    <section className="sc-faq" aria-labelledby={headingId}>
      <h2 id={headingId}>{heading}</h2>
      <Accordion>
        {shown.map((entry) => (
          <AccordionItem key={entry.id} value={entry.id}>
            <AccordionTrigger>{entry.question}</AccordionTrigger>
            <AccordionContent>
              <p>{entry.answer}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}

/** Header with the shared Button navigation from the approved Concierge preview. */
export function ServiceConciergeHeader({
  name,
  pages,
  current,
  onPageChange,
}: {
  name: string
  pages: { key: string }[]
  current: string
  onPageChange?: (key: string) => void
}) {
  return (
    <header className="cv-header sc-header">
      <div className="cv-wrap">
        <p className="sc-brand">{name}</p>
        <nav aria-label="Storefront pages">
          {pages.map((entry) => (
            <Button
              key={entry.key}
              size="sm"
              variant={current === entry.key ? "secondary" : "ghost"}
              aria-current={current === entry.key ? "page" : undefined}
              render={
                // biome-ignore lint/a11y/useAnchorContent: Button renders its visible children into this anchor.
                <a
                  href={entry.key === "home" ? "/" : `/${entry.key}`}
                  onClick={
                    onPageChange
                      ? (event) => {
                          event.preventDefault()
                          onPageChange(entry.key)
                        }
                      : undefined
                  }
                />
              }
            >
              {entry.key === "home" ? "Home" : "About"}
            </Button>
          ))}
        </nav>
      </div>
    </header>
  )
}
